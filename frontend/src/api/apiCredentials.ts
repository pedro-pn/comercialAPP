import { apiClient } from './client';

export interface ApiCredential {
  id: string;
  name: string;
  tokenPrefix: string;
  tokenLastFour: string;
  scopeCode: string;
  createdByUserId: string;
  createdByName: string | null;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revokedByUserId: string | null;
  revokedByName: string | null;
  lastUsedAt: string | null;
  useCount: number;
}

export interface CrmEventPreview {
  valid: boolean;
  duplicate: boolean;
  proposalCode: string;
  revisionNumber: number;
  approvalStatus: 'APPROVED' | 'REJECTED';
  wouldAttemptDelivery: boolean;
}

export async function listApiCredentials() {
  const { data } = await apiClient.get<{ items: ApiCredential[] }>('/admin/api-credentials');
  return data.items;
}

export async function createApiCredential(input: { name: string; expiresInDays: number | null }) {
  const { data } = await apiClient.post<{ credential: ApiCredential; token: string }>(
    '/admin/api-credentials', input
  );
  return data;
}

export async function revokeApiCredential(id: string) {
  const { data } = await apiClient.post<{ credential: ApiCredential }>(
    `/admin/api-credentials/${encodeURIComponent(id)}/revoke`
  );
  return data.credential;
}

export async function previewCrmEvent(id: string, event: unknown) {
  const { data } = await apiClient.post<CrmEventPreview>(
    `/admin/api-credentials/${encodeURIComponent(id)}/preview`, event
  );
  return data;
}
