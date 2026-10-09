import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const { outputFiles } = await build({
  stdin: { contents: `
    export * from './clientePrisma';
    export * from './useClientePrisma';
    export * from './salvamento';
    export * from '../useAutosaveServidor';`,
    resolveDir: fileURLToPath(new URL('../src/pages/comercial/proposta/', import.meta.url)) },
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
  plugins: [{ name: 'prisma-api', setup(build) {
    build.onResolve({ filter: /api\/comercial$/ }, () => ({ path: 'qa-api', external: true }));
  } }]
});
const require = createRequire(import.meta.url);
const release = { id: 'liberacao', snapshot: {
  legalName: 'Cliente do Prisma', taxId: '11222333000181', contactName: 'Contato do Prisma',
  email: 'prisma@example.invalid', department: 'Engenharia', site: 'Obra do Prisma', description: 'Serviço liberado'
} };
const clientFields = {
  client: release.snapshot.legalName, cnpj: release.snapshot.taxId, contact: release.snapshot.contactName,
  email: release.snapshot.email, department: release.snapshot.department, site: release.snapshot.site,
  title: release.snapshot.description
};
const clone = value => JSON.parse(JSON.stringify(value));

function load({ react = {}, api = {}, window = {} } = {}) {
  const module = { exports: {} };
  runInNewContext(outputFiles[0].text, { module, exports: module.exports, window,
    require: name => name === 'react' ? react : name === 'qa-api' ? api : require(name) });
  return module.exports;
}
const { preencherClientePrisma, aplicarClienteDaProposta, snapshotDaPropostaSalva, entradaDaProposta } = load();
function input(form) {
  return entradaDaProposta({ form, codigo: '4642', orcamentista: 'Vendedor', modelo: 'padrao',
    itensEscopo: [], blocos: [], categorias: [], responsabilidades: [], precos: [], incluirUnitario: true,
    servicosTecnicos: [], complementoRelatorios: '' }, 'levantamento');
}
async function flush() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

test('cadastro do Prisma preenche os campos respectivos e permanece ao salvar e reabrir', () => {
  const form = preencherClientePrisma({ client: '', cnpj: '', contact: ' ', email: '', site: '', department: null }, release.snapshot);
  for (const [field, value] of Object.entries(clientFields)) assert.equal(form[field], value);
  const saved = input(form);
  assert.equal(saved.proposalCode, '4642');
  assert.equal(saved.costEstimateId, 'levantamento');
  for (const [column, field] of [['clientName', 'client'], ['cnpj', 'cnpj'], ['contact', 'contact'],
    ['email', 'email'], ['department', 'department'], ['site', 'site']]) {
    assert.equal(saved[column], clientFields[field]);
    assert.equal(saved.payload[field], clientFields[field]);
    assert.equal(snapshotDaPropostaSalva(saved)[field], clientFields[field]);
  }
});

test('campos editados prevalecem e dados ausentes no Prisma não são inventados', () => {
  const form = { client: 'Nome editado', cnpj: '11.222.333/0001-81', contact: 'Contato escolhido',
    email: 'escolhido@example.invalid', department: 'Compras', site: 'Local escolhido', title: 'Título negociado',
    payment: 'Condição negociada', prices: [{ value: 'R$ 12.500,00' }] };
  assert.equal(preencherClientePrisma(form, release.snapshot), form);
  const incomplete = preencherClientePrisma({ department: '', email: '' }, { ...release.snapshot, department: '', email: '' });
  assert.equal(incomplete.department, '');
  assert.equal(incomplete.email, '');
});

test('CNPJ de outro cliente ou inválido impede misturar cadastros', () => {
  for (const cnpj of ['99888777000166', '123', './-']) {
    const form = { cnpj, client: '', contact: '', email: '' };
    assert.equal(preencherClientePrisma(form, release.snapshot), form);
  }
});

test('resposta do vínculo atualiza todo o cadastro sem substituir preços e condições', () => {
  const form = { client: '', cnpj: '', contact: '', email: '', department: '', site: '', title: 'Título negociado',
    payment: 'Condição negociada', prices: [{ value: 'R$ 12.500,00' }] };
  const saved = { clientName: clientFields.client, cnpj: clientFields.cnpj, contact: clientFields.contact,
    email: clientFields.email, department: clientFields.department, site: clientFields.site,
    payload: { title: form.title, payment: 'Condição antiga', prices: [] } };
  const linked = aplicarClienteDaProposta(form, saved);
  for (const field of ['client', 'cnpj', 'contact', 'email', 'department', 'site']) assert.equal(linked[field], clientFields[field]);
  assert.equal(linked.title, form.title);
  assert.equal(linked.payment, form.payment);
  assert.equal(linked.prices, form.prices);
  assert.equal(input(linked).payload.contact, clientFields.contact);
});

test('campos do cliente salvos só no payload reaparecem mesmo com colunas vazias', () => {
  for (const empty of ['', '   ', null]) {
    const form = snapshotDaPropostaSalva({ clientName: empty, cnpj: empty, contact: empty, email: empty,
      department: empty, site: empty, payload: clientFields });
    for (const [field, value] of Object.entries(clientFields)) assert.equal(form[field], value);
  }
});

