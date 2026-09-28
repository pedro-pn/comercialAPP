import { useEffect, useState, type FormEvent } from 'react';
import { ApiClientError } from './api/client';
import {
  createUser, getCurrentUser, listUsers, login, logout, updateUser,
  type CommercialRole, type CommercialUser
} from './api/auth';

const roleNames: Record<CommercialRole, string> = {
  MANAGER: 'Gestor', SELLER: 'Vendedor', VIEWER: 'Consulta'
};

function errorMessage(error: unknown) {
  return error instanceof ApiClientError ? error.message : 'Não foi possível concluir a operação.';
}

export function App() {
  const [user, setUser] = useState<CommercialUser | null>(null);
  const [users, setUsers] = useState<CommercialUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [newUser, setNewUser] = useState({
    username: '', name: '', password: '', role: 'SELLER' as CommercialRole
  });

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

  useEffect(() => {
    if (user?.role !== 'MANAGER') return;
    listUsers().then(setUsers).catch((requestError: unknown) => setError(errorMessage(requestError)));
  }, [user?.id, user?.role]);

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
      setUsers([]);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally { setBusy(false); }
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await createUser(newUser);
      setUsers(await listUsers());
      setNewUser({ username: '', name: '', password: '', role: 'SELLER' });
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally { setBusy(false); }
  }

  async function changeUser(id: string, input: {
    role?: CommercialRole; isActive?: boolean; password?: string;
  }) {
    setBusy(true);
    setError('');
    try {
      await updateUser(id, input);
      if (id === user?.id && input.password) {
        setUser(null);
        setUsers([]);
      } else {
        setUsers(await listUsers());
      }
      return true;
    } catch (requestError) {
      setError(errorMessage(requestError));
      return false;
    } finally { setBusy(false); }
  }

  return (
    <main className="shell">
      <div className="brand">Filtrovali · Comercial</div>
      <section className="card">
        {loading ? <p role="status">Verificando acesso…</p> : user ? (
          <>
            <div className="card-heading">
              <div>
                <p className="eyebrow">Acesso local</p>
                <h1>Olá, {user.name}</h1>
                <p>Perfil: {roleNames[user.role]}</p>
              </div>
              <button type="button" className="button-secondary" onClick={handleLogout} disabled={busy}>
                Sair
              </button>
            </div>
            <p className="notice">As telas de propostas ainda estão em integração com o banco e o CRM.</p>
            {user.role === 'MANAGER' && (
              <section className="access-section" aria-labelledby="access-title">
                <h2 id="access-title">Acessos do Comercial</h2>
                <ul className="user-list">
                  {users.map(entry => (
                    <li key={entry.id} className="user-row">
                      <div>
                        <strong>{entry.name}</strong>
                        <span>{entry.username} · {entry.isActive ? 'Ativo' : 'Inativo'}</span>
                      </div>
                      <div className="user-actions">
                        <label>
                          <span className="sr-only">Papel de {entry.name}</span>
                          <select value={entry.role} disabled={busy || !entry.isActive || entry.id === user.id}
                            onChange={event => changeUser(entry.id, { role: event.target.value as CommercialRole })}>
                            {Object.entries(roleNames).map(([value, label]) =>
                              <option key={value} value={value}>{label}</option>)}
                          </select>
                        </label>
                        <button type="button" className="button-secondary" disabled={busy || entry.id === user.id}
                          onClick={() => changeUser(entry.id, { isActive: !entry.isActive })}>
                          {entry.isActive ? 'Desativar' : 'Ativar'}
                        </button>
                        <button type="button" className="button-secondary" disabled={busy}
                          onClick={() => {
                            setResetUserId(resetUserId === entry.id ? null : entry.id);
                            setResetPassword('');
                          }}>
                          Redefinir senha
                        </button>
                      </div>
                      {resetUserId === entry.id && (
                        <form className="reset-form" onSubmit={event => {
                          event.preventDefault();
                          void changeUser(entry.id, { password: resetPassword }).then(success => {
                            if (success) {
                              setResetUserId(null);
                              setResetPassword('');
                            }
                          });
                        }}>
                          <label>Nova senha de {entry.name}
                            <input type="password" required minLength={12} maxLength={256}
                              autoComplete="new-password" value={resetPassword}
                              onChange={event => setResetPassword(event.target.value)} />
                          </label>
                          <button type="submit" disabled={busy}>Salvar senha</button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
                <h3>Criar acesso</h3>
                <form onSubmit={handleCreateUser} className="access-form">
                  <label>Nome<input required minLength={2} maxLength={120} value={newUser.name}
                    onChange={event => setNewUser({ ...newUser, name: event.target.value })} /></label>
                  <label>Usuário<input required minLength={3} maxLength={50} autoCapitalize="none"
                    value={newUser.username}
                    onChange={event => setNewUser({ ...newUser, username: event.target.value })} /></label>
                  <label>Senha inicial<input required type="password" minLength={12} maxLength={256}
                    autoComplete="new-password" value={newUser.password}
                    onChange={event => setNewUser({ ...newUser, password: event.target.value })} /></label>
                  <label>Papel<select value={newUser.role}
                    onChange={event => setNewUser({ ...newUser, role: event.target.value as CommercialRole })}>
                    {Object.entries(roleNames).map(([value, label]) =>
                      <option key={value} value={value}>{label}</option>)}
                  </select></label>
                  <button type="submit" disabled={busy}>Criar usuário</button>
                </form>
              </section>
            )}
          </>
        ) : (
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
