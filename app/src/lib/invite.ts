import { callApi } from '@/lib/api';

export type InviteRole = 'VIEWER' | 'EDITOR' | 'ADMIN' | 'OWNER';

async function listInvites(projectId: string) {
  return await callApi.get(`/project/${projectId}/invites`);
}

async function createInvite(
  projectId: string,
  params: {
    role: InviteRole;
    email?: string | null;
    expiresAt?: string | null;
  }
) {
  return await callApi.post(`/project/${projectId}/invites`, params);
}

async function revokeInvite(projectId: string, inviteId: string | number) {
  return await callApi.delete(`/project/${projectId}/invites/${inviteId}`);
}

async function getInvite(token: string) {
  return await callApi.get(`/project/invite/${token}`);
}

async function acceptInvite(token: string) {
  return await callApi.post(`/project/invite/${token}/accept`);
}

export const inviteService = {
  listInvites,
  createInvite,
  revokeInvite,
  getInvite,
  acceptInvite,
};
