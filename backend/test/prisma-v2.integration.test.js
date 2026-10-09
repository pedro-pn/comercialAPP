import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/db.js';
import { createApiCredential } from '../src/auth/api-credentials.js';
import { sendFinalizedToPrisma, retryPendingPrisma } from '../src/comercial/prisma-delivery.js';
import { storeFile } from '../src/comercial/storage.js';
import { crmEventSchema } from '../src/comercial/crm-event-schema.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('v1 permanece compatível; v2 exige sequência e rejeita campos desconhecidos', () => {
  const event = { contractVersion: 1, eventId: randomUUID(), proposalCode: '123',
    revisionNumber: 0, opportunityId: 'deal', approvalStatus: 'APPROVED',
    occurredAt: new Date().toISOString(), legacyExtra: true };
  assert.equal(crmEventSchema.parse(event).legacyExtra, undefined);
  assert.equal(crmEventSchema.safeParse({ ...event, approvalStatus: 'CANCELLED' }).success, false);
  const { legacyExtra, ...base } = event;
  assert.equal(crmEventSchema.safeParse({ ...base, contractVersion: 2 }).success, false);
  assert.equal(crmEventSchema.parse({ ...base, contractVersion: 2,
    statusSequence: 1, approvalStatus: 'CANCELLED' }).approvalStatus, 'CANCELLED');
  assert.equal(crmEventSchema.safeParse({ ...event, contractVersion: 2, statusSequence: 1 }).success, false);
});

