'use client';

import { useRouter, useSearchParams } from 'next/navigation';

import {
  LucideChevronDown,
  LucideDatabase,
  LucideEdit,
  LucideEyeOff,
  LucideFilter,
  LucideLayers3,
  LucidePlus,
  LucideArrowDownUp,
  LucideTrash2,
  LucideUpload,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { createNewViewDirect } from '@/lib/view';
import { toast } from 'sonner';
import { openDeleteViewConfirmDialog } from '@/components/view-editor/DeleteViewConfirmDialog';
import { openUpdateViewDialog } from '@/components/view-editor/UpdateViewDialog';
import {
  openViewsEditorDialog,
  ViewsEditorDialog,
} from '@/components/views-editor/ViewsEditor';
import { DadixViewIcon } from '@/components/dadix-view-icon/DadixViewIcon';

import { useRequireRole } from '@/hooks/useRequireRole';
import {
  openGridViewFiltersDialog,
  openViewSortingDialogRequest,
} from './views/grid-view/GridView';
import { openViewEditor } from '@/components/view-editor/ViewEditor';
import { openTableEditorDialog } from '../table-editor/TableEditorDialog';
import { openTableUploadDialog } from '@/components/table-upload-dialog/TableUploadDialog';
import { useCurrentProjectContext } from '@/context/CurrentProjectContext';
import { cn } from '@/lib/utils';

import type { IDadixView } from '@/types';
import { useTableViewsContext } from '@/context/TableViewsContext';

export function CurrentTableViewsSwitch() {
  const currentProjectCtx = useCurrentProjectContext();
  const currentTableViewsCtx = useTableViewsContext();

  const router = useRouter();
  const searchParams = useSearchParams();

  const selectedViewId = searchParams.get('viewId');
  const views = currentTableViewsCtx.views || [];
  const tableId = searchParams.get('tableId') ?? views[0]?.tableId;

  const { canEditTables } = useRequireRole();

  const handleAddView = () => {
    if (!tableId) return;
    createNewViewDirect(tableId, views.length)
      .then((res) => {
        const id = (res?.view as { id?: number })?.id;
        if (id != null) {
          router.push(
            `${document.location.pathname}?tableId=${tableId}&viewId=${id}`
          );
        }
      })
      .catch((err) => {
        console.error(err);
        const msg = err?.response?.data?.message ?? err?.message ?? 'View konnte nicht erstellt werden. Bitte erneut anmelden und versuchen.';
        toast.error(msg);
      });
  };

  if (views.length === 0) {
    return (
      <Button variant='outline' onClick={handleAddView}>
        <LucidePlus />
        Create view
      </Button>
    );
  }

  if (!currentProjectCtx.id) return null;

  return (
    <ViewsSwitch
      projectId={`${currentProjectCtx.id}`}
      tableId={tableId ?? undefined}
      views={views}
      selectedViewId={selectedViewId || undefined}
      showMenu={canEditTables}
      onSwitchView={(viewId: number) => {
        router.push(
          `${document.location.pathname}?tableId=${tableId}&viewId=${viewId}`
        );
      }}
      onAddView={handleAddView}
    />
  );
}

interface ViewsSwitchProps {
  views: IDadixView[];
  projectId: string;
  tableId?: string;
  selectedViewId: string | undefined;
  onSwitchView: (_viewId: number) => void;
  onAddView: () => void;
  showMenu: boolean;
}

export function ViewsSwitch({
  views,
  projectId,
  tableId,
  selectedViewId,
  onSwitchView,
  onAddView,
  showMenu,
}: ViewsSwitchProps) {
  return (
    <>
      <Tabs
        value={selectedViewId?.toString() || undefined}
        onValueChange={(viewId: string) => {
          if (!viewId) return;
          onSwitchView(parseInt(viewId));
        }}
      >
        <TabsList
          className={cn(
            'min-w-0',
            views.length === 1
              ? 'overflow-visible p-0 bg-transparent rounded-none'
              : 'overflow-hidden'
          )}
        >
          {views.map((view) => (
            <TabsTrigger
              key={`${view.id}`}
              value={`${view.id}`}
              className={cn([
                'group/view-tab relative pr-6 capitalize min-w-0 max-w-full overflow-hidden',
                views.length === 1 && 'shadow-xs! border-unset border',
              ])}
            >
              <DadixViewIcon name={view.icon} className='shrink-0' />
              <span className='truncate min-w-0 block'>{view.name}</span>
              {showMenu && (
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <span className='group/menu absolute flex flex-row justify-end items-center w-full h-full left-0 bg-transparent cursor-pointer group-data-[state=inactive]/view-tab:hidden'>
                      <LucideChevronDown
                        onClick={(evnt) => evnt.preventDefault()}
                        className='relative mr-1 group-data-[state=open]/menu:rotate-180'
                      />
                    </span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className='min-w-46'>
                    <DropdownMenuItem
                      onClick={() => {
                        openUpdateViewDialog({ viewId: view.id });
                      }}
                    >
                      <LucideEdit /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        openViewSortingDialogRequest({
                          viewId: view.id,
                          tableId: view.tableId,
                        });
                      }}
                    >
                      <LucideArrowDownUp /> Sorting
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={openTableUploadDialog}>
                      <LucideUpload /> Upload CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        openGridViewFiltersDialog({
                          viewId: view.id,
                          tableId: view.tableId,
                        });
                      }}
                    >
                      <LucideFilter /> Conditions
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        // Defer so dropdown can close and panel opens reliably
                        const v = view;
                        setTimeout(() => {
                          openViewEditor({
                            viewId: v.id,
                            viewType: 'gridView',
                            view: v,
                          });
                        }, 0);
                      }}
                    >
                      <LucideEyeOff /> Hidden fields
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        openTableEditorDialog({
                          tableId: view.tableId,
                          projectId,
                        });
                      }}
                    >
                      <LucideDatabase /> Table
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onAddView}>
                      <LucidePlus /> Add view
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={openViewsEditorDialog}>
                      <LucideLayers3 /> All views
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        openDeleteViewConfirmDialog({
                          tableId: view.tableId,
                          view,
                        });
                      }}
                      variant='destructive'
                    >
                      <LucideTrash2 /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <ViewsEditorDialog />
    </>
  );
}
