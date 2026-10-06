import { useCallback, useEffect, useRef, useState } from 'react';

import {
  chaveDoRascunho,
  descartarRascunho,
  descartarRascunhosDaTela,
  descreverIdade,
  guardarRascunho,
  lerRascunho,
  type RascunhoGuardado
} from './rascunhoLocal';

/**
 * Liga o rascunho local a uma tela (tarefas T089 a T092 — lacuna **L3**).
 *
 * A regra mora em `rascunhoLocal.ts`, que é puro e testado. Aqui fica só o que
 * depende do React: o `beforeunload` e o estado da oferta.
 *
 * **Ordem importa na montagem.** O rascunho é lido **uma vez**, antes de o
 * autossalvamento começar. Se as duas coisas rodassem juntas, o primeiro `setDraft`
 * do componente sobrescreveria o rascunho guardado com o payload em branco — e o
 * trabalho que se queria proteger sumiria justamente ao abrir a tela.
 */

function assinaturaDosDados(dados: unknown) {
  try {
    return JSON.stringify(dados);
  } catch {
    return '';
  }
}

export function useRascunhoLocal({
  conta,
  tela,
  modo,
  codigo,
  identidade,
  dados,
  ativo,
  rotulo
}: {
  /** Id da conta autenticada; separa pessoas que usam o mesmo navegador. */
  conta: string;
  tela: string;
  modo: string | null;
  codigo: string;
  /** Mantém o mesmo trabalho quando o primeiro salvamento atribui um número. */
  identidade?: string;
  dados: unknown;
  /** Falso enquanto a tela não está em trabalho — não guarda rascunho de diálogo. */
  ativo: boolean;
  rotulo?: string;
}) {
  const storage = typeof window === 'undefined' ? null : window.localStorage;
  const chave = conta && modo ? chaveDoRascunho(conta, tela, modo, codigo) : null;
  const trabalho = identidade ? `${conta}:${tela}:${modo}:${identidade}` : chave;

  const [oferta, setOferta] = useState<RascunhoGuardado | null>(null);
  const [alterado, setAlterado] = useState(false);

  /**
   * Enquanto for `false`, nada é gravado.
   *
   * É o que impede o autossalvamento de correr contra a leitura inicial. Vira
   * `true` só depois que a tela decidiu o que fazer com o rascunho encontrado.
   */
  const liberado = useRef(false);
  const chaveLida = useRef<string | null>(null);
  const trabalhoLido = useRef<string | null>(null);
  const assinaturaBase = useRef('');
  const assinaturaGuardada = useRef('');
  const assinaturaAtual = assinaturaDosDados(dados);

  // Leitura inicial — uma vez por chave.
  useEffect(() => {
    if (!storage || !chave || !ativo) return;
    if (chaveLida.current === chave) return;

    const encontrado = lerRascunho(storage, chave);
    const assinatura = assinaturaDosDados(dados);
    // A reserva do primeiro número muda a chave durante o POST. Transfere a
    // cópia pendente sem transformar a última edição em uma nova base salva.
    if (chaveLida.current && trabalhoLido.current === trabalho &&
        liberado.current && !encontrado && assinatura !== assinaturaBase.current) {
      if (guardarRascunho(storage, chave, dados, rotulo)) {
        descartarRascunho(storage, chaveLida.current);
        assinaturaGuardada.current = assinatura;
      } else {
        assinaturaGuardada.current = '';
      }
      chaveLida.current = chave;
      setAlterado(true);
      return;
    }

    chaveLida.current = chave;
    trabalhoLido.current = trabalho;
    liberado.current = false;
    assinaturaBase.current = assinatura;
    assinaturaGuardada.current = '';
    setAlterado(false);
    if (encontrado) {
      setOferta(encontrado);
    } else {
      // Abrir um registro salvo (ou um formulário novo ainda intocado) não é
      // uma alteração. Esta assinatura impede que a hidratação inicial do
      // servidor seja regravada como "rascunho não salvo".
      setOferta(null);
      liberado.current = true;
    }
  }, [storage, chave, ativo, dados, trabalho, rotulo]);

  // A cópia local é imediata: recarregar antes do debounce do servidor também
  // precisa oferecer a última edição, inclusive se a identificação está incompleta.
  useEffect(() => {
    if (!storage || !chave || !ativo || !liberado.current) return;
    if (assinaturaAtual === assinaturaBase.current) {
      if (assinaturaGuardada.current) descartarRascunho(storage, chave);
      assinaturaGuardada.current = '';
      setAlterado(false);
      return;
    }
    if (assinaturaAtual === assinaturaGuardada.current) return;

    if (guardarRascunho(storage, chave, dados, rotulo)) {
      assinaturaGuardada.current = assinaturaAtual;
    }
    setAlterado(true);
  }, [storage, chave, ativo, dados, rotulo, assinaturaAtual]);

  /**
   * Aviso de saída.
   *
   * Só aparece quando há alteração pendente. Um aviso que aparece sempre é um
   * aviso que se aprende a ignorar — e aí ele não protege mais nada no dia em que
   * a alteração é de verdade.
   */
  useEffect(() => {
    if (!alterado || !ativo) return;

    const aviso = (evento: BeforeUnloadEvent) => {
      evento.preventDefault();
      evento.returnValue = '';
    };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [alterado, ativo]);

  /** Aceita o rascunho oferecido e devolve os dados para a tela aplicar. */
  const recuperar = useCallback(() => {
    const dadosRecuperados = oferta?.dados;
    setOferta(null);
    liberado.current = true;
    setAlterado(true);
    return dadosRecuperados;
  }, [oferta]);

  /** Recusa a oferta e apaga: quem disse "não" não quer ser perguntado de novo. */
  const descartarOferta = useCallback(() => {
    if (storage && chave) descartarRascunho(storage, chave);
    setOferta(null);
    assinaturaBase.current = assinaturaDosDados(dados);
    assinaturaGuardada.current = '';
    setAlterado(false);
    liberado.current = true;
  }, [storage, chave, dados]);

  /** Depois de gravar no servidor o rascunho não pode sobrar (T091). */
  const limparTudo = useCallback(() => {
    if (!storage) return;
    descartarRascunhosDaTela(storage, conta, tela);
    assinaturaBase.current = assinaturaDosDados(dados);
    assinaturaGuardada.current = '';
    setAlterado(false);
  }, [storage, conta, tela, dados]);

  /** Remove só o rascunho corrente depois de persistir este trabalho no servidor. */
  const limparAtual = useCallback(() => {
    if (storage && chave) descartarRascunho(storage, chave);
    assinaturaBase.current = assinaturaDosDados(dados);
    assinaturaGuardada.current = '';
    setAlterado(false);
  }, [storage, chave, dados]);

  return {
    oferta,
    idadeDaOferta: oferta ? descreverIdade(oferta.salvoEm) : '',
    alterado,
    recuperar,
    descartarOferta,
    limparAtual,
    limparTudo
  };
}
