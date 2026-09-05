import { useState } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  LucideMoreVertical,
  LucidePencil,
  LucideTrash2,
  LucideX,
} from 'lucide-react';
import { TableEditor } from '@/components/table-editor/TableEditor';
import { TableIcon } from '@/components/table-icon/TableIcon';

import { TableContextProvider } from '@/context/TableContext';
import { useCurrentProjectContext } from '@/context/CurrentProjectContext';
import { useEventHandler } from '@/hooks/useEventHandler';
import { openUpdateTableDialog } from './UpdateTableDialog';
import { openDeleteTableConfirmDialog } from './DeleteTableDialog';

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

  if (!isOpen) return null;

  return (
    <>
      {createPortal(
        <div className='fixed top-0 left-0 w-full h-full bg-black/20 overflow-hidden z-20'>
          <div
            role='dialog'
            className='flex flex-col top-0 left-0 w-full h-full bg-background border-[5px solid #f00] md:m-[10px] md:w-[calc(100%-20px)] md:h-[calc(100%-20px)] md:rounded-md border overflow-hidden '
          >
            <div className='sticky top-0 lef-0 flex flex-row gap-2 p-4 bg-background'>
              <Button
                variant='outline'
                size='icon'
                onClick={() => setIsOpen(false)}
              >
                <LucideX />
              </Button>
              {currentProjectCtx.id === projectId && (
                <Select
                  open={isSelectTableOpen}
                  onOpenChange={setIsSelectTableOpen}
                  value={`${tableId}`}
                  onValueChange={(newTableId) => {
                    setTableId(newTableId);
                    setIsSelectTableOpen(false);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {currentProjectCtx.tables?.map((table) => {
                      return (
                        <SelectItem value={`${table.id}`} key={table.id}>
                          <TableIcon
                            name={table.icon}
                            className='text-foreground'
                          />
                          <span>{table.name}</span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}
              <div className='grow shrink' />
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button variant='outline' size='icon'>
                    <LucideMoreVertical />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
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
            </div>
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
  window.dispatchEvent(
    new CustomEvent(OPEN_TABLE_EDITOR_DIALOG, {
      detail: { tableId, projectId },
    })
  );
}

export { TableEditorDialog, openTableEditorDialog };
