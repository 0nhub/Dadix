'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { DocumentEditorScreen } from '@/components/document-editor/DocumentEditorModal';
import { useEventHandler } from '@/hooks/useEventHandler';
import type { Field } from '@/types';
import { openDesktopAuxWindow } from '@/lib/desktopShell';

const OPEN_DOCUMENT_EDITOR_EVENT = 'dadix-open-document-editor';

export interface OpenDocumentEditorParams {
  projectId: string;
  tableId: string | number;
  tableFields: Field[];
  record?: Record<string, unknown> | null;
}

function DocumentEditorDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [params, setParams] = useState<OpenDocumentEditorParams | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEventHandler(
    OPEN_DOCUMENT_EDITOR_EVENT,
    (evnt: Event) => {
      const payload = (evnt as CustomEvent<OpenDocumentEditorParams>).detail;
      if (!payload?.projectId || payload.tableId == null) return;
      setParams({
        projectId: payload.projectId,
        tableId: payload.tableId,
        tableFields: payload.tableFields ?? [],
        record: payload.record ?? null,
      });
      setIsOpen(true);
    },
    []
  );

  if (!isOpen || !params) return null;

  const handleClose = () => {
    const wasOnDocumentsPage = typeof pathname === 'string' && pathname.includes('/documents');
    const projectId = params.projectId;
    setIsOpen(false);
    setParams(null);
    if (wasOnDocumentsPage && projectId) {
      router.replace(`/dashboard/${projectId}`);
    }
  };

  return (
    <>
      {createPortal(
        <div className='fixed top-0 left-0 w-full h-full bg-black/20 overflow-hidden z-50'>
          <div
            role='dialog'
            aria-modal='true'
            className='flex flex-col top-0 left-0 w-full h-full bg-background md:m-[10px] md:w-[calc(100%-20px)] md:h-[calc(100%-20px)] md:rounded-md border overflow-hidden'
          >
            <div className='flex-1 min-h-0 overflow-hidden flex flex-col'>
              <DocumentEditorScreen
                tableId={params.tableId}
                tableFields={params.tableFields}
                record={params.record ?? null}
                onClose={handleClose}
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function openDocumentEditorDialog(payload: OpenDocumentEditorParams) {
  if (!payload?.projectId || payload.tableId == null) return;
  if (
    openDesktopAuxWindow({
      kind: 'documents',
      title: 'Documents',
      hash: `/dashboard/${payload.projectId}/documents-editor?tableId=${payload.tableId}`,
    })
  ) {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(OPEN_DOCUMENT_EDITOR_EVENT, { detail: payload })
  );
}

export { DocumentEditorDialog, openDocumentEditorDialog, OPEN_DOCUMENT_EDITOR_EVENT };
