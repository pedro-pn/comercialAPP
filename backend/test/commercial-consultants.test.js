import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/db.js';
import { createAuthService, tokenHash } from '../src/auth/service.js';
import { resolveSeller } from '../src/comercial/consultants.js';
import { finalizeLocal, issueDocuments, previewPdf } from '../src/comercial/documents.js';

function consultantDatabase() {
  const users = [
    { id: 'seller', name: 'Elaborador', role: 'SELLER', isActive: true },
    { id: 'colleague', name: 'Consultor escolhido', role: 'SELLER', isActive: true },
    { id: 'inactive', name: 'Inativo', role: 'SELLER', isActive: false },
    { id: 'viewer', name: 'Consulta', role: 'VIEWER', isActive: true }
  ];
  return { salesConsultant: { async findUnique({ where }) {
    return where.id === 'registered' ? { id: 'registered', name: 'Maria da Silva' } : null;
  } }, user: { async findFirst({ where }) {
    return users.find(user => user.id === where.id && user.isActive === where.isActive
      && where.role.in.includes(user.role)) ?? null;
  } } };
}

for (const role of ['ADMIN', 'MANAGER', 'SELLER']) {
  test(`prévia PDF usa o consultor selecionado pelo ${role}`, async () => {
    const db = consultantDatabase();
    const user = { id: 'seller', name: 'Elaborador', role };
    for (const tipo of ['commercial', 'technical']) {
      const pdf = await previewPdf(db, user,
        { tipo, seller: 'colleague', sellerName: 'Nome desatualizado', title: 'Serviço' },
        async (data, type) => {
          assert.equal(type, tipo);
          assert.equal(data.seller, 'Consultor escolhido');
          assert.equal(data.title, 'Serviço');
          return { pdf: Buffer.from('%PDF prévia') };
        });
      assert.equal(pdf.toString(), '%PDF prévia');
    }
  });

  test(`prévia PDF usa o nome cadastrado pela gestão para ${role}`, async () => {
    for (const tipo of ['commercial', 'technical']) {
      await previewPdf(consultantDatabase(), { id: 'seller', name: 'Elaborador', role },
        { tipo, seller: 'registered', sellerConsultantId: 'registered', sellerName: 'Nome forjado' },
        async (data, type) => {
          assert.equal(data.seller, 'Maria da Silva');
          assert.equal(type, tipo);
          return { pdf: Buffer.from('%PDF prévia') };
        });
    }
  });
}

test('seleção vazia, dupla ou de cadastro inexistente não escolhe outro consultor', async () => {
  for (const selection of [[null, null], ['seller', 'registered'], [null, 'missing']]) {
    await assert.rejects(resolveSeller(consultantDatabase(), ...selection), { status: 422 });
  }
});

test('prévia sem seleção mantém o usuário atual como consultor', async () => {
  await previewPdf(consultantDatabase(), { id: 'seller', name: 'Elaborador', role: 'SELLER' },
    { tipo: 'commercial' }, async data => {
      assert.equal(data.seller, 'Elaborador');
      return { pdf: Buffer.from('%PDF prévia') };
    });
});

test('prévia rejeita consultor inexistente, inativo ou com perfil de consulta', async () => {
  for (const seller of ['missing', 'inactive', 'viewer']) {
    await assert.rejects(() => previewPdf(consultantDatabase(),
      { id: 'seller', name: 'Elaborador', role: 'SELLER' },
      { tipo: 'commercial', seller }, () => {
        assert.fail('A prévia não deve ser gerada com um consultor inválido.');
      }), { status: 422 });
  }
});

