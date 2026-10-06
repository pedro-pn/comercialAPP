import { useEffect, useState, type FormEvent } from 'react';
import { cadastrarConsultor, editarConsultor, listarConsultores, mensagemDeErro, removerConsultor,
  type Consultor } from '../../../api/comercial';
import { Field } from '../components/Field';
import { BotaoFecharDialogo } from '../components/FecharDialogo';

export function ConsultoresDeVendaPanel() {
  const [consultores, setConsultores] = useState<Consultor[]>([]);
  const [nome, setNome] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [erroNome, setErroNome] = useState('');
  const [recado, setRecado] = useState('');
  const [emEdicao, setEmEdicao] = useState<string | null>(null);
  const [nomeEdicao, setNomeEdicao] = useState('');
  const [erroEdicao, setErroEdicao] = useState('');
  const [paraRemover, setParaRemover] = useState<Consultor | null>(null);
  const [erroRemocao, setErroRemocao] = useState('');

  useEffect(() => {
    let ativo = true;
    listarConsultores()
      .then(resposta => {
        if (ativo) setConsultores(resposta.items.filter(item => item.tipo === 'cadastro'));
      })
      .catch(error => {
        if (ativo) setErro(mensagemDeErro(error, 'Não foi possível carregar os consultores.'));
      })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, []);

  function ordenar(items: Consultor[]) {
    return items.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

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
      setConsultores(atuais => ordenar([...atuais, consultor]));
      setNome('');
      setRecado('Consultor cadastrado e disponível nas propostas.');
    } catch (error) {
      setErro(mensagemDeErro(error, 'Não foi possível cadastrar o consultor.'));
    } finally {
      setSalvando(false);
    }
  }

  function iniciarEdicao(consultor: Consultor) {
    setEmEdicao(consultor.id);
    setNomeEdicao(consultor.nome);
    setErroEdicao('');
    setErro('');
    setRecado('');
  }

  async function salvarEdicao(evento: FormEvent<HTMLFormElement>, id: string) {
    evento.preventDefault();
    if (salvando) return;
    const completo = nomeEdicao.trim().replace(/\s+/g, ' ');
    if (completo.split(' ').length < 2) {
      setErroEdicao('Informe o nome completo do consultor.');
      return;
    }
    setErroEdicao('');
    setSalvando(true);
    try {
      const consultor = await editarConsultor(id, completo);
      setConsultores(atuais => ordenar(atuais.map(item => item.id === id ? consultor : item)));
      setEmEdicao(null);
      setRecado('Nome do consultor atualizado.');
    } catch (error) {
      setErroEdicao(mensagemDeErro(error, 'Não foi possível atualizar o consultor.'));
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarRemocao() {
    if (!paraRemover || salvando) return;
    const id = paraRemover.id;
    setErroRemocao('');
    setSalvando(true);
    try {
      await removerConsultor(id);
      setConsultores(atuais => atuais.filter(item => item.id !== id));
      setParaRemover(null);
      setRecado('Consultor removido da seleção de novas propostas.');
    } catch (error) {
      setErroRemocao(mensagemDeErro(error, 'Não foi possível remover o consultor.'));
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
    {carregando ? <p>Carregando consultores…</p> : consultores.length > 0 ?
      <ul className="com-consultores-grid" aria-label="Consultores cadastrados">
        {consultores.map(consultor => <li key={consultor.id}>
          <article className="com-consultor-card" aria-label={`Consultor ${consultor.nome}`}>
            {emEdicao === consultor.id ? <form onSubmit={evento => void salvarEdicao(evento, consultor.id)}
              onKeyDown={evento => {
                if (evento.key === 'Escape' && !salvando) { evento.preventDefault(); setEmEdicao(null); }
              }}>
              <h3>Editar consultor</h3>
              <Field label="Nome completo" required value={nomeEdicao} maxLength={200}
                disabled={salvando} error={erroEdicao}
                onChange={valor => { setNomeEdicao(valor); setErroEdicao(''); }} />
              <div className="com-oferta-acoes">
                <button type="submit" className="com-btn com-btn-primario" disabled={salvando || !nomeEdicao.trim()}>
                  {salvando ? 'Salvando...' : 'Salvar nome'}
                </button>
                <button type="button" className="com-btn com-btn-fantasma" disabled={salvando}
                  onClick={() => setEmEdicao(null)}>Cancelar edição</button>
              </div>
            </form> : <>
              <h3>{consultor.nome}</h3>
              <div className="com-oferta-acoes">
                <button type="button" className="com-btn com-btn-fantasma" disabled={salvando}
                  aria-label={`Editar nome de ${consultor.nome}`} onClick={() => iniciarEdicao(consultor)}>Editar nome</button>
                <button type="button" className="com-btn com-btn-perigo" disabled={salvando}
                  aria-label={`Remover ${consultor.nome}`} onClick={() => {
                    setParaRemover(consultor); setErroRemocao(''); setErro(''); setRecado('');
                  }}>Remover</button>
              </div>
            </>}
          </article>
        </li>)}
      </ul> : <p>Nenhum consultor cadastrado.</p>}
    <p className="com-recado">Os usuários ativos do Comercial também ficam disponíveis na seleção da proposta.</p>
    {recado && <p className="com-recado" role="status">{recado}</p>}
    {erro && <p className="com-recado com-recado-erro" role="alert">{erro}</p>}
    {paraRemover && <div className="com-overlay" role="dialog" aria-modal="true"
      aria-labelledby="com-remover-consultor-titulo" aria-describedby="com-remover-consultor-descricao">
      <section className="com-painel com-modo-card">
        <BotaoFecharDialogo rotulo="Cancelar remoção" fechar={() => !salvando && setParaRemover(null)} />
        <h2 id="com-remover-consultor-titulo">Remover consultor?</h2>
        <p id="com-remover-consultor-descricao">
          <strong>{paraRemover.nome}</strong> deixará de aparecer na seleção de novas propostas.
          As propostas existentes manterão o consultor e seus documentos.
        </p>
        {erroRemocao && <p className="com-recado com-recado-erro" role="alert">{erroRemocao}</p>}
        <div className="com-oferta-acoes">
          <button type="button" className="com-btn com-btn-perigo" disabled={salvando}
            onClick={() => void confirmarRemocao()}>{salvando ? 'Removendo...' : 'Confirmar remoção'}</button>
          <button type="button" className="com-btn com-btn-fantasma" disabled={salvando}
            onClick={() => setParaRemover(null)}>Cancelar</button>
        </div>
      </section>
    </div>}
  </section>;
}
