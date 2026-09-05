'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useTableContext } from '@/context/TableContext';
import { useAuthContext } from '@/context/AuthContext';
import { openDocumentEditorDialog } from '@/components/document-editor/DocumentEditorDialog';

export default function DocumentsPage() {
  const router = useRouter();
  const { projectId } = useParams();
  const searchParams = useSearchParams();
  const tableIdParam = searchParams.get('tableId');
  const currentTableCtx = useTableContext();
  const authCtx = useAuthContext();
  const [mounted, setMounted] = useState(false);
  const openedRef = useRef(false);

  useEffect(() => setMounted(true), []);

  const effectiveTableId = tableIdParam ?? currentTableCtx.id;
  const tableFields = currentTableCtx.table?.fields ?? [];

  useEffect(() => {
    if (!mounted || !authCtx.state.authenticated) return;
    if (!tableIdParam && currentTableCtx.initialized && !currentTableCtx.id) {
      router.replace(`/dashboard/${projectId}`);
      return;
    }
  }, [mounted, authCtx.state.authenticated, tableIdParam, currentTableCtx.initialized, currentTableCtx.id, projectId, router]);

  useEffect(() => {
    if (!mounted || !authCtx.state.authenticated || openedRef.current) return;
    if (!projectId || effectiveTableId == null) return;
    openedRef.current = true;
    openDocumentEditorDialog({
      projectId: String(projectId),
      tableId: effectiveTableId,
      tableFields,
      record: null,
    });
  }, [mounted, authCtx.state.authenticated, projectId, effectiveTableId, tableFields]);

  if (!authCtx.state.initialized || !authCtx.state.authenticated) {
    return null;
  }

  if (!effectiveTableId && currentTableCtx.initialized) {
    return null;
  }

  return (
    <div className='flex flex-col h-screen w-full items-center justify-center' style={{ backgroundColor: '#F3F4F6' }}>
      <p className='text-muted-foreground text-sm'>Opening document editor…</p>
    </div>
  );
}
