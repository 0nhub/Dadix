'use client';

import { useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

import { SidebarStateProvider } from '@/context/SidebarStateContext';
import { TableContextProvider } from '@/context/TableContext';
import { TableViewsContextProvider } from '@/context/TableViewsContext';
import { UpdateTableDialog } from './UpdateTableDialog';
import { DeleteTableConfirmDialog } from './DeleteTableDialog';
import { DeleteTableFieldConfirmDialog } from './DeleteTableFieldDialog';
import { EditTableFieldPanel } from './EditTableFieldPanel';
import { CodeFieldFloatingWindowHolder } from './CodeFieldFloatingWindow';
import { RecordButtonCodeFloatingWindowHolder } from '@/components/record-editor/RecordButtonCodeFloatingWindow';
import { RecordEditorButtonPanel } from '@/components/record-editor/RecordEditorButtonPanel';
import { TableEditorWindow } from './TableEditorWindow';
import { useRouter } from 'next/navigation';
import { dadixEvents } from '@/constants/events';

export function TableEditorAuxPage() {
  const { projectId } = useParams();
  const tableId = useSearchParams().get('tableId') ?? '';
  const router = useRouter();
  const pid = String(projectId ?? '');

  useEffect(() => {
    const notify = () => {
      const opener = (
        window as Window & {
          __dadixNotifyAuxClosed?: (detail: Record<string, string>) => void;
        }
      ).__dadixNotifyAuxClosed;
      opener?.({ kind: 'table-editor', tableId, projectId: pid });
      window.dispatchEvent(
        new CustomEvent(dadixEvents.tableEvents.onRefetchTable, {
          detail: { tableId },
        })
      );
    };
    window.addEventListener('beforeunload', notify);
    return () => {
      window.removeEventListener('beforeunload', notify);
      notify();
    };
  }, [pid, tableId]);

  if (!pid || !tableId) return null;

  return (
    <SidebarStateProvider projectId={pid}>
      <TableContextProvider projectId={pid} tableId={tableId}>
        <TableViewsContextProvider tableId={tableId}>
          <TableEditorWindow
            projectId={pid}
            tableId={tableId}
            onTableChange={(next) => {
              router.replace(`/dashboard/${pid}/edit-table?tableId=${next}`);
            }}
          />
          <UpdateTableDialog />
          <DeleteTableConfirmDialog />
          <DeleteTableFieldConfirmDialog />
          <EditTableFieldPanel />
          <CodeFieldFloatingWindowHolder />
          <RecordButtonCodeFloatingWindowHolder />
          <RecordEditorButtonPanel />
        </TableViewsContextProvider>
      </TableContextProvider>
    </SidebarStateProvider>
  );
}
