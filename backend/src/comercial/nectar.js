import { HttpError } from '../auth/service.js';
import { produtoDaProposta } from '../lib/comercial/nectar-produtos.js';

const BASE = 'https://app.nectarcrm.com.br/crm/api/1';
const TIMEOUT_MS = 20_000;

export function nectarConfig(env = process.env) {
  const mode = String(env.NECTAR_MODE || 'off').trim().toLowerCase();
  if (!['off', 'fake', 'real'].includes(mode)) {
    throw new HttpError(500, 'NECTAR_MODE deve ser off, fake ou real.');
  }
  return {
    mode,
    token: String(env.NECTAR_API_TOKEN || '').trim(),
    responsibleId: String(env.NECTAR_RESPONSAVEL_ID || '').trim(),
    allowedPipelines: [...new Set(String(env.NECTAR_PIPELINE_IDS || '')
      .split(',').map(value => value.trim()).filter(Boolean))]
  };
}

export function nectarUnavailable(config) {
  if (config.mode === 'off') return 'O envio ao Nectar está desligado (NECTAR_MODE=off).';
  if (!config.allowedPipelines.length) return 'Configure NECTAR_PIPELINE_IDS com os funis autorizados.';
  if (config.mode === 'real' && !config.token) return 'Configure NECTAR_API_TOKEN.';
  if (config.mode === 'real' && !/^\d+$/.test(config.responsibleId)) {
    return 'Configure NECTAR_RESPONSAVEL_ID com o ID numérico do responsável.';
  }
  return '';
}

function detail(body) {
  if (!body || typeof body !== 'object') return '';
  for (const key of ['mensagens', 'errors']) {
    if (Array.isArray(body[key])) return body[key].map(item =>
      typeof item === 'string' ? item : item?.message || item?.mensagem || '').filter(Boolean).join('; ');
  }
  return String(body.message || body.mensagem || body.erro || body.error || '');
}

function unwrap(body) {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== 'object') return body;
  return body.data ?? body.items ?? body.result ?? body.item ?? body.oportunidade ?? body;
}

function list(body) {
  const value = unwrap(body);
  return Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : [];
}

function records(body, depth = 0) {
  if (depth > 6 || body == null) return [];
  if (Array.isArray(body)) return body.flatMap(item => records(item, depth + 1));
  if (typeof body !== 'object') return [];
  const own = body.id != null && (body.nome != null || body.name != null || body.titulo != null)
    ? [body] : [];
  return own.concat(Object.values(body).flatMap(value => records(value, depth + 1)));
}

function firstStep(record) {
  const steps = Array.isArray(record.sequencias) ? record.sequencias : [];
  const numbers = steps.map(item => Number(item.sequencia ?? item.etapa ?? item.ordem))
    .filter(number => Number.isInteger(number) && number > 0);
  return numbers.length ? Math.min(...numbers) : 1;
}

function person(record) {
  const emails = Array.isArray(record.emails) ? record.emails : [];
  const email = emails.find(item => typeof item === 'string') ?? emails[0];
  return {
    id: String(record.id ?? ''), name: String(record.nome ?? 'Sem nome'),
    email: String(typeof email === 'string' ? email : email?.email ?? record.email ?? ''),
    department: String(record.cargo ?? record.departamento ?? '')
  };
}

function company(record) {
  const addresses = Array.isArray(record.enderecos) ? record.enderecos : [];
  const address = addresses.find(item => item?.principal) ?? addresses[0] ?? {};
  const street = [address.logradouro, address.numero, address.bairro].filter(Boolean).join(', ');
  const city = [address.municipio, address.estado].filter(Boolean).join('/');
  return {
    id: String(record.id ?? ''), nome: String(record.nome ?? record.razaoSocial ?? 'Sem nome'),
    cnpj: String(record.cnpj ?? ''), site: [street, city].filter(Boolean).join(' — '),
    contatos: (Array.isArray(record.contatos) ? record.contatos : []).map(item => {
      const value = person(item);
      return { id: value.id, nome: value.name, email: value.email,
        departamento: value.department };
    })
  };
}

