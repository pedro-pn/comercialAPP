import { useState } from 'react';

import { calcularDistancia, mensagemDeErro } from '../../../../api/comercial';
import { decidirDistancia } from '../distancia';

/**
 * Campo de distância com cálculo pelo Google (T126b).
 *
 * A distância só ida é o número que multiplica quase todo custo de logística —
 * e até aqui era digitado a partir de consulta manual no Maps, uma por destino.
 *
 * **O campo continua digitável, e isso não é concessão.** O cálculo é atalho: o
 * botão some do caminho de quem já sabe o número, e nenhuma resposta do servidor
 * bloqueia a digitação. Endereço não achado, Maps desligado, cota do dia
 * estourada — todos caem no mesmo lugar, que é o comportamento de antes.
 *
 * O que **não** pode acontecer é preencher errado calado. "Unidade de Cubatão"
 * devolve 595 km e a cidade de Cubatão: número plausível, destino errado. Por
 * isso a decisão de aceitar ou pedir conferência mora em `decidirDistancia`,
 * separada e testada — aqui é só a apresentação dela.
 */

type Props = {
  endereco: string;
  km: number;
  onChange: (km: number) => void;
  invalido?: boolean;
  obrigatorio?: boolean;
};

export function DistanciaDoDestino({
  endereco,
  km,
  onChange,
  invalido,
  obrigatorio
}: Props) {
  const [calculando, setCalculando] = useState(false);
  const [recado, setRecado] = useState('');
  const [tom, setTom] = useState<'ok' | 'aviso' | 'erro'>('ok');

  async function calcular() {
    setCalculando(true);
    setRecado('');
    try {
      const decisao = decidirDistancia(await calcularDistancia(endereco));
      if (decisao.preencher && decisao.km !== null) onChange(decisao.km);
      setRecado(decisao.recado);
      setTom(decisao.tom);
    } catch (error) {
      setRecado(mensagemDeErro(error, 'Não foi possível calcular a distância.'));
      setTom('erro');
    } finally {
      setCalculando(false);
    }
  }

  return (
    <div className="com-distancia">
      <div className="com-distancia-linha">
        {obrigatorio && (
          <span className="survey-required-marker" title="Campo obrigatório">
            *
          </span>
        )}
        <input
          type="number"
          aria-label="Distância só ida em quilômetros"
          className={invalido ? 'com-campo-invalido' : undefined}
          aria-invalid={invalido || undefined}
          min={0}
          step={1}
          value={km || ''}
          onChange={evento => onChange(evento.target.value === '' ? 0 : Number(evento.target.value))}
        />
        <button
          type="button"
          className="com-btn com-btn-fantasma com-distancia-botao"
          // Sem endereço não há o que calcular, e a chamada seria desperdiçada.
          disabled={calculando || endereco.trim().length < 4}
          title={
            endereco.trim().length < 4
              ? 'Informe o endereço para calcular'
              : 'Calcular a distância da sede até aqui'
          }
          onClick={calcular}
        >
          {calculando ? '…' : 'Calcular'}
        </button>
      </div>

      {recado && (
        <small
          className={tom === 'ok' ? 'field-hint' : 'field-error'}
          // `alert` só quando exige ação — um "encontrado: rua tal" interrompendo
          // o leitor de tela a cada cálculo seria ruído.
          role={tom === 'ok' ? undefined : 'alert'}
        >
          {recado}
        </small>
      )}
    </div>
  );
}
