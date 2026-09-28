import type { FinalizationStage } from '../../../../../shared/comercial/dist/finalization.js';
import type { DocumentoEmitido } from '../../../api/comercial';
import { cnpjValido, emailValido } from './etapas';

/** A escolha muda apenas o download; os dois documentos sempre são emitidos. */
export type EscolhaDeDownload = 'both' | 'commercial' | 'technical';
export type EscolhaDeCard = '' | 'existing' | 'create';

export type DadosParaValidarFinalizacao = {
  email: string;
  cnpj: string;
  department: string;
  seller: string;
  estimator: string;
  pipelineId: string;
  companyId: string;
  contactId: string;
  cardChoice: EscolhaDeCard;
  existingOpportunityId: string;
  /** Sem CRM disponível, os PDFs e o SharePoint continuam sendo processados. */
  exigirIntegracao?: boolean;
};

export type PendenciaDaFinalizacao = {
  mensagem: string;
  etapa: 'cliente' | 'revisao';
  campo:
    | 'email'
    | 'cnpj'
    | 'department'
    | 'seller'
    | 'empresaCrm'
    | 'pipeline'
    | 'card';
};

/**
 * Os quatro recados do fluxo congelado, ligados às etapas técnicas do utilitário
 * compartilhado. A ligação fica explícita para que a tela e o tratamento de erro
 * não inventem duas ordens diferentes para a mesma finalização.
 */
export const ETAPAS_VISIVEIS_DA_FINALIZACAO: ReadonlyArray<{
  etapaTecnica: FinalizationStage;
  mensagem: string;
}> = [
  {
    etapaTecnica: 'geração dos PDFs',
    mensagem: 'Preparando a proposta comercial...'
  },
  {
    etapaTecnica: 'preparação dos arquivos',
    mensagem: 'Proposta comercial pronta. Preparando a proposta técnica...'
  },
  {
    etapaTecnica: 'envio às integrações',
    mensagem: 'As duas propostas foram geradas. Salvando no histórico...'
  },
  {
    etapaTecnica: 'leitura da resposta',
    mensagem:
      'As duas propostas foram salvas. Escolha abaixo quais deseja baixar.'
  }
];

/** A primeira pendência, na ordem exata aplicada antes de começar a gerar. */
export function primeiraPendenciaDaFinalizacao(
  dados: DadosParaValidarFinalizacao
): PendenciaDaFinalizacao | null {
  if (!emailValido(dados.email)) {
    return {
      mensagem:
        'Informe um e-mail válido, como nome@empresa.com ou nome@empresa.com.br.',
      etapa: 'cliente',
      campo: 'email'
    };
  }
  if (!cnpjValido(dados.cnpj)) {
    return {
      mensagem: 'Informe um CNPJ válido com 14 dígitos.',
      etapa: 'cliente',
      campo: 'cnpj'
    };
  }
  if (dados.department.trim() === '0') {
    return {
      mensagem: 'Informe o departamento correto ou deixe o campo em branco.',
      etapa: 'cliente',
      campo: 'department'
    };
  }
  if (!dados.seller.trim() || !dados.estimator.trim()) {
    return {
      mensagem: 'Selecione o consultor de vendas e o orçamentista.',
      etapa: 'cliente',
      campo: 'seller'
    };
  }
  if (dados.exigirIntegracao === false) return null;
  if (!dados.pipelineId.trim()) {
    return {
      mensagem: 'Selecione o funil do Nectar.',
      etapa: 'revisao',
      campo: 'pipeline'
    };
  }
  if (!dados.companyId.trim() || !dados.contactId.trim()) {
    return {
      mensagem:
        'Selecione a empresa e o contato diretamente pelo Nectar antes de finalizar.',
      etapa: 'cliente',
      campo: 'empresaCrm'
    };
  }
  if (!dados.cardChoice) {
    return {
      mensagem:
        'Escolha se deseja usar um card existente ou criar um card novo no Nectar.',
      etapa: 'revisao',
      campo: 'card'
    };
  }
  if (dados.cardChoice === 'existing' && !dados.existingOpportunityId.trim()) {
    return {
      mensagem:
        'Localize e selecione o card existente do Nectar antes de finalizar.',
      etapa: 'revisao',
      campo: 'card'
    };
  }
  return null;
}

/** Compatibilidade do contrato puro já usado pelos testes e demais consumidores. */
export function validarFinalizacao(dados: DadosParaValidarFinalizacao): string {
  return primeiraPendenciaDaFinalizacao(dados)?.mensagem || '';
}

/** Filtra uma cópia — a lista guardada continua contendo sempre o par emitido. */
export function documentosEscolhidos(
  documentos: DocumentoEmitido[],
  escolha: EscolhaDeDownload
): DocumentoEmitido[] {
  if (escolha === 'both') return [...documentos];
  const kind = escolha === 'commercial' ? 'COMERCIAL' : 'TECNICA';
  return documentos.filter((documento) => documento.kind === kind);
}
