// Contrato mínimo para compilar as telas extraídas. A autenticação própria
// substituirá este adaptador antes de ativar as rotas comerciais.
export interface AuthUser {
  id: string;
  name: string;
  accountType: 'ADMIN' | 'INTERNAL';
  moduleRoles: string[];
}

export interface LoginPayload {
  username: string;
  password: string;
}
