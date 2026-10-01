import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRendererHash, proposalRendererHash } from '../src/lib/comercial/document-renderer.js';

test('assinatura detecta mudanças nos dois modelos e no motor sem depender da data do arquivo', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'comercial-renderer-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const engine = path.join(directory, 'engine.js');
  const templatePath = (type, model) => path.join(directory, `${type}-${model}.docx`);
  await writeFile(engine, 'motor v1');
  for (const model of ['padrao', 'hidrojateamento']) {
    for (const type of ['commercial', 'technical']) {
      await writeFile(templatePath(type, model), `${model} ${type} v1`);
    }
  }
  const options = { files: [engine], templatePath };
  const rendererHash = createRendererHash(options);
  const standard = { payload: { modelo: 'padrao' } };
  const hydro = { payload: { modelo: 'hidrojateamento' } };
  const original = await rendererHash(standard);
  assert.equal(await rendererHash({ payload: {} }), original);
  assert.equal(await rendererHash(standard), original);
  assert.notEqual(await rendererHash(hydro), original);

  const commercial = templatePath('commercial', 'padrao');
  const times = await stat(commercial);
  await writeFile(commercial, 'padrao commercial v2');
  await utimes(commercial, times.atime, times.mtime);
  const changedCommercial = await rendererHash(standard);
  assert.notEqual(changedCommercial, original);
  await writeFile(templatePath('technical', 'padrao'), 'padrao technical v2');
  const changedTechnical = await rendererHash(standard);
  assert.notEqual(changedTechnical, changedCommercial);
  await writeFile(templatePath('commercial', 'hidrojateamento'), 'hidrojateamento commercial v2');
  assert.equal(await rendererHash(standard), changedTechnical);

  await writeFile(engine, 'motor v2');
  assert.equal(await rendererHash(standard), changedTechnical,
    'O processo em execução continua usando o motor que carregou.');
  assert.notEqual(await createRendererHash(options)(standard), changedTechnical,
    'Um novo processo com motor atualizado deve invalidar a geração anterior.');
});

test('assinatura usa os modelos e as dependências presentes no projeto', async () => {
  for (const modelo of ['padrao', 'hidrojateamento']) {
    const proposal = { payload: { modelo } };
    const hash = await proposalRendererHash(proposal);
    assert.match(hash, /^[a-f0-9]{64}$/);
    assert.equal(await proposalRendererHash(proposal), hash);
  }
});
