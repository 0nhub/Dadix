import { callApi } from '@/lib/api';

import type { MemberRole } from '@/types';

async function getProjectMembers({ projectId }: { projectId: string }) {
  return await callApi.get(`/project/${projectId}/members`);
}

async function updateProjectMemberRole({
  projectId,
  memberUserId,
  newRole,
}: {
  projectId: string;
  memberUserId: string;
  newRole: MemberRole;
}) {
  return await callApi.post(`/project/${projectId}/roles`, {
    targetUserId: memberUserId,
    role: newRole,
  });
}

async function deleteProjectMember({
  projectId,
  memberUserId,
}: {
  projectId: string;
  memberUserId: string;
}) {
  return await callApi.delete(
    `/project/${projectId}/roles?targetUserId=${memberUserId}`
  );
}

export const projectServices = {
  getProjectMembers,
  updateProjectMemberRole,
  deleteProjectMember,
};
