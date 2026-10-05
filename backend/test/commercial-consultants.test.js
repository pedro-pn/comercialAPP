import test from 'node:test';
import assert from 'node:assert/strict';
import { previewPdf } from '../src/comercial/documents.js';

function consultantDatabase() {
  const users = [
    { id: 'seller', name: 'Elaborador', role: 'SELLER', isActive: true },
    { id: 'colleague', name: 'Consultor escolhido', role: 'SELLER', isActive: true },
    { id: 'inactive', name: 'Inativo', role: 'SELLER', isActive: false },
    { id: 'viewer', name: 'Consulta', role: 'VIEWER', isActive: true }
  ];
  return { user: { async findFirst({ where }) {
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
}

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
