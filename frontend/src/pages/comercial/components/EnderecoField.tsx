import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import { sugerirEnderecos, type SugestaoDeEndereco } from '../../../api/comercial';

/**
 * Campo de endereço com as sugestões do Google enquanto se digita (T134).
 *
 * Pedido pelo mantenedor depois de configurar a sede à mão: sem a lista, quem
 * digita não tem como saber se escreveu o endereço de um jeito que o Google
 * reconhece. Vale para a **sede** — a origem de toda distância, onde um erro não
 * aparece porque quem confere um cálculo olha o destino — e para os **destinos
 * do levantamento de custos**, que é onde se digita endereço toda semana.
 *
 * Escolher da lista traz o `placeId` junto, quem chama decide se guarda.
 * Digitar à mão continua valendo: a lista **sugere, não obriga**.
 *
 * ---------------------------------------------------------------------------
 * As três proteções, e por que cada uma existe
 *
 * Autocompletar é o caso em que uma tela dispara uma chamada **por tecla**. A
 * franquia do Google é de 10.000/mês e não avisa ao ser consumida:
 *
 * 1. **Piso de 4 caracteres** — abaixo disso a resposta é meia cidade, e serve
 *    só para gastar.
 * 2. **Espera de 350 ms sem digitar** — é o que transforma "Rua Rosa Orsi
 *    Dalçoquio 930" de 28 chamadas em 3 ou 4.
 * 3. **A resposta atrasada é descartada.** Sem isso, a lista de "Rua" chega
 *    depois da lista de "Rua Rosa" e sobrescreve a certa com a velha — o
 *    clássico da busca ao vivo, e o mais difícil de perceber, porque só acontece
 *    quando a rede está lenta.
 *
 * ---------------------------------------------------------------------------
 * A lista é `position: fixed`, e não é capricho
 *
 * Na tela de custos o campo mora dentro de `.com-table-wrap`, que tem
 * `overflow-x: auto` para a tabela poder rolar na horizontal. Uma lista
 * `absolute` seria **recortada por esse overflow** — apareceria cortada na
 * primeira linha e invisível nas de baixo. Com `fixed` ela sai do fluxo e é
 * posicionada pela medida do input, que é um caminho só para os dois lugares.
 */

const MINIMO = 4;
const ESPERA_MS = 350;

/** Onde a lista deve ser desenhada, em coordenadas de viewport. */
type Caixa = { left: number; top: number; width: number };

type EnderecoInputProps = {
  value: string;
  /** `placeId` vem preenchido só quando o valor saiu da lista. */
  onChange: (endereco: string, placeId: string) => void;
  id?: string;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  /** Chamado quando o servidor manda um aviso (Places desligada, cota, rede). */
  onAviso?: (aviso: string) => void;
  onBuscando?: (buscando: boolean) => void;
};

/**
 * O combobox cru: um `input` e a lista. Sem rótulo, sem dica, sem erro.
 *
 * É esta a forma que serve dentro de uma célula de tabela, onde rótulo é o
 * cabeçalho da coluna e não pode haver texto de apoio embaixo do campo.
 */
