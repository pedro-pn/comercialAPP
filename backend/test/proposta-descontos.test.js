import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import AdmZip from 'adm-zip';
import { DOMParser } from '@xmldom/xmldom';
import { calculateProposalTotal, createProposal, getProposal, listProposals, updateProposal } from '../src/comercial/proposals.js';
import { createDatabase } from '../src/db.js';
import { preencherProposta } from '../src/lib/comercial/proposta-docx.js';
import { pendenciasDoDocumento } from '../../shared/comercial/dist/proposal-validation.js';
import { propostaCompleta } from './fixtures/proposta-completa.js';

const price = (value, local) => ({ description: `Serviço ${local ?? 'padrão'}`, quantity: '1',
  unitValue: value, value, ...(local ? { local } : {}) });
const discount = (value, local) => ({ description: `Acordo & condição <especial> ${local ?? ''}`,
  value, ...(local ? { local } : {}) });
const text = node => [...node.getElementsByTagName('w:t')].map(item => item.textContent).join('');

test('PostgreSQL preserva descontos ao criar e reabrir e retorna o valor líquido no histórico', {
  skip: !process.env.TEST_DATABASE_URL
}, async t => {
  assert.equal(new URL(process.env.TEST_DATABASE_URL).pathname, '/comercialapp_test');
  const db = createDatabase(process.env.TEST_DATABASE_URL);
  let user;
  t.after(async () => {
    if (user) {
      await db.proposal.deleteMany({ where: { createdByUserId: user.id } });
      await db.proposalNumberReservation.deleteMany({ where: { reservedByUserId: user.id } });
      await db.user.delete({ where: { id: user.id } });
    }
    await db.$disconnect();
  });
  user = await db.user.create({ data: { username: `descontos-${randomUUID()}`, name: 'Teste de descontos', role: 'SELLER' } });
  const number = 1_000_000_000 + Math.floor(Math.random() * 1_000_000_000);
  await db.proposalNumberReservation.create({ data: { number, reservedByUserId: user.id } });
  const payload = propostaCompleta({ prices: [price('R$ 1.000,00')], discounts: [discount('R$ 150,50')] });
  const proposal = await createProposal(db, user, { proposalCode: String(number), revisionNumber: 0,
    clientName: payload.client, cnpj: payload.cnpj, contact: payload.contact,
    email: payload.email, site: payload.site, payload });
  assert.equal(Number(proposal.totalValue), 849.5);
  const reopened = await getProposal(db, user, proposal.id);
  assert.deepEqual(reopened.payload.discounts, payload.discounts);
  const history = await listProposals(db, user, { page: 1, pageSize: 10 });
  assert.equal(Number(history.items[0].totalValue), 849.5);
  const withoutDiscount = await updateProposal(db, user, proposal.id, {
    expectedUpdatedAt: reopened.updatedAt.toISOString(), payload: { ...payload, discounts: [] }
  });
  assert.equal(Number(withoutDiscount.totalValue), 1000);
});

test('total da proposta deduz vários descontos em centavos e preserva propostas antigas', () => {
  assert.equal(calculateProposalTotal({ prices: [price('R$ 1.000,30')],
    discounts: [discount('R$ 100,10'), discount('R$ 0,20')] }), 900);
  assert.equal(calculateProposalTotal({ prices: [price('R$ 1.000,30')] }), 1000.3);
  assert.equal(calculateProposalTotal({ prices: [price('R$ 100,00')],
    discounts: [discount(100)] }), 0);
  const legacy = propostaCompleta({ modelo: 'padrao', prices: [price('R$ 1.000,00', 'ONSHORE')],
    discounts: [discount('R$ 100,00')] });
  assert.equal(calculateProposalTotal(legacy), 900);
  assert.deepEqual(pendenciasDoDocumento(legacy), []);
});

test('cada cenário deduz seus descontos e somente o cenário escolhido entra no total', () => {
  const payload = { prices: [price('R$ 1.000,00', 'ONSHORE'), price('R$ 2.000,00', 'OFFSHORE')],
    discounts: [discount('R$ 100,00', 'ONSHORE'), discount('R$ 500,00', 'OFFSHORE')] };
  assert.equal(calculateProposalTotal({ ...payload, priceScenario: 'ONSHORE' }), 900);
  assert.equal(calculateProposalTotal({ ...payload, priceScenario: 'OFFSHORE' }), 1500);
  assert.equal(calculateProposalTotal(payload), 1500);
});

