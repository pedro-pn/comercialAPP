import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { makeComercialSchemas } from '../../shared/schemas/comercial.js';
import { createApp } from '../src/app.js';
import { createAuthService, tokenHash } from '../src/auth/service.js';
import { createDatabase } from '../src/db.js';
import { startCostEstimate } from '../src/comercial/cost-estimates.js';

const schemas = makeComercialSchemas(z);
const expectedUpdatedAt = '2026-10-06T20:00:00.000Z';

test('POST de rascunho de proposta aceita identificação ausente, vazia e incompleta', () => {
  for (const fields of [{}, { clientName: '', cnpj: '', contact: '', email: '', site: '' },
    { cnpj: '11.222', email: 'contato@', sellerUserId: null, sellerConsultantId: null }]) {
    const saved = schemas.proposalCreate.parse({ proposalCode: '9000', payload: { attendance: '5 dias' }, ...fields });
    assert.equal(saved.clientName, '');
    assert.equal(saved.cnpj, fields.cnpj ?? '');
    assert.equal(saved.email, fields.email ?? '');
    assert.equal(saved.payload.attendance, '5 dias');
  }
});

test('PUT parcial não limpa a identificação que não veio na requisição', () => {
  const update = schemas.proposalUpdate.parse({ expectedUpdatedAt, payload: { title: 'Serviço' } });
  for (const field of ['clientName', 'cnpj', 'contact', 'email', 'site']) {
    assert.equal(field in update, false, field);
  }
  assert.equal(schemas.proposalUpdate.parse({ expectedUpdatedAt, email: 'contato@' }).email, 'contato@');
});

test('rascunhos continuam validando tipos, limites e dois consultores simultâneos', () => {
  const base = { proposalCode: '9000', payload: {} };
  for (const fields of [{ email: 123 }, { clientName: 'x'.repeat(201) },
    { sellerUserId: 'usuario', sellerConsultantId: 'cadastro' }]) {
    assert.equal(schemas.proposalCreate.safeParse({ ...base, ...fields }).success, false);
  }
});

test('título do levantamento só é obrigatório na conclusão', () => {
  const base = { proposalCode: '9000', mode: 'NOVA', payload: {} };
  for (const title of [undefined, '', '   ']) {
    assert.equal(schemas.costEstimateCreate.parse({ ...base, status: 'RASCUNHO', title }).title, '');
    assert.equal(schemas.costEstimateCreate.safeParse({ ...base, status: 'SALVO', title }).success, false);
  }
  assert.equal(schemas.costEstimateUpdate.parse({ ...base, expectedUpdatedAt, title: '', status: 'RASCUNHO' }).title, '');
});

test('início do levantamento aceita campos vazios e reserva a numeração pelo servidor', () => {
  assert.deepEqual(schemas.costEstimateStart.parse({ payload: {} }), { title: '', payload: {} });
  assert.equal(schemas.costEstimateStart.safeParse({ title: '', payload: {} }).success, true);
  for (const fields of [{ proposalCode: '9000' }, { revisionNumber: 1 }, { mode: 'REVISAO' },
    { status: 'SALVO' }, { totalCost: 100 }, { title: 'x'.repeat(201) }, { payload: null }]) {
    assert.equal(schemas.costEstimateStart.safeParse({ payload: {}, ...fields }).success, false);
  }
});

