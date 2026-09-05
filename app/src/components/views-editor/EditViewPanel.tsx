import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  LucideArrowDown,
  LucideArrowUp,
  LucideMoreVertical,
  LucideTrash2,
  LucideX,
} from 'lucide-react';
import { GridViewEditor } from '@/components/view-editor/grid-view-editor/GridViewEditor';
import { DadixViewIcon } from '@/components/dadix-view-icon/DadixViewIcon';

import { openDeleteViewConfirmDialog } from '@/components/view-editor/DeleteViewConfirmDialog';
import { dadixEvents } from '@/constants/events';
import { patchView } from '@/lib/view';
import { availableDadixViewIcons } from '@/components/dadix-view-icon/DadixViewIcon';

import type { IDadixView } from '@/types';
import { useTableViewsContext } from '@/context/TableViewsContext';

const OPEN_EDIT_VIEW_PANEL_EVENT = 'dadix--open-edit-view-panel-event';
const CLOSE_EDIT_VIEW_PANEL_EVENT = 'dadix--close-edit-view-panel-event';

function EditViewPanel() {
  const currentTableViewsCtx = useTableViewsContext();
  const [viewId, setViewId] = useState<number | undefined>(undefined);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [viewName, setViewName] = useState<string | undefined>(undefined);
  const [lastViewIcon, setlastViewIcon] = useState<string | undefined>(
    undefined
  );

  const viewCopyRef = useRef<IDadixView | undefined>(undefined);
  const updateViewNameTimeout = useRef<NodeJS.Timeout>(undefined);
  const updateViewIconTimeout = useRef<NodeJS.Timeout>(undefined);
  const closeTimeout = useRef<NodeJS.Timeout>(undefined);

  const view = useMemo(() => {
    return currentTableViewsCtx.views.filter(
      (view) => `${view.id}` === `${viewId}`
    )[0];
  }, [viewId]);

  useEffect(() => {
    window.addEventListener(OPEN_EDIT_VIEW_PANEL_EVENT, handleOpenPanel);
    return () => {
      window.removeEventListener(OPEN_EDIT_VIEW_PANEL_EVENT, handleOpenPanel);
    };
    function handleOpenPanel(evnt: Event) {
      const { viewId } = (evnt as CustomEvent).detail || {};
      if (!viewId) return;
      const view = currentTableViewsCtx.views.find(
        (view) => `${view.id}` === `${viewId}`
      );
      if (!view) return;
      clearTimeout(closeTimeout.current);
      setViewId(viewId);
      setIsOpen(true);
    }
  }, [isOpen, currentTableViewsCtx.views]);

  useEffect(() => {
    if (!isOpen)
      window.dispatchEvent(new CustomEvent(CLOSE_EDIT_VIEW_PANEL_EVENT));
  }, [isOpen]);

  useEffect(() => {
    if (!view || !isOpen) return;
    if (`${viewCopyRef.current?.name}` !== `${view.name}`) {
      setViewName(view.name);
      setlastViewIcon(view.icon);
    }
    viewCopyRef.current = {
      ...view,
    };
  }, [isOpen, view]);

  const updateViewName = () => {
    if (!viewCopyRef.current) return;

    clearTimeout(updateViewNameTimeout.current);
    const view = { ...viewCopyRef.current };
    updateViewNameTimeout.current = setTimeout(() => {
      patchView({
        id: view.id,
        tableId: view.tableId,
        data: {
          name: view.name,
        },
        silent: true,
      })
        .then((res) => {
          if (res.status !== 200) {
            throw new Error('Error saving project title');
          }
          return res;
        })
        .catch((err) => {
          console.error(err);
        });
    }, 1000);
    window.dispatchEvent(
      new CustomEvent(dadixEvents.viewEvents.onPatch, {
        detail: {
          tableId: view.tableId,
          id: view.id,
          updates: { name: view.name },
        },
      })
    );
  };

  const updateViewIcon = () => {
    if (!viewCopyRef.current) return;
    const view = { ...viewCopyRef.current };
    clearTimeout(updateViewIconTimeout.current);
    patchView({
      id: view.id,
      tableId: view.tableId,
      data: {
        icon: view.icon,
      },
    })
      .then((res) => {
        if (res.status !== 200) {
          throw new Error('Error saving project icon');
        }
        return res;
      })
      .catch((err) => {
        console.error(err);
      });
  };

  const deleteView = () => {
    openDeleteViewConfirmDialog({
      tableId: view.id,
      view,
    });
    setIsOpen(false);
  };

  return (
    <Sheet
      modal={false}
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setlastViewIcon(view?.icon as string);
          closeTimeout.current = setTimeout(() => {
            try {
              setIsOpen(false);
            } catch (err) {
              console.warn(err);
            }
          }, 320);
        } else {
          clearTimeout(closeTimeout.current);
        }
      }}
    >
      <SheetContent className='z-99999' autoFocus>
        <SheetHeader className='gap-1'>
          <SheetTitle className='flex justify-start gap-2'>
            <Button
              onClick={() => {
                setIsOpen(false);
              }}
              autoFocus
              size='icon'
              variant='outline'
              className='mr-auto'
            >
              <LucideX />
            </Button>
            <GetRelativeViewControllers viewId={viewId} />
            <DropdownMenu modal={true}>
              <DropdownMenuTrigger asChild>
                <Button size='icon' variant='outline' autoFocus={false}>
                  <LucideMoreVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem variant='destructive' onClick={deleteView}>
                  <LucideTrash2 />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SheetTitle>
        </SheetHeader>
        <div className='flex flex-col gap-4 overflow-y-auto px-4 pb-4 text-sm'>
          <form className='flex flex-col gap-4'>
            <div className='flex flex-col gap-3'>
              <div className='flex flex-row justify-center items-center'>
                <Select
                  value={lastViewIcon}
                  onValueChange={(newIcon) => {
                    if (!viewCopyRef.current) return;
                    viewCopyRef.current = {
                      ...viewCopyRef.current,
                      icon: newIcon,
                    };
                    setlastViewIcon(newIcon);
                    updateViewIcon();
                  }}
                >
                  <SelectTrigger
                    className='justify-center items-center w-18! h-18!'
                    showIcon={false}
                  >
                    <DadixViewIcon
                      color='var(--primary)'
                      name={lastViewIcon || ''}
                      className='size-8'
                    />
                  </SelectTrigger>
                  <SelectContent side='bottom' position='popper'>
                    <div className='max-w-[272px] flex flex-row flex-wrap gap-2 m-2'>
                      {availableDadixViewIcons.map((iconName) => {
                        return (
                          <SelectItem
                            className='group/noCheckIndicator flex justify-center items-center gap-0 w-12 h-12 p-0'
                            key={iconName}
                            value={iconName}
                          >
                            <DadixViewIcon
                              color='var(--primary)'
                              name={iconName}
                              className='size-5.2'
                            />
                          </SelectItem>
                        );
                      })}
                    </div>
                  </SelectContent>
                </Select>
              </div>
              <Label htmlFor='string' className='pt-3'>
                View name
              </Label>
              <Input
                id='string'
                value={viewName}
                placeholder='View name'
                onChange={(e) => {
                  if (!viewCopyRef.current) return;
                  const newName = e.target.value;
                  viewCopyRef.current = {
                    ...viewCopyRef.current,
                    name: newName,
                  };
                  setViewName(newName);
                  updateViewName();
                }}
              />
            </div>
          </form>
          {view && viewId && (
            <>
              {(() => {
                switch (view?.type) {
                  case 'gridView':
                    return (
                      <GridViewEditor
                        tableId={view?.tableId}
                        viewId={view?.id}
                      />
                    );
                  default:
                    return null;
                }
              })()}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function GetRelativeViewControllers({
  viewId,
}: {
  viewId: number | undefined;
}) {
  const currentTableViewsCtx = useTableViewsContext();
  const [haseNext, setHasNext] = useState<boolean>(true);
  const [haseBefore, setHasBefore] = useState<boolean>(true);

  function getNextView() {
    const currentView = (currentTableViewsCtx.views || []).find(
      (view) => view.id === viewId
    );

    if (!currentView) return;
    if (currentView.order >= (currentTableViewsCtx.views || []).length - 1)
      return;

    const nextView = (currentTableViewsCtx.views || []).find(
      (view) => view.order === currentView.order + 1
    );
    if (!nextView) return;

    openEditViewPanel({ viewId: nextView.id });
  }

  function getBeforeView() {
    const currentView = (currentTableViewsCtx.views || []).find(
      (view) => view.id === viewId
    );

    if (!currentView) return;
    if (currentView.order === 0) return;

    const beforeView = (currentTableViewsCtx.views || []).find(
      (view) => view.order === currentView.order - 1
    );
    if (!beforeView) return;

    openEditViewPanel({ viewId: beforeView.id });
  }

  useEffect(() => {
    const view = (currentTableViewsCtx.views || []).find(
      (view) => view.id === viewId
    );
    if (!view) {
      setHasNext(false);
      setHasBefore(false);
      return;
    }

    setHasBefore(view.order > 0);
    setHasNext(view.order < (currentTableViewsCtx.views || []).length - 1);
  }, [viewId, currentTableViewsCtx.views]);

  if (!viewId) return null;

  return (
    <>
      <Button
        onClick={getBeforeView}
        size='icon'
        variant='outline'
        disabled={!haseBefore}
      >
        <LucideArrowUp />
      </Button>
      <Button
        onClick={getNextView}
        size='icon'
        variant='outline'
        disabled={!haseNext}
      >
        <LucideArrowDown />
      </Button>
    </>
  );
}

function openEditViewPanel({ viewId }: { viewId: number }) {
  window.dispatchEvent(
    new CustomEvent(OPEN_EDIT_VIEW_PANEL_EVENT, {
      detail: { viewId },
    })
  );
}

export {
  EditViewPanel,
  openEditViewPanel,
  OPEN_EDIT_VIEW_PANEL_EVENT,
  CLOSE_EDIT_VIEW_PANEL_EVENT,
};
