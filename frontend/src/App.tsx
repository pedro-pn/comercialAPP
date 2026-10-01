import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { ApiClientError } from './api/client';
import { AuthContext } from './auth/AuthContext';
import { getAuthProviders, getCurrentUser, login, logout, type CommercialUser } from './api/auth';
import { HistoricoRascunhosPage } from './pages/comercial/historico/HistoricoRascunhosPage';
import { AcessosPage } from './pages/comercial/AcessosPage';
import { ComercialPage } from './pages/comercial/ComercialPage';
import type { AuthUser } from './types/auth';

const CustosPage = lazy(() => import('./pages/comercial/custos/CustosPage')
  .then(module => ({ default: module.CustosPage })));
const PropostaPage = lazy(() => import('./pages/comercial/proposta/PropostaPage')
  .then(module => ({ default: module.PropostaPage })));
const ConfiguracoesPage = lazy(() => import('./pages/comercial/configuracoes/ConfiguracoesPage')
  .then(module => ({ default: module.ConfiguracoesPage })));
const ApiCentralPage = lazy(() => import('./pages/comercial/ApiCentralPage')
  .then(module => ({ default: module.ApiCentralPage })));
const REMEMBERED_USER_KEY = 'comercialapp-remembered-user';

function readRememberedUser() {
  try { return localStorage.getItem(REMEMBERED_USER_KEY) || ''; }
  catch { return ''; }
}

function saveRememberedUser(username: string, rememberUser: boolean) {
  try {
    if (rememberUser) localStorage.setItem(REMEMBERED_USER_KEY, username);
    else localStorage.removeItem(REMEMBERED_USER_KEY);
  } catch {
    // O login continua funcionando quando o navegador bloqueia o armazenamento local.
  }
}