test('salvar pela API recalcula o valor e rejeita total negativo sem gravar', async () => {
  let proposal = { id: 'desconto', proposalCode: '4619', revisionNumber: 2, status: 'RASCUNHO',
    createdByUserId: 'autor', updatedAt: new Date(), costEstimateId: null,
    payload: { prices: [price('R$ 1.000,00')] }, totalValue: 1000 };
  let writes = 0;
  const db = { proposal: {
    findUnique: async () => proposal,
    update: async ({ data }) => { writes++; proposal = { ...proposal, ...data }; return proposal; }
  } };
  const user = { id: 'autor', role: 'SELLER', name: 'Autor' };
  const saved = await updateProposal(db, user, proposal.id, {
    expectedUpdatedAt: proposal.updatedAt.toISOString(), totalValue: 999999,
    payload: { ...proposal.payload, discounts: [discount('R$ 150,50')] }
  });
  assert.equal(saved.totalValue, 849.5);
  assert.equal(saved.payload.discounts[0].description, discount('').description);
  await assert.rejects(updateProposal(db, user, proposal.id, {
    expectedUpdatedAt: saved.updatedAt.toISOString(),
    payload: { ...proposal.payload, discounts: [discount('R$ 1.000,01')] }
  }), { status: 422 });
  assert.equal(writes, 1);
});

test('finalização exige descrição e valor positivo e confere descontos de todos os cenários', () => {
  for (const discounts of [[{ description: '', value: 'R$ 1,00' }],
    [discount('R$ 0,00')], [discount('-R$ 1,00')], [discount('inválido')], [null],
    [discount('R$ 60,00'), discount('R$ 40,01')]]) {
    assert.ok(pendenciasDoDocumento(propostaCompleta({ discounts }))
      .some(item => item.campo === 'discounts'));
  }
  assert.deepEqual(pendenciasDoDocumento(propostaCompleta({ discounts: [discount('R$ 100,00')] })), []);
  const invalid = propostaCompleta({ priceScenario: 'ONSHORE',
    prices: [price('R$ 100,00', 'ONSHORE'), price('R$ 50,00', 'OFFSHORE')],
    discounts: [discount('R$ 51,00', 'OFFSHORE')] });
  assert.ok(pendenciasDoDocumento(invalid).some(item => item.campo === 'discounts'
    && item.mensagem.includes('OFFSHORE')));
});

for (const modelo of ['padrao', 'hidrojateamento']) {
  test(`DOCX ${modelo} mostra os descontos e o total líquido na tabela correspondente`, async () => {
    const locals = modelo === 'padrao' ? [undefined] : ['ONSHORE', 'OFFSHORE'];
    const dados = { modelo, prices: locals.map(local => price('R$ 1.000,00', local)),
      discounts: locals.map((local, i) => discount(i ? 'R$ 200,00' : 'R$ 100,00', local)) };
    for (const includeUnitValue of [true, false]) {
      const zip = new AdmZip(await preencherProposta({ ...dados, includeUnitValue }, 'commercial'));
      const doc = new DOMParser().parseFromString(zip.readAsText('word/document.xml'), 'text/xml');
      for (const [index, local] of locals.entries()) {
        const table = [...doc.getElementsByTagName('w:tbl')]
          .find(node => text(node).includes(`Serviço ${local ?? 'padrão'}`));
        assert.ok(table);
        assert.match(text(table), /Desconto: Acordo & condição <especial>/);
        assert.match(text(table), index ? /-R\$\s*200,00/ : /-R\$\s*100,00/);
        assert.match(text(table), index ? /R\$\s*800,00/ : /R\$\s*900,00/);
        assert.doesNotMatch(text(table), /\{\{/);
      }
    }
    const technical = new AdmZip(await preencherProposta(dados, 'technical'));
    assert.doesNotMatch(technical.readAsText('word/document.xml'), /Desconto:|Acordo &amp;/);
  });
}
