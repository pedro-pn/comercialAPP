import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { ApiClientError } from './api/client';
import loginImageUrl from './assets/login/img_login.png';
import loginImage2Url from './assets/login/img_login2.png';
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
const LOGIN_IMAGES = [loginImageUrl, loginImage2Url];

type SessionState =
  | { status: 'checking' }
  | { status: 'authenticated'; user: CommercialUser }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

function LoadingScreen({ unavailable = false, onRetry }: {
  unavailable?: boolean;
  onRetry?: () => void;
}) {
  return <main className="auth-loading" role={unavailable ? 'alert' : 'status'} aria-live="polite">
    <div className="auth-loading-content">
      <span className="auth-loading-brand">Filtrovali</span>
      <strong>Comercial</strong>
      <p>{unavailable ? 'Não foi possível verificar seu acesso.' : 'Carregando…'}</p>
      {unavailable && <button type="button" onClick={onRetry}>Tentar novamente</button>}
    </div>
  </main>;
}

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
  const [session, setSession] = useState<SessionState>({ status: 'checking' });
  const [authAttempt, setAuthAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [username, setUsername] = useState(readRememberedUser);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberUser, setRememberUser] = useState(() => Boolean(readRememberedUser()));
  const [microsoftEnabled, setMicrosoftEnabled] = useState(false);
  const [loginImage] = useState(() => LOGIN_IMAGES[Math.floor(Math.random() * LOGIN_IMAGES.length)]);

  useEffect(() => {
    let active = true;
    getAuthProviders().then(providers => {
      if (active) setMicrosoftEnabled(providers.microsoft);
    }).catch(() => {});

    async function verifySession() {
      for (let attempt = 0; attempt < 2 && active; attempt++) {
        try {
          const user = await getCurrentUser();
          if (active) setSession({ status: 'authenticated', user });
          return;
        } catch (requestError) {
          if (!active) return;
          if (requestError instanceof ApiClientError && requestError.status === 401) {
            setSession({ status: 'unauthenticated' });
            return;
          }
          if (attempt === 0) {
            await new Promise(resolve => setTimeout(resolve, 400));
          } else {
            setSession({ status: 'unavailable' });
          }
        }
      }
    }

    void verifySession();
    return () => { active = false; };
  }, [authAttempt]);

  function retrySession() {
    setSession({ status: 'checking' });
    setAuthAttempt(attempt => attempt + 1);
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const loggedInUser = await login(username, password);
      saveRememberedUser(username, rememberUser);
      setSession({ status: 'authenticated', user: loggedInUser });
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
      setSession({ status: 'unauthenticated' });
      navigate('/');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally { setBusy(false); }
  }

  const user = session.status === 'authenticated' ? session.user : null;
  const contextUser: AuthUser | null = user && {
    id: user.id,
    name: user.name,
    accountType: ['ADMIN', 'MANAGER'].includes(user.role) ? 'ADMIN' : 'INTERNAL',
    moduleRoles: user.role === 'ADMIN' ? ['comercial:admin', 'comercial:manager'] :
      user.role === 'MANAGER' ? ['comercial:manager'] :
      user.role === 'SELLER' ? ['comercial:seller'] : []
  };

  if (session.status === 'checking') return <LoadingScreen />;
  if (session.status === 'unavailable') {
    return <LoadingScreen unavailable onRetry={retrySession} />;
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
          <Suspense fallback={<LoadingScreen />}>
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
      <Suspense fallback={<LoadingScreen />}>
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
      <AcessosPage user={user} onSelfPasswordChanged={() => setSession({ status: 'unauthenticated' })} />
    </AuthContext.Provider>;
  }

  return (
    <main className="login-page">
      <section className="login-layout" aria-labelledby="login-title">
        <div className="login-visual" aria-hidden="true">
          <img className="login-visual-image" src={loginImage} alt="" />
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
