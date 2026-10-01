import { useEffect, useState, type FormEvent } from 'react';

import { ApiClientError } from '../../api/client';
import {
  alterarNumeracaoInicial,
  configurarNumeracaoInicial,
  obterEstadoDaNumeracao,
  type EstadoDaNumeracao
} from '../../api/comercial';
import { NumberingConfirmationDialog } from './components/NumberingConfirmationDialog';

export function NumberingSetup({ isAdmin }: { isAdmin: boolean }) {
  const [estado, setEstado] = useState<EstadoDaNumeracao | null>(null);
  const [numero, setNumero] = useState('');
  const [conferido, setConferido] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [recado, setRecado] = useState('');
  const [confirmacao, setConfirmacao] = useState<{ numero: number; alteracao: boolean } | null>(null);

  useEffect(() => {
    let ativo = true;
    obterEstadoDaNumeracao()
      .then(resposta => { if (ativo) setEstado(resposta); })
      .catch(error => {
        if (ativo) setErro(error instanceof ApiClientError ? error.message : 'Falha ao consultar a numeração.');
      })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, []);

  function pedirConfirmacao(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const initialNumber = Number(numero);
    if (!estado || salvando || confirmacao || (estado.seeded && !isAdmin) || !conferido ||
        !Number.isInteger(initialNumber) || initialNumber < 1 || initialNumber > 2_147_483_646) return;
    setErro('');
    setRecado('');
    setConfirmacao({ numero: initialNumber, alteracao: estado.seeded });
  }

  function cancelar() {
    if (!salvando) {
      setConfirmacao(null);
      setErro('');
    }
  }

  async function configurar() {
    if (!confirmacao || salvando) return;

    setSalvando(true);
    setErro('');
    try {
      setEstado(await (confirmacao.alteracao
        ? alterarNumeracaoInicial(confirmacao.numero)
        : configurarNumeracaoInicial(confirmacao.numero)));
      setRecado(confirmacao.alteracao ? 'Numeração alterada com sucesso.' : 'Numeração configurada com sucesso.');
      setConfirmacao(null);
      setNumero('');
      setConferido(false);
    } catch (error) {
      setErro(error instanceof ApiClientError ? error.message : 'Não foi possível configurar a numeração.');
      // Uma segunda sessão pode ter configurado o número primeiro. A nova
      // situação exige uma nova confirmação, inclusive para o administrador.
      if (error instanceof ApiClientError && error.status === 409) {
        setConfirmacao(null);
        obterEstadoDaNumeracao().then(setEstado).catch(() => {});
      }
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="com-painel com-access-numbering" aria-labelledby="numbering-title">
      <div className="com-secao-titulo"><div>
        <h2 id="numbering-title">Numeração das propostas</h2>
        <p>Sequência única usada ao reservar novos números.</p>
      </div></div>
      {carregando ? <p role="status">Consultando numeração...</p> : estado && (
        <>
          {estado.seeded && (
            <>
              <div className="com-access-numbering-values">
                <div><span>Valor inicial</span><strong>{estado.seedValue}</strong></div>
                <div><span>Próximo na sequência</span><strong>{estado.nextNumber}</strong></div>
              </div>
              <p className="com-access-hint">Ao reservar, números já reservados ou legados registrados são pulados.</p>
            </>
          )}
          {(!estado.seeded || isAdmin) ? (
            <>
              <p className="com-access-hint">{estado.seeded
                ? 'O novo valor será o ponto de partida das próximas reservas. Confira os códigos usados no CRM e no legado antes de alterar.'
                : 'Configure o primeiro número após conferir os códigos usados no CRM e no legado.'}</p>
              <form className="com-access-form" onSubmit={pedirConfirmacao}>
                <label className="com-access-field">{estado.seeded ? 'Novo número inicial' : 'Primeiro número'}
                  <input type="number" min={1} max={2_147_483_646} step={1} required
                    disabled={salvando} value={numero} onChange={event => {
                      setNumero(event.target.value);
                      setConferido(false);
                      setRecado('');
                    }} />
                </label>
                <label className="com-access-confirmation">
                  <input type="checkbox" checked={conferido} disabled={salvando}
                    onChange={event => setConferido(event.target.checked)} />
                  Conferi que este número ainda não foi usado no CRM ou no legado.
                </label>
                <button type="submit" className="com-btn com-btn-primario" disabled={salvando || !conferido}>
                  {salvando ? 'Salvando...' : estado.seeded ? 'Alterar numeração' : 'Configurar numeração'}
                </button>
              </form>
            </>
          ) : <p className="com-access-hint">Somente o administrador pode alterar a numeração inicial.</p>}
        </>
      )}
      {recado && <p className="com-recado" role="status">{recado}</p>}
      {erro && !confirmacao && <p className="com-recado com-recado-erro" role="alert">{erro}</p>}
      {confirmacao && <NumberingConfirmationDialog
        numero={confirmacao.numero}
        alteracao={confirmacao.alteracao}
        proximoNumero={estado?.nextNumber ?? null}
        salvando={salvando}
        erro={erro}
        onConfirmar={() => void configurar()}
        onCancelar={cancelar}
      />}
    </section>
  );
}
