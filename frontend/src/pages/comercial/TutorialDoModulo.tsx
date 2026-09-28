import { useCallback, useEffect, useRef, useState } from 'react';
import { driver } from 'driver.js';
import type { DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';

import { marcarTutorialComercialVisto, tutorialComercialVisto } from '../../api/comercial';
import { passosPresentes } from './roteiroDoTutorial';

/**
 * O tutorial permanente do módulo — L4, FR-025/FR-025a, T096.
 *
 * **Permanente, não campanha.** Módulo novo tem onboarding que fica; a campanha
 * de novidade de 10 dias é para função nova dentro de módulo existente e não se
 * aplica aqui.
 *
 * **O marcador de "já viu" mora no servidor**, por usuário, e é a única parte
 * disto que não é enfeite. Em `localStorage` — que é o que o resto do app faz —
 * dois usuários da mesma máquina compartilhariam o marcador, e o segundo nunca
 * veria o tutorial; e o mesmo usuário o veria de novo em outro computador.
 *
 * **Rever não desmarca.** O botão é uma consulta voluntária; transformá-lo em
 * "nunca mais viu" seria o oposto do que ele significa. O marcador responde
 * uma pergunta só: *o tutorial já apareceu sozinho para esta conta?*
 *
 * **Só abre sozinho onde `abrirSozinho` estiver ligado** — a entrada do módulo.
 * Abrir em qualquer tela faria o tutorial da proposta saltar sobre alguém que
 * está no meio de um levantamento.
 */

type Props = {
  passos: DriveStep[];
  /** Ligado só na entrada do módulo. Nas outras telas, o botão é o único caminho. */
  abrirSozinho?: boolean;
};

export function TutorialDoModulo({ passos, abrirSozinho = false }: Props) {
  const [ocupado, setOcupado] = useState(false);
  const jaAbriu = useRef(false);

  const abrir = useCallback(
    (marcarAoFechar: boolean) => {
      // Passo que aponta para elemento ausente não destaca nada — some sem erro.
      // Filtrar aqui é o que faz um roteiro só servir a telas em estados
      // diferentes (a proposta sem prévia aberta, por exemplo).
      const disponiveis = passosPresentes(passos, seletor =>
        Boolean(document.querySelector(seletor))
      );
      if (!disponiveis.length) return;

      const guia = driver({
        showProgress: true,
        nextBtnText: 'Próximo',
        prevBtnText: 'Anterior',
        doneBtnText: 'Entendi',
        steps: disponiveis,
        onDestroyed: () => {
          if (!marcarAoFechar) return;
          // Falhar ao marcar não pode travar a tela: o pior caso é o tutorial
          // aparecer de novo no próximo acesso, que é incômodo, não defeito.
          marcarTutorialComercialVisto().catch(() => {});
        }
      });

      guia.drive();
    },
    [passos]
  );

  useEffect(() => {
    if (!abrirSozinho || jaAbriu.current) return;
    jaAbriu.current = true;

    let vivo = true;
    tutorialComercialVisto()
      .then(visto => {
        if (!vivo || visto) return;
        // Um quadro depois: `driver.js` mede o elemento, e medir antes da
        // primeira pintura destaca um retângulo de tamanho zero.
        window.requestAnimationFrame(() => abrir(true));
      })
      // Sem resposta do servidor, **não** abre: repetir o tutorial para quem já
      // o dispensou é pior do que não mostrá-lo a quem nunca viu — este ainda
      // tem o botão.
      .catch(() => {});

    return () => {
      vivo = false;
    };
  }, [abrirSozinho, abrir]);

  return (
    <button
      type="button"
      className="com-btn com-btn-fantasma com-tutorial-botao"
      data-tutorial="rever-tutorial"
      disabled={ocupado}
      onClick={() => {
        setOcupado(true);
        abrir(false);
        setOcupado(false);
      }}
    >
      ? Rever tutorial
    </button>
  );
}
