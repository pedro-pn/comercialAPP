/**
 * O que a tela faz com o resultado do cálculo de distância (T126b).
 *
 * Função pura, separada do componente, porque a decisão que ela toma é a única
 * coisa que importa aqui — e é a que erra em silêncio.
 *
 * O adaptador **nunca lança**: endereço não achado, serviço desligado, cota
 * estourada e rota inexistente chegam todos como resposta, com `km: null` e um
 * motivo. E quando acha, diz **com que confiança**:
 *
 * | `confianca` | O que houve | Conduta |
 * |---|---|---|
 * | `exata`   | achou o endereço pedido | preenche direto |
 * | `parcial` | não casou tudo o que foi digitado | preenche e **pede conferência** |
 * | `regiao`  | achou a cidade, não o endereço | preenche e **pede conferência** |
 * | `nenhuma` | não achou nada | não preenche, explica |
 *
 * A distinção entre `exata` e o resto é a razão de existir deste arquivo.
 * "Unidade de Cubatão" devolve **595 km e a cidade de Cubatão** — número
 * plausível, destino errado. Preencher isso sem avisar troca um campo em branco
 * por um número errado, e é pior: o branco alguém preenche, o número ninguém
 * confere.
 */

export type ResultadoDeDistancia = {
  km: number | null;
  enderecoEncontrado: string;
  confianca: 'exata' | 'parcial' | 'regiao' | 'nenhuma';
  aviso: string;
};

export type DecisaoDeDistancia = {
  /** Preenche o campo? */
  preencher: boolean;
  km: number | null;
  /** O que mostrar ao usuário. Vazio quando não há nada a dizer. */
  recado: string;
  /** `aviso` exige conferência humana; `erro` é impedimento; `ok` é silêncio. */
  tom: 'ok' | 'aviso' | 'erro';
};

export function decidirDistancia(resultado: ResultadoDeDistancia): DecisaoDeDistancia {
  if (resultado.km === null) {
    return {
      preencher: false,
      km: null,
      // O motivo vem do servidor e é específico — "a chave não está configurada",
      // "limite diário atingido", "não há rota rodoviária". Trocá-lo por um texto
      // genérico da tela jogaria fora o que diz o que fazer a seguir.
      recado: resultado.aviso || 'Não foi possível calcular a distância.',
      tom: 'erro'
    };
  }

  if (resultado.confianca === 'exata') {
    return {
      preencher: true,
      km: resultado.km,
      recado: resultado.enderecoEncontrado ? `Encontrado: ${resultado.enderecoEncontrado}` : '',
      tom: 'ok'
    };
  }

  // Preenche mesmo assim: o número é ponto de partida útil, e apagá-lo obrigaria
  // a pessoa a digitar do zero um valor que está quase certo. Mas nunca calado.
  return {
    preencher: true,
    km: resultado.km,
    recado: `${resultado.km} km — ${resultado.aviso}`,
    tom: 'aviso'
  };
}
