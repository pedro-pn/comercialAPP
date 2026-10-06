import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { useAuth } from '../../../auth/AuthContext';
import { moduleRoutePath } from '../../../modules/registry';
import { LOGO_URL } from './marca';

/**
 * Chrome do módulo Comercial — desvio nº 10.
 *
 * Dentro da raiz do módulo o chrome é o da **referência**, não o `Shell`/
 * `TopBar` do filtroAPP. Decisão do mantenedor em 03/08, com motivo
 * estratégico: o filtroAPP inteiro vai se parecer com o comercialAPP, então
 * este chrome é prévia do padrão que vem — não um corpo estranho.
 *
 * Porte de `.cost-topbar` + `.cost-hero` (`app/custos/page.tsx:497`) e de
 * `.topbar` + `.hero` (`app/page.tsx:830`).
 *
 * **A referência tem DUAS faixas, não uma**, e eu tinha portado só a primeira:
 *
 * - `custos` — compacta e grudada no topo, com eyebrow, título e descrição na
 *   MESMA linha, para sobrar tela para as 5 seções;
 * - `proposta` — alta, com os três empilhados, título de 34px e um cartão de
 *   numeração à direita. Não gruda no topo: o stepper embaixo é que orienta.
 *
 * Usar a de custos na proposta foi o que deixou eyebrow, título e descrição
 * amontoados numa linha só.
 *
 * A única coisa que este componente acrescenta à referência é o **caminho de
 * volta ao hub**, e ele vive onde já vivia um link na referência: na marca.
 * Lá a marca levava para `/` (a proposta); aqui leva para o menu do módulo, e
 * "Voltar ao início" leva à entrada do app independente.
 */


type ComercialChromeProps = {
  /** Texto pequeno acima do título, em caixa alta. */
  eyebrow: string;
  titulo: string;
  /** Complemento do título, na cor clara da referência (`<h1>Propostas <em>4435</em></h1>`). */
  tituloComplemento?: string;
  descricao?: string;
  /** Qual das duas faixas da referência. */
  variante?: 'custos' | 'proposta';
  /** Conteúdo extra da faixa — a faixa de indicadores, por exemplo. */
  heroExtra?: ReactNode;
  /** Ações da barra superior, à direita do identificador do usuário. */
  acoes?: ReactNode;
  /** Chips de integração à esquerda do identificador (Nectar, Microsoft 365). */
  chips?: ReactNode;
  /** Faixa de largura total entre o hero e o conteúdo — o stepper da proposta. */
  faixa?: ReactNode;
  /** Sem o contêiner padrão: quem passa isto desenha a própria grade. */
  semContainer?: boolean;
  children: ReactNode;
  /**
   * Para onde o "← Voltar" leva. Ausente = sem botão, que é o caso da entrada
   * do módulo: dali não há para onde voltar dentro do Comercial.
   *
   * Existe porque as telas internas dependiam do botão do NAVEGADOR para sair —
   * e o logo da barra, que leva ao menu, não se anuncia como caminho de volta.
   */
  voltarPara?: string;
  /** Permite terminar o salvamento da tela antes de navegar ou encerrar a sessão. */
  antesDeSair?: () => Promise<boolean>;
  navegacaoOcupada?: boolean;
};

export function ComercialChrome({
  eyebrow,
  titulo,
  tituloComplemento,
  descricao,
  variante = 'custos',
  heroExtra,
  acoes,
  chips,
  faixa,
  semContainer,
  voltarPara,
  antesDeSair,
  navegacaoOcupada = false,
  children
}: ComercialChromeProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  async function sair(acao: () => void) {
    if (navegacaoOcupada) return;
    if (antesDeSair && !await antesDeSair()) return;
    acao();
  }

  return (
    <div className={`com-root com-app com-app-${variante}`}>
      <header className="com-topbar">
        <button
          type="button"
          className="com-marca"
          aria-label="Comercial — voltar ao menu do módulo"
          disabled={navegacaoOcupada}
          onClick={() => void sair(() => navigate(moduleRoutePath('comercial', 'index')))}
        >
          <img src={LOGO_URL} alt="Filtrovali" />
        </button>

        <div className="com-topbar-acoes">
          {voltarPara && (
            <button
              type="button"
              className="com-btn com-btn-fantasma"
              disabled={navegacaoOcupada}
              onClick={() => void sair(() => navigate(voltarPara))}
            >
              ← Voltar
            </button>
          )}
          {chips}
          <span className="com-usuario">
            Usuário: <b className="com-quebrar">{user?.name || '—'}</b>
          </span>
          {acoes}
          {location.pathname !== moduleRoutePath('comercial', 'index') && <button
            type="button"
            className="com-btn com-btn-fantasma"
            disabled={navegacaoOcupada}
            onClick={() => void sair(() => navigate(moduleRoutePath('comercial', 'index')))}
          >
            Voltar ao início
          </button>}
          {/* Voltar ao início mantém a sessão; sair do sistema a encerra. */}
          <button
            type="button"
            className="com-btn com-btn-fantasma"
            disabled={navegacaoOcupada}
            onClick={() => void sair(() => {
              // O `catch` existe porque a sessão pode já ter caído no servidor.
              // Falhar ao avisar o servidor não pode prender o usuário na tela:
              // o `logout` limpa o estado local de qualquer jeito.
              void logout().catch(() => {});
            })}
          >
            Sair do sistema
          </button>
        </div>
      </header>

      <section className={`com-hero com-hero-${variante}`}>
        <div className="com-hero-titulo">
          <span className="com-eyebrow">{eyebrow}</span>
          <h1>
            {titulo}
            {tituloComplemento && <em>{tituloComplemento}</em>}
          </h1>
          {descricao && <p>{descricao}</p>}
        </div>
        {heroExtra}
      </section>

      {faixa}

      {semContainer ? children : <main className="com-conteudo">{children}</main>}
    </div>
  );
}
