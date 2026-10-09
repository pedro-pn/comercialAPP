import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { linkProposalToPrisma } from '../src/comercial/proposals.js';

const author = { id: 'autor', role: 'SELLER', name: 'Vendedor' };
const releaseId = '36a53577-b7d9-4e14-aa29-01b0f7d66ad1';
const otherReleaseId = '46a53577-b7d9-4e14-aa29-01b0f7d66ad1';
const taxId = '11222333000181';

function fixture({ proposal: fields = {}, release: releaseFields = {}, newer, otherLink, alternateRelease = false } = {}) {
  let proposal = {
    id: 'proposta', proposalCode: '4638', revisionNumber: 0,
    createdByUserId: author.id, archivedAt: null, status: 'RASCUNHO',
    updatedAt: new Date('2026-10-08T14:00:00Z'),
    clientName: 'Cliente sintético', cnpj: '11.222.333/0001-81', contact: 'Contato salvo',
    email: 'proposta@example.invalid', site: 'Local salvo', sellerName: 'Consultor',
    estimatorName: 'Vendedor', costEstimateId: 'levantamento', totalValue: '12500.00',
    payload: { title: 'Serviço salvo', prices: [{ value: 'R$ 12.500,00' }],
      scope: [{ description: 'Escopo existente' }] },
    documents: [{ id: 'pdf-existente' }], attachments: [{ id: 'anexo-existente' }],
    nectarOpportunityId: 'card-nectar', crmProjectId: 'projeto-filtro',
    crmReleaseId: null, crmClientId: null, crmOpportunityId: null, prismaProjectId: null,
    prismaDeliveryStatus: 'PENDENTE', prismaDeliveryAttempts: 0, crmApprovalStatus: 'PENDENTE',
    crmStatusSequence: 0,
    ...fields
  };
  const release = { id: releaseId, status: 'ACTIVE', version: 2,
    clientId: 'cliente-prisma', opportunityId: 'oportunidade-prisma', prismaProjectId: 'missao-prisma',
    snapshot: { taxId, legalName: 'Nome cadastrado no Prisma', contactName: 'Outro contato',
      email: 'contato-prisma@example.invalid', department: '',
      site: 'Local cadastrado no Prisma', description: 'Solicitação recebida' }, ...releaseFields };
  let writes = 0;
  const db = {
    $queryRaw: async () => [],
    $transaction: async callback => callback(db),
    crmRelease: { findUnique: async ({ where }) => where.id === release.id ? release :
      alternateRelease && where.id === otherReleaseId
        ? { ...release, id: otherReleaseId, opportunityId: 'segunda-oportunidade' } : null },
    proposal: {
      findUnique: async ({ where }) => where.id === proposal.id ? proposal : null,
      findFirst: async ({ where }) => where.revisionNumber ? newer || null : otherLink || null,
      update: async ({ where, data }) => {
        if (Object.entries(where).some(([key, value]) => value instanceof Date
          ? value.getTime() !== proposal[key]?.getTime() : value !== proposal[key])) {
          throw Object.assign(new Error('Proposta alterada'), { code: 'P2025' });
        }
        writes++;
        proposal = { ...proposal, ...data };
        return proposal;
      }
    }
  };
  return { db, current: () => proposal, release, writes: () => writes,
    input: () => ({ crmReleaseId: release.id, expectedReleaseVersion: release.version,
      expectedUpdatedAt: proposal.updatedAt.toISOString() }) };
}

test('associação preserva a proposta 4638, seus valores, conteúdo, documentos e vínculos existentes', async () => {
  for (const user of [author, { id: 'gestor', role: 'MANAGER', name: 'Gestor' }]) {
    const f = fixture();
    const original = structuredClone(f.current());
    const result = await linkProposalToPrisma(f.db, user, original.id, f.input());
    assert.deepEqual(result, { ...original,
      crmReleaseId: releaseId, crmClientId: f.release.clientId,
      crmOpportunityId: f.release.opportunityId, prismaProjectId: f.release.prismaProjectId,
      updatedByUserId: user.id, updatedByLabel: user.name, updatedAt: result.updatedAt });
    assert.ok(result.updatedAt > original.updatedAt);
    assert.equal(f.writes(), 1);
  }
});

test('associação respeita autoria, estado, envio e decisões da proposta', async () => {
  for (const [user, fields, status] of [
    [{ ...author, id: 'outro' }, {}, 403],
    [{ ...author, role: 'VIEWER' }, {}, 403],
    [author, { archivedAt: new Date() }, 409],
    [author, { status: 'FINALIZADA' }, 409],
    [author, { status: 'FINALIZANDO' }, 409],
    [author, { status: 'FALHA_INTEGRACAO' }, 409],
    [author, { prismaReceivedId: 'recebida' }, 409],
    [author, { prismaDeliveryAttempts: 1 }, 409],
    [author, { prismaDeliveryStatus: 'ENVIANDO' }, 409],
    [author, { prismaDeliveryStatus: 'SUCESSO' }, 409],
    [author, { crmApprovalStatus: 'APPROVED' }, 409],
    [author, { crmApprovalAt: new Date() }, 409],
    [author, { crmStatusSequence: 1 }, 409],
    [author, { crmOpportunityId: 'outro-negocio' }, 409]
  ]) {
    const f = fixture({ proposal: fields });
    await assert.rejects(linkProposalToPrisma(f.db, user, 'proposta', f.input()), { status });
    assert.equal(f.writes(), 0);
  }
});

