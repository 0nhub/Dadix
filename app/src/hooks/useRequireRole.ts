import { useEffect, useState } from 'react';

import { useCurrentProjectContext } from '@/context/CurrentProjectContext';
import { useDashboardContext } from '@/context/DashboardContext';

import type { MemberRole } from '@/types';

const MemberRolesByOrder: MemberRole[] = ['Viewer', 'Editor', 'Admin', 'Owner'];

export function useRequireRole(): {
  canEditRecords: boolean;
  canEditTables: boolean;
  canEditProject: boolean;
} {
  const dashboardCtx = useDashboardContext();
  const currentProjectCtx = useCurrentProjectContext();

  const [canEditRecords, setCanEditRecords] = useState<boolean>(false); // min role Editor
  const [canEditTables, setCanEditTables] = useState<boolean>(false); // min role Admin
  const [canEditProject, setCanEditProject] = useState<boolean>(false); // min role Owner

  useEffect(() => {
    if (
      !dashboardCtx.initialized ||
      !dashboardCtx.projects ||
      !dashboardCtx.sharedProjects ||
      !currentProjectCtx.id
    ) {
      denyAccess();
      return;
    }

    const projectId = `${currentProjectCtx.id}`;
    const project =
      dashboardCtx.projects.find((project) => `${project.id}` === projectId) ||
      dashboardCtx.sharedProjects.find(
        (project) => `${project.id}` === projectId
      );
    if (!project) {
      denyAccess();
      return;
    }

    const userRoleLevel = MemberRolesByOrder.indexOf(project.role);
    setCanEditRecords(userRoleLevel >= MemberRolesByOrder.indexOf('Editor'));
    setCanEditTables(userRoleLevel >= MemberRolesByOrder.indexOf('Admin'));
    setCanEditProject(userRoleLevel >= MemberRolesByOrder.indexOf('Owner'));
  }, [
    dashboardCtx.initialized,
    dashboardCtx.projects,
    dashboardCtx.sharedProjects,
    currentProjectCtx.id,
  ]);

  function denyAccess() {
    setCanEditRecords(false);
    setCanEditTables(false);
    setCanEditProject(false);
  }

  return { canEditRecords, canEditTables, canEditProject };
}
