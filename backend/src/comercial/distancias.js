import env from './external-env.js';
import { HttpError } from '../auth/service.js';

/**
 * Distância sede → obra, calculada (tarefa T126a).
 *
 * Dois serviços do Google, ambos no tier **Essentials**, com 10.000 chamadas
 * gratuitas por mês **cada**:
 *
 *   Geocoding  endereço digitado → endereço oficial + coordenada + `partial_match`
 *   Routes     distância rodoviária da sede até lá
 *
 * A Geocoding não é redundante. A Routes resolve o endereço sozinha — inclusive
 * nome de usina — mas devolve só `placeId` e `type`, **nunca o endereço
 * formatado**. Sem ela, dá para calcular e não dá para mostrar o que foi
 * encontrado. E é justamente aí que mora o defeito perigoso:
 *
 * > "Unidade de Cubatão" **não acha a unidade — acha a cidade**, e devolve
 * > 595 km como se fosse resposta. Ninguém olhando o campo desconfia.
 *
 * Trocar campo em branco por número errado é pior que deixar em branco: o branco
 * alguém preenche, o número ninguém confere. Por isso o resultado sempre vem com
 * **o endereço encontrado e um nível de confiança**, e a tela decide se pede
 * confirmação.
 *
 * Três modos, como Nectar e SharePoint, e `off` continua sendo o padrão.
 *
 * ---------------------------------------------------------------------------
 * A sede CHEGA aqui, não é lida aqui (T131)
 *
 * Este arquivo é o adaptador do Google e não sabe onde a sede mora. Ela vem em
 * `sede`, e quem a lê do banco é `configuracao.js`, que expõe
 * `distanciaDaSede(prisma, endereco)`. A separação é o que mantém este arquivo
 * testável sem banco — e o que evita o ciclo de importação, já que
 * `configuracao.js` precisa da geocodificação daqui para localizar a sede.
 */

const GEOCODING = 'https://maps.googleapis.com/maps/api/geocode/json';
const ROUTES = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const TEMPO_LIMITE_MS = 8000;

/**
 * Tipos que significam "achei a região, não o lugar".
 *
 * Chegar num deles é o caso da "Unidade de Cubatão": a resposta existe, a
 * distância é plausível, e o destino está errado.
 */
const SO_REGIAO = new Set([
  'locality',
  'political',
  'administrative_area_level_1',
  'administrative_area_level_2',
  'country',
  'postal_code'
]);

export class DistanciaError extends HttpError {
  constructor(message, statusCode = 502) {
    super(statusCode, message);
    this.name = 'DistanciaError';
  }
}

export function modoDasDistancias() {
  return env.mapsMode;
}

/**
 * Recusa antes de gastar chamada. Devolve o motivo, como os outros adaptadores.
 *
 * Só o que é de ambiente. A sede não entra: ela é configuração do módulo, e quem
 * a exige é quem calcula rota — a geocodificação de um endereço qualquer
 * funciona sem sede nenhuma, e é dela que a tela de configuração depende para
 * localizar a própria sede.
 */
export function indisponivel() {
  const modo = modoDasDistancias();
  if (modo === 'off') {
    return 'O cálculo automático de distância está desligado neste ambiente.';
  }
  if (modo === 'real' && !env.mapsApiKey) {
    return 'A chave do Google Maps não está configurada (GOOGLE_MAPS_API_KEY).';
  }
  return '';
}

/**
 * Cache por endereço normalizado, em memória.
 *
 * Vive no processo e morre no restart, de propósito: a distância calculada é
 * **gravada no levantamento**, então ela não é recalculada a cada abertura — o
 * cache serve para a mesma obra consultada várias vezes na mesma sessão de
 * trabalho. Uma tabela no banco resolveria mais, e não paga o custo de uma
 * migration para economizar dezenas de chamadas numa franquia de 10.000.
 */
const cache = new Map();
const CACHE_MAXIMO = 500;

/** Contador da cota diária. Reinicia sozinho na virada do dia. */
const cota = { dia: '', usadas: 0, sugestoes: 0 };

