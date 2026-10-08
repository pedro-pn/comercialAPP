import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const result = await build({
  entryPoints: [fileURLToPath(new URL('../src/pages/comercial/proposta/VincularPrismaDialog.tsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic',
  plugins: [{ name: 'dialog-dependencies', setup(build) {
    build.onResolve({ filter: /api\/comercial$/ }, () => ({ path: 'qa-api', external: true }));
    build.onResolve({ filter: /components\/FecharDialogo$/ }, () => ({ path: 'qa-close', external: true }));
  } }]
});
const require = createRequire(import.meta.url);
const release = { id: 'liberacao', opportunityId: 'negocio', version: 1,
  snapshot: { taxId: '11222333000181', legalName: 'Cliente sintético',
    contactName: 'Contato', site: 'Obra sintética', description: 'Serviço sintético' } };

async function flush() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

/** Exercita as ações do diálogo com consultas controladas, sem um servidor ou navegador. */
function mount({ list = async () => [release], onVincular = async () => {}, cnpj = '11.222.333/0001-81' } = {}) {
  const queries = [], slots = [];
  let cursor = 0, effects = [], tree, scheduled = false, closes = 0;
  const sameDeps = (a, b) => a?.length === b?.length && a.every((item, index) => Object.is(item, b[index]));
  const react = {
    useRef() {
      const index = cursor++;
      slots[index] ??= { current: { showModal() {}, close() {} } };
      return slots[index];
    },
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: initial };
      return [slots[index].value, next => {
        const value = typeof next === 'function' ? next(slots[index].value) : next;
        if (Object.is(value, slots[index].value)) return;
        slots[index].value = value;
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(() => { scheduled = false; render(); });
      }];
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (slots[index] && sameDeps(slots[index].deps, deps)) return;
      const previous = slots[index];
      slots[index] = { deps };
      effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = effect(); });
    }
  };
  const module = { exports: {} };
  runInNewContext(result.outputFiles[0].text, { module, exports: module.exports,
    require: name => name === 'react' ? react : name === 'qa-api' ? {
      listarLiberacoesPrisma: cnpj => { queries.push(cnpj); return list(cnpj); },
      mensagemDeErro: error => error.message
    } : name === 'qa-close' ? { BotaoFecharDialogo: () => null } : require(name)
  });
  function render() {
    cursor = 0;
    effects = [];
    tree = module.exports.VincularPrismaDialog({ codigo: '4638', cliente: 'Cliente sintético', cnpj,
      onVincular, onFechar: () => { closes++; } });
    for (const effect of effects) effect();
  }
  function nodes(node) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(nodes);
    return [node, ...nodes(node.props?.children)];
  }
  render();
  return { queries, nodes: () => nodes(tree),
    get closes() { return closes; },
    button: name => nodes(tree).find(node => node.type === 'button' && node.props.children === name),
    select: value => nodes(tree).find(node => node.type === 'select').props.onChange({ target: { value } })
  };
}

test('consulta o CNPJ normalizado e exige escolha explícita antes de confirmar a proposta 4638', async () => {
  const linked = [];
  const dialog = mount({ onVincular: async item => { linked.push(item); } });
  await flush();
  assert.deepEqual(dialog.queries, ['11222333000181']);
  assert.equal(dialog.button('Confirmar vínculo').props.disabled, true);
  assert.equal(dialog.nodes().filter(node => node.type === 'option').length, 2);
  dialog.select(release.id);
  await flush();
  assert.equal(dialog.button('Confirmar vínculo').props.disabled, false);
  await dialog.button('Confirmar vínculo').props.onClick();
  await flush();
  assert.equal(linked.length, 1);
  assert.equal(linked[0], release);
});

test('CNPJ incompleto e cancelamento não associam a proposta nem consultam outros clientes', async () => {
  const dialog = mount({ cnpj: '' });
  await flush();
  assert.equal(dialog.queries.length, 0);
  assert.equal(dialog.button('Confirmar vínculo').props.disabled, true);
  assert.ok(dialog.nodes().some(node => node.props?.role === 'alert'));
  dialog.button('Cancelar').props.onClick();
  assert.equal(dialog.closes, 1);
});

test('versão desatualizada pode ser recarregada sem confirmar o vínculo anterior', async () => {
  let version = 1, attempts = 0;
  const dialog = mount({ list: async () => [{ ...release, version }], onVincular: async item => {
    attempts++;
    assert.equal(item.version, 1);
    throw new Error('Liberação atualizada; recarregue os negócios antes de vincular.');
  } });
  await flush();
  dialog.select(release.id);
  await flush();
  dialog.button('Confirmar vínculo').props.onClick();
  await flush();
  assert.equal(attempts, 1);
  assert.equal(dialog.closes, 0);
  assert.ok(dialog.nodes().some(node => node.props?.role === 'alert' &&
    node.props.children.startsWith('Liberação atualizada')));
  version = 2;
  dialog.button('Atualizar negócios').props.onClick();
  await flush();
  assert.equal(dialog.queries.length, 2);
  assert.equal(dialog.button('Confirmar vínculo').props.disabled, true);
  assert.ok(!dialog.nodes().some(node => node.props?.role === 'alert'));
});

test('durante a associação o diálogo bloqueia confirmação, atualização e saída', async () => {
  let finish;
  const dialog = mount({ onVincular: () => new Promise(resolve => { finish = resolve; }) });
  await flush();
  dialog.select(release.id);
  await flush();
  dialog.button('Confirmar vínculo').props.onClick();
  await flush();
  assert.equal(dialog.button('Vinculando…').props.disabled, true);
  assert.equal(dialog.button('Cancelar').props.disabled, true);
  assert.equal(dialog.button('Atualizar negócios').props.disabled, true);
  dialog.button('Cancelar').props.onClick();
  assert.equal(dialog.closes, 0);
  finish();
  await flush();
});
