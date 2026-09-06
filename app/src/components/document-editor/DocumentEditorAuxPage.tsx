'use client';

import { useParams, useSearchParams } from 'next/navigation';

import { SidebarStateProvider } from '@/context/SidebarStateContext';
import { TableContextProvider } from '@/context/TableContext';
import { useTableContext } from '@/context/TableContext';
import { DocumentEditorScreen } from '@/components/document-editor/DocumentEditorModal';

function DocumentEditorAuxBody({ tableId }: { tableId: string }) {
  const tableCtx = useTableContext();
  return (
    <div className='dadix-project-shell flex h-full min-h-0 w-full flex-col bg-background'>
      <DocumentEditorScreen
        tableId={tableId}
        tableFields={tableCtx.table?.fields ?? []}
        record={null}
      />
    </div>
  );
}

export function DocumentEditorAuxPage() {
  const { projectId } = useParams();
  const tableId = useSearchParams().get('tableId') ?? '';
  const pid = String(projectId ?? '');
  if (!pid || !tableId) return null;
  return (
    <SidebarStateProvider projectId={pid}>
      <TableContextProvider projectId={pid} tableId={tableId}>
        <DocumentEditorAuxBody tableId={tableId} />
      </TableContextProvider>
    </SidebarStateProvider>
  );
}