/** Exercita a recuperação junto do autosave real, com consultas e timers controlados. */
function mount({ fetchRelease = async () => release, form: initial = {}, ...initialProps } = {}) {
  let props = { propostaId: '4642', crmReleaseId: release.id, habilitado: true, ...initialProps };
  const slots = [], requests = [], saves = [], timers = new Map();
  let cursor = 0, timerId = 0, effects = [], state, scheduled = false, closed = false;
  const sameDeps = (a, b) => a?.length === b?.length && a.every((value, index) => Object.is(value, b[index]));
  function schedule() {
    if (scheduled || closed) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; if (!closed) render(); });
  }
  const react = {
    useRef(value) { const index = cursor++; slots[index] ??= { current: value }; return slots[index]; },
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: initial, set(next) {
        const value = typeof next === 'function' ? next(slots[index].value) : next;
        if (Object.is(value, slots[index].value)) return;
        slots[index].value = value;
        schedule();
      } };
      return [slots[index].value, slots[index].set];
    },
    useMemo(compute, deps) {
      const index = cursor++;
      if (!slots[index] || !sameDeps(slots[index].deps, deps)) slots[index] = { value: compute(), deps };
      return slots[index].value;
    },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(effect, deps) {
      const index = cursor++;
      if (slots[index] && sameDeps(slots[index].deps, deps)) return;
      const previous = slots[index];
      slots[index] = { deps };
      effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = effect(); });
    }
  };
  const { useClientePrisma, useAutosaveServidor } = load({ react,
    api: { obterLiberacaoPrisma(id) { requests.push(id); return fetchRelease(id); }, mensagemDeErro: error => error.message },
    window: { setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
      clearTimeout(id) { timers.delete(id); } }
  });
  function render() {
    cursor = 0; effects = [];
    const [form, setForm] = react.useState(initial);
    const [recado, setRecado] = react.useState('');
    const autosave = useAutosaveServidor({ dados: { form }, identidade: props.propostaId,
      ativo: props.habilitado, salvar: async () => { saves.push(input(form)); return true; } });
    useClientePrisma({ ...props, setForm, setRecado });
    state = { form, setForm, recado, autosave };
    for (const effect of effects) effect();
  }
  render();
  return { requests, saves, get state() { return state; }, get timers() { return timers.size; },
    update(patch) { props = { ...props, ...patch }; render(); },
    edit(patch) { state.setForm(current => ({ ...current, ...patch })); },
    close() { closed = true; for (const slot of slots) slot.cleanup?.(); },
    async tick() { const callbacks = [...timers.values()]; timers.clear(); for (const callback of callbacks) callback(); await flush(); }
  };
}

test('reabrir o rascunho já vinculado recupera os dados e agenda sua gravação', async () => {
  const hook = mount({ form: { client: '', cnpj: clientFields.cnpj, contact: '', email: '',
    department: '', site: 'Local negociado', title: 'Título negociado' } });
  assert.equal(hook.timers, 0, 'a base hidratada não deve ser gravada antes da recuperação');
  await flush();
  assert.deepEqual(hook.requests, [release.id]);
  assert.equal(hook.state.form.contact, clientFields.contact);
  assert.equal(hook.state.form.email, clientFields.email);
  assert.equal(hook.state.form.site, 'Local negociado');
  assert.equal(hook.state.form.title, 'Título negociado');
  assert.equal(hook.state.autosave.temAlteracoesPendentes(), true);
  await hook.tick();
  assert.equal(hook.saves.length, 1);
  assert.equal(hook.saves[0].contact, clientFields.contact);
  assert.equal(hook.saves[0].payload.email, clientFields.email);
  assert.equal(hook.state.autosave.temAlteracoesPendentes(), false);
  hook.edit({ payment: 'Condição editada' });
  await flush();
  assert.deepEqual(hook.requests, [release.id], 'editar a proposta não deve refazer a consulta');
  hook.close();
});

test('consulta aguarda a hidratação de um rascunho vinculado', async () => {
  for (const props of [{ habilitado: false }, { propostaId: '' }, { crmReleaseId: '' }]) {
    const hook = mount(props);
    await flush();
    assert.equal(hook.requests.length, 0);
    assert.deepEqual(clone(hook.state.form), {});
    hook.close();
  }
});

test('dados digitados enquanto o Prisma responde são preservados', async () => {
  let resolve;
  const hook = mount({ fetchRelease: () => new Promise(done => { resolve = done; }) });
  hook.edit({ contact: 'Contato digitado', email: 'digitado@example.invalid', site: 'Local digitado' });
  await flush();
  resolve(release);
  await flush();
  assert.equal(hook.state.form.client, clientFields.client);
  assert.equal(hook.state.form.contact, 'Contato digitado');
  assert.equal(hook.state.form.email, 'digitado@example.invalid');
  assert.equal(hook.state.form.site, 'Local digitado');
  hook.close();
});

test('resposta de uma proposta anterior ou após saída da tela é descartada', async () => {
  const pending = [];
  const hook = mount({ fetchRelease: () => new Promise(resolve => { pending.push(resolve); }) });
  hook.update({ propostaId: '4643', crmReleaseId: 'outro-negocio' });
  pending[0](release);
  await flush();
  assert.deepEqual(clone(hook.state.form), {});
  hook.close();
  pending[1](release);
  await flush();
  assert.deepEqual(clone(hook.state.form), {});
});

test('falha na consulta mantém o formulário e informa o usuário', async () => {
  const hook = mount({ form: { site: 'Local escolhido' }, fetchRelease: async () => { throw new Error('Liberação indisponível'); } });
  await flush();
  assert.deepEqual(clone(hook.state.form), { site: 'Local escolhido' });
  assert.equal(hook.state.recado, 'Liberação indisponível');
  assert.equal(hook.saves.length, 0);
  assert.equal(hook.timers, 0);
  hook.close();
});
