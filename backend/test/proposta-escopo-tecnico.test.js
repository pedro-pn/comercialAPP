import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { DOMParser } from '@xmldom/xmldom';
import { preencherProposta } from '../src/lib/comercial/proposta-docx.js';
import { convertDocxToPdf } from '../src/lib/report-pdf-from-docx.js';

const execFileAsync = promisify(execFile);
const marcador = word => ['•', '\uf0b7'].includes(word.text);

// Requer LibreOffice/UNO e Poppler, como a validação das tabelas de escopo.
// TEST_TECHNICAL_SCOPE_PDF=1 node --test backend/test/proposta-escopo-tecnico.test.js
for (const modelo of ['padrao', 'hidrojateamento']) {
  test(`PDF técnico ${modelo} alinha os marcadores e as continuações sem espalhar as palavras`, {
    skip: process.env.TEST_TECHNICAL_SCOPE_PDF !== '1'
  }, async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'comercial-technical-scope-test-'));
    try {
      for (const editado of [false, true]) {
        const servico = { serviceId: 'limpeza_reservatorio' };
        if (editado) Object.assign(servico, {
          usesTemplate: false,
          text: 'Etapas previstas:\n\n• Abertura editada: '
            + 'Executar a inspeção do reservatório conforme as condições acordadas para esta obra. '.repeat(4)
            + '\n• Organização personalizada da área.'
        });
        const docxPath = path.join(directory, `${editado}.docx`);
        const pdfPath = path.join(directory, `${editado}.pdf`);
        await writeFile(docxPath, await preencherProposta({
          modelo, date: '2026-10-06', client: 'Cliente de homologação',
          proposalCode: 'QA-RESERVATORIO', technicalServices: [servico]
        }, 'technical'));
        await convertDocxToPdf(docxPath, pdfPath);
        const { stdout } = await execFileAsync('pdftotext', ['-bbox-layout', pdfPath, '-'], {
          maxBuffer: 4 * 1024 * 1024
        });
        const doc = new DOMParser().parseFromString(stdout, 'text/xml');
        const pages = Array.from(doc.getElementsByTagName('page')).map(page =>
          Array.from(page.getElementsByTagName('word')).map(word => ({
            text: word.textContent, x: Number(word.getAttribute('xMin')),
            right: Number(word.getAttribute('xMax')), y: Number(word.getAttribute('yMin'))
          })));
        const page = pages.find(words => words.some(word => word.text === 'Etapas'));
        assert.ok(page);
        const inicio = page.find(word => word.text === 'Etapas').y;
        const fim = page.find(word => word.text === 'Relatórios:' && word.y > inicio)?.y ?? Infinity;
        const words = page.filter(word => word.y > inicio + 1 && word.y < fim);
        const markers = words.filter(marcador);
        assert.equal(markers.length, editado ? 2 : 13, 'Cada etapa deve ter seu próprio marcador');
        const textWords = words.filter(word => !marcador(word));
        const lines = new Map();
        for (const word of textWords) {
          const key = Math.round(word.y);
          if (!lines.has(key)) lines.set(key, []);
          lines.get(key).push(word);
        }
        const left = textWords[0].x;
        for (const line of lines.values()) {
          line.sort((a, b) => a.x - b.x);
          assert.ok(Math.abs(line[0].x - left) < 1, 'Itens e linhas continuadas devem alinhar pelo texto');
          line.slice(1).forEach((word, i) => assert.ok(word.x - line[i].right < 6,
            `O espaço antes de ${word.text} deve manter a largura normal`));
        }
        for (const marker of markers) {
          const first = textWords.find(word => Math.abs(word.y - marker.y) < 1);
          assert.ok(first.x - marker.right < 20, 'O marcador deve ficar próximo do texto');
        }
        if (editado) assert.ok(lines.size > markers.length, 'O teste deve incluir um item que quebra naturalmente em várias linhas');
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}
