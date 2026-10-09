import { useEffect, useRef, useState } from 'react';
import { listarLiberacoesPrisma, mensagemDeErro, type LiberacaoPrisma } from '../../../api/comercial';
import { BotaoFecharDialogo } from '../components/FecharDialogo';

export function VincularPrismaDialog({ codigo, cliente, cnpj, onVincular, onFechar }: {
  codigo: string;
  cliente: string;
  cnpj: string;
  onVincular: (liberacao: LiberacaoPrisma) => Promise<void>;
  onFechar: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [items, setItems] = useState<LiberacaoPrisma[]>([]);
  const [selecionada, setSelecionada] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [consulta, setConsulta] = useState(0);
  const taxId = cnpj.replace(/\D/g, '');
  const cnpjVazio = !cnpj.trim();
  const cnpjCompleto = taxId.length === 14;
  const podeConsultar = cnpjVazio || cnpjCompleto;
  const negocio = items.find(item => item.id === selecionada);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { dialog?.close(); };
  }, []);

  useEffect(() => {
    let live = true;
    setItems([]);
    setSelecionada('');
    setErro('');
    setCarregando(podeConsultar);
    if (podeConsultar) listarLiberacoesPrisma(cnpjCompleto ? taxId : undefined)
      .then(items => { if (live) setItems(items); })
      .catch(error => { if (live) setErro(mensagemDeErro(error, 'Não foi possível consultar os negócios do Prisma.')); })
      .finally(() => { if (live) setCarregando(false); });
    return () => { live = false; };
  }, [taxId, cnpjCompleto, podeConsultar, consulta]);

  function fechar() {
    if (!salvando) onFechar();
  }

  async function confirmar() {
    if (!negocio || salvando) return;
    setSalvando(true);
    setErro('');
    try {
      await onVincular(negocio);
    } catch (error) {
      setErro(mensagemDeErro(error, 'Não foi possível vincular a proposta ao Prisma.'));
      setSalvando(false);
    }
  }

  return <dialog ref={dialogRef} className="com-painel com-modo-card com-prisma-vinculo-dialog"
    aria-labelledby="com-prisma-vinculo-titulo" aria-describedby="com-prisma-vinculo-descricao"
    aria-busy={carregando || salvando}
    onCancel={event => { event.preventDefault(); fechar(); }}>
    <BotaoFecharDialogo fechar={fechar} rotulo="Cancelar vínculo com o Prisma" />
    <span className="com-eyebrow">PRISMA CRM</span>
    <h1 id="com-prisma-vinculo-titulo">Vincular proposta {codigo}</h1>
    <p id="com-prisma-vinculo-descricao">
      {cliente ? <>Escolha um negócio liberado para <strong>{cliente}</strong>.</>
        : 'Escolha o negócio liberado que corresponde a esta proposta.'}
      {' '}O número, a revisão e o conteúdo da proposta serão mantidos.
    </p>
    <p>As edições pendentes serão salvas antes de confirmar o vínculo.</p>
    {cnpjVazio && <p>{!cliente.trim() ? 'O nome do cliente e o CNPJ serão preenchidos'
      : 'O CNPJ será preenchido'} com os dados do negócio selecionado. Confira o cliente antes de confirmar.</p>}
    {!podeConsultar && <p role="alert">Complete ou corrija o CNPJ na etapa Cliente antes de vincular ao Prisma.</p>}
    {carregando && <p role="status">Carregando negócios liberados…</p>}
    {!carregando && podeConsultar && !items.length && !erro &&
      <p>{cnpjCompleto ? 'Nenhum negócio ativo liberado para o CNPJ desta proposta.'
        : 'Nenhum negócio ativo liberado pelo Prisma.'} Confira a liberação no Prisma.</p>}
    {items.length > 0 && <div className="field-group">
      <label htmlFor="com-prisma-negocio">Negócio liberado pelo Prisma</label>
      <select id="com-prisma-negocio" value={selecionada} disabled={carregando || salvando}
        onChange={event => setSelecionada(event.target.value)}>
        <option value="">Selecione o negócio</option>
        {items.map(item => <option key={item.id} value={item.id}>
          {item.snapshot.legalName} · {item.snapshot.description} · {item.snapshot.site}
        </option>)}
      </select>
    </div>}
    {negocio && <div className="com-prisma-vinculo-detalhes">
      <p><strong>Cliente:</strong> {negocio.snapshot.legalName} · CNPJ {negocio.snapshot.taxId}</p>
      <p><strong>Local:</strong> {negocio.snapshot.site}</p>
      <p><strong>Serviço:</strong> {negocio.snapshot.description}</p>
      <p><strong>Contato:</strong> {negocio.snapshot.contactName}</p>
    </div>}
    {erro && <p className="com-recado com-recado-erro" role="alert">{erro}</p>}
    <div className="com-conflito-acoes">
      <button type="button" className="com-btn com-btn-fantasma" disabled={salvando}
        onClick={fechar}>Cancelar</button>
      <button type="button" className="com-btn com-btn-fantasma"
        disabled={carregando || salvando || !podeConsultar}
        onClick={() => setConsulta(atual => atual + 1)}>Atualizar negócios</button>
      <button type="button" className="com-btn com-btn-primario"
        disabled={!negocio || carregando || salvando} onClick={() => void confirmar()}>
        {salvando ? 'Vinculando…' : 'Confirmar vínculo'}
      </button>
    </div>
  </dialog>;
}