test('rascunho 4640 sem cliente e CNPJ recebe apenas a identificação do negócio selecionado', async () => {
  for (const cnpj of ['', '   ']) {
    const f = fixture({ proposal: { proposalCode: '4640', clientName: '', cnpj,
      payload: { client: '', cnpj: '', title: 'Serviço em preenchimento',
        prices: [{ value: 'R$ 12.500,00' }], scope: [{ description: 'Escopo negociado' }] } } });
    const original = structuredClone(f.current());
    const input = f.input();
    const result = await linkProposalToPrisma(f.db, author, original.id, input);
    assert.deepEqual(result, { ...original,
      clientName: f.release.snapshot.legalName, cnpj: taxId,
      payload: { ...original.payload, client: f.release.snapshot.legalName, cnpj: taxId },
      crmReleaseId: releaseId, crmClientId: f.release.clientId,
      crmOpportunityId: f.release.opportunityId, prismaProjectId: f.release.prismaProjectId,
      updatedByUserId: author.id, updatedByLabel: author.name, updatedAt: result.updatedAt });
    assert.deepEqual(await linkProposalToPrisma(f.db, author, original.id, input), result);
    assert.equal(f.writes(), 1);
  }
});

test('CNPJ ausente pode ser completado sem substituir o nome e os dados já preenchidos', async () => {
  const f = fixture({ proposal: { cnpj: '' } });
  const original = structuredClone(f.current());
  const result = await linkProposalToPrisma(f.db, author, original.id, f.input());
  assert.equal(result.cnpj, taxId);
  assert.equal(result.clientName, original.clientName);
  assert.deepEqual(result.payload, { ...original.payload, cnpj: taxId });
  for (const field of ['contact', 'email', 'site', 'totalValue', 'costEstimateId', 'documents', 'attachments']) {
    assert.deepEqual(result[field], original[field]);
  }
});

test('vínculo completa todos os campos vazios do cliente nas colunas e no conteúdo salvo', async () => {
  const f = fixture({ proposal: { proposalCode: '4642', clientName: '', cnpj: '',
    contact: '', email: '', department: null, site: '',
    payload: { client: '', cnpj: '', contact: '', email: '', department: '', site: '', title: '',
      prices: [{ value: 'R$ 12.500,00' }], scope: 'Escopo negociado', payment: 'Condição negociada' } } });
  f.release.snapshot.department = 'Engenharia';
  const original = structuredClone(f.current());
  const result = await linkProposalToPrisma(f.db, author, original.id, f.input());
  for (const [column, field, source] of [
    ['clientName', 'client', 'legalName'], ['cnpj', 'cnpj', 'taxId'],
    ['contact', 'contact', 'contactName'], ['email', 'email', 'email'],
    ['department', 'department', 'department'], ['site', 'site', 'site']
  ]) {
    assert.equal(result[column], f.release.snapshot[source]);
    assert.equal(result.payload[field], result[column]);
  }
  assert.equal(result.payload.title, f.release.snapshot.description);
  for (const field of ['proposalCode', 'revisionNumber', 'totalValue', 'costEstimateId', 'documents', 'attachments']) {
    assert.deepEqual(result[field], original[field]);
  }
  for (const field of ['prices', 'scope', 'payment']) assert.deepEqual(result.payload[field], original.payload[field]);
});

test('contato salvo só no payload prevalece e departamento ausente no Prisma continua vazio', async () => {
  const payload = { contact: 'Contato escolhido', email: 'escolhido@example.invalid', site: 'Local escolhido',
    title: 'Título negociado', department: '' };
  const f = fixture({ proposal: { contact: '', email: '', site: '', department: null, payload } });
  const result = await linkProposalToPrisma(f.db, author, 'proposta', f.input());
  assert.equal(result.contact, payload.contact);
  assert.equal(result.email, payload.email);
  assert.equal(result.site, payload.site);
  assert.equal(result.department, null);
  assert.deepEqual(result.payload, payload);
});

test('identificação salva só no payload continua protegida pelo CNPJ e preserva o nome original', async () => {
  const f = fixture({ proposal: { clientName: '', cnpj: '',
    payload: { client: 'Nome já preenchido', cnpj: '11.222.333/0001-81', scope: 'Escopo existente', title: 'Título salvo' } } });
  const originalPayload = structuredClone(f.current().payload);
  const result = await linkProposalToPrisma(f.db, author, 'proposta', f.input());
  assert.equal(result.clientName, originalPayload.client);
  assert.equal(result.cnpj, originalPayload.cnpj);
  assert.deepEqual(result.payload, originalPayload);
  const other = fixture({ proposal: { cnpj: '', payload: { cnpj: '99888777000166' } } });
  await assert.rejects(linkProposalToPrisma(other.db, author, 'proposta', other.input()), { status: 409 });
  assert.equal(other.writes(), 0);
});

