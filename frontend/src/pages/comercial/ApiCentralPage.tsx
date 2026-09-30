import { useEffect, useState, type FormEvent } from 'react';
import { ApiClientError } from '../../api/client';
import { createApiCredential, listApiCredentials, previewCrmEvent, revokeApiCredential,
  type ApiCredential, type CrmEventPreview } from '../../api/apiCredentials';
import { moduleRoutePath } from '../../modules/registry';
import { ComercialChrome } from './components/ComercialChrome';

function exampleEvent() {
  return JSON.stringify({
    contractVersion: 1,
    eventId: crypto.randomUUID(),
    proposalCode: 'CODIGO-DA-PROPOSTA',
    revisionNumber: 0,
    opportunityId: 'ID-DA-OPORTUNIDADE-PRISMA',
    approvalStatus: 'APPROVED',
    projectId: 'ID-DO-PROJETO',
    occurredAt: new Date().toISOString()
  }, null, 2);
}

function errorMessage(error: unknown) {
  return error instanceof ApiClientError ? error.message : 'Não foi possível concluir a operação.';
}

function dateLabel(value: string | null) {
  return value ? new Date(value).toLocaleString('pt-BR') : '—';
}

function isActive(item: ApiCredential) {
  return !item.revokedAt && new Date(item.expiresAt).getTime() > Date.now();
}

