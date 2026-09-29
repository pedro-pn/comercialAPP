import { useEffect, useState, type FormEvent } from 'react';

import { ApiClientError } from '../../api/client';
import {
  configurarNumeracaoInicial,
  obterEstadoDaNumeracao,
  type EstadoDaNumeracao
} from '../../api/comercial';

export function NumberingSetup() {
  const [estado, setEstado] = useState<EstadoDaNumeracao | null>(null);
  const [numero, setNumero] = useState('');
  const [conferido, setConferido] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

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

  async function configurar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const initialNumber = Number(numero);
    if (!conferido || !Number.isInteger(initialNumber) || initialNumber < 1 ||
        initialNumber > 2_147_483_646) return;

    setSalvando(true);
    setErro('');
    try {
      setEstado(await configurarNumeracaoInicial(initialNumber));
      setNumero('');
      setConferido(false);
    } catch (error) {
      setErro(error instanceof ApiClientError ? error.message : 'Não foi possível configurar a numeração.');
      // Uma segunda sessão pode ter configurado o número primeiro.
      obterEstadoDaNumeracao().then(setEstado).catch(() => {});
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
      {carregando ? <p role="status">Consultando numeração...</p> : estado?.seeded ? (
        <div className="com-access-numbering-values">
          <div><span>Valor inicial</span><strong>{estado.seedValue}</strong></div>
          <div><span>Próximo número</span><strong>{estado.nextNumber}</strong></div>
        </div>
      ) : (
        <>
          <p className="com-access-hint">Configure uma única vez, após conferir os códigos usados no CRM e no legado.</p>
          <form className="com-access-form" onSubmit={configurar}>
            <label className="com-access-field">Primeiro número
              <input type="number" min={1} max={2_147_483_646} step={1} required
                value={numero} onChange={event => setNumero(event.target.value)} />
            </label>
            <label className="com-access-confirmation">
              <input type="checkbox" checked={conferido}
                onChange={event => setConferido(event.target.checked)} />
              Conferi que este número ainda não foi usado no CRM ou no legado.
            </label>
            <button type="submit" className="com-btn com-btn-primario" disabled={salvando || !conferido}>
              {salvando ? 'Configurando...' : 'Configurar numeração'}
            </button>
          </form>
        </>
      )}
      {erro && <p className="com-recado com-recado-erro" role="alert">{erro}</p>}
    </section>
  );
}
