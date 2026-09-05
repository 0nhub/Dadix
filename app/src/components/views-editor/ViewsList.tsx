import { useEffect, useState } from 'react';

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  LucideCopy,
  LucideGripVertical,
  LucideMoreVertical,
  LucidePenLine,
  LucideTrash2,
} from 'lucide-react';
import { DadixViewIcon } from '@/components/dadix-view-icon/DadixViewIcon';

import { dadixEvents } from '@/constants/events';
import { duplicateView, patchView } from '@/lib/view';
import {
  CLOSE_EDIT_VIEW_PANEL_EVENT,
  OPEN_EDIT_VIEW_PANEL_EVENT,
  openEditViewPanel,
} from '@/components/views-editor/EditViewPanel';
import { openDeleteViewConfirmDialog } from '@/components/view-editor/DeleteViewConfirmDialog';

import type { IDadixView } from '@/types';
import { useTableViewsContext } from '@/context/TableViewsContext';

function ViewsList() {
  const currentTableViewsCtx = useTableViewsContext();
  const [editedViewId, setEditedViewId] = useState<number | undefined>(
    undefined
  );

  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {})
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (active?.data?.current?.order === over?.data?.current?.order) return;
    const newOrder = over?.data?.current?.order;
    patchView({
      tableId: active.data.current?.tableId,
      id: active.data.current?.id,
      data: { order: newOrder },
      silent: true,
    });
    window.dispatchEvent(
      new CustomEvent(dadixEvents.viewEvents.onPatch, {
        detail: {
          tableId: active.data.current?.tableId,
          id: active.data.current?.id,
          updates: { order: newOrder },
        },
      })
    );
  }

  useEffect(() => {
    window.addEventListener(
      OPEN_EDIT_VIEW_PANEL_EVENT,
      handleOpenEditViewPanel
    );
    return () => {
      window.removeEventListener(
        OPEN_EDIT_VIEW_PANEL_EVENT,
        handleOpenEditViewPanel
      );
    };
    function handleOpenEditViewPanel(evnt: Event) {
      const { viewId } = (evnt as CustomEvent).detail || {};
      if (!viewId) return;
      const view = currentTableViewsCtx.views.filter(
        (view) => `${view.id}` === `${viewId}`
      )[0];
      if (!view) return;
      setEditedViewId(viewId);
    }
  }, [currentTableViewsCtx.views]);

  useEffect(() => {
    window.addEventListener(CLOSE_EDIT_VIEW_PANEL_EVENT, handleClosePanel);
    return () => {
      window.removeEventListener(CLOSE_EDIT_VIEW_PANEL_EVENT, handleClosePanel);
    };
    function handleClosePanel(_evnt: Event) {
      setEditedViewId(undefined);
    }
  }, []);

  return (
    <>
      <div className='flex flex-col grow gap-0 w-full rounded-lg border overflow-hidden'>
        <DndContext
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
          sensors={sensors}
          id='projects-editor--projects-list'
        >
          <div className='**:data-[slot=table-cell]:first:w-8'>
            {currentTableViewsCtx.views?.length ? (
              <SortableContext
                items={currentTableViewsCtx.views}
                strategy={verticalListSortingStrategy}
              >
                {currentTableViewsCtx.views.map((view) => {
                  return (
                    <ViewsListItem
                      key={view.id}
                      item={view}
                      isSelected={`${view.id}` === `${editedViewId}`}
                    />
                  );
                })}
              </SortableContext>
            ) : (
              <div className='h-24 flex justify-center items-center text-center opacity-45'>
                No Views found!
              </div>
            )}
          </div>
        </DndContext>
      </div>
    </>
  );
}

function ViewsListItem({
  item,
  isSelected,
}: {
  item: IDadixView;
  isSelected: boolean;
}) {
  const [isDropdownMenuOpen, setIsDropdownMenuOpen] = useState<boolean>(false);

  const {
    transform,
    transition,
    setNodeRef,
    isDragging,
    attributes,
    listeners,
  } = useSortable({
    id: item.id as number,
    data: {
      tableId: item.tableId as string,
      id: item.id as number,
      order: item.order as number,
    },
  });

  return (
    <>
      <div
        data-dragging={isDragging}
        data-selected={isSelected}
        ref={setNodeRef}
        className='hover:bg-muted/50 group relative z-0 data-[dragging=true]:z-10 data-[dragging=true]:opacity-80 data-[selected=true]:bg-muted not-last:border-b'
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
        }}
        onClick={() => openEditViewPanel({ viewId: item.id })}
      >
        <div className='flex flex-row flex-nowrap justify-start items-center gap-2 h-12'>
          <div
            className='flex justify-center items-center w-8 h-full shrink-0 grow-0'
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()} // Prevent row click when dragging
          >
            <LucideGripVertical className='size-4 opacity-35' />
          </div>
          <DadixViewIcon name={item.icon as string} className='size-5' />
          <span className='text-sm shrink grow ml-3 overflow-hidden'>
            {item.name as string}
          </span>
          <DropdownMenu
            modal={false}
            open={isDropdownMenuOpen}
            onOpenChange={setIsDropdownMenuOpen}
          >
            <DropdownMenuTrigger asChild>
              <Button
                type='button'
                onClick={(evnt) => {
                  evnt.stopPropagation();
                }}
                variant='ghost'
                size='icon'
                className='ml-auto mr-1.5 data-[state=open]:bg-muted'
              >
                <LucideMoreVertical className='opacity-35' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent onClick={(evnt) => evnt.stopPropagation()}>
              <DropdownMenuItem
                onClick={() => {
                  setIsDropdownMenuOpen(false);
                  openEditViewPanel({ viewId: item.id });
                }}
              >
                <LucidePenLine />
                <span>Edit</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setIsDropdownMenuOpen(false);
                  duplicateView({ viewId: item.id, tableId: item.tableId });
                }}
              >
                <LucideCopy />
                <span>Duplicate</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  setIsDropdownMenuOpen(false);
                  openDeleteViewConfirmDialog({
                    tableId: item.tableId,
                    view: item,
                  });
                }}
                variant='destructive'
              >
                <LucideTrash2 />
                <span>Delete</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </>
  );
}

export { ViewsList };
