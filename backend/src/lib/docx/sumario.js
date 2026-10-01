import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function limparResultadoSumario(no) {
  const content = no.getElementsByTagNameNS(WORD_NS, 'sdtContent').item(0);
  if (!content) return;
  const instrucoes = [];
  function visitar(atual) {
    if (atual.nodeType === 1 && atual.localName === 'fldChar'
      && atual.getAttributeNS(WORD_NS, 'fldCharType') === 'separate') return false;
    if (atual.nodeType === 1 && atual.localName === 'instrText') instrucoes.push(atual.textContent);
    for (const filho of Array.from(atual.childNodes)) {
      if (!visitar(filho)) return false;
    }
    return true;
  }
  visitar(content);
  const codigo = instrucoes.join('');
  if (!/\bTOC\s/i.test(codigo)) return;
  const doc = no.ownerDocument;
  const p = doc.createElementNS(WORD_NS, 'w:p');
  const prop = content.getElementsByTagNameNS(WORD_NS, 'pPr').item(0);
  if (prop) p.appendChild(prop.cloneNode(true));
  // A versão final do modelo pode ter fonte aplicada diretamente às entradas.
  // Conserva essa fonte no resultado provisório para a atualização respeitá-la.
  const texto = Array.from(content.getElementsByTagNameNS(WORD_NS, 't'))
    .find(el => el.textContent.trim());
  const formato = texto?.parentNode.getElementsByTagNameNS(WORD_NS, 'rPr').item(0)?.cloneNode(true);
  if (formato) {
    for (const tag of ['rStyle', 'webHidden']) {
      Array.from(formato.getElementsByTagNameNS(WORD_NS, tag)).forEach(el => el.parentNode.removeChild(el));
    }
  }
  const adicionar = (tag, atributos = {}, texto) => {
    const run = doc.createElementNS(WORD_NS, 'w:r');
    if (tag === 't' && formato) run.appendChild(formato.cloneNode(true));
    const el = doc.createElementNS(WORD_NS, `w:${tag}`);
    for (const [nome, valor] of Object.entries(atributos)) el.setAttributeNS(WORD_NS, `w:${nome}`, valor);
    if (texto) {
      el.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
      el.appendChild(doc.createTextNode(texto));
    }
    run.appendChild(el);
    p.appendChild(run);
  };
  adicionar('fldChar', { fldCharType: 'begin', dirty: 'true' });
  adicionar('instrText', {}, codigo);
  adicionar('fldChar', { fldCharType: 'separate' });
  // O Writer descarta campos TOC cujo resultado está completamente vazio.
  adicionar('t', {}, 'Sumário');
  adicionar('fldChar', { fldCharType: 'end' });
  while (content.firstChild) content.removeChild(content.firstChild);
  content.appendChild(p);
}

export function possuiSumario(doc) {
  const instrucoes = Array.from(doc.getElementsByTagNameNS(WORD_NS, 'instrText'))
    .map(no => no.textContent).join('');
  return /\bTOC\s/i.test(instrucoes) || Array.from(doc.getElementsByTagNameNS(WORD_NS, 'fldSimple'))
    .some(no => /\bTOC\s/i.test(no.getAttributeNS(WORD_NS, 'instr')));
}

/** O cache do sumário também pode conter marcadores; só o corpo deve ser preenchido. */
export function separarSumarios(doc) {
  const sumarios = Array.from(doc.getElementsByTagNameNS(WORD_NS, 'sdt'))
    .filter(possuiSumario);
  const partes = sumarios.filter(no => {
    for (let pai = no.parentNode; pai; pai = pai.parentNode) {
      if (sumarios.includes(pai)) return false;
    }
    return true;
  })
    .map(no => {
      const ancora = doc.createComment('sumario');
      no.parentNode.replaceChild(ancora, no);
      return { ancora, no };
    });
  return () => partes.forEach(({ ancora, no }) => {
    limparResultadoSumario(no);
    ancora.parentNode.replaceChild(no, ancora);
  });
}

export function marcarSumarioParaAtualizar(zip) {
  const doc = new DOMParser().parseFromString(zip.readAsText('word/document.xml'), 'text/xml');
  if (!possuiSumario(doc)) return false;
  for (const campo of Array.from(doc.getElementsByTagNameNS(WORD_NS, 'fldChar'))) {
    if (campo.getAttributeNS(WORD_NS, 'fldCharType') === 'begin') {
      campo.setAttributeNS(WORD_NS, 'w:dirty', 'true');
    }
  }
  zip.updateFile('word/document.xml', Buffer.from(new XMLSerializer().serializeToString(doc)));
  const settings = new DOMParser().parseFromString(zip.readAsText('word/settings.xml'), 'text/xml');
  let update = settings.getElementsByTagNameNS(WORD_NS, 'updateFields').item(0);
  if (!update) {
    update = settings.createElementNS(WORD_NS, 'w:updateFields');
    const compat = settings.getElementsByTagNameNS(WORD_NS, 'compat').item(0);
    settings.documentElement.insertBefore(update, compat);
  }
  update.setAttributeNS(WORD_NS, 'w:val', 'true');
  zip.updateFile('word/settings.xml', Buffer.from(new XMLSerializer().serializeToString(settings)));
  return true;
}
