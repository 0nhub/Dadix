'use client';

import { DocumentEditorDialog } from '@/components/document-editor/DocumentEditorDialog';
import { RecordButtonCodeFloatingWindowHolder } from '@/components/record-editor/RecordButtonCodeFloatingWindow';
import { RecordEditorButtonPanel } from '@/components/record-editor/RecordEditorButtonPanel';
import { DeleteTableConfirmDialog } from '@/components/table-editor/DeleteTableDialog';
import { DeleteTableFieldConfirmDialog } from '@/components/table-editor/DeleteTableFieldDialog';
import { CodeFieldFloatingWindowHolder } from '@/components/table-editor/CodeFieldFloatingWindow';
import { EditTableFieldPanel } from '@/components/table-editor/EditTableFieldPanel';
import { TableEditorDialog } from '@/components/table-editor/TableEditorDialog';
import { UpdateTableDialog } from '@/components/table-editor/UpdateTableDialog';
import { useCurrentProjectContext } from '@/context/CurrentProjectContext';
import { SidebarStateProvider } from '@/context/SidebarStateContext';
import { TableContextProvider } from '@/context/TableContext';
import { TableViewsContextProvider } from '@/context/TableViewsContext';
import { useSearchParams } from 'next/navigation';

export default function CurrentProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const tableId = useSearchParams().get('tableId');
  const { id: projectId } = useCurrentProjectContext();

  if (!projectId) return null;

  return (
    <SidebarStateProvider projectId={projectId?.toString()}>
      <TableContextProvider
        projectId={projectId?.toString()}
        tableId={tableId ?? ''}
      >
        <TableViewsContextProvider tableId={tableId ?? ''}>
          {children}
          <UpdateTableDialog />
          <CodeFieldFloatingWindowHolder />
          <EditTableFieldPanel />
          <RecordButtonCodeFloatingWindowHolder />
          <RecordEditorButtonPanel />
          <TableEditorDialog />
          <DocumentEditorDialog />
          <DeleteTableFieldConfirmDialog />
          <DeleteTableConfirmDialog />
        </TableViewsContextProvider>
      </TableContextProvider>
    </SidebarStateProvider>
  );
}
