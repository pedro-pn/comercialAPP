import test from 'node:test';
import assert from 'node:assert/strict';
import { createNectarClient, nectarConfig, nectarUnavailable } from '../src/comercial/nectar.js';

test('Nectar fica desligado sem configuração e restringe funis', async () => {
  const off = nectarConfig({});
  assert.equal(off.mode, 'off');
  assert.match(nectarUnavailable(off), /desligado/);
  const client = createNectarClient({ config: off,
    request: () => { throw new Error('Não deve acessar a rede.'); } });
  assert.deepEqual((await client.funnels()).items, []);
  await assert.rejects(() => client.searchCompanies('Empresa'), { status: 503 });
  assert.match(nectarUnavailable({ mode: 'real', token: '', responsibleId: '',
    allowedPipelines: ['44'] }), /NECTAR_API_TOKEN/);
});

test('adaptador Nectar usa token no header, funil permitido e anexos do card', async () => {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    const path = new URL(url).pathname;
    const body = path.endsWith('/pipelines')
      ? [{ id: 44, nome: 'Comercial', sequencias: [{ sequencia: 2 }] },
        { id: 55, nome: 'Outro', sequencias: [] }]
      : path.endsWith('/contatos')
        ? [{ id: 101, nome: 'Empresa Teste', isEmpresa: true, contatos: [] }]
        : path.endsWith('/contatos/101')
          ? { id: 101, nome: 'Empresa Teste', isEmpresa: true,
            contatos: [{ id: 201, nome: 'Pessoa', emails: ['pessoa@example.com'] }] }
          : path.endsWith('/oportunidades')
            ? []
            : path.endsWith('/oportunidades/')
              ? { id: 700 }
              : { ok: true };
    return new Response(JSON.stringify(body), { status: 200,
      headers: { 'Content-Type': 'application/json' } });
  };
  const client = createNectarClient({ config: {
    mode: 'real', token: 'token-de-teste', responsibleId: '7', allowedPipelines: ['44']
  }, request });
  const funnel = (await client.funnels()).items[0];
  assert.deepEqual(funnel, { id: '44', nome: 'Comercial', primeiraEtapa: 2 });
  assert.equal((await client.searchCompanies('Empresa')).items[0].id, '101');
  assert.equal((await client.companyDetails('101')).contatos[0].id, '201');
  const data = { proposalCode: '8700', clientName: 'Empresa Teste', title: 'Serviço',
    site: 'Obra', contactName: 'Pessoa', contactEmail: 'pessoa@example.com',
    companyId: '101', contactId: '201', totalValue: 1500,
    technicalServices: [{ id: 'limpeza_quimica' }] };
  const opportunity = await client.createOpportunity(data, funnel);
  assert.equal(opportunity.id, '700');
  await client.attach('700', [{ fileName: 'Proposta Técnica.pdf', bytes: Buffer.from('%PDF-') }],
    data, funnel);
  assert(calls.every(item => item.options.headers['Access-Token'] === 'token-de-teste'));
  const created = calls.find(item => item.url.endsWith('/oportunidades/'));
  assert.equal(JSON.parse(created.options.body).produtos[0].refId, 2315553);
  const publication = calls.find(item => item.url.endsWith('/publicacao/incluirComAnexos'));
  assert.equal(publication.options.body.getAll('anexos').length, 1);
});

test('erro 409 de validação do Nectar preserva o motivo e não inventa card existente', async () => {
  const request = async (url, options) => {
    if (url.includes('/oportunidades?')) return new Response('[]', { status: 200 });
    if (options.method === 'POST') return new Response(
      JSON.stringify({ mensagens: ['Nenhum responsável foi selecionado'] }),
      { status: 409, headers: { 'Content-Type': 'application/json' } }
    );
    throw new Error('Rota inesperada no teste.');
  };
  const client = createNectarClient({ config: {
    mode: 'real', token: 'token-de-teste', responsibleId: '7', allowedPipelines: ['44']
  }, request });
  await assert.rejects(() => client.createOpportunity({
    proposalCode: '8700', clientName: 'Empresa', title: 'Serviço',
    companyId: '101', contactId: '201', totalValue: 1500,
    technicalServices: [{ id: 'limpeza_quimica' }]
  }, { id: '44', nome: 'Comercial', primeiraEtapa: 1 }),
  { message: /Nenhum responsável foi selecionado/ });
});
