'use client';

import { useState, useEffect, useRef } from 'react';
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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ChoiceFieldOption, Field } from '@/types';
// import { MoreHorizontal } from 'lucide-react';
import tableService from '@/lib/table';
import { dadixEvents } from '@/constants/events';
import { toast } from 'sonner';
import {
  LucideGripVertical,
  LucideMoreVertical,
  LucidePenLine,
  LucidePlus,
  LucideTrash2,
} from 'lucide-react';
// import { LoadingIndicator } from '@/components/loading-indicator/LoadingIndicator';
import { useTableContext } from '@/context/TableContext';

export function EditTableChoiceFieldOptions({
  choiceField,
}: {
  choiceField: Field;
}) {
  const currentTableCtx = useTableContext();
  const [choiceFieldOptions, setChoiceFieldOptions] = useState<
    ChoiceFieldOption[]
  >(choiceField.options || []);
  const [newChoiceFieldOption, setNewChoiceFieldOption] = useState('');
  const [isAddingNewOption, setIsAddingNewOption] = useState<boolean>(false);

  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {})
  );

  useEffect(() => {
    if (!choiceField) return;
    setChoiceFieldOptions(choiceField.options || []);
  }, [choiceField]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      const reorderFrom = active.data.current?.order;
      const reorderTo = over.data.current?.order;
      if (reorderFrom === reorderTo) return;
      // save updates to state
      window.dispatchEvent(
        new CustomEvent(dadixEvents.tableEvents.onPatchFieldOption, {
          detail: {
            tableId: currentTableCtx.id as string,
            fieldId: choiceField.id,
            optionId: active.id,
            data: {
              order: reorderTo,
            },
          },
        })
      );
      // save updates to database
      tableService.patchTableFieldOption({
        tableId: currentTableCtx.id as string,
        fieldId: choiceField.id,
        optionId: active.id,
        optionData: {
          order: reorderTo,
        },
      });
    }
  }

  const handleAddTagOption = () => {
    if (newChoiceFieldOption.trim()) {
      setIsAddingNewOption(true);
      tableService
        .createTableFieldOption({
          tableId: currentTableCtx.id as string,
          fieldId: choiceField.id,
          optionData: {
            value: newChoiceFieldOption.trim(),
          },
        })
        .then((res) => {
          if (res.status !== 201 || !res.data) {
            throw new Error('Error creating new choice option');
          }
          window.dispatchEvent(
            new CustomEvent(dadixEvents.tableEvents.onCreateFieldOption, {
              detail: {
                tableId: currentTableCtx.id as string,
                fieldId: choiceField.id,
                data: {
                  ...res.data,
                },
              },
            })
          );
          setNewChoiceFieldOption('');
          setIsAddingNewOption(false);
          return res;
        })
        .catch((err) => {
          setIsAddingNewOption(false);
          toast.error('Error creating new choice option');
          console.error(err);
        });
    }
  };

  return (
    <>
      <div
        className={`flex flex-col gap-3 rounded-md ${choiceFieldOptions.length === 0 ? '' : 'border'}`}
      >
        <DndContext
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
          sensors={sensors}
        >
          <div className='flex flex-col'>
            <SortableContext
              items={choiceFieldOptions}
              strategy={verticalListSortingStrategy}
            >
              {choiceFieldOptions.map((option) => (
                <Option
                  key={option.id}
                  option={option}
                  tableId={currentTableCtx.id}
                  fieldId={choiceField.id}
                />
              ))}
            </SortableContext>
          </div>
        </DndContext>
      </div>
      <div className='flex gap-2'>
        <Input
          disabled={isAddingNewOption}
          value={newChoiceFieldOption}
          onChange={(e) => setNewChoiceFieldOption(e.target.value)}
          placeholder='Add new choice option'
        />
        <Button
          disabled={isAddingNewOption}
          type='button'
          size='icon'
          onClick={handleAddTagOption}
        >
          {/*{isAddingNewOption ? (
            <LoadingIndicator visibilityDelay={false} />
          ) : (
            <LucidePlus />
          )}*/}
          <LucidePlus />
        </Button>
      </div>
    </>
  );
}

