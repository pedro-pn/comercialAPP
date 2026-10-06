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
const columns = ['Sistema', 'Material', 'Quantidade', 'Comprimento', 'Ø interno', 'Preenchimento (%)'];
const firstRow = ['Sistema de interligação', 'Aço inox', '1', '600 m', '4"', '100'];

// Requer LibreOffice/UNO e pdftotext (Poppler):
// TEST_SCOPE_TABLE_PDF=1 node --test backend/test/proposta-tabelas.test.js
for (const tipo of ['commercial', 'technical']) {
  for (const modelo of ['padrao', 'hidrojateamento']) {
    test(`PDF ${tipo} ${modelo} mantém cabeçalhos legíveis junto aos dados e repete nas páginas seguintes`, {
      skip: process.env.TEST_SCOPE_TABLE_PDF !== '1'
    }, async () => {
      const directory = await mkdtemp(path.join(os.tmpdir(), 'comercial-table-test-'));
      try {
        for (const count of [1, 40]) {
          const rows = [firstRow, ...Array.from({ length: count - 1 }, (_, i) => [
            `Circuito-${String(i + 2).padStart(3, '0')}`, ...firstRow.slice(1)
          ])];
          const docxPath = path.join(directory, `${count}.docx`);
          const pdfPath = path.join(directory, `${count}.pdf`);
          await writeFile(docxPath, await preencherProposta({
            modelo, date: '2026-10-06', client: 'Cliente de homologação', proposalCode: 'QA-TABELA',
            scopeItems: [{ id: 'scope', title: 'Limpeza química',
              description: 'Execução de limpeza química nas tubulações do circuito sintético para conferência do documento.' }],
            scopeBlocks: [{ type: 'table', title: 'Linha nova — Tubulações', columns, rows }]
          }, tipo));
          await convertDocxToPdf(docxPath, pdfPath);
          const { stdout } = await execFileAsync('pdftotext', ['-bbox-layout', pdfPath, '-'], {
            maxBuffer: 4 * 1024 * 1024
          });
          const doc = new DOMParser().parseFromString(stdout, 'text/xml');
          const pages = Array.from(doc.getElementsByTagName('page')).map(page =>
            Array.from(page.getElementsByTagName('word')).map(word => ({
              text: word.textContent,
              x: Number(word.getAttribute('xMin')), right: Number(word.getAttribute('xMax')),
              y: Number(word.getAttribute('yMin')), bottom: Number(word.getAttribute('yMax'))
            })));
          const rowLabels = ['interligação', ...rows.slice(1).map(row => row[0])];
          const tablePages = pages.filter(words => words.some(word => rowLabels.includes(word.text)));
          assert.ok(tablePages.length > 0);
          if (count > 1) assert.ok(tablePages.length > 1, 'Tabelas grandes devem continuar em outras páginas');

          const firstPage = tablePages[0];
          const title = firstPage.find(word => word.text === 'Tubulações');
          const firstData = firstPage.find(word => word.text === 'interligação');
          assert.ok(title, 'O título deve ficar na página da primeira linha');
          assert.ok(firstData);
          for (const words of tablePages) {
            const labels = words.filter(word => rowLabels.includes(word.text));
            const headers = ['Sistema', 'Material', 'Quantidade', 'Comprimento', 'Ø', 'Preenchimento']
              .map(text => words.find(word => word.text === text && word.y < labels[0].y));
            assert.ok(headers.every(Boolean), 'Cada página de dados deve repetir os cabeçalhos sem partir palavras');
            headers.forEach((header, index) => {
              if (index < headers.length - 1) assert.ok(header.right < headers[index + 1].x,
                `O cabeçalho ${header.text} deve caber na sua coluna`);
              assert.ok(header.bottom < labels[0].y, 'O cabeçalho deve vir antes dos dados');
            });
            for (const label of labels) {
              ['Aço', '1', '600', '4"', '100'].forEach((text, index) => {
                assert.ok(words.some(word => word.text === text
                  && Math.abs(word.x - headers[index + 1].x) < 1
                  && word.y >= label.y - 20 && word.y <= label.y + 1),
                `A linha ${label.text} deve manter ${text} na mesma página e na coluna correta`);
              });
            }
            if (words === firstPage) assert.ok(title.bottom < Math.min(...headers.map(header => header.y)));
          }
          for (const label of rowLabels) {
            assert.equal(pages.flat().filter(word => word.text === label).length, 1,
              `A linha ${label} deve aparecer inteira e uma única vez`);
          }
        }
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
  }
}
