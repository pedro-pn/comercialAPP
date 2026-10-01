import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import AdmZip from 'adm-zip';
import { DOMParser } from '@xmldom/xmldom';
import { marcarSumarioParaAtualizar, possuiSumario } from './docx/sumario.js';

const execFileAsync = promisify(execFile);
let conversionQueue = Promise.resolve();

async function converterComSumario(docxPath, pdfPath, profile) {
  const pipe = `comercial_${randomUUID().replaceAll('-', '')}`;
  const office = spawn(process.env.SOFFICE_BIN || 'soffice', [
    `-env:UserInstallation=${pathToFileURL(profile).href}`,
    '--headless', '--norestore', '--nodefault', '--nofirststartwizard',
    `--accept=pipe,name=${pipe};urp;StarOffice.ComponentContext`
  ], { stdio: 'ignore' });
  try {
    await new Promise((resolve, reject) => {
      office.once('spawn', resolve);
      office.once('error', reject);
    });
    await execFileAsync(process.env.PYTHON_BIN || 'python3', [
      fileURLToPath(new URL('../../scripts/convert-docx-with-toc.py', import.meta.url)),
      pipe, path.resolve(docxPath), path.resolve(pdfPath)
    ], { timeout: 120_000, maxBuffer: 1024 * 1024 });
    const zip = new AdmZip(await readFile(docxPath));
    marcarSumarioParaAtualizar(zip);
    await writeFile(docxPath, zip.toBuffer());
  } finally {
    if (office.exitCode === null) office.kill('SIGKILL');
    if (office.pid && office.exitCode === null) {
      await new Promise(resolve => office.once('close', resolve));
    }
  }
}

async function convert(docxPath, pdfPath) {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'comercial-soffice-'));
  try {
    const zip = new AdmZip(await readFile(docxPath));
    const doc = new DOMParser().parseFromString(zip.readAsText('word/document.xml'), 'text/xml');
    if (possuiSumario(doc)) {
      await converterComSumario(docxPath, pdfPath, profile);
    } else {
      await execFileAsync(process.env.SOFFICE_BIN || 'soffice', [
        `-env:UserInstallation=${pathToFileURL(profile).href}`,
        '--headless', '--convert-to', 'pdf:writer_pdf_Export',
        '--outdir', path.dirname(pdfPath), docxPath
      ], { timeout: 120_000, maxBuffer: 1024 * 1024 });
    }
    const bytes = await readFile(pdfPath);
    if (bytes.length < 16 || bytes.subarray(0, 5).toString() !== '%PDF-' ||
      !bytes.subarray(-2048).toString('latin1').includes('%%EOF')) {
      throw new Error('A conversão DOCX para PDF não gerou um PDF completo.');
    }
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
}

/** O LibreOffice compartilha estado interno; cada conversão aguarda a anterior. */
export function convertDocxToPdf(docxPath, pdfPath) {
  const job = conversionQueue.then(() => convert(docxPath, pdfPath));
  conversionQueue = job.catch(() => {});
  return job;
}
