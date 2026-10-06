import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { transform } from 'esbuild';

const source = await readFile(new URL('../src/utils/randomUuid.ts', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'cjs' });

function uuidGenerator(crypto) {
  const module = { exports: {} };
  runInNewContext(code, { module, crypto });
  return module.exports.randomUuid;
}

test('UUID de evento funciona sem randomUUID, como no staging HTTP', () => {
  const randomUuid = uuidGenerator({
    getRandomValues: bytes => webcrypto.getRandomValues(bytes)
  });
  const ids = Array.from({ length: 100 }, () => randomUuid());
  for (const id of ids) {
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  }
  assert.equal(new Set(ids).size, ids.length);
});

test('UUID preserva a versão 4 e a variante RFC nos limites dos bytes aleatórios', () => {
  for (const [byte, expected] of [
    [0, '00000000-0000-4000-8000-000000000000'],
    [255, 'ffffffff-ffff-4fff-bfff-ffffffffffff']
  ]) {
    const randomUuid = uuidGenerator({ getRandomValues: bytes => bytes.fill(byte) });
    assert.equal(randomUuid(), expected);
  }
});
