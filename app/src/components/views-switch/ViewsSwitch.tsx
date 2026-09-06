'use client';

import { useRef, useState, type MouseEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import {
  LucideChevronDown,
  LucideTable,
  LucideEdit,
  LucideFilter,
  LucidePlus,
  LucideTrash2,
} from 'lucide-react';

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
import { ViewsEditorDialog } from '@/components/views-editor/ViewsEditor';
import { DadixViewIcon } from '@/components/dadix-view-icon/DadixViewIcon';

import { useRequireRole } from '@/hooks/useRequireRole';
import { openGridViewFiltersDialog } from './views/grid-view/GridView';
import { openViewEditor } from '@/components/view-editor/ViewEditor';
import { useCurrentProjectContext } from '@/context/CurrentProjectContext';
import { cn } from '@/lib/utils';

import type { IDadixView } from '@/types';
import { useTableViewsContext } from '@/context/TableViewsContext';
import { projectTableHref } from '@/lib/projectHref';
import { useLanguage } from '@/context/LanguageContext';
import { localizeSystemName } from '@/lib/i18n';

export function CurrentTableViewsSwitch() {
  const currentProjectCtx = useCurrentProjectContext();
  const currentTableViewsCtx = useTableViewsContext();
  const { t } = useLanguage();

  const router = useRouter();
  const searchParams = useSearchParams();

  const selectedViewId = searchParams.get('viewId');
  const views = currentTableViewsCtx.views || [];
  const tableId = searchParams.get('tableId') ?? views[0]?.tableId;

  const { canEditTables } = useRequireRole();

  const handleAddView = () => {
    if (!tableId) {
      toast.error(t('table.noTableSelected'));
      return;
    }
    createNewViewDirect(String(tableId), views.length)
      .then((res) => {
        const id = (res?.view as { id?: number })?.id;
        if (id != null) {
          router.push(projectTableHref(currentProjectCtx.id, tableId, id));
        }
      })
      .catch((err) => {
        console.error(err);
        const msg = err?.response?.data?.message ?? err?.message ?? t('table.viewCreateFailed');
        toast.error(msg);
      });
  };

  if (!currentTableViewsCtx.initialized || currentTableViewsCtx.isLoading) {
    return null;
  }

  if (views.length === 0) {
    return null;
  }

  if (!currentProjectCtx.id) return null;

  return (
    <ViewsSwitch
      tableId={tableId ?? undefined}
      views={views}
      selectedViewId={selectedViewId || undefined}
      showMenu={canEditTables}
      onSwitchView={(viewId: number) => {
        router.push(projectTableHref(currentProjectCtx.id, tableId, viewId));
      }}
      onAddView={handleAddView}
    />
  );
}

interface ViewsSwitchProps {
  views: IDadixView[];
  tableId?: string;
  selectedViewId: string | undefined;
  onSwitchView: (_viewId: number) => void;
  onAddView: () => void;
  showMenu: boolean;
}

export function ViewsSwitch({
  views,
  tableId,
  selectedViewId,
  onSwitchView,
  onAddView,
  showMenu,
}: ViewsSwitchProps) {
  const { locale } = useLanguage();
  const [menuViewId, setMenuViewId] = useState<string | null>(null);
  const [menuArmed, setMenuArmed] = useState(true);
  const skipSwitchRef = useRef(false);
  const armMenuTimeoutRef = useRef<number | null>(null);

  const armMenuAfterPointerUp = () => {
    const arm = () => {
      setMenuArmed(true);
      window.removeEventListener('pointerup', arm);
      window.removeEventListener('pointercancel', arm);
      if (armMenuTimeoutRef.current != null) {
        window.clearTimeout(armMenuTimeoutRef.current);
        armMenuTimeoutRef.current = null;
      }
    };
    window.addEventListener('pointerup', arm);
    window.addEventListener('pointercancel', arm);
    armMenuTimeoutRef.current = window.setTimeout(arm, 400);
  };

  const openViewMenu = (viewId: string, event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    skipSwitchRef.current = true;
    window.setTimeout(() => {
      skipSwitchRef.current = false;
    }, 400);
    setMenuArmed(false);
    setMenuViewId(viewId);
    armMenuAfterPointerUp();
  };

  return (
    <>
      <div
        className={cn(
          'text-muted-foreground inline-flex h-full w-max max-w-none items-stretch overflow-visible bg-transparent p-0'
        )}
      >
        {views.map((view) => {
          const isActive = `${view.id}` === `${selectedViewId}`;
          return (
            <DropdownMenu
              key={`${view.id}`}
              modal
              open={showMenu && menuViewId === `${view.id}`}
              onOpenChange={(open) => {
                if (open) {
                  setMenuViewId(`${view.id}`);
                  return;
                }
                setMenuViewId(null);
                setMenuArmed(true);
              }}
            >
              <div className='relative inline-flex h-full items-stretch'>
                <button
                  type='button'
                  data-state={isActive ? 'active' : 'inactive'}
                  className={cn(
                    'group/view-tab inline-flex h-full w-auto shrink-0 items-center justify-center gap-1.5 overflow-visible whitespace-nowrap rounded-none border-0 border-r border-border bg-transparent px-3 text-sm font-medium text-muted-foreground shadow-none',
                    'data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none',
                    'hover:bg-foreground/6 hover:text-foreground'
                  )}
                  onPointerDown={(event) => {
                    if (event.button !== 2) return;
                    event.preventDefault();
                    skipSwitchRef.current = true;
                    window.setTimeout(() => {
                      skipSwitchRef.current = false;
                    }, 400);
                  }}
                  onClick={() => {
                    if (skipSwitchRef.current) {
                      skipSwitchRef.current = false;
                      return;
                    }
                    if (showMenu && isActive) {
                      setMenuViewId(`${view.id}`);
                      return;
                    }
                    onSwitchView(Number(view.id));
                  }}
                  onContextMenu={
                    showMenu
                      ? (event) => openViewMenu(`${view.id}`, event)
                      : undefined
                  }
                >
                  <DadixViewIcon name={view.icon} className='shrink-0 size-4' />
                  <span data-view-name={view.name} className='whitespace-nowrap leading-5'>
                    {localizeSystemName(locale, view.name)}
                  </span>
                  {showMenu && isActive && (
                    <LucideChevronDown className='size-4 shrink-0 opacity-70 group-data-[state=open]/view-tab:rotate-180' />
                  )}
                </button>
                {showMenu && isActive && (
                  <DropdownMenuTrigger asChild>
                    <button
                      type='button'
                      className='absolute inset-y-0 right-0 w-8'
                      aria-label='View options'
                      onClick={(event) => event.stopPropagation()}
                    />
                  </DropdownMenuTrigger>
                )}
                {showMenu && !isActive && (
                  <DropdownMenuTrigger asChild>
                    <button
                      type='button'
                      tabIndex={-1}
                      aria-hidden
                      className='pointer-events-none absolute size-0 overflow-hidden opacity-0'
                    />
                  </DropdownMenuTrigger>
                )}
              </div>
              {showMenu && (
                <DropdownMenuContent
                  className='relative min-w-46'
                  onOpenAutoFocus={(event) => event.preventDefault()}
                  onCloseAutoFocus={(event) => event.preventDefault()}
                  onPointerDownOutside={(event) => {
                    if (!menuArmed) event.preventDefault();
                  }}
                  onInteractOutside={(event) => {
                    if (!menuArmed) event.preventDefault();
                  }}
                >
                  {!menuArmed && (
                    <div className='absolute inset-0 z-10' aria-hidden />
                  )}
                  <DropdownMenuItem
                    onClick={() => {
                      openUpdateViewDialog({ viewId: view.id });
                    }}
                  >
                    <LucideEdit /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      openGridViewFiltersDialog({
                        viewId: view.id,
                        tableId: view.tableId,
                      });
                    }}
                  >
                    <LucideFilter /> Filter
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      const v = view;
                      window.setTimeout(() => {
                        openViewEditor({
                          viewId: v.id,
                          viewType: 'gridView',
                          view: v,
                        });
                      }, 150);
                    }}
                  >
                    <LucideTable /> Fields
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      setTimeout(() => onAddView(), 0);
                    }}
                  >
                    <LucidePlus /> Add view
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant='destructive'
                    onClick={() => {
                      openDeleteViewConfirmDialog({
                        tableId: view.tableId,
                        view,
                      });
                    }}
                  >
                    <LucideTrash2 /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              )}
            </DropdownMenu>
          );
        })}
      </div>
      <ViewsEditorDialog />
    </>
  );
}