const databaseUrl = process.env.TEST_DATABASE_URL;
test('gestão cadastra nomes e propostas preservam o consultor sem conta de acesso',
  { skip: !databaseUrl }, async t => {
    assert.equal(new URL(databaseUrl).pathname, '/comercialapp_test');
    const db = createDatabase(databaseUrl);
    const auth = createAuthService(db);
    const suffix = randomUUID();
    const users = await Promise.all(['ADMIN', 'MANAGER', 'SELLER', 'VIEWER'].map((role, i) =>
      db.user.create({ data: { username: `consultores-${suffix}-${i}`, name: `Usuário teste ${i}`,
        role } })));
    // As sessões são próprias do teste; nenhum usuário existente é alterado.
    const tokens = users.map(() => randomBytes(32).toString('hex'));
    await Promise.all(users.map((user, i) => db.session.create({ data: {
      userId: user.id, tokenHash: tokenHash(tokens[i]), expiresAt: new Date(Date.now() + 60_000)
    } })));
    const storage = await mkdtemp(path.join(os.tmpdir(), 'comercial-consultores-test-'));
    const previousStorage = process.env.COMERCIAL_DIR;
    process.env.COMERCIAL_DIR = storage;
    const server = createApp({ authService: auth, commercialDb: db,
      appOrigin: 'http://localhost:5174' }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const createdConsultants = [];
    const createdProposals = [];
    const number = 1_000_000 + Math.floor(Math.random() * 1_000_000);
    t.after(async () => {
      await new Promise(resolve => server.close(resolve));
      await db.proposal.deleteMany({ where: { id: { in: createdProposals } } });
      await db.salesConsultant.deleteMany({ where: { id: { in: createdConsultants } } });
      await db.proposalNumberReservation.deleteMany({ where: { number } });
      await db.session.deleteMany({ where: { userId: { in: users.map(user => user.id) } } });
      await db.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } });
      await db.$disconnect();
      await rm(storage, { recursive: true, force: true });
      if (previousStorage === undefined) delete process.env.COMERCIAL_DIR;
      else process.env.COMERCIAL_DIR = previousStorage;
    });

    const base = `http://127.0.0.1:${server.address().port}`;
    async function request(route, roleIndex, method = 'GET', body) {
      const response = await fetch(base + '/api/comercial' + route, {
        method, headers: { Cookie: `comercial_session=${tokens[roleIndex]}`,
          'Content-Type': 'application/json', 'X-Comercial-Request': '1' },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      return { status: response.status, data: await response.json() };
    }

    const userCount = await db.user.count();
    const name = `Ana Maria ${suffix}`;
    const registered = await request('/consultores', 1, 'POST', { nome: `  Ana   Maria ${suffix}  ` });
    assert.equal(registered.status, 201);
    createdConsultants.push(registered.data.id);
    assert.equal(registered.data.nome, name);
    assert.equal(registered.data.tipo, 'cadastro');
    assert.equal(await db.user.count(), userCount);
    assert.equal((await db.salesConsultant.findUnique({ where: { id: registered.data.id } }))
      .createdByUserId, users[1].id);
    const adminRegistered = await request('/consultores', 0, 'POST', { nome: `Carlos Souza ${suffix}` });
    assert.equal(adminRegistered.status, 201);
    createdConsultants.push(adminRegistered.data.id);

    for (const roleIndex of [2, 3]) {
      assert.equal((await request('/consultores', roleIndex, 'POST', { nome: 'José Silva' })).status, 403);
    }
    assert.equal((await request('/consultores', 1, 'POST', { nome: name.toUpperCase() })).status, 409);
    for (const nome of ['', '   ', 'Ana', 'A'.repeat(201) + ' Silva']) {
      assert.equal((await request('/consultores', 1, 'POST', { nome })).status, 422);
    }
    assert.equal((await request('/consultores', 1, 'POST', { nome: 'José Silva', username: 'jose' })).status, 400);
    assert.equal(await db.user.count(), userCount);
    const available = await request('/consultores', 2);
    assert.equal(available.status, 200);
    assert.ok(available.data.items.some(item => item.id === registered.data.id && item.nome === name));
    assert.ok(available.data.items.some(item => item.id === users[2].id && item.tipo === 'usuario'));
    assert.equal((await request('/consultores', 3)).status, 403);

    await db.proposalNumberReservation.create({ data: { number, reservedByUserId: users[2].id } });
    const input = { proposalCode: String(number), clientName: 'Cliente teste', cnpj: '12345678000100',
      contact: 'Contato teste', email: 'cliente@example.com', site: 'Obra teste',
      sellerUserId: null, sellerConsultantId: registered.data.id,
      payload: { seller: registered.data.id, sellerConsultantId: registered.data.id,
        sellerName: 'Nome forjado', title: 'Serviço teste', scopeItems: [{ title: 'Serviço', description: 'Escopo' }],
        prices: [{ value: 'R$ 100,00' }] } };
    assert.equal((await request('/propostas', 2, 'POST', { ...input, sellerConsultantId: 'missing' })).status, 422);
    assert.equal((await request('/propostas', 2, 'POST', { ...input, sellerUserId: users[2].id })).status, 400);
    const created = await request('/propostas', 2, 'POST', input);
    assert.equal(created.status, 201);
    createdProposals.push(created.data.id);
    assert.equal(created.data.sellerUserId, null);
    assert.equal(created.data.sellerConsultantId, registered.data.id);
    assert.equal(created.data.sellerName, name);
    assert.equal(created.data.createdByUserId, users[2].id);
    assert.equal(created.data.estimatorName, users[2].name);
    assert.equal((await request(`/propostas/${created.data.id}`, 2)).data.sellerConsultantId,
      registered.data.id);
    assert.equal((await request('/propostas', 2)).data.items.find(item => item.id === created.data.id)
      .sellerName, name);

    const invalidUpdate = await request(`/propostas/${created.data.id}`, 2, 'PUT', {
      expectedUpdatedAt: created.data.updatedAt, sellerUserId: null, sellerConsultantId: null
    });
    assert.equal(invalidUpdate.status, 422);
    const changed = await request(`/propostas/${created.data.id}`, 2, 'PUT', {
      expectedUpdatedAt: created.data.updatedAt, sellerUserId: users[2].id
    });
    assert.equal(changed.status, 200);
    assert.equal(changed.data.sellerConsultantId, null);
    assert.equal(changed.data.sellerName, users[2].name);
    const restored = await request(`/propostas/${created.data.id}`, 2, 'PUT', {
      expectedUpdatedAt: changed.data.updatedAt, sellerConsultantId: registered.data.id
    });
    assert.equal(restored.status, 200);
    assert.equal(restored.data.sellerUserId, null);
    const partial = await request(`/propostas/${created.data.id}`, 2, 'PUT', {
      expectedUpdatedAt: restored.data.updatedAt, clientName: 'Cliente atualizado'
    });
    assert.equal(partial.status, 200);
    assert.equal(partial.data.sellerConsultantId, registered.data.id);

    await issueDocuments(db, users[2], created.data.id, async data => {
      assert.equal(data.seller, name);
      return { docx: Buffer.from('PK proposta'), pdf: Buffer.from('%PDF proposta') };
    });
    await finalizeLocal(db, users[2], created.data.id);
    const revision = await request(`/propostas/${number}/revisao`, 2);
    assert.equal(revision.status, 200);
    assert.equal(revision.data.sellerConsultantId, registered.data.id);
    assert.equal(revision.data.snapshot.seller, registered.data.id);
    const revised = await request('/propostas', 2, 'POST', { ...input, revisionNumber: 1 });
    assert.equal(revised.status, 201);
    createdProposals.push(revised.data.id);
    assert.equal(revised.data.sellerConsultantId, registered.data.id);
    assert.equal(revised.data.sellerName, name);
  });