/**
 * A chave inclui a SEDE, n\u00e3o s\u00f3 a obra.
 *
 * Desde que o endere\u00e7o da sede virou configura\u00e7\u00e3o edit\u00e1vel (T131), a mesma obra
 * tem dist\u00e2ncias diferentes conforme a origem. Com a chave s\u00f3 do destino, mudar
 * a sede deixaria o cache respondendo a dist\u00e2ncia da sede antiga \u2014 em sil\u00eancio, e
 * s\u00f3 nos processos que j\u00e1 tinham a resposta guardada. Invalidar na hora de salvar
 * resolveria num processo s\u00f3; a chave composta resolve em todos, sem ningu\u00e9m
 * precisar lembrar de chamar nada.
 */
export function chaveDeCache(sede, endereco) {
  return `${normalizarTexto(sede)}>${normalizarTexto(endereco)}`;
}

function normalizarTexto(valor) {
  return String(valor || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * A cota de segurança existe porque a franquia é generosa e invisível.
 *
 * Um defeito que dispare chamadas em laço passa das 10.000 do mês sem ninguém
 * notar — e só aparece na fatura. O teto diário transforma isso num campo que
 * pede para ser digitado, que é o comportamento de hoje.
 */
function consumirCota() {
  virarODia();
  if (cota.usadas >= env.mapsMaxDia) {
    throw new DistanciaError(
      `Limite diário de consultas de distância atingido (${env.mapsMaxDia}). Informe a distância manualmente.`,
      429
    );
  }
  cota.usadas += 1;
}

/**
 * A sugestão tem cota PRÓPRIA, e maior.
 *
 * Um cálculo de distância é um clique; uma sugestão é uma **tecla digitada**.
 * Compartilhar o teto de 200 faria o autocompletar comer, em três endereços, a
 * franquia que a distância usa o dia inteiro — e o sintoma seria o cálculo
 * parando de funcionar por causa de outra coisa.
 */
function consumirCotaDeSugestao() {
  virarODia();
  if (cota.sugestoes >= env.mapsMaxDiaSugestoes) {
    throw new DistanciaError(
      `Limite diário de sugestões de endereço atingido (${env.mapsMaxDiaSugestoes}). Digite o endereço.`,
      429
    );
  }
  cota.sugestoes += 1;
}

function virarODia() {
  const hoje = new Date().toISOString().slice(0, 10);
  if (cota.dia !== hoje) {
    cota.dia = hoje;
    cota.usadas = 0;
    cota.sugestoes = 0;
  }
}

export function cotaUsada() {
  return {
    dia: cota.dia,
    usadas: cota.usadas,
    teto: env.mapsMaxDia,
    sugestoes: cota.sugestoes,
    tetoSugestoes: env.mapsMaxDiaSugestoes
  };
}

/**
 * Calcula a distância da sede até o endereço.
 *
 * Devolve sempre `{ km, enderecoEncontrado, confianca, aviso }`, e **nunca
 * lança**. Endereço não encontrado, serviço fora do ar, chave sem permissão e
 * cota estourada são todos a mesma coisa do ponto de vista de quem está na tela:
 * o campo continua editável, e ele digita. Um erro subindo daqui faria a tela
 * parecer quebrada quando o trabalho pode seguir.
 *
 * O motivo vem no `aviso` — inclusive o técnico, porque quem lê "chave não
 * autorizada" sabe a quem avisar, e "não consegui calcular" não diz nada.
 *
 * `sede` é `{ endereco, placeId }` e vem de `configuracao.js` (T131). Sem ela
 * não há de onde sair, e a resposta diz onde configurar — o gestor tem tela para
 * isso, e mandá-lo procurar variável de ambiente seria mandá-lo ao lugar errado.
 */
export async function distanciaAteObra(endereco, opcoes = {}) {
  try {
    return await calcular(endereco, opcoes);
  } catch (error) {
    return naoEncontrado(
      error instanceof DistanciaError
        ? error.message
        : `Não foi possível calcular a distância: ${error.message}`
    );
  }
}

async function calcular(endereco, { buscar = fetch, sede = {} } = {}) {
  const consulta = String(endereco || '').trim();
  if (!consulta) {
    return naoEncontrado('Informe o endereço da obra para calcular a distância.');
  }

  const impedimento = indisponivel();
  if (impedimento) return naoEncontrado(impedimento);

  if (!sede.endereco) {
    return naoEncontrado(
      'O endereço da sede ainda não foi configurado. Um gestor do módulo pode informá-lo em Configurações.'
    );
  }

  const chave = chaveDeCache(sede.placeId || sede.endereco, consulta);
  if (cache.has(chave)) return cache.get(chave);

  if (modoDasDistancias() === 'fake') {
    return guardar(chave, {
      km: 100,
      enderecoEncontrado: `${consulta} (modo de teste)`,
      confianca: 'exata',
      aviso: ''
    });
  }

  const local = await geocodificar(consulta, buscar);
  if (!local) {
    return naoEncontrado(`Não encontrei "${consulta}". Confira o endereço ou informe a distância.`);
  }

  const km = await distanciaRodoviaria(local, sede, buscar);
  if (km === null) {
    return naoEncontrado(
      `Encontrei "${local.endereco}", mas não há rota rodoviária a partir da sede.`
    );
  }

  return guardar(chave, {
    km,
    enderecoEncontrado: local.endereco,
    confianca: local.confianca,
    aviso: local.aviso
  });
}

function naoEncontrado(aviso) {
  return { km: null, enderecoEncontrado: '', confianca: 'nenhuma', aviso };
}

/**
 * Localiza um endereço, sem calcular rota nenhuma (T131).
 *
 * É a geocodificação sozinha, para a tela de configuração conferir a sede e para
 * `salvarSede` guardar o `placeId`. Não passa pelo cache: são poucas chamadas na
 * vida do sistema — a sede muda quando a empresa muda de prédio — e guardá-las
 * junto das distâncias misturaria duas coisas com validade muito diferente.
 *
 * **Nunca lança**, pelo mesmo motivo do cálculo: Maps desligado é o padrão do
 * ambiente, e nesse caso o gestor grava o endereço sem `placeId` e segue.
 */
export async function localizarEndereco(endereco, { buscar = fetch } = {}) {
  const consulta = String(endereco || '').trim();
  if (!consulta) return semLocal('Informe o endereço.');

  const impedimento = indisponivel();
  if (impedimento) return semLocal(impedimento);

  if (modoDasDistancias() === 'fake') {
    return {
      enderecoEncontrado: `${consulta} (modo de teste)`,
      placeId: 'place-de-teste',
      confianca: 'exata',
      aviso: ''
    };
  }

  try {
    const local = await geocodificar(consulta, buscar);
    if (!local) return semLocal(`Não encontrei "${consulta}". Confira o endereço.`);

    return {
      enderecoEncontrado: local.endereco,
      placeId: local.placeId,
      confianca: local.confianca,
      aviso: local.aviso
    };
  } catch (error) {
    return semLocal(
      error instanceof DistanciaError
        ? error.message
        : `Não foi possível localizar o endereço: ${error.message}`
    );
  }
}

function semLocal(aviso) {
  return { enderecoEncontrado: '', placeId: '', confianca: 'nenhuma', aviso };
}

// ---------------------------------------------------------------------------
// Sugestões enquanto se digita — Places Autocomplete (T134)
// ---------------------------------------------------------------------------

/**
 * As sugestões do Google enquanto o usuário digita.
 *
 * Pedido pelo mantenedor depois de configurar a sede à mão: sem a lista, quem
 * digita não sabe se escreveu o endereço de um jeito que o Google reconhece — e
 * a origem errada é a que ninguém confere.
 *
 * ---------------------------------------------------------------------------
 * O que isso custa, medido antes de escrever
 *
 * `Autocomplete Requests` é SKU **Essentials**: 10.000 chamadas grátis por mês,
 * como Geocoding e Routes, e contadas à parte delas.
 *
 * **Não uso token de sessão, e é decisão, não esquecimento.** A sessão só passa a
 * valer da 13ª tecla em diante — as 12 primeiras são cobradas igual — e ela só
 * fecha se a escolha terminar numa chamada de *Place Details*. Aqui a escolha
 * não termina em Place Details: a sugestão **já traz** `placeId` e o endereço
 * formatado, que é tudo o que a sede precisa. Abrir sessão sem fechá-la
 * reverteria para cobrança por requisição de qualquer jeito — o mesmo lugar onde
 * já estamos, com uma peça a mais para manter.
 *
 * O que de fato segura o consumo é do lado de cá: **mínimo de caracteres, espera
 * entre teclas (na tela) e cota diária própria**. Sem isso, um endereço digitado
 * são 40 chamadas em vez de 4.
 *
 * ---------------------------------------------------------------------------
 * Exige `Places API (New)` habilitada no console — não é a mesma da Geocoding
 * nem a da Routes. Sem ela a resposta vem 403, e o `aviso` diz isso.
 */
const AUTOCOMPLETE = 'https://places.googleapis.com/v1/places:autocomplete';

/** Abaixo disto a sugestão é ruído: devolve meia cidade e gasta chamada. */
const MINIMO_PARA_SUGERIR = 4;
const MAXIMO_DE_SUGESTOES = 6;

/**
 * **Nunca lança**, como o resto do adaptador. Sem sugestão a pessoa digita o
 * endereço inteiro, que é o que ela fazia antes de isto existir.
 */
export async function sugerirEnderecos(termo, { buscar = fetch } = {}) {
  const consulta = String(termo || '').trim();
  if (consulta.length < MINIMO_PARA_SUGERIR) return { items: [], aviso: '' };

  const impedimento = indisponivel();
  if (impedimento) return { items: [], aviso: impedimento };

  if (modoDasDistancias() === 'fake') {
    return {
      items: [
        {
          placeId: 'place-de-teste',
          texto: `${consulta} — Itajaí, SC, Brasil (modo de teste)`,
          principal: consulta,
          secundario: 'Itajaí, SC, Brasil (modo de teste)'
        }
      ],
      aviso: ''
    };
  }

  try {
    consumirCotaDeSugestao();

    const resposta = await chamar(buscar, AUTOCOMPLETE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': env.mapsApiKey,
        // Sem a máscara, a resposta traz campos que não são lidos aqui — e cada
        // campo a mais pode subir o SKU da chamada.
        'X-Goog-FieldMask':
          'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat'
      },
      body: JSON.stringify({
        input: consulta,
        languageCode: 'pt-BR',
        regionCode: 'BR',
        // Só endereços do Brasil. Sem isto, "Rua São João" traz Portugal junto.
        includedRegionCodes: ['br']
      })
    });

    const corpo = await resposta.json();
    if (corpo.error) {
      throw new DistanciaError(`O Google recusou a busca de endereço: ${corpo.error.message}.`);
    }

    const items = (corpo.suggestions || [])
      .map(sugestao => sugestao.placePrediction)
      .filter(predicao => predicao?.placeId)
      .slice(0, MAXIMO_DE_SUGESTOES)
      .map(predicao => ({
        placeId: predicao.placeId,
        texto: predicao.text?.text || '',
        principal: predicao.structuredFormat?.mainText?.text || predicao.text?.text || '',
        secundario: predicao.structuredFormat?.secondaryText?.text || ''
      }));

    return { items, aviso: '' };
  } catch (error) {
    return {
      items: [],
      aviso:
        error instanceof DistanciaError
          ? error.message
          : `Não foi possível buscar endereços: ${error.message}`
    };
  }
}

