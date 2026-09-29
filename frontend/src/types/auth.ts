// Formato usado pelas telas portadas, preenchido a partir da sessão local.
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
