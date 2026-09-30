import { apiClient } from './client';

export type CommercialRole = 'ADMIN' | 'MANAGER' | 'SELLER' | 'VIEWER';

export interface CommercialUser {
  id: string;
  username: string;
  name: string;
  role: CommercialRole;
  isActive: boolean;
}

export async function getCurrentUser() {
  const { data } = await apiClient.get<{ user: CommercialUser }>('/auth/me', {
    timeout: 10_000
  });
  return data.user;
}

export async function getAuthProviders() {
  const { data } = await apiClient.get<{ microsoft: boolean }>('/auth/providers');
  return data;
}

export async function login(username: string, password: string) {
  const { data } = await apiClient.post<{ user: CommercialUser }>('/auth/login', { username, password });
  return data.user;
}

export async function logout() {
  await apiClient.post('/auth/logout');
}

export async function listUsers() {
  const { data } = await apiClient.get<{ users: CommercialUser[] }>('/users');
  return data.users;
}

export async function createUser(input: {
  username: string; name: string; password: string; role: CommercialRole;
}) {
  const { data } = await apiClient.post<{ user: CommercialUser }>('/users', input);
  return data.user;
}

export async function updateUser(id: string, input: {
  role?: CommercialRole; isActive?: boolean; password?: string;
}) {
  const { data } = await apiClient.patch<{ user: CommercialUser }>(`/users/${id}`, input);
  return data.user;
}