function guardar(chave, resultado) {
  // Cache sem teto vira vazamento de memória num processo de vida longa.
  if (cache.size >= CACHE_MAXIMO) cache.delete(cache.keys().next().value);
  cache.set(chave, resultado);
  return resultado;
}

/**
 * Endereço digitado → endereço oficial, com o **nível de confiança**.
 *
 * Os dois sinais vêm de graça na resposta e dizem coisas diferentes:
 *
 * - `partial_match` — o Google não casou tudo o que foi digitado;
 * - `types` só de região — casou, mas o que existe é a cidade.
 *
 * "Unidade de Cubatão" dispara os dois. "Cubatão" sozinho dispara só o segundo,
 * e é resposta correta para quem quis a cidade — por isso os avisos são
 * diferentes.
 */
async function geocodificar(endereco, buscar) {
  const url = new URL(GEOCODING);
  url.searchParams.set('address', endereco);
  url.searchParams.set('region', 'br');
  url.searchParams.set('language', 'pt-BR');
  url.searchParams.set('key', env.mapsApiKey);

  consumirCota();
  const resposta = await chamar(buscar, url.toString());
  const corpo = await resposta.json();

  if (corpo.status === 'ZERO_RESULTS') return null;
  if (corpo.status !== 'OK') {
    throw new DistanciaError(
      `O Google não respondeu à consulta de endereço: ${corpo.status}${corpo.error_message ? ` — ${corpo.error_message}` : ''}.`
    );
  }

  const primeiro = corpo.results[0];
  const tipos = primeiro.types || [];
  const soRegiao = tipos.length > 0 && tipos.every(tipo => SO_REGIAO.has(tipo));

  let confianca = 'exata';
  let aviso = '';

  if (primeiro.partial_match) {
    confianca = 'parcial';
    aviso = `Não achei exatamente o que foi digitado. Usei "${primeiro.formatted_address}" — confira antes de seguir.`;
  } else if (soRegiao) {
    confianca = 'regiao';
    aviso = `Achei apenas a cidade (${primeiro.formatted_address}), não o endereço da obra. A distância é até o centro dela.`;
  }

  return {
    endereco: primeiro.formatted_address,
    placeId: primeiro.place_id,
    confianca,
    aviso
  };
}

