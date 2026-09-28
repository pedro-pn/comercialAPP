import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  calculateEstimate,
  validateCostEstimate,
} from '../dist/cost-model.js';

/**
 * Oráculo numérico do módulo Comercial (tarefa T014).
 *
 * Os 16 cenários foram copiados do FiltroAPP, commit 94b74278. O motor
 * extraído deve reproduzi-los dígito a dígito.
 *
 * >>> NUNCA regere um golden para fazer este teste passar. <<<
 *
 * Se um cenário falha, investigar o porte antes de mudar a referência.
 */

const here = dirname(fileURLToPath(import.meta.url));
const goldensDir = join(here, 'goldens');

const manifest = JSON.parse(readFileSync(join(goldensDir, 'manifest.json'), 'utf8'));

const goldenFiles = readdirSync(goldensDir)
  .filter((name) => name.endsWith('.golden.json'))
  .sort();

test('os 16 cenários golden estão presentes', () => {
  assert.equal(goldenFiles.length, 16, 'faltou arquivo golden na pasta');
  assert.equal(
    manifest.scenarios.length,
    16,
    'o manifest não descreve os 16 cenários',
  );
});

for (const fileName of goldenFiles) {
  const golden = JSON.parse(readFileSync(join(goldensDir, fileName), 'utf8'));

  test(`golden ${golden.scenario}: ${golden.intent.split('.')[0]}`, () => {
    const result = calculateEstimate(golden.payload);
    const validation = validateCostEstimate(golden.payload);

    // Resultado inteiro, campo a campo — não só os totais. É o que pega
    // divergência em subtotal que se cancela no total.
    assert.deepEqual(
      JSON.parse(JSON.stringify(result)),
      golden.result,
      `resultado divergiu do golden em ${fileName}`,
    );

    assert.equal(
      validation.valid,
      golden.validation.valid,
      `validade divergiu em ${fileName}`,
    );
    assert.deepEqual(
      validation.errors,
      golden.validation.errors,
      `lista de erros divergiu em ${fileName}`,
    );
    assert.deepEqual(
      validation.warnings,
      golden.validation.warnings,
      `lista de avisos divergiu em ${fileName}`,
    );
  });
}

test('os invariantes declarados no manifest batem com o resultado', () => {
  for (const scenario of manifest.scenarios) {
    const golden = JSON.parse(
      readFileSync(join(goldensDir, `${scenario.scenario}.golden.json`), 'utf8'),
    );
    const result = calculateEstimate(golden.payload);
    const validation = validateCostEstimate(golden.payload);

    assert.equal(
      Number(result.totalCost),
      scenario.totalCost,
      `${scenario.scenario}: custo total`,
    );
    assert.equal(
      Number(result.salePrice),
      scenario.salePrice,
      `${scenario.scenario}: preço de venda`,
    );
    assert.equal(
      Number(result.margin),
      scenario.margin,
      `${scenario.scenario}: margem`,
    );
    assert.equal(
      Boolean(result.validPricing),
      scenario.validPricing,
      `${scenario.scenario}: precificação válida`,
    );
    assert.equal(
      validation.valid,
      scenario.valid,
      `${scenario.scenario}: validade`,
    );
    assert.equal(
      validation.errors.length,
      scenario.errors,
      `${scenario.scenario}: quantidade de erros`,
    );
    assert.equal(
      validation.warnings.length,
      scenario.warnings,
      `${scenario.scenario}: quantidade de avisos`,
    );
  }
});
