import type { LiberacaoPrisma, PropostaSalva } from '../../../api/comercial';
import { snapshotDaPropostaSalva } from './salvamento';
import { formatarCnpj } from './etapas';

type Formulario = Record<string, unknown>;

/** Completa o cadastro que falta, inclusive em rascunhos vinculados anteriormente. */
export function preencherClientePrisma(form: Formulario, snapshot: LiberacaoPrisma['snapshot']): Formulario {
  const cnpj = String(form.cnpj || '').trim();
  if (cnpj && cnpj.replace(/\D/g, '') !== snapshot.taxId) return form;
  const campos = {
    client: snapshot.legalName, cnpj: formatarCnpj(snapshot.taxId), contact: snapshot.contactName,
    email: snapshot.email, department: snapshot.department, site: snapshot.site,
    title: snapshot.description
  };
  const faltantes = Object.fromEntries(Object.entries(campos).filter(([campo, valor]) =>
    !String(form[campo] || '').trim() && Boolean(valor?.trim())));
  if (cnpj && form.cnpj !== formatarCnpj(cnpj)) faltantes.cnpj = formatarCnpj(cnpj);
  return Object.keys(faltantes).length ? { ...form, ...faltantes } : form;
}

/** Completa o cliente retornado pela API sem apagar edições feitas durante a consulta. */
export function aplicarClienteDaProposta(
  form: Formulario, proposta: PropostaSalva, liberacao?: LiberacaoPrisma['snapshot']
): Formulario {
  const dados = snapshotDaPropostaSalva(proposta);
  const preenchido = preencherClientePrisma(form, {
    legalName: String(dados.client || ''), taxId: String(dados.cnpj || '').replace(/\D/g, ''),
    contactName: String(dados.contact || ''), email: String(dados.email || ''),
    department: String(dados.department || ''), site: String(dados.site || ''),
    description: String(dados.title || '')
  });
  // A liberação selecionada já contém contato e e-mail, inclusive quando uma
  // resposta antiga ou idempotente devolve apenas nome e CNPJ.
  return liberacao ? preencherClientePrisma(preenchido, liberacao) : preenchido;
}
