/**
 * O emblema redondo dos cartões de opção — desenhado, não digitado.
 *
 * Os cartões traziam `＋` (U+FF0B, **fullwidth**), `↻` e `✓` como texto dentro
 * de um círculo de 38 px. Nenhum dos três centraliza: eles se alinham pelas
 * métricas da fonte — o `＋` e o `↻` pelo **eixo matemático**, que fica acima do
 * centro da caixa — e o quanto sobra depende da fonte de quem abre. Relatado com
 * captura em 14/08, junto com o `×` do diálogo, que tinha a mesma causa.
 *
 * Desenhado em SVG, o centro é geométrico e igual em qualquer máquina.
 *
 * **O que isso muda para a paridade**: o caractere sai do DOM. Ele aparece nas
 * linhas do inventário que capturaram o texto cru do botão (`PROP-CTL-001`,
 * `PROP-CTL-002` e as de "Adicionar…"), e a T115 vai notar a falta. Não é
 * remoção de controle nem de texto legível — o emblema continua ali, com o mesmo
 * desenho —, e por isso não entra na lista de desvios; está registrado no
 * próprio inventário para a conferência não parar nele.
 */

type Tipo = 'nova' | 'revisao' | 'ok';

const DESENHOS: Record<Tipo, string> = {
  // Um "+": duas linhas cruzadas no centro exato do quadro.
  nova: 'M12 6v12M6 12h12',
  // Seta circular — o "↻" de recarregar, com a ponta fechando o arco.
  revisao: 'M18.5 12a6.5 6.5 0 1 1-2.2-4.9M18.5 6v3.4h-3.4',
  ok: 'M6 12.5l4 4 8-8'
};

export function MarcaDeOpcao({ tipo }: { tipo: Tipo }) {
  return (
    <b aria-hidden="true">
      <svg viewBox="0 0 24 24" width="19" height="19" focusable="false">
        <path
          d={DESENHOS[tipo]}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </b>
  );
}
