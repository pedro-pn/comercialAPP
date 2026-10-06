import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeLocal, payloadHash } from '../src/comercial/documents.js';
import { propostaCompleta } from './fixtures/proposta-completa.js';

function scenario(payload = propostaCompleta(), columns = {}) {
  const proposal = { id: 'qa', proposalCode: '99001', revisionNumber: 0, status: 'RASCUNHO',
    updatedAt: new Date(), totalValue: 100, payload, costEstimateId: null,
    clientName: 'Cliente', cnpj: '11.222.333/0001-81', contact: 'Contato',
    email: 'cliente@example.com', site: 'Local', sellerName: 'Consultor', ...columns };
  const docs = ['COMERCIAL', 'TECNICA'].flatMap(kind => ['PDF', 'DOCX'].map(format => ({
    id: `${kind}-${format}`, generationId: 'qa', kind, format, byteSize: 100,
    payloadHash: payloadHash(proposal), rendererHash: 'qa'
  })));
  let updates = 0;
  const db = { proposal: { findUnique: async () => proposal,
    updateMany: async () => { updates++; return { count: 1 }; } },
    proposalDocument: { findFirst: async () => docs[0], findMany: async () => docs },
    proposalAttachment: { aggregate: async () => ({ _sum: { byteSize: 0 } }) } };
  return { finalize: () => finalizeLocal(db, { id: 'qa', role: 'ADMIN' }, proposal.id, async () => 'qa'),
    updates: () => updates };
}

const required = ['date', 'attendance', 'mobilization', 'permanence', 'integration', 'execution',
  'workday', 'payment', 'taxes', 'overtimeRate', 'standbyTeam', 'standbyTeamQuantity',
  'standbyEquipment', 'extraMobilization', 'validity'];
for (const field of required) {
  test(`a API recusa finalizar com ${field} ausente, vazio ou sem texto`, async () => {
    for (const value of [undefined, null, '', ' \n\t ', {}, [], false]) {
      const attempt = scenario(propostaCompleta({ [field]: value }));
      await assert.rejects(attempt.finalize(), { status: 422 });
      assert.equal(attempt.updates(), 0);
    }
  });
}

test('a API confere identificação, responsabilidades, técnica e preços mesmo com documentos emitidos', async () => {
  const cases = [
    [{}, { clientName: '' }], [{}, { sellerName: '' }], [{}, { contact: '' }],
    [{}, { cnpj: '00000000000000' }], [{}, { email: 'invalido' }], [{}, { site: '' }],
    [{ title: {} }, {}], [{ scopeItems: ['Serviço sem título'] }, {}],
    [{ scopeItems: [{ title: '' }] }, {}], [{ rows: [] }, {}],
    [{ technicalServices: [] }, {}], [{ prices: [{ value: 'R$ 100,00' }] }, {}],
    [{ standbyTeamQuantity: '0' }, {}], [{ validity: '-1' }, {}]
  ];
  for (const [payload, columns] of cases) {
    const attempt = scenario(propostaCompleta(payload), columns);
    await assert.rejects(attempt.finalize(), { status: 422 });
    assert.equal(attempt.updates(), 0);
  }
});

test('a API permite finalizar com o conteúdo obrigatório completo e os documentos atuais', async () => {
  const valid = scenario();
  assert.equal((await valid.finalize()).status, 'FINALIZADA');
  assert.equal(valid.updates(), 1);
});
