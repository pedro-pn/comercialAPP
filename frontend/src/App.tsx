import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { ApiClientError } from './api/client';
import { AuthContext } from './auth/AuthContext';
import { getCurrentUser, login, logout, type CommercialUser } from './api/auth';
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
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
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
      setUser(await login(username, password));
      setPassword('');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally { setBusy(false); }
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
    accountType: user.role === 'MANAGER' ? 'ADMIN' : 'INTERNAL',
    moduleRoles: user.role === 'MANAGER' ? ['comercial:manager'] :
      user.role === 'SELLER' ? ['comercial:seller'] : []
  };

  if (!loading && user && (location.pathname === '/' ||
    location.pathname === '/custos' || location.pathname === '/propostas' ||
    location.pathname === '/configuracoes')) {
    if (user.role === 'VIEWER' && location.pathname !== '/') return <Navigate to="/" replace />;
    if (location.pathname === '/configuracoes' && user.role !== 'MANAGER') {
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

  if (!loading && user && location.pathname === '/historico') {
    return <HistoricoRascunhosPage user={user} onLogout={handleLogout} />;
  }

  if (!loading && user && (location.pathname !== '/acessos' || user.role !== 'MANAGER')) {
    return <Navigate to="/" replace />;
  }

  if (!loading && user) {
    return <AuthContext.Provider value={{ user: contextUser!, logout: handleLogout }}>
      <AcessosPage user={user} onSelfPasswordChanged={() => setUser(null)} />
    </AuthContext.Provider>;
  }

  return (
    <main className="shell">
      <div className="brand">Filtrovali · Comercial</div>
      <section className="card">
        {loading ? <p role="status">Verificando acesso…</p> : (
          <>
            <p className="eyebrow">Acesso local</p>
            <h1>Entrar no Comercial</h1>
            <form onSubmit={handleLogin} className="login-form">
              <label>Usuário<input required autoComplete="username" autoCapitalize="none" value={username}
                onChange={event => setUsername(event.target.value)} /></label>
              <label>Senha<input required type="password" autoComplete="current-password" value={password}
                onChange={event => setPassword(event.target.value)} /></label>
              <button type="submit" disabled={busy}>Entrar</button>
            </form>
          </>
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </section>
    </main>
  );
}
