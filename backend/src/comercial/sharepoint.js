import env from './external-env.js';
import { HttpError } from '../auth/service.js';

/**
 * Adaptador do SharePoint / OneDrive, via Microsoft Graph (tarefas T076 e T076f).
 *
 * Mesmos três modos do Nectar, e pela mesma razão: **não há ambiente de teste
 * separado**. O destino é a biblioteca de documentos real da empresa, e um
 * ambiente mal configurado que "tentasse por padrão" criaria pasta de verdade
 * dentro dela.
 *
 *   off    não tenta. A finalização responde que o envio está desligado.
 *   fake   responde como se tivesse gravado, sem rede. É o modo do dev e da suíte.
 *   real   autentica com as credenciais do aplicativo e grava.
 *
 * A contenção que não depende da Microsoft é `SHAREPOINT_BASE_FOLDER`: tudo é
 * criado **dentro** dela. Apontar o ambiente de teste para uma pasta de testes
 * mantém o erro de código longe de "02 - Comercial/Projetos em cotação".
 */

const GRAPH = 'https://graph.microsoft.com/v1.0';
const LOGIN = 'https://login.microsoftonline.com';
const TEMPO_LIMITE_MS = 15000;

export class SharePointError extends HttpError {
  constructor(message, statusCode = 502) {
    super(statusCode, message);
    this.name = 'SharePointError';
  }
}

export function modoDoSharePoint() {
  return env.sharepointMode;
}

/**
 * Recusa antes de qualquer trabalho quando o envio não pode acontecer.
 *
 * Devolve o motivo em vez de lançar, como o Nectar: quem chama precisa
 * continuar, porque os documentos já existem e continuam baixáveis (FR-034).
 */
export function indisponivel(biblioteca = bibliotecaDoAmbiente()) {
  const modo = modoDoSharePoint();
  if (modo === 'off') {
    return 'O envio ao SharePoint está desligado neste ambiente (SHAREPOINT_MODE=off).';
  }
  if (modo !== 'real') return '';

  const faltando = [
    ['MICROSOFT_TENANT_ID', env.microsoftTenantId],
    ['MICROSOFT_CLIENT_ID', env.microsoftClientId],
    ['MICROSOFT_CLIENT_SECRET', env.microsoftClientSecret]
  ]
    .filter(([, valor]) => !valor)
    .map(([nome]) => nome);

  if (faltando.length) {
    return `Integração Microsoft pendente: ${faltando.join(', ')} não configurado(s).`;
  }

  // **A pasta é obrigatória no modo real, e a checagem existe por causa do que
  // acontece sem ela**: `garantirPastas` cria o caminho que falta, então um
  // valor vazio ou esquecido não daria erro — gravaria as propostas na raiz da
  // biblioteca do cliente, ou numa pasta inventada, e ninguém procuraria ali.
  // É a única contenção que não depende da Microsoft.
  if (!env.sharepointBaseFolder.trim()) {
    return 'SHAREPOINT_BASE_FOLDER não configurado: sem ele as propostas seriam gravadas na raiz da biblioteca.';
  }

  // O destino aceita três formas, e basta uma. Cobrar hostname + caminho de quem
  // configurou o `DRIVE_ID` faria a instalação de menor privilégio — a que não
  // pode descobrir site — parecer incompleta.
  const temDestino =
    biblioteca.driveId || biblioteca.siteId || (biblioteca.hostname && biblioteca.sitePath);

  return temDestino
    ? ''
    : 'Integração Microsoft pendente: informe SHAREPOINT_DRIVE_ID, ou SHAREPOINT_SITE_ID, ou SHAREPOINT_HOSTNAME + SHAREPOINT_SITE_PATH.';
}

/**
 * Grava os arquivos numa pasta da proposta e devolve o caminho gravado.
 *
 * `pastaExistente` é o `PROP-CTL-080` (T076f): havendo valor, os arquivos vão
 * **para dentro dela** em vez de uma pasta nova. É o caso de a obra já ter uma
 * pasta no OneDrive — criar outra ao lado espalharia os documentos da mesma
 * negociação por dois lugares.
 */
