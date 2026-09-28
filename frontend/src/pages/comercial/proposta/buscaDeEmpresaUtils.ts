import type { ContatoCrm, EmpresaCrm } from '../../../api/comercial';

/**
 * As decisões da busca de empresa — **sem React**, como a cadeia do rodapé e a
 * decisão da distância.
 *
 * Elas saíram do componente por dois motivos que se somam: são a única parte da
 * busca que **erra em silêncio** (o aviso errado faz o vendedor cadastrar uma
 * empresa que já existe), e são testáveis sem montar nada. O componente ficou
 * com o que falha à vista — o campo, a lista e o estado de carregando.
 */

/** Abaixo disto o servidor recusa com 400, e recusar aqui poupa a viagem. */
export const MINIMO_PARA_BUSCAR = 2;

/**
 * O aviso sobre o alcance da busca — função pura, separada do componente.
 *
 * É a única parte daqui que **erra em silêncio**: com o aviso errado (ou sem
 * ele), quem procura "brasileiro" e não acha a Petrobras conclui que a empresa
 * não está no CRM e cadastra uma segunda. O resto do componente falha à vista.
 */
export function avisoDoAlcance(resposta: {
  porTrechoDisponivel: boolean;
  indiceEmPreparo: boolean;
}): string {
  if (resposta.porTrechoDisponivel) return '';
  if (resposta.indiceEmPreparo) {
    return 'A busca por trecho está sendo preparada. Por enquanto, procure pelo início do nome — tente de novo em instantes.';
  }
  return 'A busca encontra pelo início do nome. "Petrobras" acha; "brasileiro" não acha a mesma empresa.';
}

/**
 * O que a escolha da empresa grava no formulário.
 *
 * Trocar de empresa **apaga o contato**: manter o da anterior mandaria ao CRM um
 * vínculo que não existe, e ao documento o nome de quem não trabalha lá.
 */
export function dadosDaEmpresa(empresa: EmpresaCrm): Record<string, unknown> {
  return {
    companyId: empresa.id,
    client: empresa.nome,
    cnpj: empresa.cnpj,
    // `site` é o local onde o serviço será executado, não o endereço cadastral
    // da empresa/contato no Nectar. Ele vem do destino informado no levantamento
    // de custos e não pode ser sobrescrito ao trocar a empresa do CRM.
    contactId: '',
    contact: '',
    email: '',
    department: ''
  };
}

/** O que a escolha do contato grava. */
export function dadosDoContato(contato: ContatoCrm): Record<string, unknown> {
  return {
    contactId: contato.id,
    contact: contato.nome,
    email: contato.email,
    department: contato.departamento
  };
}