export function EnderecoInput({
  value,
  onChange,
  id,
  className,
  disabled,
  placeholder = 'Rua, número, bairro, cidade - UF',
  maxLength = 300,
  onAviso,
  onBuscando,
  ...aria
}: EnderecoInputProps) {
  const geradoId = useId();
  const listaId = `${id || geradoId}-lista`;

  const [sugestoes, setSugestoes] = useState<SugestaoDeEndereco[]>([]);
  const [aberta, setAberta] = useState(false);
  const [ativo, setAtivo] = useState(-1);
  const [caixa, setCaixa] = useState<Caixa | null>(null);

  /**
   * O termo que a busca deve perseguir. Fica separado de `value` porque
   * escolher da lista muda `value` **sem** dever disparar busca nova — senão a
   * escolha reabriria a lista com o resultado do que acabou de ser escolhido.
   */
  const [termo, setTermo] = useState('');

  const campo = useRef<HTMLInputElement>(null);
  // Cada busca leva o número da sua vez. Só a última manda na tela.
  const vez = useRef(0);

  const medir = useCallback(() => {
    const alvo = campo.current;
    if (!alvo) return;
    const rect = alvo.getBoundingClientRect();
    setCaixa({ left: rect.left, top: rect.bottom + 2, width: rect.width });
  }, []);

  useEffect(() => {
    if (termo.trim().length < MINIMO) {
      setSugestoes([]);
      onAviso?.('');
      return;
    }

    const minhaVez = vez.current + 1;
    vez.current = minhaVez;
    const controle = new AbortController();

    const relogio = window.setTimeout(() => {
      onBuscando?.(true);
      sugerirEnderecos(termo, controle.signal)
        .then(resposta => {
          // Chegou fora de hora: já há busca mais nova a caminho.
          if (vez.current !== minhaVez) return;
          setSugestoes(resposta.items);
          onAviso?.(resposta.aviso);
          setAtivo(-1);
          setAberta(true);
          medir();
        })
        .catch(() => {
          // Cancelamento é o caminho normal aqui — o usuário continuou digitando.
          if (vez.current !== minhaVez) return;
          setSugestoes([]);
        })
        .finally(() => {
          if (vez.current === minhaVez) onBuscando?.(false);
        });
    }, ESPERA_MS);

    return () => {
      window.clearTimeout(relogio);
      controle.abort();
    };
  }, [termo, medir, onAviso, onBuscando]);

  // A lista é `fixed`: rolar a página a deixaria para trás, parada onde o campo
  // estava. `capture` porque quem rola aqui costuma ser a tabela, não a janela.
  useLayoutEffect(() => {
    if (!aberta) return;
    const remedir = () => medir();
    window.addEventListener('scroll', remedir, true);
    window.addEventListener('resize', remedir);
    return () => {
      window.removeEventListener('scroll', remedir, true);
      window.removeEventListener('resize', remedir);
    };
  }, [aberta, medir]);

  function digitar(texto: string) {
    setTermo(texto);
    // O `placeId` anterior era de OUTRO endereço. Mantê-lo faria quem grava
    // guardar o lugar antigo com o texto novo.
    onChange(texto, '');
  }

  function escolher(sugestao: SugestaoDeEndereco) {
    // `termo` não muda: a escolha não pode disparar uma busca pelo que já foi
    // escolhido, que reabriria a lista por cima do campo recém-preenchido.
    onChange(sugestao.texto, sugestao.placeId);
    setAberta(false);
    setSugestoes([]);
    setAtivo(-1);
  }

  function navegar(evento: React.KeyboardEvent<HTMLInputElement>) {
    if (evento.key === 'Escape') {
      setAberta(false);
      return;
    }
    if (!aberta || sugestoes.length === 0) return;

    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      setAtivo(atual => (atual + 1) % sugestoes.length);
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      setAtivo(atual => (atual <= 0 ? sugestoes.length - 1 : atual - 1));
    } else if (evento.key === 'Enter' && ativo >= 0) {
      // Só intercepta o Enter quando há linha destacada: sem isso, quem digitou
      // o endereço inteiro à mão apertaria Enter e não aconteceria nada.
      evento.preventDefault();
      escolher(sugestoes[ativo]);
    } else if (evento.key === 'Tab') {
      setAberta(false);
    }
  }

  const mostrando = aberta && sugestoes.length > 0;

  return (
    <span className="com-autocomplete">
      <input
        {...aria}
        ref={campo}
        id={id}
        type="text"
        className={className}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
        autoComplete="off"
        role="combobox"
        aria-expanded={mostrando}
        aria-controls={listaId}
        aria-autocomplete="list"
        aria-activedescendant={ativo >= 0 ? `${listaId}-${ativo}` : undefined}
        onChange={evento => digitar(evento.target.value)}
        onKeyDown={navegar}
        onFocus={() => {
          if (sugestoes.length > 0) {
            setAberta(true);
            medir();
          }
        }}
        // `blur` fecha com atraso porque o clique numa sugestão dispara o blur
        // ANTES do clique — fechar na hora tiraria a linha debaixo do cursor.
        onBlur={() => window.setTimeout(() => setAberta(false), 150)}
      />

      {mostrando && (
        <ul
          className="com-autocomplete-lista"
          id={listaId}
          role="listbox"
          style={caixa ? { left: caixa.left, top: caixa.top, width: caixa.width } : undefined}
        >
          {sugestoes.map((sugestao, indice) => (
            <li
              key={sugestao.placeId}
              id={`${listaId}-${indice}`}
              role="option"
              aria-selected={indice === ativo}
              className={
                indice === ativo
                  ? 'com-autocomplete-item com-autocomplete-item-ativo'
                  : 'com-autocomplete-item'
              }
              onMouseDown={evento => {
                // `mouseDown`, não `click`: o `blur` do campo chega primeiro e o
                // clique nunca aconteceria.
                evento.preventDefault();
                escolher(sugestao);
              }}
              onMouseEnter={() => setAtivo(indice)}
            >
              <strong className="com-quebrar">{sugestao.principal}</strong>
              {sugestao.secundario && <span className="com-quebrar">{sugestao.secundario}</span>}
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}

type EnderecoFieldProps = {
  label: string;
  value: string;
  onChange: (endereco: string, placeId: string) => void;
  error?: string | null;
  hint?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  maxLength?: number;
};

/** O mesmo combobox, com rótulo, dica e erro — a forma de formulário. */
export function EnderecoField({
  label,
  value,
  onChange,
  error,
  hint,
  disabled,
  required,
  placeholder,
  maxLength
}: EnderecoFieldProps) {
  const id = useId();
  const errorId = `${id}-erro`;
  const hintId = `${id}-dica`;
  const invalid = Boolean(error);

  const [aviso, setAviso] = useState('');
  const [buscando, setBuscando] = useState(false);

  return (
    <div className={invalid ? 'field-group field-invalid' : 'field-group'}>
      <label htmlFor={id}>
        {label}
        {required && <span className="survey-required-marker">*</span>}
      </label>

      <EnderecoInput
        id={id}
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-invalid={invalid || undefined}
        aria-describedby={
          [invalid ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined
        }
        onAviso={setAviso}
        onBuscando={setBuscando}
      />

      {buscando && <small className="field-hint">Buscando endereços…</small>}

      {/* O aviso do servidor — Places desabilitada, cota do dia, rede fora do ar.
          Ele não impede de digitar: a lista é atalho, não caminho obrigatório. */}
      {!buscando && aviso && <small className="field-hint">{aviso}</small>}

      {hint && !invalid && !buscando && !aviso && (
        <small id={hintId} className="field-hint">
          {hint}
        </small>
      )}
      {invalid && (
        <small id={errorId} className="field-error" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}