function errorMessage(error: unknown) {
  return error instanceof ApiClientError ? error.message : 'Não foi possível concluir a operação.';
}

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState<CommercialUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [username, setUsername] = useState(readRememberedUser);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberUser, setRememberUser] = useState(() => Boolean(readRememberedUser()));
  const [microsoftEnabled, setMicrosoftEnabled] = useState(false);

  useEffect(() => {
    getAuthProviders().then(providers => setMicrosoftEnabled(providers.microsoft)).catch(() => {});
    getCurrentUser()
      .then(setUser)
      .catch((requestError: unknown) => {
        if (!(requestError instanceof ApiClientError && requestError.status === 401)) {
          setError('A API do Comercial não está disponível.');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const loggedInUser = await login(username, password);
      saveRememberedUser(username, rememberUser);
      setUser(loggedInUser);
      setPassword('');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setShowPassword(false);
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    setError('');
    try {
      await logout();
      setUser(null);
      navigate('/');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally { setBusy(false); }
  }

  const contextUser: AuthUser | null = user && {
    id: user.id,
    name: user.name,
    accountType: ['ADMIN', 'MANAGER'].includes(user.role) ? 'ADMIN' : 'INTERNAL',
    moduleRoles: user.role === 'ADMIN' ? ['comercial:admin', 'comercial:manager'] :
      user.role === 'MANAGER' ? ['comercial:manager'] :
      user.role === 'SELLER' ? ['comercial:seller'] : []
  };

  if (loading) {
    return <main className="auth-loading" role="status" aria-live="polite">Verificando acesso…</main>;
  }

  if (user && (location.pathname === '/' ||
    location.pathname === '/custos' || location.pathname === '/propostas' ||
    location.pathname === '/configuracoes')) {
    if (user.role === 'VIEWER' && location.pathname !== '/') return <Navigate to="/" replace />;
    if (location.pathname === '/configuracoes' && !['ADMIN', 'MANAGER'].includes(user.role)) {
      return <Navigate to="/" replace />;
    }
    return (
      <AuthContext.Provider value={{
        user: contextUser!,
        logout: handleLogout
      }}>
        {location.pathname === '/' ? <ComercialPage /> :
          <Suspense fallback={<main className="shell" role="status">Carregando Comercial...</main>}>
            {location.pathname === '/custos' ? <CustosPage somenteLevantamento /> :
              location.pathname === '/configuracoes' ? <ConfiguracoesPage /> :
                <PropostaPage somenteRascunho />}
          </Suspense>}
      </AuthContext.Provider>
    );
  }

  if (user && location.pathname === '/historico') {
    return <HistoricoRascunhosPage user={user} onLogout={handleLogout} />;
  }

  if (user && location.pathname === '/api-central') {
    if (user.role !== 'ADMIN') return <Navigate to="/" replace />;
    return <AuthContext.Provider value={{ user: contextUser!, logout: handleLogout }}>
      <Suspense fallback={<main className="shell" role="status">Carregando Central de API...</main>}>
        <ApiCentralPage />
      </Suspense>
    </AuthContext.Provider>;
  }

  if (user && (location.pathname !== '/acessos' ||
    !['ADMIN', 'MANAGER'].includes(user.role))) {
    return <Navigate to="/" replace />;
  }

  if (user) {
    return <AuthContext.Provider value={{ user: contextUser!, logout: handleLogout }}>
      <AcessosPage user={user} onSelfPasswordChanged={() => setUser(null)} />
    </AuthContext.Provider>;
  }

  return (
    <main className="login-page">
      <section className="login-layout" aria-labelledby="login-title">
        <div className="login-visual" aria-hidden="true">
          <div className="login-visual-content">
            <span className="login-visual-brand">Filtrovali</span>
            <p>Comercial</p>
          </div>
        </div>
        <div className="login-panel">
          <div className="login-panel-content">
            <img className="login-logo" src="/assets/Logo/LOGO_COLORIDO.png" alt="Filtrovali" />
            <div className="login-heading">
              <p className="login-eyebrow">Gerador de propostas</p>
              <h1 id="login-title">Bem-vindo de volta</h1>
              <p>Entre com sua conta para acessar o Comercial.</p>
            </div>
            <form onSubmit={handleLogin} className="login-form">
              <label htmlFor="login-username">Usuário</label>
              <input id="login-username" required autoComplete="username" autoCapitalize="none"
                value={username} onChange={event => setUsername(event.target.value)} />
              <label htmlFor="login-password">Senha</label>
              <div className="login-password-field">
                <input id="login-password" required type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password" value={password}
                  onChange={event => setPassword(event.target.value)} />
                <button className="login-password-toggle" type="button" disabled={busy}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  aria-pressed={showPassword} onMouseDown={event => event.preventDefault()}
                  onClick={() => setShowPassword(value => !value)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" />
                    <circle cx="12" cy="12" r="2.7" />
                    {showPassword && <path d="M3 3 21 21" />}
                  </svg>
                </button>
              </div>
              <label className="login-remember-user">
                <input type="checkbox" checked={rememberUser}
                  onChange={event => setRememberUser(event.target.checked)} />
                <span>Lembrar usuário</span>
              </label>
              <button className="login-submit" type="submit" disabled={busy}>
                {busy ? 'Entrando…' : 'Entrar'}
              </button>
            </form>
            {microsoftEnabled && (
              <a className="login-microsoft" href="/api/auth/microsoft"
                aria-label="Entrar com a Microsoft">
                <svg className="login-microsoft-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#f25022" d="M1 1h10v10H1z" />
                  <path fill="#7fba00" d="M13 1h10v10H13z" />
                  <path fill="#00a4ef" d="M1 13h10v10H1z" />
                  <path fill="#ffb900" d="M13 13h10v10H13z" />
                </svg>
                <span>Entrar com Microsoft</span>
              </a>
            )}
            {(error || location.search.includes('auth_error=microsoft')) &&
              <p className="login-error" role="alert">
                {error || 'Não foi possível entrar com a conta Microsoft. Verifique seu acesso ou tente novamente.'}
              </p>}
          </div>
        </div>
      </section>
    </main>
  );
}
