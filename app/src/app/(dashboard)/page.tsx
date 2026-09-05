'use client';

import { useEffect } from 'react';
import { useAuthContext } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { UserLocalStorage } from '@/lib/userLocalStorage';

/**
 * App entry: after login, apply start-target once, otherwise go to dashboard home.
 * Explicit /dashboard visits must NEVER be redirected away (that broke navigation).
 */
export default function Page() {
  const { state } = useAuthContext();
  const router = useRouter();

  useEffect(() => {
    if (!state.initialized) return;

    if (!state.authenticated) {
      router.replace('/login');
      return;
    }

    if (UserLocalStorage.shouldApplyStartLanding()) {
      UserLocalStorage.markStartLandingApplied();
      const target = UserLocalStorage.getStartTarget();

      if (target === 'lastUsedTable') {
        const projectId = UserLocalStorage.getProjectId();
        const tableId = UserLocalStorage.getTableId();
        if (projectId && tableId) {
          router.replace(`/dashboard/${projectId}?tableId=${tableId}`);
          return;
        }
      }

      if (target === 'project') {
        const projectId = UserLocalStorage.getStartProjectId();
        if (projectId) {
          router.replace(`/dashboard/${projectId}`);
          return;
        }
      }
    }

    router.replace('/dashboard');
  }, [state.initialized, state.authenticated, router]);

  return <></>;
}
