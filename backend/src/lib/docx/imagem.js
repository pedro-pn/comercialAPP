import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

/**
 * Inserir imagem num `.docx`.
 *
 * **São três lugares, e esquecer um deles produz um arquivo que o Word recusa
 * a abrir** — não um documento feio, um documento quebrado:
 *
 * 1. os bytes em `word/media/`;
 * 2. uma `Relationship` em `word/_rels/document.xml.rels`, que é como o
 *    parágrafo referencia o arquivo;
 * 3. um `Default` em `[Content_Types].xml` para a extensão, sem o qual o
 *    pacote é considerado inválido.
 *
 * A lógica saiu de `report-docx.js`, que já embutia assinatura e fotos de
 * relatório. Está aqui porque o módulo Comercial passou a precisar dela para as
 * fotos do escopo, e duplicá-la seria duplicar as três chances de errar.
 */

/** 1 cm = 360 000 EMU. O Word mede imagem em EMU, não em pixel nem em ponto. */
export const EMU_POR_MM = 36000;

export function proximoIdDeRelacao(relsDoc) {
  let maior = 0;
  for (const no of Array.from(relsDoc.getElementsByTagName('Relationship'))) {
    const achado = String(no.getAttribute('Id') || '').match(/^rId(\d+)$/);
    if (achado) maior = Math.max(maior, Number(achado[1]));
  }
  return `rId${maior + 1}`;
}

export function garantirTipoDeConteudo(zip, extensao, mime) {
  const entrada = zip.getEntry('[Content_Types].xml');
  if (!entrada) return;

  const doc = new DOMParser().parseFromString(zip.readAsText(entrada), 'text/xml');
  const existe = Array.from(doc.getElementsByTagName('Default')).some(
    no => String(no.getAttribute('Extension') || '').toLowerCase() === extensao.toLowerCase()
  );
  if (existe) return;

  const no = doc.createElement('Default');
  no.setAttribute('Extension', extensao.toLowerCase());
  no.setAttribute('ContentType', mime);
  doc.documentElement.appendChild(no);
  zip.updateFile(
    '[Content_Types].xml',
    Buffer.from(new XMLSerializer().serializeToString(doc), 'utf8')
  );
}

/**
 * Grava os bytes e devolve o `rId` para referenciar a imagem.
 *
 * O nome inclui um sufixo aleatório porque duas fotos gravadas no mesmo
 * milissegundo colidiriam, e a segunda sobrescreveria a primeira em silêncio —
 * o documento sairia com a mesma foto duas vezes.
 */
export function registrarImagem(zip, relsDoc, { bytes, extensao, mime }, prefixo = 'imagem') {
  const relId = proximoIdDeRelacao(relsDoc);
  const nome = `${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensao}`;

  zip.addFile(`word/media/${nome}`, bytes);
  garantirTipoDeConteudo(zip, extensao, mime);

  const relacao = relsDoc.createElement('Relationship');
  relacao.setAttribute('Id', relId);
  relacao.setAttribute(
    'Type',
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image'
  );
  relacao.setAttribute('Target', `media/${nome}`);
  relsDoc.documentElement.appendChild(relacao);

  return relId;
}

/** O run com o desenho, em linha com o texto. */
export function xmlDeImagem(relId, larguraEmu, alturaEmu, nome = 'Imagem') {
  return `
    <w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
      <w:drawing>
        <wp:inline distT="0" distB="0" distL="0" distR="0">
          <wp:extent cx="${larguraEmu}" cy="${alturaEmu}"/>
          <wp:docPr id="${Math.floor(Math.random() * 100000) + 1}" name="${nome}"/>
          <a:graphic>
            <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:pic>
                <pic:nvPicPr>
                  <pic:cNvPr id="0" name="${nome}"/>
                  <pic:cNvPicPr/>
                </pic:nvPicPr>
                <pic:blipFill>
                  <a:blip r:embed="${relId}"/>
                  <a:stretch><a:fillRect/></a:stretch>
                </pic:blipFill>
                <pic:spPr>
                  <a:xfrm>
                    <a:off x="0" y="0"/>
                    <a:ext cx="${larguraEmu}" cy="${alturaEmu}"/>
                  </a:xfrm>
                  <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                </pic:spPr>
              </pic:pic>
            </a:graphicData>
          </a:graphic>
        </wp:inline>
      </w:drawing>
    </w:r>`.trim();
}