test('Prisma v2: permissões, liberação, criação/revisão, multipart, reenvio e decisões',
  { skip: !databaseUrl }, async t => {
    assert.equal(new URL(databaseUrl).pathname, '/comercialapp_test');
    const db = createDatabase(databaseUrl);
    const dir = await mkdtemp(path.join(tmpdir(), 'commercial-prisma-v2-'));
    const keys = ['COMERCIAL_DIR', 'PRISMA_API_URL', 'PRISMA_API_TOKEN', 'APP_ENV',
      'NODE_ENV', 'FILTROAPP_API_URL', 'FILTROAPP_API_TOKEN'];
    const old = Object.fromEntries(keys.map(key => [key, process.env[key]]));
    Object.assign(process.env, { COMERCIAL_DIR: dir, APP_ENV: 'test', NODE_ENV: 'test',
      PRISMA_API_TOKEN: 'synthetic-prisma-token', FILTROAPP_API_URL: '', FILTROAPP_API_TOKEN: '' });
    let commercial, receiver, user, consultant;
    const releaseId = randomUUID();
    t.after(async () => {
      for (const server of [commercial, receiver]) {
        if (server) await new Promise(resolve => server.close(resolve));
      }
      if (user) {
        await db.proposal.deleteMany({ where: { createdByUserId: user.id } });
        await db.proposalNumberReservation.deleteMany({ where: { reservedByUserId: user.id } });
        if (consultant) await db.salesConsultant.delete({ where: { id: consultant.id } });
        await db.apiCredential.deleteMany({ where: { createdByUserId: user.id } });
        await db.user.delete({ where: { id: user.id } });
      }
      await db.crmReleaseEvent.deleteMany({ where: { releaseId } });
      await db.crmRelease.deleteMany({ where: { id: releaseId } });
      await db.$disconnect();
      await rm(dir, { recursive: true, force: true });
      for (const [key, value] of Object.entries(old)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    });
    user = await db.user.create({ data: { username: `prisma-v2-${randomUUID()}`,
      name: 'Administrador sintético', role: 'ADMIN' } });
    consultant = await db.salesConsultant.create({ data: { name: 'Consultor sintético', createdByUserId: user.id } });
    const releaseToken = await createApiCredential(db, user, {
      name: 'Liberações teste', expiresInDays: 1, scopeCode: 'crm.releases.write' });
    const eventToken = await createApiCredential(db, user, {
      name: 'Decisões teste', expiresInDays: 1, scopeCode: 'crm.events.write' });
    commercial = createApp({ commercialDb: db, appOrigin: 'http://localhost',
      authService: { authenticate: async token => token === 'synthetic-admin' ? user : null }
    }).listen(0, '127.0.0.1');
    await once(commercial, 'listening');
    const base = `http://127.0.0.1:${commercial.address().port}`;
    const request = async (route, body, token) => {
      const response = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST',
        headers: token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
          : { Cookie: 'comercial_session=synthetic-admin', 'X-Comercial-Request': '1',
            'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, data: await response.json() };
    };
    const release = { contractVersion: 2, eventId: randomUUID(), releaseId, releaseVersion: 1,
      releaseStatus: 'ACTIVE', clientId: `client-${releaseId}`, opportunityId: `deal-${releaseId}`,
      prismaProjectId: null, contactId: 'synthetic-contact', legalName: 'Cliente sintético',
      taxId: '00000000000000', contactName: 'Contato sintético', email: 'qa@example.invalid',
      department: 'Engenharia', site: 'Local de teste', description: 'Serviço sintético',
      occurredAt: new Date().toISOString() };
    const postRelease = input => request('/api/integrations/crm/releases', input, releaseToken.token);
    assert.equal((await request('/api/integrations/crm/releases', release, eventToken.token)).status, 401);
    assert.equal((await postRelease({ ...release, extra: true })).status, 400);
    assert.equal((await postRelease(release)).status, 202);
    assert.equal((await postRelease(release)).status, 200);
    assert.equal((await postRelease({ ...release, description: 'Outro conteúdo' })).status, 409);
    assert.equal((await postRelease({ ...release, eventId: randomUUID() })).status, 409);
    assert.equal((await request('/api/comercial/liberacoes')).data.items.some(item => item.id === releaseId), true);
    assert.equal((await request('/api/comercial/liberacoes?cnpj=00000000000000')).data.items.some(item => item.id === releaseId), true);
    assert.equal((await request('/api/comercial/liberacoes?cnpj=11222333000181')).data.items.some(item => item.id === releaseId), false);
    assert.equal((await request(`/api/admin/api-credentials/${releaseToken.credential.id}/preview`, {})).status, 403);

    // Exerce a criação pública, incluindo a validação de consultor e a reserva existente.
    const number = 1_900_000_000 + Math.floor(Math.random() * 100_000_000);
    await db.proposalNumberReservation.create({ data: { number, reservedByUserId: user.id } });
    const input = { proposalCode: String(number), revisionNumber: 0, crmReleaseId: releaseId,
      clientName: release.legalName, cnpj: release.taxId, contact: release.contactName,
      email: release.email, site: release.site, sellerConsultantId: consultant.id,
      payload: { prices: [{ value: 'R$ 1.250,00' }] } };
    assert.equal((await request('/api/comercial/propostas', { ...input, sellerUserId: user.id })).status, 400);
    const { crmReleaseId: requestedReleaseId, ...existingDraft } = input;
    let first = await request('/api/comercial/propostas', { ...existingDraft, clientName: '', cnpj: '',
      contact: '', email: '', site: '', department: null,
      payload: { ...existingDraft.payload, client: '', cnpj: '', contact: '', email: '', site: '', department: '' } });
    assert.equal(first.status, 201, JSON.stringify(first.data));
    first = first.data;
    assert.equal(first.crmReleaseId, null);
    const savedDraft = first;
    const association = {
      crmReleaseId: requestedReleaseId, expectedReleaseVersion: 1,
      expectedUpdatedAt: savedDraft.updatedAt
    };
    const linked = await request(`/api/comercial/propostas/${first.id}/vincular-prisma`, association);
    assert.equal(linked.status, 200, JSON.stringify(linked.data));
    first = linked.data;
    assert.equal(first.id, savedDraft.id);
    assert.equal(first.proposalCode, savedDraft.proposalCode);
    assert.equal(first.clientName, release.legalName);
    assert.equal(first.cnpj, release.taxId);
    assert.equal(first.contact, release.contactName);
    assert.equal(first.email, release.email);
    assert.equal(first.department, release.department);
    assert.equal(first.site, release.site);
    assert.deepEqual(first.payload, { ...savedDraft.payload, client: release.legalName, cnpj: release.taxId,
      contact: release.contactName, email: release.email, department: release.department,
      site: release.site, title: release.description });
    assert.deepEqual((await request(`/api/comercial/propostas/${first.id}`)).data, first);
    assert.deepEqual((await request(`/api/comercial/propostas/${first.id}/vincular-prisma`, association)).data, first);
    assert.equal(first.sellerConsultantId, consultant.id);
    assert.equal(first.crmReleaseId, releaseId);
    assert.equal(Number(first.totalValue), 1250);
    await db.proposal.update({ where: { id: first.id }, data: { status: 'FINALIZADA', finalizedAt: new Date() } });
    const prepared = await request(`/api/comercial/propostas/${number}/revisao`);
    assert.equal(prepared.data.crmReleaseId, releaseId);
    assert.equal(prepared.data.snapshot.contact, release.contactName);
    assert.equal(prepared.data.snapshot.email, release.email);
    assert.equal(prepared.data.snapshot.department, release.department);
    const secondResult = await request('/api/comercial/propostas', { ...input, crmReleaseId: undefined, revisionNumber: 1,
      contact: '', email: '', payload: { ...input.payload, contact: '', email: '' } });
    assert.equal(secondResult.status, 201, JSON.stringify(secondResult.data));
    const second = secondResult.data;
    assert.equal(second.crmReleaseId, releaseId);
    assert.equal(second.contact, release.contactName);
    assert.equal(second.email, release.email);
    assert.equal(second.payload.contact, release.contactName);
    assert.equal(second.payload.email, release.email);
    await db.proposal.update({ where: { id: second.id }, data: { status: 'FINALIZADA', finalizedAt: new Date() } });

    // Receptor HTTP verifica o multipart efetivamente serializado pelo fetch.
    const uploads = [], receipts = new Map();
    let httpStatus = 201, loseAck = true;
    receiver = createServer(async (req, res) => {
      try {
        assert.equal(req.url, '/api/comercialapp/v2/sandbox/revisions');
        assert.equal(req.headers.authorization, 'Bearer synthetic-prisma-token');
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const form = await new Request('http://localhost', { method: 'POST',
          headers: req.headers, body: Buffer.concat(chunks) }).formData();
        assert.deepEqual([...form.keys()].sort(), ['commercial_pdf', 'metadata', 'technical_pdf']);
        const metadata = JSON.parse(form.get('metadata'));
        assert.equal(metadata.releaseId, releaseId);
        assert.equal(metadata.prismaProjectId, null);
        assert.equal(metadata.amountBrl, '1250');
        const pdfs = {};
        for (const part of ['commercial_pdf', 'technical_pdf']) {
          const file = form.get(part);
          assert.equal(file.type, 'application/pdf');
          assert.match(file.name, /\.pdf$/);
          pdfs[part] = Buffer.from(await file.arrayBuffer()).toString();
          assert.match(pdfs[part], /^%PDF-/);
        }
        const key = req.headers['idempotency-key'];
        uploads.push({ key, metadata, pdfs });
        if (httpStatus !== 201) {
          res.writeHead(httpStatus, { 'Retry-After': '600' }); res.end('{}'); return;
        }
        const receipt = receipts.get(key) || { id: randomUUID(), releaseId,
          opportunityId: metadata.opportunityId, proposalId: metadata.proposalId,
          proposalCode: metadata.proposalCode, revisionNumber: metadata.revisionNumber };
        receipts.set(key, receipt);
        if (loseAck) { loseAck = false; req.socket.destroy(); return; }
        res.writeHead(201, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(receipt));
      } catch (error) { res.writeHead(500); res.end(JSON.stringify({ error: error.message })); }
    }).listen(0, '127.0.0.1');
    await once(receiver, 'listening');
    process.env.PRISMA_API_URL = `http://127.0.0.1:${receiver.address().port}/api/comercialapp/v2/sandbox`;
    const addPdfs = async (proposal, marker) => {
      const generationId = randomUUID();
      for (const kind of ['TECNICA', 'COMERCIAL']) {
        const file = await storeFile(`${proposal.id}/${generationId}/${kind}.pdf`, Buffer.from(`%PDF-1.4 ${marker} ${kind}`));
        await db.proposalDocument.create({ data: { proposalId: proposal.id, generationId,
          kind, format: 'PDF', payloadHash: 'synthetic', ...file } });
      }
      return generationId;
    };
    await addPdfs(first, 'original');
    await addPdfs(second, 'revisao');
    assert.equal((await sendFinalizedToPrisma(db, first.id)).status, 'ERRO');
    await addPdfs(first, 'regenerado após confirmação perdida');
    const retry = await sendFinalizedToPrisma(db, first.id);
    assert.equal(retry.status, 'SUCESSO');
    assert.deepEqual(uploads[0], uploads[1]);
    assert.equal((await sendFinalizedToPrisma(db, first.id)).id, retry.id);
    assert.equal(uploads.length, 2);
    const receivedSecond = await sendFinalizedToPrisma(db, second.id);
    assert.equal(receivedSecond.status, 'SUCESSO');
    assert.notEqual(receivedSecond.id, retry.id);
    assert.notEqual(uploads[2].key, uploads[0].key);

    const event = { contractVersion: 2, eventId: randomUUID(), releaseId,
      clientId: release.clientId, opportunityId: release.opportunityId, prismaProjectId: null,
      proposalId: second.id, proposalCode: String(number), revisionNumber: 1,
      approvalStatus: 'APPROVED', statusSequence: 2, occurredAt: new Date().toISOString() };
    const postEvent = input => request('/api/integrations/crm/events', input, eventToken.token);
    assert.equal((await request('/api/integrations/crm/events', event, releaseToken.token)).status, 401);
    assert.equal((await postEvent({ ...event, proposalId: first.id })).status, 409);
    const approved = await postEvent(event);
    assert.equal(approved.status, 202);
    assert.equal(approved.data.delivery, null); // Sem vínculo FiltroAPP, somente decisão comercial.
    assert.equal((await db.proposal.findUnique({ where: { id: first.id } })).crmApprovalStatus, 'PENDENTE');
    const cancelled = { ...event, eventId: randomUUID(), approvalStatus: 'CANCELLED', statusSequence: 3 };
    assert.equal((await postEvent(cancelled)).status, 202);
    const repeated = await postEvent(event);
    assert.equal(repeated.status, 200);
    assert.equal(repeated.data.approvalStatus, 'CANCELLED');
    assert.equal((await postEvent({ ...event, eventId: randomUUID() })).status, 409);
    assert.equal((await postEvent({ ...cancelled, reason: 'conteúdo alterado' })).status, 409);
    await db.proposal.update({ where: { id: second.id }, data: { filtroStatus: 'SUCESSO', crmProjectId: 'operational-test' } });
    assert.equal((await postEvent({ ...cancelled, eventId: randomUUID(), statusSequence: 4 })).status, 202);
    assert.equal((await db.proposal.findUnique({ where: { id: second.id } })).crmProjectId, 'operational-test');
    assert.equal((await postEvent({ ...event, eventId: randomUUID(), statusSequence: 5, projectId: 'different-operational' })).status, 409);

    // A fila trata validação, limitação do receptor e o teto de dez tentativas.
    await db.proposal.update({ where: { id: first.id }, data: { prismaDeliveryStatus: 'PENDENTE', prismaDeliveryAttempts: 0 } });
    httpStatus = 400;
    assert.equal((await sendFinalizedToPrisma(db, first.id)).status, 'ERRO');
    let stored = await db.proposal.findUnique({ where: { id: first.id } });
    assert.equal(stored.prismaDeliveryNextRetryAt, null);
    assert.equal(await retryPendingPrisma(db), 0);
    httpStatus = 429;
    const before = Date.now();
    await sendFinalizedToPrisma(db, first.id);
    stored = await db.proposal.findUnique({ where: { id: first.id } });
    assert.ok(stored.prismaDeliveryNextRetryAt.getTime() >= before + 600_000);
    await db.proposal.update({ where: { id: first.id }, data: {
      prismaDeliveryAttempts: 10, prismaDeliveryNextRetryAt: new Date(0) } });
    assert.equal(await retryPendingPrisma(db), 0);
    httpStatus = 201;
    assert.equal((await sendFinalizedToPrisma(db, first.id)).status, 'SUCESSO');
    process.env.APP_ENV = 'staging';
    process.env.PRISMA_API_URL = 'https://prismacrm.filtrovali.com.br/api/comercialapp/v2/production';
    await db.proposal.update({ where: { id: first.id }, data: { prismaDeliveryStatus: 'PENDENTE' } });
    await assert.rejects(() => sendFinalizedToPrisma(db, first.id), { status: 503 });
    process.env.APP_ENV = 'test';
    process.env.PRISMA_API_TOKEN = '';
    assert.equal((await sendFinalizedToPrisma(db, first.id)).status, 'DESATIVADO');
    const revoked = { ...release, eventId: randomUUID(), releaseVersion: 2, releaseStatus: 'REVOKED',
      occurredAt: new Date().toISOString() };
    assert.equal((await postRelease(revoked)).status, 202);
    assert.equal((await postRelease(release)).status, 200);
    assert.equal((await db.crmRelease.findUnique({ where: { id: releaseId } })).status, 'REVOKED');
    assert.equal((await request('/api/comercial/propostas', { ...input, revisionNumber: 2 })).status, 409);
    assert.equal(await db.proposal.count({ where: { crmReleaseId: releaseId } }), 2);
  });
