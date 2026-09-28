import { useRef, useState } from 'react';

import {
  buscarEmpresasCrm,
  mensagemDeErro,
  obterEmpresaCrm,
  type ContatoCrm,
  type EmpresaCrm
} from '../../../api/comercial';
import {
  MINIMO_PARA_BUSCAR,
  avisoDoAlcance,
  dadosDaEmpresa,
  dadosDoContato
} from './buscaDeEmpresaUtils';

/**
 * Busca de empresa no CRM, na etapa Cliente (`PROP-CTL-012..015`, T121a).
 *
 * **Preencher daqui não é conveniência, é o que destrava a finalização.** A
 * `validarFinalizacao` exige `companyId` e `contactId`, e a `RevisaoStep` manda
 * o vendedor "voltar à etapa Cliente e selecionar a empresa no Nectar" — que era
 * um recado para uma tela que não tinha como fazer isso. Digitar o nome à mão
 * nunca produziria o vínculo, porque o que o CRM precisa é o **id**.
 *
 * **Os campos continuam digitáveis depois.** A busca é atalho, como o cálculo de
 * distância: o cliente cujo nome no CRM está errado precisa sair certo no
 * documento, e corrigir na tela não pode desfazer o vínculo.
 *
 * **A busca falha sem derrubar a etapa.** Integração desligada devolve `503`, e
 * isso é caminho normal — o padrão do ambiente é `off`. A mensagem aparece e os
 * campos seguem preenchíveis à mão, que é como a etapa funcionava antes desta.
 */

type Props = {
  /** Recebe os dados da empresa e, havendo, do contato escolhido. */
  onEscolher: (patch: Record<string, unknown>) => void;
  erro?: string;
};

export function BuscaDeEmpresa({ onEscolher, erro }: Props) {
  const [termo, setTermo] = useState('');
  const [empresas, setEmpresas] = useState<EmpresaCrm[]>([]);
  const [escolhida, setEscolhida] = useState<EmpresaCrm | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [recado, setRecado] = useState('');
  const [aviso, setAviso] = useState('');
  const [buscou, setBuscou] = useState(false);

  // Cancela a busca anterior: resposta fora de ordem pinta a lista com o
  // resultado de um termo que o usuário já apagou.
  const emVoo = useRef<AbortController | null>(null);

  async function buscar() {
    const consulta = termo.trim();
    if (consulta.length < MINIMO_PARA_BUSCAR) {
      setRecado(
        `Digite ao menos ${MINIMO_PARA_BUSCAR} caracteres para buscar.`
      );
      return;
    }

    emVoo.current?.abort();
    const controle = new AbortController();
    emVoo.current = controle;

    setBuscando(true);
    setRecado('');
    setAviso('');

    try {
      const resposta = await buscarEmpresasCrm(consulta, controle.signal);
      setEmpresas(resposta.items);
      setBuscou(true);

      // **O aviso do trecho é o ponto da T123.** Sem o espelho, o Nectar casa só
      // pelo COMEÇO do nome, e dizer isso é o que separa "não achei" de "não existe".
      setAviso(avisoDoAlcance(resposta));
    } catch (error) {
      if (controle.signal.aborted) return;
      setEmpresas([]);
      setBuscou(false);
      setRecado(mensagemDeErro(error, 'Não foi possível buscar no CRM.'));
    } finally {
      if (!controle.signal.aborted) setBuscando(false);
    }
  }

  async function escolherEmpresa(empresa: EmpresaCrm) {
    setRecado('');
    onEscolher(dadosDaEmpresa(empresa));
    setEscolhida(empresa);
    // Limpar a lista após uma escolha não significa que a busca voltou vazia.
    // Sem encerrar este estado, o bloco "Nenhuma empresa encontrada" aparece
    // junto da empresa já vinculada.
    setBuscou(false);
    setEmpresas([]);

    // A busca traz contatos, mas nem sempre completos. O registro cheio é
    // pedido só agora, quando alguém escolheu — não para todas as linhas da lista.
    try {
      setEscolhida(await obterEmpresaCrm(empresa.id));
    } catch (error) {
      // A empresa já foi preenchida; o que falha aqui é a lista de contatos.
      setRecado(
        mensagemDeErro(
          error,
          'Não foi possível carregar os contatos desta empresa.'
        )
      );
    }
  }

  function escolherContato(contato: ContatoCrm) {
    onEscolher(dadosDoContato(contato));
  }

  return (
    <div className="com-crm">
      <div className="com-crm-busca">
        <input
          aria-label="Buscar empresa no Nectar"
          aria-invalid={Boolean(erro) || undefined}
          placeholder="Buscar empresa no Nectar..."
          value={termo}
          onChange={(evento) => setTermo(evento.target.value)}
          onKeyDown={(evento) => {
            if (evento.key !== 'Enter') return;
            // Enter num input solto submeteria o formulário da etapa.
            evento.preventDefault();
            void buscar();
          }}
        />
        <button type="button" onClick={() => void buscar()} disabled={buscando}>
          {buscando ? 'Buscando...' : 'Buscar no CRM'}
        </button>
      </div>

      {erro && (
        <p className="com-recado com-recado-erro" role="alert">
          {erro}
        </p>
      )}

      {recado && (
        <p className="com-recado com-recado-erro" role="alert">
          {recado}
        </p>
      )}
      {aviso && <p className="com-nota com-nota-aviso">{aviso}</p>}

      {empresas.length > 0 && (
        <ul className="com-crm-resultados">
          {empresas.map((empresa) => (
            <li key={empresa.id}>
              <button
                type="button"
                onClick={() => void escolherEmpresa(empresa)}
              >
                <strong className="com-quebrar">{empresa.nome}</strong>
                {/* O CNPJ distingue matriz de filial, que costumam ter o mesmo
                    nome — é ele que evita vincular a proposta à unidade errada. */}
                <span className="com-quebrar">
                  {[empresa.cnpj, empresa.site].filter(Boolean).join(' — ') ||
                    'Sem endereço no CRM'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {buscou && empresas.length === 0 && !recado && (
        <p className="com-nota">Nenhuma empresa encontrada com esse nome.</p>
      )}

      {escolhida && (
        <div className="com-crm-escolhida">
          <p className="com-nota">
            Vinculado ao CRM: <strong>{escolhida.nome}</strong>
          </p>

          {escolhida.contatos.length > 0 ? (
            <ul className="com-crm-resultados">
              {escolhida.contatos.map((contato) => (
                <li key={contato.id}>
                  <button
                    type="button"
                    onClick={() => escolherContato(contato)}
                  >
                    <strong className="com-quebrar">{contato.nome}</strong>
                    <span className="com-quebrar">
                      {[contato.departamento, contato.email]
                        .filter(Boolean)
                        .join(' — ') || 'Sem e-mail no CRM'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="com-nota">
              Esta empresa não tem contato cadastrado no CRM. Preencha o contato
              e o e-mail abaixo — a finalização vai pedir um contato do Nectar.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
