import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/db.js';
import { currentDocuments, documentData, downloadDocument, finalizeLocal,
  issueDocuments, regenerateDocuments } from '../src/comercial/documents.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('regeneração preserva a proposta e publica arquivos completos com segurança',
  { skip: !databaseUrl }, async t => {
    assert.equal(new URL(databaseUrl).pathname, '/comercialapp_test');
    const db = createDatabase(databaseUrl);
    const storage = await mkdtemp(path.join(os.tmpdir(), 'comercial-regeneracao-test-'));
    const previousStorage = process.env.COMERCIAL_DIR;
    process.env.COMERCIAL_DIR = storage;
    const suffix = randomUUID();
    const users = await Promise.all(['SELLER', 'SELLER', 'MANAGER', 'VIEWER'].map((role, index) =>
      db.user.create({ data: { username: `regeneracao-${suffix}-${index}`,
        name: `Usuário ${index}`, role } })));
    const [seller, colleague, manager, viewer] = users;
    const proposalIds = [];
    let sequence = 0;
    t.after(async () => {
      await db.proposal.deleteMany({ where: { id: { in: proposalIds } } });
      await db.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } });
      await db.$disconnect();
      await rm(storage, { recursive: true, force: true });
      if (previousStorage === undefined) delete process.env.COMERCIAL_DIR;
      else process.env.COMERCIAL_DIR = previousStorage;
    });

    function pair(label) {
      return async (_data, type) => ({
        docx: Buffer.from(`PK ${label} ${type}`), pdf: Buffer.from(`%PDF ${label} ${type}`)
      });
    }

    async function fixture({ emitted = true, ...overrides } = {}) {
      const proposal = await db.proposal.create({ data: {
        proposalCode: `regeneracao-${suffix}-${++sequence}`, revisionNumber: 2,
        clientName: 'Cliente salvo', cnpj: '12345678000100', contact: 'Contato salvo',
        email: 'cliente@example.com', site: 'Local salvo', department: 'Compras',
        sellerUserId: seller.id, sellerName: seller.name, estimatorName: manager.name,
        createdByUserId: seller.id, updatedByUserId: seller.id, updatedByLabel: seller.name,
        payload: { title: 'Serviço salvo', scopeItems: ['Escopo salvo'],
          prices: [{ local: 'ONSHORE', value: 'R$ 1.000,00' }] }, totalValue: 1000
      } });
      proposalIds.push(proposal.id);
      if (emitted) {
        await issueDocuments(db, seller, proposal.id, pair('original'));
        await db.proposalDocument.updateMany({ where: { proposalId: proposal.id },
          data: { createdAt: new Date('2020-01-01T00:00:00Z') } });
      }
      if (Object.keys(overrides).length) {
        return db.proposal.update({ where: { id: proposal.id }, data: overrides });
      }
      return proposal;
    }

    async function files(directory = storage) {
      const entries = await readdir(directory, { withFileTypes: true });
      const nested = await Promise.all(entries.map(entry => entry.isDirectory()
        ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]));
      return nested.flat().sort();
    }

    async function assertOriginals(proposal, originals) {
      for (const doc of originals) {
        const file = await downloadDocument(db, seller, doc.id);
        const type = doc.kind === 'COMERCIAL' ? 'commercial' : 'technical';
        assert.equal(file.bytes.toString(), `${doc.format === 'PDF' ? '%PDF' : 'PK'} original ${type}`);
        assert.match(file.fileName, /Rev 2/);
      }
      assert.equal(await db.proposalDocument.count({ where: {
        proposalId: proposal.id, generationId: originals[0].generationId
      } }), 4);
    }

    await t.test('força uma nova geração sem alterar dados, número, revisão ou status', async () => {
      const proposal = await fixture();
      const original = await currentDocuments(db, proposal.id);
      const seen = [];
      const result = await regenerateDocuments(db, seller, proposal.id, async (data, type) => {
        const { lerFoto, ...saved } = data;
        assert.equal(typeof lerFoto, 'function');
        assert.deepEqual(saved, documentData(proposal));
        seen.push(type);
        return pair('modelo atualizado')(data, type);
      });
      assert.deepEqual(seen, ['commercial', 'technical']);
      assert.equal(result.proposalCode, proposal.proposalCode);
      assert.equal(result.documentos.length, 4);
      assert.ok(result.documentos.every(doc => !original.some(old => old.id === doc.id)));
      const current = await currentDocuments(db, proposal.id);
      assert.equal(new Set(current.map(doc => doc.generationId)).size, 1);
      assert.notEqual(current[0].generationId, original[0].generationId);
      assert.deepEqual(await db.proposal.findUnique({ where: { id: proposal.id } }), proposal);
      assert.equal(await db.proposalDocument.count({ where: { proposalId: proposal.id } }), 8);
      for (const doc of current) {
        const type = doc.kind === 'COMERCIAL' ? 'commercial' : 'technical';
        const file = await downloadDocument(db, seller, doc.id);
        assert.equal(file.bytes.toString(),
          `${doc.format === 'PDF' ? '%PDF' : 'PK'} modelo atualizado ${type}`);
      }
      await assertOriginals(proposal, original);
      const reused = await issueDocuments(db, seller, proposal.id, () => {
        throw new Error('A emissão comum deve continuar reutilizando os documentos.');
      });
      assert.deepEqual(reused.documentos.map(doc => doc.id).sort(), current.map(doc => doc.id).sort());
    });

    await t.test('gestor pode regerar finalizada sem alterar finalização ou integrações', async () => {
      const proposal = await fixture();
      await finalizeLocal(db, seller, proposal.id);
      const finalized = await db.proposal.update({ where: { id: proposal.id }, data: {
        nectarStatus: 'SUCESSO', nectarOpportunityId: 'oportunidade-salva',
        nectarAttemptId: 'tentativa-crm', nectarAttemptAt: new Date(),
        sharepointStatus: 'SUCESSO', sharepointFolder: 'pasta-salva',
        sharepointAttemptId: 'tentativa-sharepoint', sharepointAttemptAt: new Date(),
        filtroStatus: 'SUCESSO', filtroAttempts: 1, filtroDeliveredAt: new Date()
      } });
      const original = await currentDocuments(db, proposal.id);
      await regenerateDocuments(db, manager, proposal.id, pair('novo'));
      assert.deepEqual(await db.proposal.findUnique({ where: { id: proposal.id } }), finalized);
      await assert.rejects(issueDocuments(db, seller, proposal.id, pair('proibido')),
        { status: 409 });
      await assertOriginals(proposal, original);
    });

    await t.test('respeita autoria, perfil, arquivamento e finalização em andamento', async () => {
      const proposal = await fixture();
      const forbidden = () => { throw new Error('Não deve gerar arquivos.'); };
      await assert.rejects(regenerateDocuments(db, colleague, proposal.id, forbidden), { status: 403 });
      await assert.rejects(regenerateDocuments(db, viewer, proposal.id, forbidden), { status: 403 });
      await assert.rejects(regenerateDocuments(db, seller, 'inexistente', forbidden), { status: 404 });
      const archived = await fixture({ archivedAt: new Date() });
      const finalizing = await fixture({ status: 'FINALIZANDO' });
      const withoutFiles = await fixture({ emitted: false });
      for (const invalid of [archived, finalizing, withoutFiles]) {
        await assert.rejects(regenerateDocuments(db, seller, invalid.id, forbidden), { status: 409 });
      }
      const failedIntegration = await fixture({ status: 'FALHA_INTEGRACAO' });
      await regenerateDocuments(db, seller, failedIntegration.id, pair('novo'));
      assert.deepEqual(await db.proposal.findUnique({ where: { id: failedIntegration.id } }),
        failedIntegration);
    });

    await t.test('falha de conversão mantém os quatro documentos antigos e remove novos arquivos', async () => {
      const proposal = await fixture();
      const original = await currentDocuments(db, proposal.id);
      const before = await files();
      await assert.rejects(regenerateDocuments(db, seller, proposal.id, async (data, type) => {
        if (type === 'technical') throw new Error('Falha de conversão simulada');
        return pair('parcial')(data, type);
      }), /Falha de conversão simulada/);
      assert.deepEqual(await files(), before);
      assert.deepEqual(await currentDocuments(db, proposal.id), original);
      await assertOriginals(proposal, original);
    });

    await t.test('falha ao publicar desfaz inserções parciais e remove os quatro novos arquivos', async () => {
      const proposal = await fixture();
      const original = await currentDocuments(db, proposal.id);
      const before = await files();
      const failingDb = {
        proposal: db.proposal, proposalDocument: db.proposalDocument,
        $transaction: callback => db.$transaction(async tx => {
          let created = 0;
          return callback(new Proxy(tx, { get(target, key) {
            if (key !== 'proposalDocument') return target[key];
            return { create: async args => {
              const item = await target.proposalDocument.create(args);
              if (++created === 2) throw new Error('Falha de publicação simulada');
              return item;
            }, findFirst: args => target.proposalDocument.findFirst(args),
            findMany: args => target.proposalDocument.findMany(args) };
          } }));
        })
      };
      await assert.rejects(regenerateDocuments(failingDb, seller, proposal.id, pair('parcial')),
        /Falha de publicação simulada/);
      assert.deepEqual(await files(), before);
      assert.deepEqual(await currentDocuments(db, proposal.id), original);
      assert.equal(await db.proposalDocument.count({ where: { proposalId: proposal.id } }), 4);
      await assertOriginals(proposal, original);
    });

    await t.test('edição durante a conversão impede publicação de documentos desatualizados', async () => {
      const proposal = await fixture();
      const original = await currentDocuments(db, proposal.id);
      const before = await files();
      await assert.rejects(regenerateDocuments(db, seller, proposal.id, async (data, type) => {
        if (type === 'commercial') await db.proposal.update({ where: { id: proposal.id },
          data: { clientName: 'Cliente alterado durante a geração' } });
        return pair('desatualizado')(data, type);
      }), { status: 409 });
      assert.deepEqual(await files(), before);
      assert.deepEqual(await currentDocuments(db, proposal.id), original);
      await assertOriginals(proposal, original);
    });

    await t.test('duas regenerações simultâneas publicam apenas um conjunto completo', async () => {
      const proposal = await fixture();
      const original = await currentDocuments(db, proposal.id);
      const before = await files();
      let arrived = 0;
      let release;
      const ready = new Promise(resolve => { release = resolve; });
      const concurrentPair = async (data, type) => {
        if (type === 'commercial') {
          if (++arrived === 2) release();
          await ready;
        }
        return pair('concorrente')(data, type);
      };
      const results = await Promise.allSettled([
        regenerateDocuments(db, seller, proposal.id, concurrentPair),
        regenerateDocuments(db, seller, proposal.id, concurrentPair)
      ]);
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
      assert.equal(results.find(result => result.status === 'rejected').reason.status, 409);
      assert.equal((await files()).length, before.length + 4);
      assert.equal(await db.proposalDocument.count({ where: { proposalId: proposal.id } }), 8);
      const current = await currentDocuments(db, proposal.id);
      assert.equal(current.length, 4);
      assert.equal(new Set(current.map(doc => doc.generationId)).size, 1);
      assert.deepEqual(await db.proposal.findUnique({ where: { id: proposal.id } }), proposal);
      await assertOriginals(proposal, original);
    });

    await t.test('rota exige autenticação e não aceita alterações de dados no corpo', async () => {
      const proposal = await fixture();
      const server = createApp({ commercialDb: db,
        authService: { authenticate: token => users.find(user => user.id === token) } }).listen(0, '127.0.0.1');
      await once(server, 'listening');
      try {
        const endpoint = `http://127.0.0.1:${server.address().port}/api/comercial/propostas/${proposal.id}/documentos/regerar`;
        const request = (user, body, csrf = true) => fetch(endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json',
            ...(csrf ? { 'X-Comercial-Request': '1' } : {}),
            ...(user ? { Cookie: `comercial_session=${user.id}` } : {}) },
          body: JSON.stringify(body)
        });
        assert.equal((await request(null, {})).status, 401);
        assert.equal((await request(viewer, {})).status, 403);
        assert.equal((await request(colleague, {})).status, 403);
        assert.equal((await request(seller, {}, false)).status, 403);
        assert.equal((await request(seller, { revisionNumber: 3, payload: {} })).status, 400);
        assert.deepEqual(await db.proposal.findUnique({ where: { id: proposal.id } }), proposal);
      } finally {
        await new Promise(resolve => server.close(resolve));
      }
    });
  });
