'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UserLocalStorage } from '@/lib/userLocalStorage';

/** edit-projects is replaced by Dashboard; redirect to dashboard. */
export default function EditProjectsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    UserLocalStorage.preferDashboardHome();
    router.replace('/dashboard');
  }, [router]);
  return null;
}
