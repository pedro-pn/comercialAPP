import { useEffect, useState, type FormEvent } from 'react';

import { ApiClientError } from '../../api/client';
import {
  createUser, listUsers, updateUser,
  type CommercialRole, type CommercialUser
} from '../../api/auth';
import { moduleRoutePath } from '../../modules/registry';
import { ComercialChrome } from './components/ComercialChrome';
import { NumberingSetup } from './NumberingSetup';

const roleNames: Record<CommercialRole, string> = {
  ADMIN: 'Administrador', MANAGER: 'Gestor', SELLER: 'Vendedor', VIEWER: 'Consulta'
};

function errorMessage(error: unknown) {
  return error instanceof ApiClientError ? error.message : 'Não foi possível concluir a operação.';
}

export function AcessosPage({ user, onSelfPasswordChanged }: {
  user: CommercialUser;
  onSelfPasswordChanged: () => void;
}) {
  const isAdmin = user.role === 'ADMIN';
  const availableRoles = Object.entries(roleNames).filter(([role]) => isAdmin || role !== 'ADMIN');
  const [users, setUsers] = useState<CommercialUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [newUser, setNewUser] = useState({
    username: '', name: '', password: '', role: 'SELLER' as CommercialRole
  });

  useEffect(() => {
    let active = true;
    listUsers()
      .then(result => { if (active) setUsers(result); })
      .catch(cause => { if (active) setError(errorMessage(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user.id]);

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await createUser(newUser);
      setUsers(await listUsers());
      setMessage(`Acesso de ${newUser.name} criado.`);
      setNewUser({ username: '', name: '', password: '', role: 'SELLER' });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally { setBusy(false); }
  }

  async function changeUser(id: string, input: {
    role?: CommercialRole; isActive?: boolean; password?: string;
  }) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await updateUser(id, input);
      if (id === user.id && input.password) {
        onSelfPasswordChanged();
      } else {
        setUsers(await listUsers());
        setMessage(input.password ? 'Senha redefinida.' : 'Acesso atualizado.');
      }
      return true;
    } catch (cause) {
      setError(errorMessage(cause));
      return false;
    } finally { setBusy(false); }
  }

  return <ComercialChrome
    voltarPara={moduleRoutePath('comercial', 'index')}
    eyebrow="FILTROVALI / COMERCIAL"
    titulo="Acessos e numeração"
    descricao="Gerencie as pessoas autorizadas e a sequência de propostas."
    variante="proposta"
  >
    {(error || message) && <div className="com-access-feedback" aria-live="polite">
      {error && <p className="com-recado com-recado-erro" role="alert">{error}</p>}
      {message && <p className="com-recado" role="status">{message}</p>}
    </div>}

    <div className="com-access-layout">
      <section className="com-painel com-access-users" aria-labelledby="access-title">
        <div className="com-secao-titulo">
          <div>
            <h2 id="access-title">Pessoas com acesso</h2>
            <p>Altere o perfil, bloqueie um acesso ou defina uma nova senha.</p>
          </div>
          {!loading && <span className="com-access-count">{users.length} {users.length === 1 ? 'conta' : 'contas'}</span>}
        </div>
        {loading ? <p role="status">Carregando acessos…</p> : users.length === 0 ? (
          <p className="com-access-empty">Nenhuma conta encontrada.</p>
        ) : <ul className="com-access-list">
          {users.map(entry => <li key={entry.id} className="com-access-user">
            <div className="com-access-user-heading">
              <div>
                <strong>{entry.name}</strong>
                <span className="com-access-username">
                  {entry.microsoftEmail ?? `@${entry.username}`}
                  {entry.microsoftEmail ? ' · Microsoft' : ''}
                  {entry.id === user.id ? ' · sua conta' : ''}
                </span>
              </div>
              <span className={`com-access-status${entry.isActive ? ' is-active' : ''}`}>
                {entry.isActive ? 'Ativo' : 'Inativo'}
              </span>
            </div>
            <div className="com-access-user-controls">
              <label className="com-access-field com-access-role">Perfil
                <select value={entry.role} disabled={busy || !entry.isActive || entry.id === user.id ||
                  !isAdmin && entry.role === 'ADMIN'}
                  onChange={event => { void changeUser(entry.id, {
                    role: event.target.value as CommercialRole
                  }); }}>
                  {(isAdmin || entry.role !== 'ADMIN' ? availableRoles : Object.entries(roleNames))
                    .map(([value, label]) =>
                    <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <button type="button" className="com-btn com-btn-fantasma"
                disabled={busy || entry.id === user.id || !isAdmin && entry.role === 'ADMIN'}
                onClick={() => { void changeUser(entry.id, { isActive: !entry.isActive }); }}>
                {entry.isActive ? 'Desativar' : 'Ativar'}
              </button>
              {entry.hasLocalPassword && <button type="button" className="com-btn com-btn-fantasma"
                disabled={busy || !isAdmin && entry.role === 'ADMIN'}
                aria-expanded={resetUserId === entry.id}
                onClick={() => {
                  setResetUserId(resetUserId === entry.id ? null : entry.id);
                  setResetPassword('');
                }}>
                {resetUserId === entry.id ? 'Cancelar' : 'Redefinir senha'}
              </button>}
            </div>
            {resetUserId === entry.id && <form className="com-access-reset" onSubmit={event => {
              event.preventDefault();
              void changeUser(entry.id, { password: resetPassword }).then(success => {
                if (success) { setResetUserId(null); setResetPassword(''); }
              });
            }}>
              <label className="com-access-field">Nova senha de {entry.name}
                <input type="password" required minLength={12} maxLength={256}
                  autoComplete="new-password" value={resetPassword}
                  onChange={event => setResetPassword(event.target.value)} />
              </label>
              <button type="submit" className="com-btn com-btn-primario" disabled={busy}>
                Salvar senha
              </button>
            </form>}
          </li>)}</ul>}
      </section>

      <div className="com-access-side">
        <NumberingSetup isAdmin={isAdmin} />
        <section className="com-painel" aria-labelledby="create-access-title">
          <div className="com-secao-titulo"><div>
            <h2 id="create-access-title">Criar acesso</h2>
            <p>O usuário receberá a senha inicial definida aqui.</p>
          </div></div>
          <form onSubmit={handleCreateUser} className="com-access-form">
            <label className="com-access-field">Nome
              <input required minLength={2} maxLength={120} autoComplete="off" value={newUser.name}
                onChange={event => setNewUser({ ...newUser, name: event.target.value })} />
            </label>
            <label className="com-access-field">Usuário
              <input required minLength={3} maxLength={50} autoCapitalize="none" autoComplete="off"
                value={newUser.username}
                onChange={event => setNewUser({ ...newUser, username: event.target.value })} />
            </label>
            <label className="com-access-field">Perfil
              <select value={newUser.role}
                onChange={event => setNewUser({ ...newUser, role: event.target.value as CommercialRole })}>
                {availableRoles.map(([value, label]) =>
                  <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="com-access-field">Senha inicial
              <input required type="password" minLength={12} maxLength={256}
                autoComplete="new-password" value={newUser.password}
                onChange={event => setNewUser({ ...newUser, password: event.target.value })} />
              <small>Mínimo de 12 caracteres.</small>
            </label>
            <button type="submit" className="com-btn com-btn-primario" disabled={busy}>
              {busy ? 'Salvando…' : 'Criar usuário'}
            </button>
          </form>
        </section>
      </div>
    </div>
  </ComercialChrome>;
}