export async function gravarArquivos(
  arquivos,
  { nomeDaPasta, pastaExistente = '', biblioteca = bibliotecaDoAmbiente() } = {}
) {
  const pasta = nomeDeePasta(pastaExistente || nomeDaPasta);
  const base = env.sharepointBaseFolder.trim()
    ? nomeDeePasta(env.sharepointBaseFolder).replace(/^\/+|\/+$/g, '') : '';
  const destino = !base || pasta === base || pasta.startsWith(`${base}/`)
    ? pasta : `${base}/${pasta}`;

  if (modoDoSharePoint() === 'fake') {
    return { pasta: destino, arquivos: arquivos.length };
  }

  const cabecalhos = { Authorization: `Bearer ${await autenticar()}` };
  const driveId = await acharBiblioteca(cabecalhos, biblioteca);

  await garantirPastas(driveId, destino, cabecalhos);

  // Um por vez, e não em paralelo: o Graph limita requisições por aplicativo, e
  // três uploads simultâneos de PDF grande são o caminho mais curto para o 429.
  for (const arquivo of arquivos) {
    await enviarArquivo(driveId, destino, arquivo, cabecalhos);
  }

  return { pasta: destino, arquivos: arquivos.length };
}

// ---------------------------------------------------------------------------

async function autenticar() {
  const resposta = await chamar(`${LOGIN}/${env.microsoftTenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.microsoftClientId,
      client_secret: env.microsoftClientSecret,
      grant_type: 'client_credentials',
      scope: 'https://graph.microsoft.com/.default'
    })
  });

  if (!resposta.ok) {
    throw new SharePointError('Não foi possível autenticar o serviço no Microsoft 365.');
  }

  const token = String((await resposta.json()).access_token || '');
  if (!token) {
    throw new SharePointError('O Microsoft 365 autenticou sem devolver o token.');
  }
  return token;
}

/**
 * Onde gravar — por três caminhos, do mais restrito ao mais permissivo.
 *
 * A ordem existe por causa da permissão concedida no Entra ID, e a diferença é
 * grande o bastante para justificar os três:
 *
 * 1. `SHAREPOINT_DRIVE_ID` — vai direto à biblioteca, **sem descobrir nada**. É o
 *    único caminho que a `Sites.Selected` garante: ela concede acesso a sites
 *    escolhidos um a um e **restringe descoberta**, então procurar o site pelo
 *    endereço pode voltar 403 mesmo com o site liberado. A documentação do
 *    `GET /sites/{site-id}` lista só `Sites.Read.All` e `Sites.ReadWrite.All`
 *    como permissão de aplicativo — `Sites.Selected` não está lá.
 * 2. `SHAREPOINT_SITE_ID` — uma descoberta só, a da biblioteca padrão.
 * 3. hostname + caminho do site — duas descobertas. Precisa de
 *    `Sites.ReadWrite.All`, que alcança **todo site e todo OneDrive da empresa**.
 *
 * Quem instala escolhe pelo que preencher. O caminho 3 continua existindo porque
 * é o que estava em uso antes de a opção de menor privilégio existir.
 */
/** As quatro variáveis de destino, como estão no ambiente. */
export function bibliotecaDoAmbiente() {
  return {
    driveId: env.sharepointDriveId,
    siteId: env.sharepointSiteId,
    hostname: env.sharepointHostname,
    sitePath: env.sharepointSitePath
  };
}

async function acharBiblioteca(cabecalhos, biblioteca) {
  if (biblioteca.driveId) return biblioteca.driveId;

  const alvo = biblioteca.siteId
    ? `${GRAPH}/sites/${biblioteca.siteId}/drive`
    : // `sites/{host}:/{caminho}:/drive` — a biblioteca padrão do site que está
      // naquele endereço, numa requisição só.
      //
      // Era em DUAS, e a primeira nunca poderia ter funcionado: o `:` do
      // template somava com o `:` que `caminhoDeUrl` já abre, e a URL saía
      // `sites/host::/sites/X:` — dois-pontos duplicado, endereço inválido.
      // Passou despercebido porque o SharePoint fica `off` por padrão e este
      // ramo nunca rodou; teria estourado no primeiro dia de uso real, com
      // "o site não foi localizado" apontando para o lugar errado.
      `${GRAPH}/sites/${biblioteca.hostname}${caminhoDeUrl(biblioteca.sitePath)}/drive`;

  const drive = await chamar(alvo, { headers: cabecalhos });
  if (!drive.ok) {
    throw new SharePointError(
      'A biblioteca de documentos do site não foi localizada. Com Sites.Selected, configure SHAREPOINT_DRIVE_ID — ela não permite descobrir site nem biblioteca.'
    );
  }

  return String((await drive.json()).id || '');
}

/**
 * Cria a árvore de pastas, um nível por vez.
 *
 * O Graph não cria caminho intermediário sozinho: pedir `a/b/c` de uma vez
 * falha se `a/b` não existir. E cada nível é **procurado antes de criar**, senão
 * a segunda proposta do mesmo mês esbarraria numa pasta que já existe.
 */
async function garantirPastas(driveId, caminho, cabecalhos) {
  let pai = 'root';

  for (const nome of caminho.split('/').filter(Boolean)) {
    const alvo =
      pai === 'root'
        ? `${GRAPH}/drives/${driveId}/root:/${encodeURIComponent(nome)}`
        : `${GRAPH}/drives/${driveId}/items/${pai}:/${encodeURIComponent(nome)}`;

    const existente = await chamar(alvo, { headers: cabecalhos });
    if (existente.ok) {
      pai = String((await existente.json()).id || '');
      continue;
    }

    const filhos = pai === 'root' ? 'root/children' : `items/${pai}/children`;
    const criada = await chamar(`${GRAPH}/drives/${driveId}/${filhos}`, {
      method: 'POST',
      headers: { ...cabecalhos, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: nome,
        folder: {},
        // `fail` de propósito: se apareceu entre a procura e a criação, é outra
        // finalização acontecendo ao mesmo tempo — e renomear para "pasta 1"
        // espalharia os documentos da mesma proposta.
        '@microsoft.graph.conflictBehavior': 'fail'
      })
    });

    if (!criada.ok) {
      throw new SharePointError(`Não foi possível criar a pasta ${nome} no SharePoint.`);
    }
    pai = String((await criada.json()).id || '');
  }
}

async function enviarArquivo(driveId, pasta, arquivo, cabecalhos) {
  const caminho = `${pasta}/${nomeDeArquivo(arquivo.fileName)}`
    .split('/')
    .map(encodeURIComponent)
    .join('/');

  const resposta = await chamar(`${GRAPH}/drives/${driveId}/root:/${caminho}:/content`, {
    method: 'PUT',
    headers: { ...cabecalhos, 'Content-Type': tipoDe(arquivo.fileName) },
    body: arquivo.bytes
  });

  if (!resposta.ok) {
    throw new SharePointError(`Não foi possível salvar ${arquivo.fileName} no SharePoint.`);
  }
}

async function chamar(url, opcoes = {}) {
  return fetch(url, { ...opcoes, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) }).catch(erro => {
    throw new SharePointError(`Não foi possível falar com o Microsoft 365: ${erro.message}`);
  });
}

/**
 * O caminho do site vira segmento de URL do Graph, com as barras preservadas.
 *
 * `encodeURIComponent` no caminho inteiro comeria as barras e o site não seria
 * encontrado; codificar segmento a segmento mantém a estrutura.
 */
export function caminhoDeUrl(caminho) {
  const limpo = String(caminho || '').replace(/^\/+|\/+$/g, '');
  if (!limpo) return ':';
  return `:/${limpo.split('/').map(encodeURIComponent).join('/')}:`;
}

/**
 * Nome de pasta aceito pelo SharePoint.
 *
 * Ele recusa `\ : * ? " < > |` e nome terminado em ponto — e a recusa vem
 * depois do upload começar, com mensagem que não diz qual caractere. Limpar
 * antes é mais barato que interpretar o erro.
 */
/** Um segmento limpo, sem o que o SharePoint recusa. Pode voltar vazio. */
function limparSegmento(valor) {
  return String(valor)
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/[\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/g, '')
    .trim();
}

export function nomeDeePasta(valor) {
  return (
    String(valor || '')
      .split('/')
      .map(limparSegmento)
      .filter(Boolean)
      .join('/') || 'Proposta'
  );
}

/**
 * Nome de arquivo, com reserva **própria**.
 *
 * Ele não passa por `nomeDeePasta`: aquela tem a reserva "Proposta", que é nome
 * de pasta e nunca de arquivo — um anexo sem nome viraria "Proposta", sem
 * extensão, ao lado da proposta de verdade.
 *
 * E a barra vira hífen antes de tudo: `Proposta 4418/2.pdf` criaria a pasta
 * "Proposta 4418" com "2.pdf" dentro, em silêncio.
 */
export function nomeDeArquivo(valor) {
  return limparSegmento(String(valor || '').replace(/\//g, '-')) || 'arquivo';
}

function tipoDe(nome) {
  if (/\.pdf$/i.test(nome)) return 'application/pdf';
  if (/\.csv$/i.test(nome)) return 'text/csv';
  return 'application/octet-stream';
}
