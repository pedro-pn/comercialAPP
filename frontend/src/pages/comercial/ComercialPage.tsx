import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';

import { useAuth } from '../../auth/AuthContext';
import { moduleRoutePath } from '../../modules/registry';
import { ComercialChrome } from './components/ComercialChrome';
import { TutorialDoModulo } from './TutorialDoModulo';
import { ROTEIRO_DA_ENTRADA } from './roteiroDoTutorial';

/**
 * Menu de entrada do módulo Comercial — desvio nº 9.
 *
 * A referência não tem esta tela: lá o login desemboca direto no assistente de
 * proposta, e quem vai levantar custos — que é o começo real do fluxo, já que é
 * o levantamento que carimba o código — tem de sair de lá e navegar.
 *
 * Metade disto já era inevitável, porque no filtroAPP todo módulo mora atrás de
 * um prefixo. O que a decisão do mantenedor acrescentou foi a **tela de
 * escolha**. E ela é menos estranha à referência do que parecia: o diálogo de
 * abertura de `/` já oferecia três caminhos, e um deles ("Levantar custos") era
 * um **link** para a tela de custos. Este menu é a promoção daquilo a tela.
 *
 * **Sem baseline visual** — não existe na referência para ser fotografado, então
 * a comparação de paridade não se aplica aqui.
 */

type Destino = {
  titulo: string;
  descricao: string;
  rota: string;
  icone: ReactNode;
};

type RotaKey = 'custos' | 'propostas' | 'historico' | 'configuracoes';

const DESTINOS: Array<
  Omit<Destino, 'rota'> & { rotaKey: RotaKey; soGestor?: boolean; soOrcamentista?: boolean }
> = [
  {
    titulo: 'Levantar custos',
    descricao:
      'Calcula custos, impostos, comissões e margem. É ele que carimba o código da proposta.',
    rotaKey: 'custos',
    soOrcamentista: true,
    icone: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 7h8" />
        <path d="M8 11h3" />
        <path d="M13 11h3" />
        <path d="M8 15h3" />
        <path d="M13 15h3" />
      </>
    )
  },
  {
    titulo: 'Propostas',
    descricao: 'Monta a proposta técnica e a comercial para uma nova emissão.',
    rotaKey: 'propostas',
    soOrcamentista: true,
    icone: (
      <>
        <path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
        <path d="M14 3v6h6" />
        <path d="M9 13h6" />
        <path d="M9 17h4" />
      </>
    )
  },
  {
    titulo: 'Histórico',
    descricao: 'Consulta propostas emitidas, documentos e o estado das integrações.',
    rotaKey: 'historico',
    icone: (
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v5h5" />
        <path d="M12 7v5l3 2" />
      </>
    )
  },
  {
    titulo: 'Configurações',
    descricao: 'Endereço da sede — a origem de todas as distâncias calculadas nos levantamentos.',
    rotaKey: 'configuracoes',
    soGestor: true,
    icone: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.09a1.7 1.7 0 0 0 1.56 1h.04a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.56 1z" />
      </>
    )
  }
];

export function ComercialPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // O cartão de configuração só aparece para quem a rota deixa entrar. Mostrá-lo
  // a todos daria a um vendedor um caminho que termina em "acesso negado" — e o
  // que ele veria seria uma tela quebrada, não uma permissão que não tem.
  const ehGestor =
    user?.accountType === 'ADMIN' || Boolean(user?.moduleRoles?.includes('comercial:manager'));
  const ehOrcamentista =
    ehGestor || Boolean(user?.moduleRoles?.includes('comercial:seller'));
  const destinos = DESTINOS.filter(
    destino =>
      (!destino.soGestor || ehGestor) && (!destino.soOrcamentista || ehOrcamentista)
  );

  return (
    <ComercialChrome
      eyebrow="FILTROVALI / COMERCIAL"
      titulo="O que você quer fazer?"
      descricao="O levantamento vem antes da proposta — é ele que define o código que os dois documentos vão usar."
      /* A entrada é a ÚNICA tela que abre o tutorial sozinha (T096). Nas outras,
         o botão é o caminho — abrir automático saltaria por cima de quem está no
         meio de um levantamento. */
      acoes={<TutorialDoModulo passos={ROTEIRO_DA_ENTRADA} abrirSozinho />}
    >
      <section className="com-painel com-menu">
        <div className="com-grid">
            {destinos.map(destino => (
              <button
                key={destino.rotaKey}
                type="button"
                className="com-cartao"
                data-tutorial={`menu-${destino.rotaKey}`}
                onClick={() => navigate(moduleRoutePath('comercial', destino.rotaKey))}
              >
                <span className="com-cartao-icone" aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    width="22"
                    height="22"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {destino.icone}
                  </svg>
                </span>
                <strong className="com-quebrar">{destino.titulo}</strong>
                <span className="com-cartao-descricao com-quebrar">{destino.descricao}</span>
              </button>
            ))}
        </div>
      </section>

    </ComercialChrome>
  );
}