export function ApiCentralPage() {
  const eventUrl = new URL('/api/integrations/crm/events', window.location.origin).href;
  const curlExample = [
    `curl -X POST '${eventUrl}' \\`,
    '  -H "Authorization: Bearer $PRISMA_CRM_TOKEN" \\',
    '  -H "Content-Type: application/json" \\',
    '  --data @evento.json'
  ].join('\n');
  const [items, setItems] = useState<ApiCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('CRM Prisma');
  const [expiresInDays, setExpiresInDays] = useState(90);
  const [issued, setIssued] = useState<{ token: string; credential: ApiCredential } | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [eventText, setEventText] = useState(exampleEvent);
  const [preview, setPreview] = useState<CrmEventPreview | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    listApiCredentials()
      .then(result => {
        if (!active) return;
        setItems(result);
        setSelectedId(result.find(isActive)?.id || '');
      })
      .catch(cause => { if (active) setError(errorMessage(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (issued) {
      setError('Guarde ou oculte o token exibido antes de criar outro.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await createApiCredential({ name: name.trim(), expiresInDays });
      setIssued(result);
      setItems(previous => [result.credential, ...previous]);
      setSelectedId(result.credential.id);
      setName('');
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  async function handleRevoke(id: string) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const updated = await revokeApiCredential(id);
      setItems(previous => previous.map(item => item.id === id ? updated : item));
      if (issued?.credential.id === id) setIssued(null);
      if (selectedId === id) setSelectedId('');
      setRevokeId(null);
      setMessage('Token revogado. Chamadas futuras com ele serão recusadas.');
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  async function handlePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setPreview(null);
    try {
      const parsed: unknown = JSON.parse(eventText);
      setPreview(await previewCrmEvent(selectedId, parsed));
    } catch (cause) {
      setError(cause instanceof SyntaxError ? 'O JSON do evento é inválido.' : errorMessage(cause));
    } finally { setBusy(false); }
  }

  async function copyToken() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.token);
      setError('');
      setMessage('Token copiado. Guarde-o no cofre de segredos.');
    } catch {
      setError('Não foi possível copiar automaticamente. Selecione e copie o token exibido.');
    }
  }

  const activeItems = items.filter(isActive);

  return <ComercialChrome
    voltarPara={moduleRoutePath('comercial', 'index')}
    eyebrow="FILTROVALI / ADMINISTRAÇÃO"
    titulo="Central de API"
    descricao="Credenciais e contrato para receber eventos do CRM Prisma."
    variante="proposta"
  >
    <div className="com-api-page">
      {error && <p className="com-recado com-recado-erro" role="alert">{error}</p>}
      {message && <p className="com-recado" role="status">{message}</p>}

      <div className="com-api-grid">
        <section className="com-painel" aria-labelledby="api-create-title">
          <div className="com-secao-titulo"><div>
            <h2 id="api-create-title">Gerar token</h2>
            <p>Permissão: enviar aprovação ou rejeição de propostas pelo CRM.</p>
          </div></div>
          <form className="com-api-form" onSubmit={handleCreate}>
            <label className="com-access-field">Nome da integração
              <input required minLength={3} maxLength={100} value={name}
                onChange={event => setName(event.target.value)} placeholder="CRM Prisma" />
            </label>
            <label className="com-access-field">Validade
              <select value={expiresInDays} onChange={event => setExpiresInDays(Number(event.target.value))}>
                <option value={30}>30 dias</option>
                <option value={90}>90 dias</option>
                <option value={180}>180 dias</option>
                <option value={365}>365 dias</option>
              </select>
            </label>
            <button className="com-btn com-btn-primario" disabled={busy || Boolean(issued)} type="submit">
              {busy ? 'Gerando…' : 'Gerar token'}
            </button>
          </form>
          {issued && <div className="com-api-secret" role="region" aria-label="Token recém-criado">
            <strong>Exibição única: guarde o token agora</strong>
            <p>Depois de fechar esta área, o valor não poderá ser recuperado.</p>
            <code tabIndex={0}>{issued.token}</code>
            <div className="com-api-actions">
              <button type="button" className="com-btn com-btn-primario" onClick={() => void copyToken()}>Copiar token</button>
              <button type="button" className="com-btn com-btn-fantasma" onClick={() => setIssued(null)}>Concluí, ocultar</button>
            </div>
          </div>}
        </section>

        <section className="com-painel" aria-labelledby="api-contract-title">
          <div className="com-secao-titulo"><div>
            <h2 id="api-contract-title">Contrato do CRM</h2>
            <p>O token funciona somente neste endpoint de escrita.</p>
          </div></div>
          <p><strong>POST</strong> <code className="com-api-url">{eventUrl}</code></p>
          <p><code>Authorization: Bearer &lt;token&gt;</code><br /><code>Content-Type: application/json</code></p>
          <p>Corpo v1: <code>eventId</code> UUID, código e revisão da proposta, ID da oportunidade no Prisma,
            <code> approvalStatus</code> (<code>APPROVED</code> ou <code>REJECTED</code>),
            <code> occurredAt</code> ISO 8601 e <code>projectId</code> quando houver.</p>
          <p>Eventos novos retornam HTTP 202; reenvios idênticos retornam 200.
            Propostas inexistentes ou não finalizadas são recusadas.</p>
          <pre className="com-api-example"><code>{curlExample}</code></pre>
        </section>
      </div>

      <section className="com-painel" aria-labelledby="api-tokens-title">
        <div className="com-secao-titulo"><div>
          <h2 id="api-tokens-title">Tokens emitidos</h2>
          <p>O segredo não aparece novamente. Crie outro token antes de revogar o anterior para fazer uma troca.</p>
        </div></div>
        {loading ? <p role="status">Carregando tokens…</p> : items.length === 0 ?
          <p>Nenhum token criado.</p> : <div className="com-api-token-list">
            {items.map(item => <article key={item.id} className="com-api-token">
              <div>
                <h3>{item.name}</h3>
                <p><code>{item.tokenPrefix}_…{item.tokenLastFour}</code></p>
                <p>Emitido em {dateLabel(item.createdAt)}{item.createdByName ? ` por ${item.createdByName}` : ''}
                  {' · '}Vence em {dateLabel(item.expiresAt)} · Usos: {item.useCount}</p>
                <p>Último uso: {dateLabel(item.lastUsedAt)}</p>
                {item.revokedAt && <p>Revogado em {dateLabel(item.revokedAt)}
                  {item.revokedByName ? ` por ${item.revokedByName}` : ''}</p>}
              </div>
              <div className="com-api-token-side">
                <span className={isActive(item) ? 'com-api-active' : 'com-api-inactive'}>
                  {item.revokedAt ? 'Revogado' : isActive(item) ? 'Ativo' : 'Expirado'}
                </span>
                {isActive(item) && (revokeId === item.id ? <div className="com-api-actions">
                  <button type="button" className="com-btn com-btn-primario" disabled={busy}
                    onClick={() => void handleRevoke(item.id)}>Confirmar revogação</button>
                  <button type="button" className="com-btn com-btn-fantasma" onClick={() => setRevokeId(null)}>Cancelar</button>
                </div> : <button type="button" className="com-btn com-btn-fantasma"
                  onClick={() => setRevokeId(item.id)}>Revogar</button>)}
              </div>
            </article>)}
          </div>}
      </section>

      <section className="com-painel" aria-labelledby="api-playground-title">
        <div className="com-secao-titulo"><div>
          <h2 id="api-playground-title">Testar contrato</h2>
          <p>Valida formato, token selecionado e situação da proposta sem registrar o evento.</p>
        </div></div>
        <form className="com-api-form" onSubmit={handlePreview}>
          <label className="com-access-field">Token
            <select required value={selectedId} onChange={event => { setSelectedId(event.target.value); setPreview(null); }}>
              <option value="">Selecione um token ativo</option>
              {activeItems.map(item => <option value={item.id} key={item.id}>{item.name} · {item.tokenPrefix}_…</option>)}
            </select>
          </label>
          <label className="com-access-field">Evento JSON
            <textarea rows={13} value={eventText} spellCheck={false}
              onChange={event => { setEventText(event.target.value); setPreview(null); }} />
          </label>
          <button type="submit" className="com-btn com-btn-primario" disabled={busy || !selectedId}>
            {busy ? 'Validando…' : 'Validar sem enviar'}
          </button>
        </form>
        {preview && <p className="com-api-result" role="status">
          Contrato válido para proposta {preview.proposalCode} revisão {preview.revisionNumber}.
          {preview.duplicate ? ' Evento já registrado.' : ' Nenhum dado foi alterado.'}
        </p>}
      </section>
    </div>
  </ComercialChrome>;
}
