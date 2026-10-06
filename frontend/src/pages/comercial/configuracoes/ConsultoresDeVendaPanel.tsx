import { useEffect, useState, type FormEvent } from 'react';
import { cadastrarConsultor, listarConsultores, mensagemDeErro,
  type Consultor } from '../../../api/comercial';
import { Field } from '../components/Field';

export function ConsultoresDeVendaPanel() {
  const [consultores, setConsultores] = useState<Consultor[]>([]);
  const [nome, setNome] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [erroNome, setErroNome] = useState('');
  const [recado, setRecado] = useState('');

  useEffect(() => {
    let ativo = true;
    listarConsultores()
      .then(resposta => { if (ativo) setConsultores(resposta.items); })
      .catch(error => {
        if (ativo) setErro(mensagemDeErro(error, 'Não foi possível carregar os consultores.'));
      })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, []);

  async function cadastrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (salvando || carregando) return;
    const completo = nome.trim().replace(/\s+/g, ' ');
    setErro('');
    setRecado('');
    if (completo.split(' ').length < 2) {
      setErroNome('Informe o nome completo do consultor.');
      return;
    }
    setErroNome('');
    setSalvando(true);
    try {
      const consultor = await cadastrarConsultor(completo);
      setConsultores(atuais => [...atuais, consultor]
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
      setNome('');
      setRecado('Consultor cadastrado e disponível nas propostas.');
    } catch (error) {
      setErro(mensagemDeErro(error, 'Não foi possível cadastrar o consultor.'));
    } finally {
      setSalvando(false);
    }
  }

  return <section className="com-painel" aria-labelledby="com-consultores-titulo">
    <h2 id="com-consultores-titulo">Consultores de venda</h2>
    <p>Cadastre o nome completo para disponibilizar o consultor no campo da proposta.</p>
    <form onSubmit={evento => void cadastrar(evento)}>
      <Field label="Nome completo" required value={nome} maxLength={200}
        disabled={salvando || carregando} error={erroNome}
        onChange={valor => { setNome(valor); setErroNome(''); setErro(''); setRecado(''); }} />
      <div className="com-oferta-acoes">
        <button type="submit" className="com-btn com-btn-primario"
          disabled={salvando || carregando || !nome.trim()}>
          {salvando ? 'Cadastrando...' : 'Cadastrar consultor'}
        </button>
      </div>
    </form>
    {carregando ? <p>Carregando consultores…</p> : consultores.length > 0 ? <>
      <h3>Consultores disponíveis nas propostas</h3>
      <ul>{consultores.map(consultor => <li key={consultor.id}>{consultor.nome}</li>)}</ul>
    </> : <p>Nenhum consultor cadastrado.</p>}
    {recado && <p className="com-recado" role="status">{recado}</p>}
    {erro && <p className="com-recado com-recado-erro" role="alert">{erro}</p>}
  </section>;
}
