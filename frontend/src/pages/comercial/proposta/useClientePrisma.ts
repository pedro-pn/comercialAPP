import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { mensagemDeErro, obterLiberacaoPrisma } from '../../../api/comercial';
import { preencherClientePrisma } from './clientePrisma';

/** Recupera os campos faltantes de rascunhos que já tinham sido vinculados. */
export function useClientePrisma({ propostaId, crmReleaseId, habilitado, setForm, setRecado }: {
  propostaId: string;
  crmReleaseId: string;
  habilitado: boolean;
  setForm: Dispatch<SetStateAction<Record<string, unknown>>>;
  setRecado: Dispatch<SetStateAction<string>>;
}) {
  const carregada = useRef('');
  useEffect(() => {
    const chave = `${propostaId}:${crmReleaseId}`;
    if (!habilitado || !propostaId || !crmReleaseId || carregada.current === chave) return;
    let vivo = true;
    obterLiberacaoPrisma(crmReleaseId)
      .then(liberacao => {
        if (!vivo) return;
        carregada.current = chave;
        setForm(atual => preencherClientePrisma(atual, liberacao.snapshot));
      })
      .catch(error => {
        if (vivo) setRecado(mensagemDeErro(error, 'Não foi possível carregar os dados do cliente do Prisma.'));
      });
    return () => { vivo = false; };
  }, [propostaId, crmReleaseId, habilitado, setForm, setRecado]);
}
