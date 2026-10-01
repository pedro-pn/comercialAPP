import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { caminhoDoModelo } from './proposta-docx.js';

const root = fileURLToPath(new URL('../../../../', import.meta.url));

async function javascriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? javascriptFiles(file)
      : entry.name.endsWith('.js') ? [file] : [];
  }));
  return files.flat().sort();
}

async function engineFiles() {
  return [
    ...await javascriptFiles(path.join(root, 'backend/src/lib')),
    ...await javascriptFiles(path.join(root, 'shared/comercial/dist')),
    path.join(root, 'backend/src/comercial/documents.js'),
    path.join(root, 'backend/scripts/convert-docx-with-toc.py'),
    path.join(root, 'package-lock.json')
  ];
}

/** O código acompanha o processo; os modelos Word podem mudar sem reiniciar. */
export function createRendererHash({ files = engineFiles, templatePath = caminhoDoModelo } = {}) {
  let engine;
  return async proposal => {
    if (!engine) {
      engine = (async () => {
        const paths = typeof files === 'function' ? await files() : files;
        const bytes = await Promise.all(paths.map(file => readFile(file)));
        const hash = createHash('sha256').update(process.version)
          .update(process.env.SOFFICE_BIN || 'soffice')
          .update(process.env.PYTHON_BIN || 'python3');
        bytes.forEach(content => hash.update(String(content.length)).update(':').update(content));
        return hash.digest('hex');
      })().catch(error => { engine = null; throw error; });
    }
    const modelo = proposal.payload?.modelo === 'hidrojateamento' ? 'hidrojateamento' : 'padrao';
    const [engineHash, templates] = await Promise.all([engine,
      Promise.all(['commercial', 'technical'].map(type => readFile(templatePath(type, modelo))))]);
    const hash = createHash('sha256').update(engineHash).update(modelo);
    templates.forEach(content => hash.update(String(content.length)).update(':').update(content));
    return hash.digest('hex');
  };
}

export const proposalRendererHash = createRendererHash();