/**
 * A distância rodoviária, pelo `placeId` que a geocodificação já resolveu.
 *
 * Mandar o `placeId` em vez do texto evita que a Routes resolva o endereço de
 * novo — por conta própria, e possivelmente para outro lugar que o que a tela
 * acabou de mostrar ao usuário.
 *
 * Vale para as **duas pontas**. A origem usa o `placeId` que a tela de
 * configuração resolveu ao salvar a sede; sem ele — Maps desligado na hora de
 * configurar, ou endereço que ninguém achou — cai no texto, que é o
 * comportamento antigo e continua servindo.
 */
async function distanciaRodoviaria(local, sede, buscar) {
  consumirCota();

  const resposta = await chamar(buscar, ROUTES, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': env.mapsApiKey,
      'X-Goog-FieldMask': 'routes.distanceMeters'
    },
    body: JSON.stringify({
      origin: sede.placeId ? { placeId: sede.placeId } : { address: sede.endereco },
      destination: { placeId: local.placeId },
      travelMode: 'DRIVE',
      languageCode: 'pt-BR',
      regionCode: 'BR'
    })
  });

  const corpo = await resposta.json();
  if (corpo.error) {
    throw new DistanciaError(`O Google recusou o cálculo de rota: ${corpo.error.message}.`);
  }

  const metros = corpo.routes?.[0]?.distanceMeters;
  if (!metros) return null;

  // Arredondado ao quilômetro: o campo é em km inteiros, e casa decimal em
  // 2.706 km é precisão que a rota não tem.
  return Math.round(metros / 1000);
}

async function chamar(buscar, url, opcoes = {}) {
  const resposta = await buscar(url, {
    ...opcoes,
    signal: AbortSignal.timeout(TEMPO_LIMITE_MS)
  }).catch(erro => {
    throw new DistanciaError(`Não foi possível falar com o Google Maps: ${erro.message}`);
  });

  if (!resposta.ok) {
    throw new DistanciaError(`O Google Maps respondeu com erro ${resposta.status}.`);
  }
  return resposta;
}

/** Só para o teste: a memória entre casos não pode vazar de um para o outro. */
export function limparCache() {
  cache.clear();
  cota.dia = '';
  cota.usadas = 0;
  cota.sugestoes = 0;
}
