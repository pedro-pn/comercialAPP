import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

import {
  describeFinalizationError,
  type FinalizationStage
} from '../../../../../shared/comercial/dist/finalization.js';
import {
  baixarDocumento,
  enviarAnexoDaProposta,
  finalizarProposta,
  listarAnexosDaProposta,
  listarFunisNectar,
  mensagemDeErro,
  removerAnexoDaProposta,
  type AnexoDaProposta,
  type DocumentoEmitido,
  type FunilNectar,
  type VinculoCrmDaProposta
} from '../../../api/comercial';
import {
  ETAPAS_VISIVEIS_DA_FINALIZACAO,
  primeiraPendenciaDaFinalizacao,
  type PendenciaDaFinalizacao,
  type EscolhaDeCard,
  type EscolhaDeDownload
} from './finalizacao';

type AnyRecord = Record<string, unknown>;

/**
 * Estado e efeitos da finalização real, separados do container das sete etapas.
 *
 * O fluxo tem duas garantias que não cabem num componente de apresentação:
 * anexos enviados antes de uma falha saem da fila (não duplicam na retomada), e
 * o `502` parcial abre o download dos PDFs em vez de apagar o resultado útil.
 */
export function usePropostaFinalizacao({
  propostaId,
  statusProposta,
  form,
  orcamentista,
  salvar,
  setRecado,
  vinculoCrm,
  setVinculoCrm,
  onPendencia,
  onStatus
}: {
  propostaId: string;
  statusProposta: string;
  form: AnyRecord;
  orcamentista: string;
  salvar: () => Promise<string | null>;
  setRecado: Dispatch<SetStateAction<string>>;
  vinculoCrm: VinculoCrmDaProposta | null;
  setVinculoCrm: Dispatch<SetStateAction<VinculoCrmDaProposta | null>>;
  onPendencia: (pendencia: PendenciaDaFinalizacao) => void;
  onStatus: (status: string) => void;
}) {
  const [escolhaDownload, setEscolhaDownload] =
    useState<EscolhaDeDownload>('both');
  const [escolhaCard, setEscolhaCard] = useState<EscolhaDeCard>('');
  const [funis, setFunis] = useState<FunilNectar[]>([]);
  const [funisCarregando, setFunisCarregando] = useState(true);
  const [funisMensagem, setFunisMensagem] = useState('');
  const [funilId, setFunilId] = useState('');
  const [pastaOneDrive, setPastaOneDrive] = useState('');
  const [anexos, setAnexos] = useState<File[]>([]);
  const [anexosEnviados, setAnexosEnviados] = useState<AnexoDaProposta[]>([]);
  const [removendoAnexoId, setRemovendoAnexoId] = useState('');
  const [finalizando, setFinalizando] = useState(false);
  const [etapaFinalizacao, setEtapaFinalizacao] = useState(-1);
  const [erroFinalizacao, setErroFinalizacao] = useState('');
  const [finalizada, setFinalizada] = useState(false);
  const [baixandoId, setBaixandoId] = useState('');
  const [emitidos, setEmitidos] = useState<DocumentoEmitido[]>([]);

  /** Os ids já chegam filtrados pela lista branca do backend. */
  useEffect(() => {
    let vivo = true;
    setFunisCarregando(true);
    listarFunisNectar()
      .then((resposta) => {
        if (!vivo) return;
        setFunis(resposta.items);
        setFunisMensagem(resposta.motivoIndisponivel);
      })
      .catch((error) => {
        if (!vivo) return;
        setFunis([]);
        setFunisMensagem(
          mensagemDeErro(
            error,
            'Não foi possível consultar os funis do Nectar.'
          )
        );
      })
      .finally(() => {
        if (vivo) setFunisCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  /** Revisão vinculada não pede outra escolha nem permite trocar de funil. */
  useEffect(() => {
    if (vinculoCrm) {
      setFunilId(vinculoCrm.pipelineId);
      setEscolhaCard('existing');
      return;
    }
    setFunilId('');
    setEscolhaCard((atual) => (atual === 'existing' ? '' : atual));
  }, [vinculoCrm]);

  /** Anexo já enviado sobrevive a F5 e não pode ser reenviado em duplicidade. */
  useEffect(() => {
    if (!propostaId) {
      setAnexosEnviados([]);
      return;
    }

    let vivo = true;
    listarAnexosDaProposta(propostaId)
      .then((resposta) => {
        if (vivo) setAnexosEnviados(resposta.items);
      })
      .catch((error) => {
        if (vivo)
          setRecado(
            mensagemDeErro(error, 'Não foi possível carregar os anexos.')
          );
      });
    return () => {
      vivo = false;
    };
  }, [propostaId, setRecado]);

  function escolherFunil(id: string) {
    setFunilId(id);
    setErroFinalizacao('');
  }

  function escolherCard(valor: EscolhaDeCard) {
    setEscolhaCard(valor);
    setErroFinalizacao('');
  }

  /**
   * Valida, salva, envia anexos e chama a rota que grava os PDFs antes das
   * integrações. Cada falha conserva o que já chegou ao servidor.
   */
  async function concluirFinalizacao() {
    if (finalizando || finalizada) return;

    const pipelineId = funilId || vinculoCrm?.pipelineId || '';
    const cardChoice: EscolhaDeCard = vinculoCrm ? 'existing' : escolhaCard;
    const integracaoDisponivel = Boolean(
      funisCarregando || funis.length || vinculoCrm?.pipelineId
    );
    const pendencia = primeiraPendenciaDaFinalizacao({
      email: String(form.email || ''),
      cnpj: String(form.cnpj || ''),
      department: String(form.department || ''),
      seller: String(form.seller || ''),
      estimator: orcamentista,
      pipelineId,
      companyId: String(form.companyId || ''),
      contactId: String(form.contactId || ''),
      cardChoice,
      existingOpportunityId: vinculoCrm?.opportunityId || '',
      exigirIntegracao: integracaoDisponivel
    });
    setErroFinalizacao(pendencia?.mensagem || '');
    if (pendencia) {
      setRecado(pendencia.mensagem);
      onPendencia(pendencia);
      return;
    }

    setFinalizando(true);
    setErroFinalizacao('');
    setEtapaFinalizacao(0);
    setRecado(ETAPAS_VISIVEIS_DA_FINALIZACAO[0].mensagem);
    let etapaTecnica: FinalizationStage =
      ETAPAS_VISIVEIS_DA_FINALIZACAO[0].etapaTecnica;

    try {
      // Depois de uma falha os documentos já existem e o registro é imutável.
      // Repetir começa direto nas integrações; tentar salvar antes receberia 409.
      const id =
        statusProposta === 'FALHA_INTEGRACAO' && propostaId
          ? propostaId
          : await salvar();
      if (!id) return;

      setEtapaFinalizacao(1);
      etapaTecnica = ETAPAS_VISIVEIS_DA_FINALIZACAO[1].etapaTecnica;
      setRecado(ETAPAS_VISIVEIS_DA_FINALIZACAO[1].mensagem);
      for (const arquivo of [...anexos]) {
        const enviado = await enviarAnexoDaProposta(id, arquivo);
        setAnexosEnviados((atuais) => [...atuais, enviado]);
        setAnexos((atuais) => atuais.filter((item) => item !== arquivo));
      }

      setEtapaFinalizacao(2);
      etapaTecnica = ETAPAS_VISIVEIS_DA_FINALIZACAO[2].etapaTecnica;
      setRecado(ETAPAS_VISIVEIS_DA_FINALIZACAO[2].mensagem);
      const resultado = await finalizarProposta(
        id,
        pipelineId,
        pastaOneDrive.trim()
      );

      setEmitidos(resultado.documentos);
      setEtapaFinalizacao(3);
      etapaTecnica = ETAPAS_VISIVEIS_DA_FINALIZACAO[3].etapaTecnica;
      if (resultado.ok) {
        setFinalizada(true);
        onStatus('FINALIZADA');
        setRecado(ETAPAS_VISIVEIS_DA_FINALIZACAO[3].mensagem);
        if (resultado.integracao.opportunityId) {
          setVinculoCrm({
            opportunityId: resultado.integracao.opportunityId,
            pipelineId: resultado.integracao.pipelineId || pipelineId,
            pipelineName: resultado.integracao.pipelineName || ''
          });
        }
      } else {
        onStatus('FALHA_INTEGRACAO');
        const mensagem =
          resultado.error ||
          resultado.integracao.mensagem ||
          resultado.sharepoint.mensagem;
        setRecado(
          `${mensagem || 'Não foi possível concluir as integrações.'} ` +
            'As duas propostas foram geradas e continuam disponíveis para download.'
        );
      }
    } catch (error) {
      const causa = new Error(
        mensagemDeErro(error, 'Não foi possível concluir a proposta.')
      );
      const mensagem = describeFinalizationError(causa, etapaTecnica);
      setErroFinalizacao(mensagem);
      setRecado(mensagem);
    } finally {
      setFinalizando(false);
    }
  }

  async function removerAnexo(id: string) {
    if (!propostaId || removendoAnexoId || finalizando || finalizada) return;
    setRemovendoAnexoId(id);
    setErroFinalizacao('');
    try {
      await removerAnexoDaProposta(propostaId, id);
      setAnexosEnviados((atuais) => atuais.filter((anexo) => anexo.id !== id));
    } catch (error) {
      setErroFinalizacao(
        mensagemDeErro(error, 'Não foi possível remover o anexo.')
      );
    } finally {
      setRemovendoAnexoId('');
    }
  }

  async function baixarDocumentos(documentos: DocumentoEmitido[]) {
    if (!documentos.length || baixandoId) return;
    setBaixandoId(documentos.length === 1 ? documentos[0].id : 'varios');
    try {
      const arquivos = await Promise.all(
        documentos.map(async (documento) => ({
          documento,
          blob: await baixarDocumento(documento.id)
        }))
      );
      for (const { documento, blob } of arquivos) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = documento.fileName;
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      setRecado(mensagemDeErro(error, 'Não foi possível baixar o documento.'));
    } finally {
      setBaixandoId('');
    }
  }

  function reiniciarFinalizacao() {
    setFunilId('');
    setEscolhaCard('');
    setAnexos([]);
    setAnexosEnviados([]);
    setEmitidos([]);
    setEtapaFinalizacao(-1);
    setErroFinalizacao('');
    setFinalizada(false);
  }

  return {
    anexos,
    anexosEnviados,
    baixandoId,
    bloqueada: finalizando || finalizada,
    concluirFinalizacao,
    escolherCard,
    escolherFunil,
    escolhaCard,
    escolhaDownload,
    erroFinalizacao,
    etapaFinalizacao,
    finalizada,
    finalizando,
    funilId: funilId || vinculoCrm?.pipelineId || '',
    funis,
    funisCarregando,
    funisMensagem,
    integracaoDisponivel: Boolean(funis.length || vinculoCrm?.pipelineId),
    emitidos,
    marcarFinalizada: setFinalizada,
    limparErroFinalizacao: () => setErroFinalizacao(''),
    pastaOneDrive,
    reiniciarFinalizacao,
    removerAnexo,
    removendoAnexoId,
    baixarDocumentos,
    setAnexos,
    setEscolhaDownload,
    setPastaOneDrive
  };
}