test('API salva, lista e reabre rascunhos incompletos de propostas e custos',
  { skip: !process.env.TEST_DATABASE_URL }, async t => {
    assert.equal(new URL(process.env.TEST_DATABASE_URL).pathname, '/comercialapp_test');
    const db = createDatabase(process.env.TEST_DATABASE_URL);
    const user = await db.user.create({ data: { username: `rascunhos-${randomUUID()}`, name: 'Teste Rascunhos', role: 'ADMIN' } });
    const token = randomBytes(32).toString('hex');
    await db.session.create({ data: { userId: user.id, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 60_000) } });
    const server = createApp({ authService: createAuthService(db), commercialDb: db }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const numbers = [];
    const proposalIds = [];
    const estimateIds = [];
    let seeded = false;
    t.after(async () => {
      await new Promise(resolve => server.close(resolve));
      await db.proposal.deleteMany({ where: { id: { in: proposalIds } } });
      await db.costEstimate.deleteMany({ where: { id: { in: estimateIds } } });
      await db.proposalNumberReservation.deleteMany({ where: { number: { in: numbers } } });
      if (seeded) await db.proposalNumberingState.deleteMany({ where: { seededByUserId: user.id } });
      await db.session.deleteMany({ where: { userId: user.id } });
      await db.user.delete({ where: { id: user.id } });
      await db.$disconnect();
    });
    const origin = `http://127.0.0.1:${server.address().port}/api/comercial`;
    async function request(route, method = 'GET', body) {
      const response = await fetch(origin + route, { method,
        headers: { 'Content-Type': 'application/json', 'X-Comercial-Request': '1', Cookie: `comercial_session=${token}` },
        ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, data: await response.json() };
    }
    if (!(await request('/numeracao/status')).data.seeded) {
      assert.equal((await request('/numeracao/inicializar', 'POST', { initialNumber: 98000 })).status, 201);
      seeded = true;
    }
    async function nextNumber() {
      const { data } = await request('/propostas/proximo-numero', 'POST');
      numbers.push(data.numero);
      return String(data.numero);
    }

    const startedEstimate = await request('/levantamentos/iniciar', 'POST', {
      title: '', payload: {}
    });
    assert.equal(startedEstimate.status, 201);
    const started = startedEstimate.data;
    estimateIds.push(started.id);
    numbers.push(Number(started.proposalCode));
    assert.equal(started.status, 'RASCUNHO');
    assert.equal(started.mode, 'NOVA');
    assert.equal(started.revisionNumber, 0);
    assert.equal(started.title, '');
    assert.equal(started.createdByUserId, user.id);
    assert.equal(started.payload.schemaVersion, 2);
    assert.ok(started.updatedAt);
    assert.ok((await request('/levantamentos?status=RASCUNHO')).data.items.some(item => item.id === started.id));
    assert.deepEqual((await request(`/levantamentos/${started.id}`)).data.payload, started.payload);
    assert.ok((await db.proposalNumberReservation.findUnique({
      where: { number: Number(started.proposalCode) }
    })).firstUsedAt);
    assert.equal(await db.costEstimateVersion.count({ where: { costEstimateId: started.id } }), 0);

    const resumed = await request(`/levantamentos/${started.id}`, 'PUT', {
      proposalCode: started.proposalCode, mode: 'NOVA', status: 'RASCUNHO',
      expectedUpdatedAt: started.updatedAt, title: 'Retomado',
      payload: { ...started.payload, title: 'Retomado' }
    });
    assert.equal(resumed.status, 200);
    assert.equal(resumed.data.id, started.id);
    assert.equal(resumed.data.proposalCode, started.proposalCode);
    assert.equal(await db.costEstimate.count({ where: { proposalCode: started.proposalCode } }), 1);

    // Falhas antes e depois de criar o registro desfazem a reserva e a sequência.
    for (const failureStep of ['create', 'markUsed']) {
      const before = (await request('/numeracao/status')).data;
      const failure = new Error(`Falha simulada: ${failureStep}`);
      const failingDb = {
        $transaction: action => db.$transaction(tx => action({
          proposalNumberingState: tx.proposalNumberingState,
          proposalNumberReservation: {
            findUnique: args => tx.proposalNumberReservation.findUnique(args),
            create: args => tx.proposalNumberReservation.create(args),
            updateMany: args => failureStep === 'markUsed'
              ? Promise.reject(failure) : tx.proposalNumberReservation.updateMany(args)
          },
          costEstimate: {
            create: args => failureStep === 'create'
              ? Promise.reject(failure) : tx.costEstimate.create(args)
          }
        }))
      };
      await assert.rejects(() => startCostEstimate(failingDb, user, { title: '', payload: {} }), failure);
      assert.deepEqual((await request('/numeracao/status')).data, before);
      assert.equal(await db.proposalNumberReservation.findUnique({ where: { number: before.nextNumber } }), null);
      assert.equal(await db.costEstimate.count({ where: { proposalCode: String(before.nextNumber) } }), 0);
    }

    const proposal = await request('/propostas', 'POST', {
      proposalCode: await nextNumber(), email: 'contato@', payload: { attendance: '5 dias', title: 'Em andamento' }
    });
    assert.equal(proposal.status, 201);
    proposalIds.push(proposal.data.id);
    assert.equal(proposal.data.sellerName, '');
    assert.equal(proposal.data.clientName, '');
    const updated = await request(`/propostas/${proposal.data.id}`, 'PUT', {
      expectedUpdatedAt: proposal.data.updatedAt, contact: 'Contato preenchido', email: '',
      payload: { ...proposal.data.payload, contact: 'Contato preenchido', email: '' }
    });
    assert.equal(updated.status, 200);
    const reopened = await request(`/propostas/${proposal.data.id}`);
    assert.equal(reopened.data.contact, 'Contato preenchido');
    assert.equal(reopened.data.payload.attendance, '5 dias');
    const drafts = await request('/propostas?status=RASCUNHO');
    assert.equal(drafts.status, 200);
    assert.ok(drafts.data.items.some(item => item.id === proposal.data.id));
    assert.ok(drafts.data.items.every(item => item.status === 'RASCUNHO'));
    assert.ok(!(await request('/propostas?status=FINALIZADA')).data.items.some(item => item.id === proposal.data.id));
    assert.equal((await request(`/propostas/${proposal.data.id}/finalizar-local`, 'POST')).status, 422);

    const estimate = await request('/levantamentos', 'POST', {
      proposalCode: await nextNumber(), title: '', mode: 'NOVA', status: 'RASCUNHO', payload: { title: '' }
    });
    assert.equal(estimate.status, 201);
    estimateIds.push(estimate.data.id);
    assert.equal(estimate.data.title, '');
    const estimates = await request('/levantamentos?status=RASCUNHO');
    assert.ok(estimates.data.items.some(item => item.id === estimate.data.id));
    assert.ok(estimates.data.items.every(item => item.status === 'RASCUNHO'));
    assert.equal((await request(`/levantamentos/${estimate.data.id}`, 'PUT', {
      proposalCode: estimate.data.proposalCode, mode: 'NOVA', status: 'SALVO', title: '',
      expectedUpdatedAt: estimate.data.updatedAt, payload: estimate.data.payload
    })).status, 400);

    const completedEstimate = await request(`/levantamentos/${estimate.data.id}`, 'PUT', {
      proposalCode: estimate.data.proposalCode, mode: 'NOVA', status: 'SALVO',
      title: 'Levantamento vinculado', expectedUpdatedAt: estimate.data.updatedAt, payload: {}
    });
    assert.equal(completedEstimate.status, 200);
    const linkedProposal = await request('/propostas', 'POST', {
      proposalCode: estimate.data.proposalCode, costEstimateId: estimate.data.id,
      payload: { title: 'Proposta com custos' }
    });
    assert.equal(linkedProposal.status, 201);
    proposalIds.push(linkedProposal.data.id);
    const editedEstimate = await request(`/levantamentos/${estimate.data.id}`, 'PUT', {
      proposalCode: estimate.data.proposalCode, mode: 'NOVA', status: 'RASCUNHO',
      title: 'Custos em edição', expectedUpdatedAt: completedEstimate.data.updatedAt, payload: {}
    });
    assert.equal(editedEstimate.status, 200);
    assert.equal(editedEstimate.data.propostaVinculada.id, linkedProposal.data.id,
      'Salvar custos deve devolver o ID da proposta existente para continuar sem duplicar');
    const loadedEstimate = await request(`/levantamentos/${estimate.data.id}`);
    assert.equal(loadedEstimate.data.propostaVinculada.id, linkedProposal.data.id);
    const listedEstimates = await request('/levantamentos');
    assert.equal(listedEstimates.data.items.find(item => item.id === estimate.data.id)
      .propostaVinculada.id, linkedProposal.data.id);
    const savedLinkedProposal = await request(`/propostas/${linkedProposal.data.id}`, 'PUT', {
      expectedUpdatedAt: linkedProposal.data.updatedAt, costEstimateId: estimate.data.id,
      payload: { title: 'Proposta em edição', attendance: '10 dias' }
    });
    assert.equal(savedLinkedProposal.status, 200);
    assert.equal(savedLinkedProposal.data.costEstimateId, estimate.data.id);
    assert.equal(savedLinkedProposal.data.payload.attendance, '10 dias');
    assert.equal((await request(`/levantamentos/${estimate.data.id}`)).data.status, 'RASCUNHO');
    // Vincular o rascunho a uma nova revisão continua exigindo a conclusão.
    assert.equal((await request('/propostas', 'POST', {
      proposalCode: estimate.data.proposalCode, revisionNumber: 1,
      costEstimateId: estimate.data.id, payload: {}
    })).status, 422);

    const completedAgain = await request(`/levantamentos/${estimate.data.id}`, 'PUT', {
      proposalCode: estimate.data.proposalCode, mode: 'NOVA', payload: {},
      status: 'SALVO', title: 'Custos em edição', expectedUpdatedAt: editedEstimate.data.updatedAt
    });
    assert.equal(completedAgain.status, 200);
    const revision = await request('/propostas', 'POST', {
      proposalCode: estimate.data.proposalCode, revisionNumber: 1,
      costEstimateId: estimate.data.id, payload: { title: 'Revisão usando os mesmos custos' }
    });
    assert.equal(revision.status, 201);
    proposalIds.push(revision.data.id);
    assert.equal((await request(`/levantamentos/${estimate.data.id}`)).data.propostaVinculada.id,
      linkedProposal.data.id, 'Uma revisão posterior não deve tomar o lugar da proposta deste levantamento');
    const history = await request('/levantamentos');
    assert.equal(history.data.items.find(item => item.id === estimate.data.id).propostaVinculada.id,
      linkedProposal.data.id);
  });
