import path from 'node:path';
import AdmZip from 'adm-zip';
import { DOMParser } from '@xmldom/xmldom';
import { HttpError } from '../auth/service.js';

export const LEC_MAX_BYTES = 10 * 1024 * 1024;
const namespace = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const relationshipNamespace = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const key = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .trim().replace(/\s+/g, ' ').toUpperCase();
const elements = (node, name) => Array.from(node.getElementsByTagNameNS(namespace, name));

/** Reads OOXML values only. VBA, external links and formulas are never executed. */
export function readLecWorkbook(bytes, fileName) {
  if (!/\.(xlsx|xlsm)$/i.test(fileName)) {
    throw new HttpError(422, 'Selecione um LEC em .xlsm ou .xlsx.');
  }
  if (!Buffer.isBuffer(bytes) || !bytes.length) throw new HttpError(422, 'O arquivo LEC está vazio.');
  if (bytes.length > LEC_MAX_BYTES) throw new HttpError(413, 'O LEC deve ter até 10 MB.');
  try {
    if (bytes.readUInt32LE(0) !== 0x04034b50) throw new Error('Not an OOXML archive');
    const zip = new AdmZip(bytes);
    const entries = zip.getEntries();
    if (entries.length > 2000 || entries.reduce((sum, entry) => sum + entry.header.size, 0) > 80 * 1024 * 1024) {
      throw new HttpError(413, 'O conteúdo descompactado do LEC excede o limite permitido.');
    }
    function xml(name, optional = false) {
      const entry = zip.getEntry(name);
      if (!entry && optional) return null;
      if (!entry || entry.header.size > 12 * 1024 * 1024) throw new Error('Missing or oversized XML');
      const source = entry.getData().toString('utf8');
      if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('Unsupported XML declaration');
      return new DOMParser({ onError: () => { throw new Error('Invalid XML'); } })
        .parseFromString(source, 'text/xml');
    }
    const workbook = xml('xl/workbook.xml');
    const relationships = xml('xl/_rels/workbook.xml.rels');
    const shared = xml('xl/sharedStrings.xml', true);
    const strings = shared ? elements(shared, 'si').map(si => elements(si, 't').map(t => t.textContent).join('')) : [];
    const targets = new Map(Array.from(relationships.getElementsByTagName('Relationship'))
      .filter(item => item.getAttribute('TargetMode') !== 'External')
      .map(item => [item.getAttribute('Id'), path.posix.normalize(
        item.getAttribute('Target').startsWith('/')
          ? item.getAttribute('Target').slice(1) : `xl/${item.getAttribute('Target')}`
      )]));
    const sheetFiles = new Map(elements(workbook, 'sheet').map(sheet => [
      key(sheet.getAttribute('name')), targets.get(sheet.getAttributeNS(relationshipNamespace, 'id'))
    ]));
    const sheets = new Map();
    const warnings = new Set();
    function sheet(name, required = false) {
      const normalizedName = key(name);
      if (sheets.has(normalizedName)) return sheets.get(normalizedName);
      const file = sheetFiles.get(normalizedName);
      if (!file || !file.startsWith('xl/worksheets/')) {
        if (required) throw new HttpError(422, `LEC incompatível: a aba ${name} não foi encontrada.`);
        return new Map();
      }
      const doc = xml(file);
      const cells = elements(doc, 'c');
      if (cells.length > 100_000) throw new HttpError(413, `A aba ${name} excede o limite de células.`);
      const values = new Map(cells.map(cell => {
        const type = cell.getAttribute('t');
        const raw = elements(cell, 'v')[0]?.textContent ?? '';
        let value = raw;
        if (type === 's') {
          if (raw && strings[Number(raw)] === undefined) throw new Error('Invalid shared string');
          value = strings[Number(raw)] ?? '';
        } else if (type === 'inlineStr') value = elements(cell, 't').map(t => t.textContent).join('');
        return [cell.getAttribute('r'), { value, type, formula: elements(cell, 'f').length > 0 }];
      }));
      sheets.set(normalizedName, values);
      return values;
    }
    function cell(name, address) {
      const entry = sheet(name).get(address);
      if (entry?.type === 'e' || entry?.formula && !entry.value) {
        warnings.add(`Aba ${name}, célula ${address}: fórmula sem resultado válido. Confira este campo no app ou salve o LEC recalculado no Excel e importe novamente.`);
        return '';
      }
      return entry?.value ?? '';
    }
    return {
      sheet,
      text: (name, address) => String(cell(name, address)).trim(),
      number: (name, address) => {
        const value = cell(name, address);
        if (value === '') return 0;
        // Numeric OOXML cells use a decimal point; text cells may use Brazilian currency.
        const normalized = sheet(name).get(address)?.type === 's' || sheet(name).get(address)?.type === 'inlineStr'
          ? String(value).replace(/R\$|\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.')
          : value;
        const number = Number(normalized);
        if (!Number.isFinite(number)) {
          warnings.add(`Aba ${name}, célula ${address}: valor numérico não reconhecido. Confira este campo.`);
          return 0;
        }
        return number;
      },
      date: (name, address) => {
        const value = cell(name, address);
        const serial = Number(value);
        if (value && Number.isFinite(serial) && serial > 0 && serial < 100_000) {
          const uses1904 = elements(workbook, 'workbookPr')[0]?.getAttribute('date1904');
          const epoch = uses1904 === '1' || uses1904 === 'true' ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
          return new Date(epoch + Math.floor(serial) * 86400000).toISOString().slice(0, 10);
        }
        return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : '';
      },
      warnings,
      key
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(422, 'Não foi possível ler o LEC. Use um arquivo .xlsm ou .xlsx válido, sem senha, no modelo LEC 1.2/1.3.');
  }
}
