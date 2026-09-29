import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from '../auth/service.js';

function root() {
  return path.resolve(process.env.COMERCIAL_DIR || path.join(process.cwd(), 'storage'));
}

export function storagePath(relative) {
  const base = root();
  const absolute = path.resolve(base, String(relative || ''));
  if (absolute === base || !absolute.startsWith(`${base}${path.sep}`)) {
    throw new HttpError(400, 'Caminho de arquivo inválido.');
  }
  return absolute;
}

export function safeCode(code) {
  const clean = String(code || '').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 80);
  return clean || 'sem-numero';
}

export async function storeFile(relative, bytes) {
  const absolute = storagePath(relative);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, bytes, { flag: 'wx' });
  return { storagePath: relative.split(path.sep).join('/'), byteSize: bytes.length };
}

export async function loadFile(relative) {
  try {
    return await readFile(storagePath(relative));
  } catch (error) {
    if (error.code === 'ENOENT') throw new HttpError(404, 'Arquivo ausente do armazenamento do Comercial.');
    throw error;
  }
}

export async function removeFile(relative) {
  await rm(storagePath(relative), { force: true });
}
