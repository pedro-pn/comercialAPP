import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { createAuthService } from '../src/auth/service.js';
import { createDatabase } from '../src/db.js';
import { downloadDocument, finalizeLocal, issueDocuments } from '../src/comercial/documents.js';
import { crmStatus, sendProposalToCrm } from '../src/comercial/crm-delivery.js';
import { createNectarClient } from '../src/comercial/nectar.js';
import { recordCrmEvent, deliverToFiltro, crmBridgeStatus,
  syncNectarOpportunity, findFiltroProjects } from '../src/comercial/crm-bridge.js';
import { sendProposalToSharePoint } from '../src/comercial/sharepoint-delivery.js';
import { lerConfiguracao, salvarSede, distanciaDaSede } from '../src/comercial/configuracao.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('rascunhos, autoria, valores e concorrência no banco próprio', { skip: !databaseUrl }, async t => {
  assert.equal(new URL(databaseUrl).pathname, '/comercialapp_test');
  const db = createDatabase(databaseUrl);
  const storageDir = await mkdtemp(path.join(os.tmpdir(), 'comercialapp-files-test-'));
  const oldStorageDir = process.env.COMERCIAL_DIR;
  process.env.COMERCIAL_DIR = storageDir;
  const auth = createAuthService(db);
  const disabledCrm = createNectarClient({ config: {
    mode: 'off', token: '', responsibleId: '', allowedPipelines: []
  }, request: () => { throw new Error('O teste não pode acessar o Nectar.'); } });
  const server = createApp({ authService: auth, commercialDb: db,
    crm: disabledCrm,
    appOrigin: 'http://localhost:5174' }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await db.$disconnect();
    await rm(storageDir, { recursive: true, force: true });
    if (oldStorageDir === undefined) delete process.env.COMERCIAL_DIR;
    else process.env.COMERCIAL_DIR = oldStorageDir;
  });

  await db.proposal.deleteMany();
  await db.costEstimateVersion.deleteMany();
  await db.costEstimate.deleteMany();
  await db.proposalNumberReservation.deleteMany();
  await db.proposalNumberingState.deleteMany();
  await db.scopePhotoAsset.deleteMany();
  await db.session.deleteMany();
  await db.apiCredential.deleteMany();
  await db.user.deleteMany();

  const manager = await auth.bootstrapAdmin({
    username: 'gestor', name: 'Gestor', password: 'senha-segura-123'
  });
  const sede = await salvarSede(db, manager, { sedeEndereco: 'Rua de Teste, 100, São Paulo' });
  assert.equal(sede.sedeEndereco, 'Rua de Teste, 100, São Paulo');
  assert.equal((await lerConfiguracao(db)).sedeEndereco, sede.sedeEndereco);
  assert.equal((await distanciaDaSede(db, 'Avenida Teste, 200, Santos')).km, null);
  const seller = await auth.createUser({
    username: 'vendedor', name: 'Vendedor', role: 'SELLER', password: 'senha-segura-456'
  }, manager);
  await auth.createUser({
    username: 'colega', name: 'Outro Vendedor', role: 'SELLER', password: 'senha-segura-789'
  }, manager);
  await auth.createUser({
    username: 'consulta', name: 'Consulta', role: 'VIEWER', password: 'senha-segura-abc'
  }, manager);

  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, { method = 'GET', body, cookie } = {}) => {
    const response = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Comercial-Request': '1',
        ...(cookie ? { Cookie: cookie } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { status: response.status, data: await response.json(), response };
  };
  const login = async (username, password) => {
    const result = await request('/api/auth/login', { method: 'POST', body: { username, password } });
    assert.equal(result.status, 200);
    return result.response.headers.get('set-cookie').split(';')[0];
  };
  const managerCookie = await login('gestor', 'senha-segura-123');
  const sellerCookie = await login('vendedor', 'senha-segura-456');
  const colleagueCookie = await login('colega', 'senha-segura-789');
  const viewerCookie = await login('consulta', 'senha-segura-abc');

  assert.equal((await request('/api/comercial/nectar/funis', {
    cookie: sellerCookie
  })).data.items.length, 0);
  assert.equal((await request('/api/comercial/crm/empresas?busca=Empresa', {
    cookie: sellerCookie
  })).status, 503);

  assert.equal((await request('/api/comercial/propostas/proximo-numero', {
    method: 'POST', cookie: sellerCookie
  })).status, 503);
  assert.equal((await request('/api/comercial/numeracao/inicializar', {
    method: 'POST', cookie: managerCookie, body: { initialNumber: 8700 }
  })).status, 201);
  assert.equal((await request('/api/comercial/numeracao/inicializar', {
    method: 'POST', cookie: managerCookie, body: { initialNumber: 9000 }
  })).status, 409);
  const reserved = await request('/api/comercial/propostas/proximo-numero', {
    method: 'POST', cookie: sellerCookie
  });
  assert.equal(reserved.data.numero, 8700);
  assert.equal((await request('/api/comercial/propostas/proximo-numero', {
    method: 'POST', cookie: sellerCookie
  })).data.numero, 8701);

  const estimate = await request('/api/comercial/levantamentos', {
    method: 'POST', cookie: sellerCookie,
    body: {
      proposalCode: '8700', title: 'Levantamento de teste', mode: 'NOVA',
      status: 'SALVO', payload: {}
    }
  });
  assert.equal(estimate.status, 201);
  assert.equal(estimate.data.proposalCode, '8700');
  assert.equal(Number(estimate.data.totalCost), 0);

  const proposal = await request('/api/comercial/propostas', {
    method: 'POST', cookie: sellerCookie,
    body: {
      proposalCode: '8700', costEstimateId: estimate.data.id,
      clientName: 'Cliente Teste', cnpj: '12345678000100',
      contact: 'Contato', email: 'cliente@example.com', site: 'Obra',
      sellerUserId: seller.id,
      payload: { title: 'Teste', prices: [{ local: 'ONSHORE', value: 'R$ 1.200,00' }] }
    }
  });
  assert.equal(proposal.status, 201);
  assert.equal(Number(proposal.data.totalValue), 1200);
  assert.equal(proposal.data.createdByUserId, seller.id);

  const listForViewer = await request('/api/comercial/propostas', { cookie: viewerCookie });
  assert.equal(listForViewer.status, 200);
  assert.equal(listForViewer.data.items.length, 1);
  assert.equal('totalValue' in listForViewer.data.items[0], false);
  assert.equal((await request(`/api/comercial/propostas/${proposal.data.id}`, {
    cookie: viewerCookie
  })).status, 403);
  assert.equal((await request('/api/comercial/propostas', {
    cookie: colleagueCookie
  })).data.items.length, 0);
  assert.equal((await request(`/api/comercial/levantamentos/${estimate.data.id}`, {
    cookie: colleagueCookie
  })).status, 403);
  assert.equal((await request('/api/comercial/propostas', {
    method: 'POST', cookie: colleagueCookie,
    body: {
      proposalCode: '8700', clientName: 'Outro', cnpj: '12345678000100',
      contact: 'Contato', email: 'outro@example.com', site: 'Obra',
      sellerUserId: seller.id, payload: {}
    }
  })).status, 403);

  const updated = await request(`/api/comercial/propostas/${proposal.data.id}`, {
    method: 'PUT', cookie: sellerCookie,
    body: { expectedUpdatedAt: proposal.data.updatedAt,
      payload: { prices: [{ local: 'ONSHORE', value: 'R$ 1.500,00' }] } }
  });
  assert.equal(updated.status, 200);
  assert.equal(Number(updated.data.totalValue), 1500);
  const stale = await request(`/api/comercial/propostas/${proposal.data.id}`, {
    method: 'PUT', cookie: sellerCookie,
    body: { expectedUpdatedAt: proposal.data.updatedAt,
      payload: { prices: [{ local: 'ONSHORE', value: 'R$ 2.000,00' }] } }
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.code, 'COMERCIAL_CONCURRENT_WRITE');
  const photoBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlM0S8AAAAASUVORK5CYII=',
    'base64');
  const photoResponse = await fetch(base + '/api/comercial/escopo/fotos', {
    method: 'POST', headers: { Cookie: sellerCookie, 'X-Comercial-Request': '1',
      'Content-Type': 'image/png', 'x-file-name': encodeURIComponent('foto.png') },
    body: photoBytes
  });
  assert.equal(photoResponse.status, 201);
  const photo = await photoResponse.json();
  assert.equal((await fetch(base + `/api/comercial/escopo/fotos/${photo.id}`, {
    headers: { Cookie: sellerCookie }
  })).status, 200);
  assert.equal((await fetch(base + `/api/comercial/escopo/fotos/${photo.id}`, {
    headers: { Cookie: colleagueCookie }
  })).status, 403);
  const completed = await request(`/api/comercial/propostas/${proposal.data.id}`, {
    method: 'PUT', cookie: sellerCookie,
    body: { expectedUpdatedAt: updated.data.updatedAt,
      payload: {
        title: 'Serviço teste', scopeItems: [{ id: 'servico-1', title: 'Limpeza', description: 'Escopo' }],
        scopeBlocks: [{ id: photo.id, type: 'photo', scopeItemId: 'servico-1',
          assetKey: photo.assetKey, fileName: 'foto.png', aspectRatio: 1 }],
        prices: [{ local: 'ONSHORE', value: 'R$ 1.500,00' }],
        technicalServices: [{ id: 'limpeza_quimica' }]
      } }
  });
  assert.equal(completed.status, 200);
  const fakePair = async (data, type) => {
    assert.equal(data.proposalCode, '8700');
    assert.equal(data.seller, 'Vendedor');
    assert.deepEqual((await data.lerFoto(data.scopeBlocks[0])).bytes, photoBytes);
    return { docx: Buffer.from(`PK-${type}`), pdf: Buffer.from(`%PDF-${type}\n%%EOF`) };
  };
  await assert.rejects(() => issueDocuments(db,
    { id: 'colleague', role: 'SELLER' }, proposal.data.id, fakePair), { status: 403 });
  const issued = await issueDocuments(db, seller, proposal.data.id, fakePair);
  assert.equal(issued.documentos.length, 4);
  assert.equal((await issueDocuments(db, seller, proposal.data.id, fakePair)).documentos.length, 4);
  assert.equal((await db.proposalDocument.count({ where: { proposalId: proposal.data.id } })), 4);
  const technical = issued.documentos.find(item => item.kind === 'TECNICA' && item.format === 'PDF');
  const commercial = issued.documentos.find(item => item.kind === 'COMERCIAL' && item.format === 'PDF');
  assert.match((await downloadDocument(db, { role: 'VIEWER' }, technical.id)).bytes.toString(), /^%PDF-/);
  await assert.rejects(() => downloadDocument(db, { role: 'VIEWER' }, commercial.id), { status: 403 });
  await db.proposal.update({ where: { id: proposal.data.id },
    data: { payload: { ...completed.data.payload, title: 'Serviço atualizado' } } });
  await assert.rejects(() => finalizeLocal(db, seller, proposal.data.id), { status: 409 });
  assert.equal((await issueDocuments(db, seller, proposal.data.id, fakePair)).documentos.length, 4);
  const attachmentResponse = await fetch(base + `/api/comercial/propostas/${proposal.data.id}/anexos`, {
    method: 'POST', headers: { Cookie: sellerCookie, 'X-Comercial-Request': '1',
      'Content-Type': 'application/pdf', 'x-file-name': encodeURIComponent('ART.pdf') },
    body: Buffer.from('%PDF-attachment')
  });
  assert.equal(attachmentResponse.status, 201);
  const attachment = await attachmentResponse.json();
  assert.equal(attachment.originalName, 'ART.pdf');
  const jsonAttachment = await fetch(base + `/api/comercial/propostas/${proposal.data.id}/anexos`, {
    method: 'POST', headers: { Cookie: sellerCookie, 'X-Comercial-Request': '1',
      'Content-Type': 'application/json', 'x-file-name': encodeURIComponent('dados.json') },
    body: Buffer.from('{"teste":true}')
  });
  assert.equal(jsonAttachment.status, 201);
  assert.equal((await request(`/api/comercial/propostas/${proposal.data.id}/anexos`, {
    cookie: sellerCookie
  })).data.items.length, 2);
  const finalized = await finalizeLocal(db, seller, proposal.data.id);
  assert.equal(finalized.status, 'FINALIZADA');
  assert.equal((await request(`/api/comercial/propostas/${proposal.data.id}/enviar-crm`, {
    method: 'POST', cookie: sellerCookie,
    body: { pipelineId: '44', companyId: '101', contactId: '201' }
  })).status, 503);
  const fakeCrm = createNectarClient({ config: {
    mode: 'fake', token: '', responsibleId: '', allowedPipelines: ['44']
  }, request: () => { throw new Error('Modo fake não deve acessar a rede.'); } });
  const crmInput = { pipelineId: '44', companyId: '101', contactId: '201' };
  const simulated = await sendProposalToCrm(db, seller, proposal.data.id, crmInput, fakeCrm);
  assert.equal(simulated.status, 'SIMULADO');
  assert.equal((await crmStatus(db, seller, proposal.data.id)).status, 'PENDENTE');
  let creations = 0;
  let attachments = 0;
  const realCrm = {
    config: { mode: 'real', token: 'test-token', responsibleId: '7', allowedPipelines: ['44'] },
    async funnels() { return { items: [{ id: '44', nome: 'Funil de teste', primeiraEtapa: 1 }] }; },
    async companyDetails() { return { id: '101', contatos: [{ id: '201' }] }; },
    async createOpportunity() { creations += 1; return { id: 'card-700', created: true }; },
    async attach(_id, files) {
      attachments += 1;
      assert.equal(files.length, 5); // dois PDFs, CSV de custos e dois anexos
      if (attachments === 1) throw new Error('Falha simulada ao anexar.');
    }
  };
  assert.equal((await sendProposalToCrm(db, seller, proposal.data.id,
    crmInput, realCrm)).status, 'ERRO');
  assert.equal((await crmStatus(db, seller, proposal.data.id)).opportunityId, 'card-700');
  assert.equal((await sendProposalToCrm(db, seller, proposal.data.id,
    crmInput, realCrm)).status, 'SUCESSO');
  assert.equal(creations, 1);
  assert.equal(attachments, 2);
  assert.equal((await sendProposalToCrm(db, seller, proposal.data.id,
    crmInput, realCrm)).status, 'SUCESSO');
  assert.equal(attachments, 2);
  const sharepoint = await sendProposalToSharePoint(db, seller, proposal.data.id, {}, {
    indisponivel: () => '', modoDoSharePoint: () => 'fake',
    gravarArquivos: async files => ({ pasta: 'testes/proposta-8700', arquivos: files.length })
  });
  assert.equal(sharepoint.status, 'SIMULADO');
  assert.equal(sharepoint.files, 5);
  assert.equal((await db.proposal.findUnique({ where: { id: proposal.data.id } })).sharepointStatus,
    'PENDENTE');

  const event = { eventId: crypto.randomUUID(), proposalCode: '8700', revisionNumber: 0,
    approvalStatus: 'APPROVED', projectId: 'project-test-1', opportunityId: 'card-700',
    occurredAt: new Date().toISOString() };
  const received = await recordCrmEvent(db, event);
  assert.equal(received.duplicate, false);
  assert.equal((await recordCrmEvent(db, event)).duplicate, true);
  assert.equal((await crmBridgeStatus(db, seller, proposal.data.id)).projectId, 'project-test-1');
  const oldProjectField = process.env.NECTAR_PROJECT_FIELD;
  process.env.NECTAR_PROJECT_FIELD = 'Projeto FiltroAPP';
  try {
    const updatedAt = new Date(Date.now() + 1000).toISOString();
    const crmSync = { config: { mode: 'real' }, opportunityDetails: async () => ({
      id: 'card-700', status: 2, dataAtualizacao: updatedAt,
      camposPersonalizados: { 'Projeto FiltroAPP': 'project-test-1' }
    }) };
    assert.equal((await syncNectarOpportunity(db, 'card-700', crmSync)).duplicate, false);
    assert.equal((await syncNectarOpportunity(db, 'card-700', crmSync)).duplicate, true);
  } finally {
    if (oldProjectField === undefined) delete process.env.NECTAR_PROJECT_FIELD;
    else process.env.NECTAR_PROJECT_FIELD = oldProjectField;
  }
  const oldUrl = process.env.FILTROAPP_API_URL;
  const oldToken = process.env.FILTROAPP_API_TOKEN;
  process.env.FILTROAPP_API_URL = 'http://filtroapp.test';
  process.env.FILTROAPP_API_TOKEN = 'test-service-token';
  try {
    const foundProjects = await findFiltroProjects('Obra', async (url, options) => {
      assert.match(url, /comercialapp\/projetos\?busca=Obra$/);
      assert.equal(options.headers.Authorization, 'Bearer test-service-token');
      return { ok: true, json: async () => ({ items: [{ id: 'project-test-1', code: 'OBRA-1' }] }) };
    });
    assert.equal(foundProjects.items[0].id, 'project-test-1');
    const delivered = await deliverToFiltro(db, proposal.data.id, async (url, options) => {
      assert.match(url, /\/api\/acompanhamento\/comercial\/comercialapp\/propostas$/);
      assert.equal(options.headers.Authorization, 'Bearer test-service-token');
      const snapshot = JSON.parse(options.body);
      assert.equal(snapshot.projectId, 'project-test-1');
      assert.equal(snapshot.proposalCode, '8700');
      assert.equal(snapshot.salePrice, 1500);
      assert.deepEqual(snapshot.scope, completed.data.payload.scopeItems);
      assert.deepEqual(snapshot.estimateSummary.hours, { normal: 0, overtime: 0, total: 0 });
      assert.equal(snapshot.estimateSummary.costs.total, 0);
      return { ok: true, json: async () => ({ budgetStatus: 'SELECTED' }) };
    });
    assert.equal(delivered.status, 'SUCESSO');
    assert.equal((await deliverToFiltro(db, proposal.data.id)).duplicate, true);
  } finally {
    if (oldUrl === undefined) delete process.env.FILTROAPP_API_URL;
    else process.env.FILTROAPP_API_URL = oldUrl;
    if (oldToken === undefined) delete process.env.FILTROAPP_API_TOKEN;
    else process.env.FILTROAPP_API_TOKEN = oldToken;
  }
  const fallback = await request('/api/comercial/propostas', {
    method: 'POST', cookie: sellerCookie,
    body: { proposalCode: '8701', clientName: 'Cliente manual', cnpj: '12345678000100',
      contact: 'Contato', email: 'manual@example.com', site: 'Obra',
      sellerUserId: seller.id,
      payload: { title: 'Seleção manual', prices: [{ value: 'R$ 100,00' }] } }
  });
  assert.equal(fallback.status, 201);
  await db.proposal.update({ where: { id: fallback.data.id }, data: { status: 'FINALIZADA' } });
  const manualInput = { projectId: 'project-manual-1', reason: 'Nectar sem retorno neste teste.' };
  assert.equal((await request(`/api/comercial/propostas/${fallback.data.id}/selecao-manual`, {
    method: 'POST', cookie: sellerCookie, body: manualInput
  })).status, 403);
  assert.equal((await request(`/api/comercial/propostas/${fallback.data.id}/selecao-manual`, {
    method: 'POST', cookie: managerCookie, body: manualInput
  })).status, 202);
  const manualState = await crmBridgeStatus(db, manager, fallback.data.id);
  assert.equal(manualState.approvalSource, 'MANUAL');
  assert.equal(manualState.projectId, manualInput.projectId);
  process.env.FILTROAPP_API_URL = 'http://filtroapp.test';
  process.env.FILTROAPP_API_TOKEN = 'test-service-token';
  try {
    const failure = await deliverToFiltro(db, fallback.data.id, async () => ({
      ok: false, status: 503, json: async () => ({ error: 'indisponível' })
    }));
    assert.equal(failure.status, 'ERRO');
    const retryState = await crmBridgeStatus(db, manager, fallback.data.id);
    assert.equal(retryState.attempts, 1);
    assert.ok(new Date(retryState.nextRetryAt).getTime() > Date.now());
  } finally {
    if (oldUrl === undefined) delete process.env.FILTROAPP_API_URL;
    else process.env.FILTROAPP_API_URL = oldUrl;
    if (oldToken === undefined) delete process.env.FILTROAPP_API_TOKEN;
    else process.env.FILTROAPP_API_TOKEN = oldToken;
  }
  assert.equal((await request(`/api/comercial/propostas/${proposal.data.id}/anexos/${attachment.id}`, {
    method: 'DELETE', cookie: sellerCookie
  })).status, 409);
  assert.equal((await request(`/api/comercial/propostas/${proposal.data.id}`, {
    method: 'PUT', cookie: sellerCookie,
    body: { expectedUpdatedAt: completed.data.updatedAt, clientName: 'Outro' }
  })).status, 409);

  const legacyPath = '/api/comercial/propostas/legado/revisao';
  const legacyInput = { proposalCode: '8702', revisionNumber: 3 };
  assert.equal((await request(legacyPath, {
    method: 'POST', cookie: sellerCookie, body: legacyInput
  })).status, 201);
  assert.equal((await request(legacyPath, {
    method: 'POST', cookie: sellerCookie, body: legacyInput
  })).status, 200);
  assert.equal((await request(legacyPath, {
    method: 'POST', cookie: colleagueCookie, body: legacyInput
  })).status, 409);
  assert.equal((await request(legacyPath, {
    method: 'POST', cookie: sellerCookie, body: { proposalCode: '8700', revisionNumber: 2 }
  })).status, 409);
  const legacyBody = {
    proposalCode: '8702', revisionNumber: 3,
    clientName: 'Cliente legado', cnpj: '12345678000100',
    contact: 'Contato', email: 'legado@example.com', site: 'Obra',
    sellerUserId: seller.id,
    payload: { title: 'Revisão de proposta legada', prices: [{ value: 'R$ 200,00' }] }
  };
  assert.equal((await request('/api/comercial/propostas', {
    method: 'POST', cookie: sellerCookie, body: { ...legacyBody, revisionNumber: 0 }
  })).status, 409);
  const legacy = await request('/api/comercial/propostas', {
    method: 'POST', cookie: sellerCookie, body: legacyBody
  });
  assert.equal(legacy.status, 201);
  assert.equal(legacy.data.revisionNumber, 3);
  assert.equal((await request('/api/comercial/propostas/8702/revisao', {
    cookie: sellerCookie
  })).data.nextRevision, 4);
  assert.equal((await request('/api/comercial/propostas', {
    method: 'POST', cookie: sellerCookie, body: { ...legacyBody, revisionNumber: 4 }
  })).status, 201);
  assert.equal((await request('/api/comercial/propostas/proximo-numero', {
    method: 'POST', cookie: sellerCookie
  })).data.numero, 8703);
  assert.equal(manager.role, 'ADMIN');

  const numberedReservations = await db.proposalNumberReservation.findMany({ orderBy: { number: 'asc' } });
  const changedNumbering = await request('/api/comercial/numeracao/inicial', {
    method: 'PUT', cookie: managerCookie, body: { initialNumber: 9000 }
  });
  assert.equal(changedNumbering.status, 200);
  assert.equal(changedNumbering.data.seedValue, 9000);
  assert.equal(changedNumbering.data.nextNumber, 9000);
  assert.equal((await request('/api/comercial/propostas/proximo-numero', {
    method: 'POST', cookie: sellerCookie
  })).data.numero, 9000);
  assert.equal((await request('/api/comercial/numeracao/inicial', {
    method: 'PUT', cookie: managerCookie, body: { initialNumber: 8700 }
  })).status, 200);
  const concurrentReservations = await Promise.all(Array.from({ length: 5 }, () =>
    request('/api/comercial/propostas/proximo-numero', { method: 'POST', cookie: sellerCookie })));
  assert.ok(concurrentReservations.every(result => result.status === 200));
  const numbers = concurrentReservations.map(result => result.data.numero).sort((a, b) => a - b);
  assert.equal(new Set(numbers).size, numbers.length);
  assert.ok(numbers.every(number => number > 8703));
  for (const reservation of numberedReservations) {
    assert.deepEqual(await db.proposalNumberReservation.findUnique({
      where: { number: reservation.number }
    }), reservation);
  }
  assert.equal((await db.proposal.findUnique({ where: { id: proposal.data.id } })).proposalCode, '8700');
  assert.equal((await db.proposal.findUnique({ where: { id: legacy.data.id } })).proposalCode, '8702');
});
