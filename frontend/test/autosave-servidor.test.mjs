import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { transform } from 'esbuild';

const source = await readFile(new URL('../src/pages/comercial/useAutosaveServidor.ts', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'cjs' });

async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

/** Executa o hook com efeitos e timers controlados, sem aguardar o debounce real. */
function mount(salvar) {
  let props = { dados: { email: '' }, identidade: 'proposta:nova', ativo: true, ocupado: false, salvar };
  const slots = [];
  const timers = new Map();
  let cursor = 0, timerId = 0, effects = [], result, scheduled = false;
  const sameDeps = (a, b) => a?.length === b?.length && a.every((item, index) => Object.is(item, b[index]));
  const react = {
    useRef(value) {
      const index = cursor++;
      slots[index] ??= { current: value };
      return slots[index];
    },
    useState(value) {
      const index = cursor++;
      slots[index] ??= { value };
      return [slots[index].value, next => {
        if (Object.is(next, slots[index].value)) return;
        slots[index].value = next;
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(() => { scheduled = false; render(); });
      }];
    },
    useMemo(compute, deps) {
      const index = cursor++;
      if (!slots[index] || !sameDeps(slots[index].deps, deps))
        slots[index] = { value: compute(), deps };
      return slots[index].value;
    },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(effect, deps) {
      const index = cursor++;
      if (slots[index] && sameDeps(slots[index].deps, deps)) return;
      const previous = slots[index];
      slots[index] = { deps };
      effects.push(() => {
        previous?.cleanup?.();
        slots[index].cleanup = effect();
      });
    }
  };
  const module = { exports: {} };
  runInNewContext(code, {
    module,
    require: name => { assert.equal(name, 'react'); return react; },
    window: {
      setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
      clearTimeout(id) { timers.delete(id); }
    }
  });
  function render() {
    cursor = 0;
    effects = [];
    result = module.exports.useAutosaveServidor(props);
    for (const effect of effects) effect();
  }
  render();
  return {
    get result() { return result; },
    get timers() { return timers.size; },
    update(patch) { props = { ...props, ...patch }; render(); },
    async tick() {
      const callbacks = [...timers.values()];
      timers.clear();
      for (const callback of callbacks) callback();
      await flush();
    }
  };
}

test('falha não repete os mesmos dados quando a página deixa de estar ocupada', async () => {
  let calls = 0;
  const hook = mount(async () => {
    calls++;
    hook.update({ ocupado: true });
    await Promise.resolve();
    hook.update({ ocupado: false });
    return false;
  });
  assert.equal(hook.timers, 0, 'a montagem não grava um formulário intocado');
  hook.update({ dados: { email: 'contato@' } });
  await hook.tick();
  assert.equal(hook.result.estado, 'erro');
  for (let i = 0; i < 3; i++) {
    hook.update({ ocupado: true });
    hook.update({ ocupado: false });
    await hook.tick();
  }
  assert.equal(calls, 1);
  assert.equal(hook.timers, 0);
  assert.equal(hook.result.temAlteracoesPendentes(), true);
});

test('nova edição permite salvar novamente depois de uma falha', async () => {
  let calls = 0;
  const hook = mount(async () => ++calls > 1);
  hook.update({ dados: { email: 'contato@' } });
  await hook.tick();
  hook.update({ dados: { email: 'contato@example.com' } });
  await hook.tick();
  assert.equal(calls, 2);
  assert.equal(hook.result.estado, 'salvo');
  assert.equal(hook.result.temAlteracoesPendentes(), false);
});

for (const success of [false, true]) {
  test(`edição feita durante uma gravação ${success ? 'bem-sucedida' : 'com falha'} não fica presa na fila`, async () => {
    let complete;
    let calls = 0;
    const hook = mount(() => ++calls === 1
      ? new Promise(resolve => { complete = resolve; })
      : Promise.resolve(true));
    hook.update({ dados: { email: 'contato@' } });
    await hook.tick();
    assert.equal(hook.result.estado, 'salvando');
    hook.update({ dados: { email: 'contato@example.com' } });
    complete(success);
    await flush();
    assert.equal(hook.result.estado, 'pendente');
    await hook.tick();
    assert.equal(calls, 2);
    assert.equal(hook.result.estado, 'salvo');
    assert.equal(hook.result.temAlteracoesPendentes(), false);
  });
}
