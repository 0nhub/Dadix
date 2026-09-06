import { useState } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  LucideChevronDown,
  LucideMoreVertical,
  LucidePencil,
  LucideTrash2,
  LucideX,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TableEditor } from '@/components/table-editor/TableEditor';
import { TableIcon } from '@/components/table-icon/TableIcon';

import { TableContextProvider } from '@/context/TableContext';
import { useCurrentProjectContext } from '@/context/CurrentProjectContext';
import { useEventHandler } from '@/hooks/useEventHandler';
import { openUpdateTableDialog } from './UpdateTableDialog';
import { openDeleteTableConfirmDialog } from './DeleteTableDialog';
import { dadixEvents } from '@/constants/events';
import { openDesktopAuxWindow } from '@/lib/desktopShell';

const OPEN_TABLE_EDITOR_DIALOG = 'dadix--open-table-editor-dialog-event';

function TableEditorDialog() {
  const currentProjectCtx = useCurrentProjectContext();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isSelectTableOpen, setIsSelectTableOpen] = useState<boolean>(false);
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [tableId, setTableId] = useState<string | undefined>(undefined);

  useEventHandler(
    OPEN_TABLE_EDITOR_DIALOG,
    (evnt: Event) => {
      const { tableId, projectId } = (evnt as CustomEvent).detail || {};
      if (isOpen || !tableId || !projectId) return;
      setProjectId(projectId);
      setTableId(tableId);
      setIsOpen(true);
    },
    [isOpen]
  );

  const closeEditor = () => {
    setIsOpen(false);
    if (!tableId) return;
    const query = new URLSearchParams(
      (typeof window !== 'undefined' ? window.location.hash.split('?')[1] : '') ??
        ''
    );
    window.dispatchEvent(
      new CustomEvent(dadixEvents.tableEvents.onRefetchTable, {
        detail: { tableId },
      })
    );
    window.dispatchEvent(
      new CustomEvent(dadixEvents.gridViewEvents.onRefetchView, {
        detail: {
          tableId,
          viewId: query.get('viewId'),
        },
      })
    );
  };

  if (!isOpen) return null;

  return (
    <>
      {createPortal(
        <div className='fixed inset-0 bg-black/20 overflow-hidden z-[200]'>
          <div
            role='dialog'
            className='flex h-full w-full flex-col overflow-hidden border bg-background'
          >
            <header className='dadix-app-titlebar z-50 flex h-11 min-h-11 w-full items-stretch border-b bg-background'>
              {currentProjectCtx.id === projectId && (
                <DropdownMenu open={isSelectTableOpen} onOpenChange={setIsSelectTableOpen}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type='button'
                      className={cn(
                        'inline-flex h-full w-auto shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-none border-0 border-r border-border bg-transparent px-3 text-sm font-medium shadow-none hover:bg-foreground/6'
                      )}
                    >
                      <TableIcon
                        name={
                          currentProjectCtx.tables?.find((table) => `${table.id}` === `${tableId}`)
                            ?.icon
                        }
                        className='size-4 shrink-0 text-foreground'
                      />
                      <span className='whitespace-nowrap'>
                        {currentProjectCtx.tables?.find((table) => `${table.id}` === `${tableId}`)
                          ?.name || 'Table'}
                      </span>
                      <LucideChevronDown className='size-4 shrink-0 opacity-70' />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='start' className='min-w-46'>
                    {currentProjectCtx.tables?.map((table) => (
                      <DropdownMenuItem
                        key={table.id}
                        onClick={() => {
                          setTableId(`${table.id}`);
                          setIsSelectTableOpen(false);
                        }}
                      >
                        <TableIcon name={table.icon} className='text-foreground' />
                        <span>{table.name}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <div className='h-full min-w-8 flex-1' />
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant='ghost'
                    size='icon'
                    className='size-auto h-full min-h-11 w-11 rounded-none border-0 border-l border-border bg-transparent shadow-none hover:bg-foreground/6'
                    aria-label='Table options'
                  >
                    <LucideMoreVertical />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end'>
                  <DropdownMenuItem
                    onClick={() => {
                      openUpdateTableDialog({
                        projectId: `${projectId}`,
                        tableId: `${tableId}`,
                      });
                    }}
                  >
                    <LucidePencil />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant='destructive'
                    onClick={() => {
                      openDeleteTableConfirmDialog({
                        projectId: `${projectId}`,
                        tableId: `${tableId}`,
                      });
                    }}
                  >
                    <LucideTrash2 />
                    Remove
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant='ghost'
                size='icon'
                className='size-auto h-full min-h-11 w-11 rounded-none border-0 border-l border-border bg-transparent shadow-none hover:bg-foreground/6'
                aria-label='Close table editor'
                onClick={closeEditor}
              >
                <LucideX />
              </Button>
            </header>
            {projectId && tableId && (
              <div>
                <TableContextProvider projectId={projectId} tableId={tableId}>
                  <TableEditor />
                </TableContextProvider>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function openTableEditorDialog({
  projectId,
  tableId,
}: {
  projectId: string | undefined;
  tableId: string | undefined;
}) {
  if (!tableId || !projectId) return;
  if (
    openDesktopAuxWindow({
      kind: 'table-editor',
      title: 'Table',
      hash: `/dashboard/${projectId}/edit-table?tableId=${tableId}`,
    })
  ) {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(OPEN_TABLE_EDITOR_DIALOG, {
      detail: { tableId, projectId },
    })
  );
}

export { TableEditorDialog, openTableEditorDialog };
