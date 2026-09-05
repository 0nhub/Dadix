'use client';

import { useEffect, useState } from 'react';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { LucideDatabase, LucideEye, LucideEyeOff, LucideMoreVertical, LucideTrash2, LucideX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { GridViewEditor } from './grid-view-editor/GridViewEditor';
import { openTableEditorDialog } from '@/components/table-editor/TableEditorDialog';
import { openDeleteViewConfirmDialog } from '@/components/view-editor/DeleteViewConfirmDialog';
import { useCurrentProjectContext } from '@/context/CurrentProjectContext';
import type { IDadixGridView } from '@/types';

export const GRIDVIEW_ALL_FIELDS_VISIBLE = 'dadix-gridview-all-fields-visible';
export const GRIDVIEW_HIDE_ALL_FIELDS = 'dadix-gridview-hide-all-fields';

const OPEN_VIEW_EDITOR_PANEL_EVENT = 'dadix--open-view-editor-panel-event';

function ViewEditor() {
  const currentProjectCtx = useCurrentProjectContext();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [viewId, setViewId] = useState<number | undefined>(undefined);
  const [viewType, setViewType] = useState<string | undefined>(undefined);
  const [view, setView] = useState<IDadixGridView | undefined>(undefined);

  useEffect(() => {
    window.addEventListener(
      OPEN_VIEW_EDITOR_PANEL_EVENT,
      handleOpenViewEditorEvent
    );
    return () => {
      window.removeEventListener(
        OPEN_VIEW_EDITOR_PANEL_EVENT,
        handleOpenViewEditorEvent
      );
    };
    function handleOpenViewEditorEvent(evnt: Event) {
      const { viewId, view, viewType } = (evnt as CustomEvent).detail || {};
      if (!viewId || !view || !viewType) return;
      setViewType(viewType);
      setView(view);
      setViewId(viewId);
      setIsOpen(true);
    }
  }, []);

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setIsOpen(open);
        }
      }}
      modal={false}
    >
      <SheetContent className='sm:max-w-[520px] z-9999'>
        <SheetHeader className='flex-row flex-nowrap items-center justify-between gap-2'>
          <SheetTitle hidden>View editor</SheetTitle>
          <SheetClose asChild>
            <Button size='icon' variant='outline' className='shrink-0'>
              <LucideX />
            </Button>
          </SheetClose>
          {viewType === 'gridView' && view && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size='icon' variant='outline' className='shrink-0' aria-label='Options'>
                  <LucideMoreVertical className='size-4' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuItem
                  onClick={() => {
                    window.dispatchEvent(
                      new CustomEvent(GRIDVIEW_ALL_FIELDS_VISIBLE, {
                        detail: { viewId: view.id, tableId: view.tableId },
                      })
                    );
                  }}
                >
                  <LucideEye className='size-4' />
                  All fields visible
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    window.dispatchEvent(
                      new CustomEvent(GRIDVIEW_HIDE_ALL_FIELDS, {
                        detail: { viewId: view.id, tableId: view.tableId },
                      })
                    );
                  }}
                >
                  <LucideEyeOff className='size-4' />
                  Hide all fields
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setIsOpen(false);
                    openTableEditorDialog({
                      projectId: currentProjectCtx?.id?.toString(),
                      tableId: view.tableId != null ? `${view.tableId}` : undefined,
                    });
                  }}
                >
                  <LucideDatabase className='size-4' />
                  Table
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant='destructive'
                  onClick={() => {
                    openDeleteViewConfirmDialog({ tableId: view.tableId, view });
                  }}
                >
                  <LucideTrash2 className='size-4' />
                  Remove view
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </SheetHeader>
        <div className='p-4 overflow-auto'>
          {viewId &&
            view &&
            (() => {
              switch (viewType) {
                case 'gridView':
                  return <GridViewEditor view={view} />;
                default:
                  return null;
              }
            })()}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function openViewEditor({
  viewId,
  viewType,
  view,
}: {
  viewId: number;
  viewType: string;
  view: IDadixGridView | undefined;
}): boolean {
  try {
    if (!viewId) {
      console.warn('No view id was provided');
      return true;
    }
    window.dispatchEvent(
      new CustomEvent(OPEN_VIEW_EDITOR_PANEL_EVENT, {
        detail: { viewId, viewType, view },
      })
    );
  } catch (err) {
    console.warn('open view editor Error::', err);
    return true;
  }
  return false;
}

export { ViewEditor, openViewEditor };
