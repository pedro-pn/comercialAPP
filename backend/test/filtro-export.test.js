import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { createHash } from 'node:crypto';
import { createFiltroExportRouter, exportFiltroProposal, exportFiltroDocument } from '../src/comercial/filtro-export.js';
import { payloadHash } from '../src/comercial/documents.js';

function fixture() {
  const proposal = { id: 'proposal-1', proposalCode: '4621', revisionNumber: 2,
    status: 'FINALIZADA', clientName: 'Cliente', cnpj: '12345678000190', site: 'Sede',
    crmProjectId: null, costEstimateId: null, payload: { scopeItems: [{ id: 'scope-1', title: 'Limpeza' }] } };
  const bytes = Buffer.from('%PDF-1.7\nproposal test');
  const documents = ['COMERCIAL', 'TECNICA'].map(kind => ({
    id: `document-${kind}`, kind, format: 'PDF', proposalId: proposal.id,
    generationId: 'generation-1', payloadHash: payloadHash(proposal),
    storagePath: kind, byteSize: bytes.length, createdAt: new Date('2026-10-07T18:00:00Z')
  }));
  const database = {
    proposal: { findUnique: async ({ where }) => where.proposalCode_revisionNumber.proposalCode === proposal.proposalCode &&
      where.proposalCode_revisionNumber.revisionNumber === proposal.revisionNumber ? proposal : null },
    proposalDocument: {
      findFirst: async ({ where }) => documents.find(item => item.proposalId === where.proposalId && (!where.id || item.id === where.id)),
      findMany: async () => documents
    }
  };
  return { proposal, documents, bytes, database, dependencies: { readFile: async () => bytes } };
}

test('exporta a revisão exata, os dois PDFs e o escopo sem exigir um evento de aprovação', async () => {
  const f = fixture();
  const bundle = await exportFiltroProposal(f.database, { code: '4621', revision: '2' }, f.dependencies);
  assert.equal(bundle.revisionNumber, 2);
  assert.deepEqual(bundle.scope, f.proposal.payload.scopeItems);
  assert.equal(bundle.documents.length, 2);
  assert.equal(bundle.documents[0].sha256, createHash('sha256').update(f.bytes).digest('hex'));
  await assert.rejects(exportFiltroProposal(f.database, { code: '4621', revision: '1' }, f.dependencies), error => error.status === 404);
});

test('rascunho e PDFs de outro conteúdo não são exportados', async () => {
  const f = fixture();
  f.proposal.status = 'RASCUNHO';
  await assert.rejects(exportFiltroProposal(f.database, { code: '4621', revision: 2 }, f.dependencies), error => error.status === 409);
  f.proposal.status = 'FINALIZADA';
  f.documents[0].payloadHash = 'other-content';
  await assert.rejects(exportFiltroProposal(f.database, { code: '4621', revision: 2 }, f.dependencies), error => error.status === 409);
});

test('download não permite documento de outra proposta ou um arquivo inválido', async () => {
  const f = fixture();
  await assert.rejects(exportFiltroDocument(f.database, { code: '4621', revision: 2 }, 'foreign-document', f.dependencies), error => error.status === 404);
  f.dependencies.readFile = async () => Buffer.from('not-a-pdf');
  await assert.rejects(exportFiltroDocument(f.database, { code: '4621', revision: 2 }, f.documents[0].id, f.dependencies), error => error.status === 409);
});

test('rotas de consulta e download exigem o token de serviço e funcionam sem cookie', async t => {
  const f = fixture();
  const oldToken = process.env.FILTROAPP_API_TOKEN;
  process.env.FILTROAPP_API_TOKEN = 'synthetic-filtro-export-token';
  const app = express();
  app.use('/api/integrations/filtroapp', createFiltroExportRouter(f.database, f.dependencies));
  app.use((error, _request, response, _next) => response.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    if (oldToken === undefined) delete process.env.FILTROAPP_API_TOKEN;
    else process.env.FILTROAPP_API_TOKEN = oldToken;
  });
  const base = `http://127.0.0.1:${server.address().port}/api/integrations/filtroapp/propostas/4621/revisoes/2`;
  assert.equal((await fetch(base)).status, 401);
  const headers = { Authorization: 'Bearer synthetic-filtro-export-token' };
  const response = await fetch(base, { headers });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const bundle = await response.json();
  const download = await fetch(`${base}/documentos/${bundle.documents[0].id}`, { headers });
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('content-type'), 'application/pdf');
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), f.bytes);
  delete process.env.FILTROAPP_API_TOKEN;
  assert.equal((await fetch(base, { headers })).status, 503);
});
