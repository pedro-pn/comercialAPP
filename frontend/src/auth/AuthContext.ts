import { createContext, useContext } from 'react';
import type { AuthUser } from '../types/auth';

export interface AuthContextValue {
  user: AuthUser | null;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('Comercial requer autenticação própria.');
  return context;
}
