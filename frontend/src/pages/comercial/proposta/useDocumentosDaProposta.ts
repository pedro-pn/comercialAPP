import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listarDocumentosDaProposta,
  mensagemDeErro,
  type DocumentoEmitido
} from '../../../api/comercial';

/** Compartilha a geração atual entre a finalização e a lista de downloads. */
export function useDocumentosDaProposta(proposalId: string) {
  const [geracao, setGeracao] = useState<{
    proposalId: string;
    documentos: DocumentoEmitido[];
  } | null>(null);
  const [erro, setErro] = useState('');
  const versao = useRef(0);
  const propostaAtual = useRef(proposalId);
  propostaAtual.current = proposalId;

  const atualizarDocumentos = useCallback((id: string, documentos: DocumentoEmitido[]) => {
    if (propostaAtual.current && propostaAtual.current !== id) return;
    // Uma consulta iniciada antes da emissão não pode recolocar a geração antiga.
    versao.current++;
    setGeracao({ proposalId: id, documentos });
    setErro('');
  }, []);

  useEffect(() => {
    const consulta = ++versao.current;
    let ativo = true;
    setErro('');
    if (!proposalId) {
      setGeracao(null);
      return;
    }
    listarDocumentosDaProposta(proposalId)
      .then(documentos => {
        if (ativo && consulta === versao.current) {
          setGeracao({ proposalId, documentos });
        }
      })
      .catch(error => {
        if (ativo && consulta === versao.current) {
          setErro(mensagemDeErro(error, 'Falha ao carregar documentos.'));
        }
      });
    return () => { ativo = false; };
  }, [proposalId]);

  return {
    documentos: geracao?.proposalId === proposalId ? geracao.documentos : [],
    erro,
    atualizarDocumentos
  };
}
