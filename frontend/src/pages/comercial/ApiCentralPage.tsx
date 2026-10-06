import { useEffect, useState, type FormEvent } from 'react';
import { ApiClientError } from '../../api/client';
import { createApiCredential, listApiCredentials, previewCrmEvent, revokeApiCredential,
  type ApiCredential, type CrmEventPreview } from '../../api/apiCredentials';
import { moduleRoutePath } from '../../modules/registry';
import { randomUuid } from '../../utils/randomUuid';
import { ComercialChrome } from './components/ComercialChrome';

type ExampleOutcome = 'APPROVED' | 'REJECTED';

function exampleEvent(outcome: ExampleOutcome) {
  return JSON.stringify({
    contractVersion: 1,
    eventId: randomUuid(),
    proposalCode: '1234',
    revisionNumber: 0,
    opportunityId: 'OPORTUNIDADE-123',
    approvalStatus: outcome,
    ...(outcome === 'APPROVED' ? { projectId: 'PROJETO-456' } : {}),
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
  return !item.revokedAt && (!item.expiresAt || new Date(item.expiresAt).getTime() > Date.now());
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
  const [expiresInDays, setExpiresInDays] = useState<number | null>(90);
  const [issued, setIssued] = useState<{ token: string; credential: ApiCredential } | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [eventText, setEventText] = useState(() => exampleEvent('APPROVED'));
  const [exampleOutcome, setExampleOutcome] = useState<ExampleOutcome>('APPROVED');
  const [contractExamples] = useState(() => ({
    APPROVED: exampleEvent('APPROVED'), REJECTED: exampleEvent('REJECTED')
  }));
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

  async function copyText(value: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(value);
      setError('');
      setMessage(successMessage);
    } catch {
      setError('Não foi possível copiar automaticamente. Selecione e copie o texto exibido.');
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
              <select value={expiresInDays === null ? 'never' : String(expiresInDays)}
                onChange={event => setExpiresInDays(event.target.value === 'never'
                  ? null : Number(event.target.value))}>
                <option value={30}>30 dias</option>
                <option value={90}>90 dias</option>
                <option value={180}>180 dias</option>
                <option value={365}>365 dias</option>
                <option value="never">Nunca expira</option>
              </select>
            </label>
            {expiresInDays === null && <p className="com-api-hint">O token ficará ativo até ser revogado nesta página.</p>}
            <button className="com-btn com-btn-primario" disabled={busy || Boolean(issued)} type="submit">
              {busy ? 'Gerando…' : 'Gerar token'}
            </button>
          </form>
          {issued && <div className="com-api-secret" role="region" aria-label="Token recém-criado">
            <strong>Exibição única: guarde o token agora</strong>
            <p>Depois de fechar esta área, o valor não poderá ser recuperado.</p>
            <code tabIndex={0}>{issued.token}</code>
            <div className="com-api-actions">
              <button type="button" className="com-btn com-btn-primario"
                onClick={() => void copyText(issued.token, 'Token copiado. Guarde-o no cofre de segredos.')}>
                Copiar token
              </button>
              <button type="button" className="com-btn com-btn-fantasma" onClick={() => setIssued(null)}>Concluí, ocultar</button>
            </div>
          </div>}
        </section>

        <section className="com-painel com-api-contract" aria-labelledby="api-contract-title">
          <div className="com-secao-titulo"><div>
            <h2 id="api-contract-title">Contrato do CRM</h2>
            <p>Exemplo completo para configurar o retorno de aprovação e rejeição no Prisma.</p>
          </div></div>
          <div className="com-api-contract-section">
            <h3>1. Configure a chamada no Prisma</h3>
            <div className="com-api-endpoint">
              <span className="com-api-method">POST</span>
              <code className="com-api-url">{eventUrl}</code>
              <button type="button" className="com-btn com-btn-fantasma"
                onClick={() => void copyText(eventUrl, 'URL do callback copiada.')}>Copiar URL</button>
            </div>
            <p>Envie um JSON com estes cabeçalhos. Use o token gerado acima somente no campo Authorization:</p>
            <div className="com-api-headers">
              <code>Authorization: Bearer &lt;token&gt;</code>
              <code>Content-Type: application/json</code>
            </div>
          </div>
          <div className="com-api-contract-section">
            <h3>2. Envie um evento</h3>
            <p>Escolha o resultado para ver o corpo correspondente. Troque o código, a revisão e os IDs pelos dados reais.</p>
            <div className="com-api-tabs" role="group" aria-label="Resultado do evento de exemplo">
              <button type="button" className={exampleOutcome === 'APPROVED' ? 'is-selected' : ''}
                aria-pressed={exampleOutcome === 'APPROVED'} onClick={() => setExampleOutcome('APPROVED')}>
                Aprovação
              </button>
              <button type="button" className={exampleOutcome === 'REJECTED' ? 'is-selected' : ''}
                aria-pressed={exampleOutcome === 'REJECTED'} onClick={() => setExampleOutcome('REJECTED')}>
                Rejeição
              </button>
            </div>
            <pre className="com-api-example"><code>{contractExamples[exampleOutcome]}</code></pre>
            <div className="com-api-actions">
              <button type="button" className="com-btn com-btn-fantasma"
                onClick={() => void copyText(contractExamples[exampleOutcome], 'JSON de exemplo copiado.')}>
                Copiar JSON
              </button>
              <button type="button" className="com-btn com-btn-fantasma" onClick={() => {
                setEventText(contractExamples[exampleOutcome]);
                setPreview(null);
                document.getElementById('api-playground-title')?.scrollIntoView({ behavior: 'smooth' });
              }}>Usar no teste sem gravação</button>
            </div>
            <p className="com-api-hint"><code>eventId</code> deve ser um UUID novo para cada mudança; no reenvio
              da mesma mudança, reutilize o mesmo ID e o mesmo conteúdo. A proposta precisa estar finalizada.
              O <code>opportunityId</code> deve continuar igual nos eventos seguintes. Informe
              <code> projectId</code> na aprovação quando o projeto já estiver definido; sem ele,
              a entrega ao FiltroAPP fica pendente.</p>
          </div>
          <div className="com-api-contract-section">
            <h3>3. Confira a resposta</h3>
            <div className="com-api-response-wrap"><table className="com-api-response-table">
              <thead><tr><th>HTTP</th><th>Significado</th></tr></thead>
              <tbody>
                <tr><td>202</td><td>Evento novo registrado.</td></tr>
                <tr><td>200</td><td>Mesmo evento recebido novamente, sem duplicação.</td></tr>
                <tr><td>400 / 401</td><td>JSON inválido ou token inválido, revogado ou expirado.</td></tr>
                <tr><td>404 / 409</td><td>Proposta não encontrada ou conflito com o estado já registrado.</td></tr>
              </tbody>
            </table></div>
            <p className="com-api-hint">HTTP 202 confirma o registro do evento. Se a aprovação incluir
              um projeto, confira <code>delivery.status</code> na resposta para saber o resultado
              da entrega ao FiltroAPP.</p>
            <p>Exemplo por linha de comando: salve o JSON acima como <code>evento.json</code> e
              configure <code>PRISMA_CRM_TOKEN</code> no ambiente de quem executa a chamada.</p>
            <pre className="com-api-example"><code>{curlExample}</code></pre>
            <button type="button" className="com-btn com-btn-fantasma"
              onClick={() => void copyText(curlExample, 'Comando cURL copiado.')}>Copiar cURL</button>
          </div>
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
                  {' · '}{item.expiresAt ? `Vence em ${dateLabel(item.expiresAt)}` : 'Nunca expira'}
                  {' · '}Usos: {item.useCount}</p>
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
