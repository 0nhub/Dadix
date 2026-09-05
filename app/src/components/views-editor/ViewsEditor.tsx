'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LucideDatabase, LucideMoreVertical, LucidePlus, LucideX } from 'lucide-react';
import { TableIcon } from '@/components/table-icon/TableIcon';
import { EditViewPanel } from '@/components/views-editor/EditViewPanel';
import { ViewsList } from '@/components/views-editor/ViewsList';
import { AddNewViewForm } from '@/components/views-editor/AddNewViewForm';
import { useTableContext } from '@/context/TableContext';
import { useTableViewsContext } from '@/context/TableViewsContext';
import { createNewViewDirect } from '@/lib/view';
import { toast } from 'sonner';

const OPEN_EDIT_VIEWS_DIALOG_EVENT = 'dadix--open-edit-views-dialog-event';

export function ViewsEditorDialog() {
  const currentTableCtx = useTableContext();
  const tableViewsCtx = useTableViewsContext();
  const router = useRouter();

  const [isOpen, setIsOpen] = useState<boolean>(false);

  const handleAddView = () => {
    const tableId = currentTableCtx.table?.id ?? tableViewsCtx.tableId;
    if (!tableId) return;
    createNewViewDirect(tableId, (tableViewsCtx.views || []).length).catch(
      (err) => {
        console.error(err);
        const msg = (err as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message ?? (err as Error)?.message ?? 'View konnte nicht erstellt werden.';
        toast.error(msg);
      }
    );
  };

  useEffect(() => {
    window.addEventListener(OPEN_EDIT_VIEWS_DIALOG_EVENT, handleOpenDialog);
    return () => {
      window.removeEventListener(
        OPEN_EDIT_VIEWS_DIALOG_EVENT,
        handleOpenDialog
      );
    };
    function handleOpenDialog(_evnt: Event) {
      setIsOpen(true);
    }
  }, []);

  if (!isOpen) return null;

  return (
    <>
      {createPortal(
        <>
          <div className='fixed top-0 left-0 w-full h-full bg-black/20 overflow-hidden z-[9999]'>
            <div
              role='dialog'
              className='flex flex-col top-0 left-0 w-full h-full bg-background md:m-[10px] md:w-[calc(100%-20px)] md:h-[calc(100%-20px)] md:rounded-md overflow-hidden'
            >
              <div className='sticky top-0 left-0 z-10 flex flex-row items-center gap-2 p-4 bg-background'>
                <Button
                  variant='outline'
                  size='icon'
                  onClick={() => setIsOpen(false)}
                >
                  <LucideX />
                </Button>
                {currentTableCtx.table && (
                  <div className='flex h-9 items-center gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs min-w-0 max-w-[200px]'>
                    <TableIcon name={currentTableCtx.table.icon} className='size-4 shrink-0 text-muted-foreground' />
                    <span className='truncate'>{currentTableCtx.table.name}</span>
                  </div>
                )}
                <div className='grow shrink' />
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button variant='outline' size='icon'>
                      <LucideMoreVertical />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='end'>
                    <DropdownMenuItem onClick={handleAddView}>
                      <LucidePlus />
                      Add view
                    </DropdownMenuItem>
                    {currentTableCtx.table && (
                      <DropdownMenuItem
                        onClick={() => {
                          setIsOpen(false);
                          router.push(
                            `/dashboard/${currentTableCtx.table?.projectId}/edit-table?tableId=${currentTableCtx.table?.id}`
                          );
                        }}
                      >
                        <LucideDatabase />
                        Table
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className='flex-1 min-h-0 overflow-auto'>
                <div className='flex flex-col justify-center items-center p-4 max-md:items-start'>
                  <div className='flex flex-col gap-4 w-full max-w-[28rem]'>
                    <ViewsList />
                    <div className='sticky bottom-0 bg-background z-1'>
                      <AddNewViewForm />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <EditViewPanel />
        </>,
        document.body
      )}
    </>
  );
}

export function openViewsEditorDialog() {
  window.dispatchEvent(new CustomEvent(OPEN_EDIT_VIEWS_DIALOG_EVENT));
}
