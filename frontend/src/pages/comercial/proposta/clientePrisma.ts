import type { LiberacaoPrisma, PropostaSalva } from '../../../api/comercial';
import { snapshotDaPropostaSalva } from './salvamento';

type Formulario = Record<string, unknown>;

/** Completa o cadastro que falta, inclusive em rascunhos vinculados anteriormente. */
export function preencherClientePrisma(form: Formulario, snapshot: LiberacaoPrisma['snapshot']): Formulario {
  const cnpj = String(form.cnpj || '').trim();
  if (cnpj && cnpj.replace(/\D/g, '') !== snapshot.taxId) return form;
  const campos = {
    client: snapshot.legalName, cnpj: snapshot.taxId, contact: snapshot.contactName,
    email: snapshot.email, department: snapshot.department, site: snapshot.site,
    title: snapshot.description
  };
  const faltantes = Object.fromEntries(Object.entries(campos).filter(([campo, valor]) =>
    !String(form[campo] || '').trim() && Boolean(valor?.trim())));
  return Object.keys(faltantes).length ? { ...form, ...faltantes } : form;
}

/** Aplica a resposta do vínculo sem reidratar os preços, serviços ou condições. */
export function aplicarClienteDaProposta(form: Formulario, proposta: PropostaSalva): Formulario {
  const dados = snapshotDaPropostaSalva(proposta);
  const cliente = Object.fromEntries(['client', 'cnpj', 'contact', 'email', 'department', 'site', 'title']
    .filter(campo => String(dados[campo] || '').trim())
    .map(campo => [campo, dados[campo]]));
  return { ...form, ...cliente };
}
