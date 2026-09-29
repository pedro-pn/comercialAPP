import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);
let conversionQueue = Promise.resolve();

async function convert(docxPath, pdfPath) {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'comercial-soffice-'));
  try {
    await execFileAsync(process.env.SOFFICE_BIN || 'soffice', [
      `-env:UserInstallation=${pathToFileURL(profile).href}`,
      '--headless', '--convert-to', 'pdf:writer_pdf_Export',
      '--outdir', path.dirname(pdfPath), docxPath
    ], { timeout: 120_000, maxBuffer: 1024 * 1024 });
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