function normalized(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ').toLowerCase().trim();
}

function transportName(value) {
  return String(value || 'proposta.pdf').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ._-]/g, '_').trim() || 'proposta.pdf';
}

export function createNectarClient({ config = nectarConfig(), request = fetch } = {}) {
  async function call(path, options = {}) {
    let response;
    try {
      response = await request(`${BASE}${path}`, {
        ...options,
        headers: { 'Access-Token': config.token, ...(options.headers || {}) },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
    } catch (error) {
      throw new HttpError(502, `Não foi possível falar com o Nectar: ${error.message}`);
    }
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const reason = detail(body);
      const message = response.status === 429
        ? 'O Nectar limitou as consultas. Tente novamente em instantes.'
        : `O Nectar respondeu com erro ${response.status}${reason ? `: ${reason}` : '.'}`;
      const error = new HttpError(response.status === 429 ? 429 : 502, message);
      error.upstreamStatus = response.status;
      throw error;
    }
    return body;
  }

  function requireAvailable() {
    const reason = nectarUnavailable(config);
    if (reason) throw new HttpError(503, reason);
  }

  async function funnels() {
    const reason = nectarUnavailable(config);
    if (reason) return { items: [], motivoIndisponivel: reason, mode: config.mode };
    if (config.mode === 'fake') return {
      items: config.allowedPipelines.map(id => ({ id, nome: `Funil de teste ${id}`, primeiraEtapa: 1 })),
      motivoIndisponivel: '', mode: config.mode
    };
    let foundRecords = [];
    for (const path of ['/pipelines?type=0&page=-1', '/pipeline?type=0&page=-1']) {
      try { foundRecords = records(await call(path)); }
      catch (error) { if (error.upstreamStatus !== 404) throw error; }
      if (foundRecords.length) break;
    }
    const allowed = new Set(config.allowedPipelines);
    const items = foundRecords.filter(item => allowed.has(String(item.id))).map(item => ({
      id: String(item.id), nome: String(item.nome || item.name || ''),
      primeiraEtapa: firstStep(item)
    }));
    if (!items.length) throw new HttpError(502, 'Nenhum funil autorizado foi encontrado no Nectar.');
    return { items, motivoIndisponivel: '', mode: config.mode };
  }

  async function searchCompanies(term) {
    requireAvailable();
    const query = String(term || '').trim();
    if (query.length < 2) throw new HttpError(400, 'Digite ao menos 2 caracteres para buscar.');
    if (config.mode === 'fake') {
      const fake = { id: '101', nome: 'Empresa de teste Nectar', cnpj: '', site: '',
        contatos: [{ id: '201', nome: 'Contato de teste', email: 'teste@example.com', departamento: '' }] };
      return { items: normalized(fake.nome).startsWith(normalized(query)) ? [fake] : [],
        porTrechoDisponivel: false, indiceEmPreparo: false };
    }
    const records = list(await call(`/contatos?nome=${encodeURIComponent(query)}&displayLength=25`));
    return { items: records.filter(item => item?.isEmpresa === true).map(company),
      porTrechoDisponivel: false, indiceEmPreparo: false };
  }

  async function companyDetails(id) {
    requireAvailable();
    if (!/^\d+$/.test(String(id))) throw new HttpError(400, 'ID da empresa inválido.');
    if (config.mode === 'fake') {
      const result = await searchCompanies('Empresa');
      if (id !== '101') throw new HttpError(404, 'Empresa não encontrada.');
      return result.items[0];
    }
    const body = unwrap(await call(`/contatos/${encodeURIComponent(id)}`));
    const record = Array.isArray(body) ? body[0] : body;
    if (!record?.id) throw new HttpError(404, 'Empresa não encontrada no Nectar.');
    return company(record);
  }

  async function opportunityDetails(id) {
    requireAvailable();
    if (!/^\d+$/.test(String(id))) throw new HttpError(400, 'ID da oportunidade inválido.');
    if (config.mode === 'fake') return { id: String(id), status: 1,
      dataAtualizacao: new Date().toISOString(), camposPersonalizados: {} };
    const body = unwrap(await call(`/oportunidades/${encodeURIComponent(id)}`));
    const record = Array.isArray(body) ? body[0] : body;
    if (String(record?.id ?? '') !== String(id)) throw new HttpError(404, 'Oportunidade não encontrada no Nectar.');
    return record;
  }

  async function existingOpportunity(name, funnel, companyId) {
    const found = records(await call(`/oportunidades?nome=${encodeURIComponent(name)}&page=-1`));
    const match = found.find(item => {
      const pipeline = item.pipeline ?? item.funilVenda ?? item.funil ?? {};
      const pipelineId = String(pipeline?.id ?? item.pipelineId ?? item.funilVendaId ?? '');
      const pipelineName = typeof pipeline === 'string' ? pipeline : pipeline?.nome ?? pipeline?.name;
      const clientId = String(item.cliente?.id ?? item.contato?.id ?? '');
      return String(item.nome ?? item.titulo ?? '') === name &&
        (pipelineId === funnel.id || !pipelineId && normalized(pipelineName) === normalized(funnel.nome)) &&
        (!clientId || clientId === String(companyId));
    });
    return match ? String(match.id) : '';
  }

  async function createOpportunity(data, funnel) {
    const product = produtoDaProposta(data.technicalServices, data.totalValue);
    if (config.mode === 'fake') return { id: `fake-op-${data.proposalCode}`, created: true };
    const name = [data.proposalCode, data.clientName, data.title].filter(Boolean).join(' - ').slice(0, 200);
    const existing = await existingOpportunity(name, funnel, data.companyId);
    if (existing) return { id: existing, created: false };
    let body;
    try {
      body = await call('/oportunidades/', { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: name,
          observacao: `Proposta ${data.proposalCode}: ${data.title}. Local da obra: ${data.site}. Contato: ${data.contactName} (${data.contactEmail}).`,
          cliente: { id: Number(data.companyId) }, contato: { id: Number(data.contactId) },
          camposPersonalizados: { 'Local da Obra': data.site },
          produtos: [product], responsavel: { id: Number(config.responsibleId) },
          pipeline: funnel.nome, etapa: funnel.primeiraEtapa, status: 1,
          valorAvulso: data.totalValue, probabilidade: 10,
          bloquearProposta: false, bloquearConclusao: false
        })
      });
    } catch (error) {
      if (error.upstreamStatus === 409) {
        const found = await existingOpportunity(name, funnel, data.companyId);
        if (found) return { id: found, created: false };
      }
      throw error;
    }
    const value = unwrap(body);
    const id = String(value?.id ?? '');
    if (!id) throw new HttpError(502, 'O Nectar criou a oportunidade sem devolver o identificador.');
    return { id, created: true };
  }

  async function attach(opportunityId, files, data, funnel) {
    if (config.mode === 'fake') return { attached: files.length };
    const form = new FormData();
    form.append('publicacao', JSON.stringify({
      oportunidade: { id: opportunityId }, contato: { id: Number(data.contactId) },
      assunto: `Proposta ${data.proposalCode}`,
      descricao: `Propostas técnica e comercial anexadas. Funil: <b>${funnel.nome.replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</b>. Valor total: <b>${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(data.totalValue)}</b>.`,
      importante: true
    }));
    for (const file of files) {
      form.append('anexos', new Blob([file.bytes]), transportName(file.fileName));
    }
    await call('/publicacao/incluirComAnexos', { method: 'POST', body: form });
    return { attached: files.length };
  }

  return { config, funnels, searchCompanies, companyDetails, opportunityDetails,
    createOpportunity, attach };
}
