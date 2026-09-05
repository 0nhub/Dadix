import { useEffect, useState } from 'react';

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  LucideGripVertical,
  LucideMoreVertical,
  LucidePenLine,
  LucideTrash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TableFieldTypeIcon } from '@/components/table-field-type-icon/TableFieldTypeIcon';

import {
  CLOSE_EDIT_TABLE_FIELD_PANEL_EVENT,
  OPEN_EDIT_TABLE_FIELD_PANEL_EVENT,
  openEditTableFieldPanel,
} from './EditTableFieldPanel';
import { dadixEvents } from '@/constants/events';
import { openDeleteTableFieldConfirmDialog } from '@/components/table-editor/DeleteTableFieldDialog';
import tableService from '@/lib/table';

import type { Field } from '@/types';
import { useTableContext } from '@/context/TableContext';

function TableFieldsList() {
  const currentTableCtx = useTableContext();

  const [editedFieldId, setEditedFieldId] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {})
  );

  useEffect(() => {
    // handle open edit field panel event
    window.addEventListener(
      OPEN_EDIT_TABLE_FIELD_PANEL_EVENT,
      handleOpenEditFieldPanel
    );
    return () => {
      window.removeEventListener(
        OPEN_EDIT_TABLE_FIELD_PANEL_EVENT,
        handleOpenEditFieldPanel
      );
    };
    function handleOpenEditFieldPanel(evnt: Event) {
      const { fieldId } = (evnt as CustomEvent).detail || {};
      if (!fieldId) return;
      const field = (currentTableCtx.table?.fields || []).filter(
        (field) => `${field.id}` === `${fieldId}`
      )[0];
      if (!field) return;
      setEditedFieldId(fieldId);
    }
  }, [currentTableCtx.id, currentTableCtx.table?.fields]);

  useEffect(() => {
    // handle close edit field panel event
    window.addEventListener(
      CLOSE_EDIT_TABLE_FIELD_PANEL_EVENT,
      handleCloseEditFieldPanel
    );
    return () => {
      window.removeEventListener(
        CLOSE_EDIT_TABLE_FIELD_PANEL_EVENT,
        handleCloseEditFieldPanel
      );
    };
    function handleCloseEditFieldPanel(_evnt: Event) {
      if (!editedFieldId) return;
      setEditedFieldId(null);
    }
  }, [currentTableCtx.id, editedFieldId]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (active?.data?.current?.order === over?.data?.current?.order) return;
    tableService.patchTableField({
      tableId: `${currentTableCtx.id}`,
      id: parseInt(`${active.id}`),
      field: { order: over?.data?.current?.order },
      optimistic: true,
    });
  }

  return (
    <div className='flex flex-col grow gap-0 w-full rounded-lg border overflow-hidden'>
      <DndContext
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
        sensors={sensors}
        id='projects-editor--projects-list'
      >
        <div className='**:data-[slot=table-cell]:first:w-8'>
          {currentTableCtx.initialized &&
            currentTableCtx.table?.fields &&
            (currentTableCtx.table?.fields.length > 0 ? (
              <SortableContext
                items={currentTableCtx.table?.fields}
                strategy={verticalListSortingStrategy}
              >
                {currentTableCtx.table?.fields?.map((field, i) => {
                  return (
                    <TableField
                      key={field.id}
                      tableId={currentTableCtx.id ?? ''}
                      item={{ ...field, order: i }}
                      isSelected={`${field.id}` === `${editedFieldId}`}
                    />
                  );
                })}
              </SortableContext>
            ) : (
              <div className='h-24 flex justify-center items-center text-center opacity-45'>
                No Projects found!
              </div>
            ))}
        </div>
      </DndContext>
    </div>
  );
}

function TableField({
  tableId,
  item,
  isSelected,
}: {
  tableId: string | number;
  item: Field;
  isSelected: boolean;
}) {
  const [isDropdownMenuOpen, setIsDropdownMenuOpen] = useState<boolean>(false);
  const tableCtx = useTableContext();

  const {
    transform,
    transition,
    setNodeRef,
    isDragging,
    attributes,
    listeners,
  } = useSortable({
    id: item.id,
    data: {
      id: item.id,
      order: item.order,
    },
  });

  return (
    <>
      <div
        data-dragging={isDragging}
        data-selected={isSelected}
        ref={setNodeRef}
        className='hover:bg-muted/50 group relative z-0 data-[dragging=true]:z-10 data-[dragging=true]:opacity-80 data-[selected=true]:bg-muted not-last:border-b-1'
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
        }}
        onClick={
          item.name === 'id'
            ? undefined
            : () =>
                openEditTableFieldPanel({
                  fieldId: item.id as number,
                  tableContext: tableCtx,
                })
        }
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
          <TableFieldTypeIcon name={item.type} className='size-5' />
          <span className='text-sm shrink grow ml-3 overflow-hidden'>
            {item.name}
          </span>
          {item.name !== 'id' && (
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
                    openEditTableFieldPanel({
                      fieldId: item.id as number,
                      tableContext: tableCtx,
                    });
                  }}
                >
                  <LucidePenLine />
                  <span>Edit</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setIsDropdownMenuOpen(false);
                    openDeleteTableFieldConfirmDialog({
                      tableId,
                      fieldId: item.id as number,
                    });
                  }}
                  variant='destructive'
                >
                  <LucideTrash2 />
                  <span>Delete</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </>
  );
}

export { TableFieldsList };