function Option({
  option,
  fieldId,
  tableId,
}: {
  option: ChoiceFieldOption;
  fieldId: number;
  tableId: number | string | undefined;
}) {
  const [isDropdownMenuOpen, setIsDropdownMenuOpen] = useState<boolean>(false);
  const [isDeliting, setIsDeleting] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isEditingActive, setIsEditingActive] = useState<boolean>(false);
  const [optionValue, setOptionValue] = useState<string | undefined>(undefined);
  const {
    transform,
    transition,
    setNodeRef,
    isDragging,
    attributes,
    listeners,
  } = useSortable({
    id: option.id,
    data: { order: option.order },
  });
  const optionValueRef = useRef<string>(undefined);
  const optionIdRef = useRef<number | string>(undefined);

  useEffect(() => {
    if (option.id === optionIdRef.current) return;
    optionIdRef.current = option.id;
    optionValueRef.current = option.value;
    setOptionValue(option.value);
  }, [option]);

  const handleUpdateOptionValue = () => {
    if (option.value === optionValueRef.current) {
      setIsEditingActive(false);
      return;
    }
    if (!tableId) return;
    setIsSaving(true);
    tableService
      .patchTableFieldOption({
        tableId: `${tableId}`,
        fieldId,
        optionId: option.id,
        optionData: {
          value: optionValueRef.current,
        },
      })
      .then((res) => {
        if (res.status !== 200) {
          throw new Error('Error update Tag');
        }
        window.dispatchEvent(
          new CustomEvent(dadixEvents.tableEvents.onPatchFieldOption, {
            detail: {
              tableId,
              fieldId,
              optionId: option.id,
              data: {
                value: optionValueRef.current,
              },
            },
          })
        );
        setIsEditingActive(false);
        setIsSaving(false);
        return res;
      })
      .catch((err) => {
        setIsSaving(false);
        toast.error('Error saving changes');
        console.error(err);
      });
  };

  const handleDeleteOption = () => {
    if (!tableId) return;
    setIsDeleting(true);
    tableService
      .deleteTableFieldOption({
        tableId: `${tableId}`,
        fieldId,
        id: option.id as number,
      })
      .then((res) => {
        if (res.status !== 200) {
          throw new Error('Error delete Tag');
        }
        window.dispatchEvent(
          new CustomEvent(dadixEvents.tableEvents.onDeleteFieldOption, {
            detail: {
              tableId,
              fieldId,
              optionId: option.id,
            },
          })
        );
        setIsDeleting(false);
        setIsDropdownMenuOpen(false);
        return res;
      })
      .catch((err) => {
        setIsDeleting(false);
        toast.error('Error deleting tag');
        console.error(err);
      });
  };

  return (
    <>
      <div
        data-dragging={isDragging}
        ref={setNodeRef}
        className='hover:bg-muted/50 group relative z-0 data-[dragging=true]:z-10 data-[dragging=true]:opacity-80 not-last:border-b-1'
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
        }}
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
          {isEditingActive ? (
            <div
              data-tag-option-edit-scope='true'
              className='flex items-center gap-2 w-full'
            >
              <Input
                value={optionValue}
                onChange={(e) => {
                  optionValueRef.current = e.target.value;
                  setOptionValue(e.target.value);
                }}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleUpdateOptionValue();
                  } else if (e.key === 'Escape') {
                    optionValueRef.current = option.value;
                    setOptionValue(option.value);
                    setIsEditingActive(false);
                  }
                }}
                className='h-9'
              />
            </div>
          ) : (
            <span className='text-sm shrink grow ml-3 overflow-hidden'>
              {option.value}
            </span>
          )}
          {isEditingActive ? (
            <div
              className='flex items-center gap-2'
              data-tag-option-edit-scope='true'
            >
              <Button
                size='sm'
                disabled={isSaving || !optionValue?.trim()}
                onClick={handleUpdateOptionValue}
              >
                {/*{isSaving && <LoadingIndicator visibilityDelay={false} />}*/}
                Done
              </Button>
            </div>
          ) : (
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
                    setIsEditingActive(true);
                  }}
                >
                  <LucidePenLine />
                  <span>Edit</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(evnt) => {
                    evnt.preventDefault();
                    evnt.stopPropagation();
                    handleDeleteOption();
                  }}
                  variant='destructive'
                >
                  {/*{isDeliting ? (
                    <LoadingIndicator visibilityDelay={false} />
                  ) : (
                    <LucideTrash2 />
                  )}*/}
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

  // return (
  //   <TableRow
  //     data-dragging={isDragging}
  //     ref={setNodeRef}
  //     style={{
  //       transform: CSS.Transform.toString(transform),
  //       transition,
  //     }}
  //   >
  //     {row.getVisibleCells().map((cell: VisibleCell, index: number) => (
  //       <TableCell key={cell.id} style={{ width: cell.column.columnDef.width }}>
  //         {index === 0 ? (
  //           <div {...attributes} {...listeners} style={{ cursor: 'grab' }}>
  //             {flexRender(cell.column.columnDef.cell, cell.getContext())}
  //           </div>
  //         ) : (
  //           flexRender(cell.column.columnDef.cell, cell.getContext())
  //         )}
  //       </TableCell>
  //     ))}
  //   </TableRow>
  // );
}