test('falha na liberação não preenche a identificação nem associa o rascunho vazio', async () => {
  for (const release of [{ status: 'REVOKED' }, { version: 1 }]) {
    const f = fixture({ proposal: { clientName: '', cnpj: '' }, release });
    const original = structuredClone(f.current());
    await assert.rejects(linkProposalToPrisma(f.db, author, 'proposta', {
      ...f.input(), expectedReleaseVersion: 2
    }), { status: 409 });
    assert.deepEqual(f.current(), original);
    assert.equal(f.writes(), 0);
  }
});

test('somente liberação ativa do mesmo CNPJ e da versão selecionada pode ser vinculada', async () => {
  for (const [options, input, status] of [
    [{ release: { status: 'REVOKED' } }, {}, 409],
    [{ release: { snapshot: { taxId: '99888777000166' } } }, {}, 409],
    [{ proposal: { cnpj: '123' } }, {}, 422],
    [{ proposal: { cnpj: './-' } }, {}, 422],
    [{}, { crmReleaseId: otherReleaseId }, 409],
    [{}, { expectedReleaseVersion: 1 }, 409],
    [{ newer: { id: 'revisao-mais-recente' } }, {}, 409],
    [{ otherLink: { crmReleaseId: otherReleaseId } }, {}, 409]
  ]) {
    const f = fixture(options);
    await assert.rejects(linkProposalToPrisma(f.db, author, 'proposta', { ...f.input(), ...input }), { status });
    assert.equal(f.writes(), 0);
  }
});

test('repetir o mesmo vínculo é idempotente e não permite trocar o negócio', async () => {
  const f = fixture();
  const input = f.input();
  const first = await linkProposalToPrisma(f.db, author, 'proposta', input);
  assert.deepEqual(await linkProposalToPrisma(f.db, author, 'proposta', input), first);
  assert.equal(f.writes(), 1);
  await assert.rejects(linkProposalToPrisma(f.db, author, 'proposta', {
    ...f.input(), crmReleaseId: otherReleaseId
  }), { status: 409 });
  assert.equal(f.writes(), 1);
});

test('versão antiga e gravação concorrente não sobrescrevem a proposta', async () => {
  const f = fixture({ alternateRelease: true });
  await assert.rejects(linkProposalToPrisma(f.db, author, 'proposta', {
    ...f.input(), expectedUpdatedAt: '2026-10-08T13:00:00Z'
  }), { code: 'COMERCIAL_CONCURRENT_WRITE', status: 409 });
  const input = f.input();
  const results = await Promise.allSettled([
    linkProposalToPrisma(f.db, author, 'proposta', input),
    linkProposalToPrisma(f.db, author, 'proposta', { ...input, crmReleaseId: otherReleaseId })
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.status, 409);
  assert.equal(f.writes(), 1);
});

test('rota de vínculo exige sessão, origem, versão e corpo restrito', async t => {
  const f = fixture({ proposal: { proposalCode: '4640', clientName: '', cnpj: '', contact: '', email: '', site: '' } });
  const viewer = { id: 'consulta', role: 'VIEWER' };
  const users = [author, viewer, { id: 'outro', role: 'SELLER' }];
  const server = createApp({ commercialDb: f.db,
    authService: { authenticate: token => users.find(user => user.id === token) }
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/comercial`;
  const request = (user, body = f.input(), csrf = true) => fetch(base + '/propostas/proposta/vincular-prisma', {
    method: 'POST', headers: { 'Content-Type': 'application/json',
      ...(user ? { Cookie: `comercial_session=${user.id}` } : {}),
      ...(csrf ? { 'X-Comercial-Request': '1' } : {}) }, body: JSON.stringify(body)
  });
  assert.equal((await request(null)).status, 401);
  assert.equal((await request(viewer)).status, 403);
  assert.equal((await request(users[2])).status, 403);
  assert.equal((await request(author, f.input(), false)).status, 403);
  for (const change of [{ crmReleaseId: 'inválida' }, { expectedReleaseVersion: 0 },
    { expectedUpdatedAt: 'inválida' }, { forceOverwrite: true }, { payload: { title: 'Substituir' } }]) {
    assert.equal((await request(author, { ...f.input(), ...change })).status, 400);
  }
  assert.equal(f.writes(), 0);
  const response = await request(author);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.proposalCode, '4640');
  assert.equal(result.crmReleaseId, releaseId);
  assert.equal(result.clientName, f.release.snapshot.legalName);
  assert.equal(result.cnpj, taxId);
  assert.equal(result.payload.client, result.clientName);
  assert.equal(result.payload.cnpj, result.cnpj);
  assert.equal(result.contact, f.release.snapshot.contactName);
  assert.equal(result.email, f.release.snapshot.email);
  assert.equal(result.site, f.release.snapshot.site);
  assert.equal(result.payload.contact, result.contact);
  assert.equal(result.payload.email, result.email);
  assert.equal(result.payload.site, result.site);
  assert.equal(result.payload.title, 'Serviço salvo');
});
