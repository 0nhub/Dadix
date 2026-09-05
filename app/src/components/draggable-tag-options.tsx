'use client';

import type { JSX } from 'react';
import { useState, useEffect, useMemo } from 'react';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

import { IconGripVertical, IconDotsVertical } from '@tabler/icons-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { flexRender } from '@tanstack/react-table';

interface TagOption {
  id: UniqueIdentifier;
  value: string;
}

interface VisibleCell {
  id: string;
  column: {
    columnDef: {
      cell: ({
        // eslint-disable-next-line no-unused-vars
        row,
      }: {
        row: { original: TagOption; index: number };
      }) => JSX.Element;
      width?: string;
    };
  };
  getContext: () => {
    row: {
      original: TagOption;
      index: number;
    };
  };
}

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
// import { MoreHorizontal } from 'lucide-react';

interface DraggableTagRowProps {
  row: {
    id: UniqueIdentifier;
    index: number;
    original: TagOption;
    getVisibleCells: () => {
      id: string;
      column: {
        columnDef: {
          cell: ({
            // eslint-disable-next-line no-unused-vars
            row,
          }: {
            row: { original: TagOption; index: number };
          }) => JSX.Element;
          width?: string;
        };
      };
      getContext: () => {
        row: {
          original: TagOption;
          index: number;
        };
      };
    }[];
  };
  _onUpdate: (_index: number, _value: string) => void;
  _onDelete: (_index: number) => void;
  _onEdit: (_index: number) => void;
}

function DraggableTagRow({
  row,
  _onUpdate,
  _onDelete,
  _onEdit,
}: DraggableTagRowProps) {
  const {
    transform,
    transition,
    setNodeRef,
    isDragging,
    attributes,
    listeners,
  } = useSortable({
    id: row.original.id,
  });

  return (
    <TableRow
      data-dragging={isDragging}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      {row.getVisibleCells().map((cell: VisibleCell, index: number) => (
        <TableCell key={cell.id} style={{ width: cell.column.columnDef.width }}>
          {index === 0 ? (
            <div {...attributes} {...listeners} style={{ cursor: 'grab' }}>
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </div>
          ) : (
            flexRender(cell.column.columnDef.cell, cell.getContext())
          )}
        </TableCell>
      ))}
    </TableRow>
  );
}

export function DraggableTagOptions({
  options,
  onUpdate,
  onDelete,
  onReorder,
  onAdd,
  onCommit,
}: {
  options: string[];
  onUpdate: (_index: number, _value: string) => void;
  onDelete: (_index: number) => void;
  onReorder: (
    _reorderedOptions: string[],
    _draggedElementPosition: {
      oldIndex: number;
      newIndex: number;
    }
  ) => void;
  onAdd: (_value: string) => void;
  onCommit?: () => Promise<void> | void;
}) {
  const [tagOptions, setTagOptions] = useState<TagOption[]>([]);
  const [newTagOption, setNewTagOption] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [saving, setSaving] = useState(false);

  // Cancel editing when clicking anywhere else inside (or outside) the sheet.
  useEffect(() => {
    if (editingIndex === null) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // If the click is not inside the current editing scope, cancel.
      if (!target.closest('[data-tag-option-edit-scope="true"]')) {
        setEditingIndex(null);
        setEditingValue('');
      }
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [editingIndex]);

  useEffect(() => {
    setTagOptions(
      options.map((opt, index) => ({ id: index.toString(), value: opt }))
    );
  }, [options]);

  const dataIds = useMemo<UniqueIdentifier[]>(
    () => tagOptions.map(({ id }) => id),
    [tagOptions]
  );

  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {})
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      const oldIndex = dataIds.indexOf(active.id);
      const newIndex = dataIds.indexOf(over.id);
      const reordered = arrayMove(tagOptions, oldIndex, newIndex);
      setTagOptions(reordered);
      onReorder(
        reordered.map((opt) => opt.value),
        { oldIndex, newIndex }
      );
    }
  }

  const handleAddTagOption = () => {
    if (newTagOption.trim()) {
      onAdd(newTagOption.trim());
      setNewTagOption('');
    }
  };

  const commitUpdate = async (index: number) => {
    if (index === null || index < 0) return;
    const trimmed = editingValue.trim();
    if (!trimmed) return; // ignore empty
    onUpdate(index, trimmed);
    if (onCommit) {
      try {
        setSaving(true);
        await onCommit();
      } catch {
        // swallow; parent can toast
      } finally {
        setSaving(false);
      }
    }
    setEditingIndex(null);
  };

  const columns = [
    {
      id: 'drag',
      cell: () => <IconGripVertical className='text-neutral-400 size-4' />,
      width: '10px',
    },
    {
      id: 'value',
      cell: ({ row }: { row: { original: TagOption; index: number } }) => {
        return editingIndex === row.index ? (
          <div
            data-tag-option-edit-scope='true'
            className='flex items-center gap-2 w-full'
          >
            <Input
              value={editingValue}
              onChange={(e) => setEditingValue(e.target.value)}
              autoFocus
              onKeyDown={async (e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  await commitUpdate(row.index);
                } else if (e.key === 'Escape') {
                  setEditingIndex(null);
                  setEditingValue('');
                }
              }}
              className='h-9'
            />
          </div>
        ) : (
          <p>{row.original.value}</p>
        );
      },
    },
    {
      id: 'actions',
      cell: ({ row }: { row: { index: number } }) => {
        if (editingIndex === row.index) {
          return (
            <div
              className='flex items-center gap-2'
              data-tag-option-edit-scope='true'
            >
              <Button
                size='sm'
                disabled={saving || !editingValue.trim()}
                onClick={async () => await commitUpdate(row.index)}
              >
                {saving ? '...' : 'Done'}
              </Button>
            </div>
          );
        }
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='ghost' size='icon'>
                <IconDotsVertical className='text-neutral-400 size-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className='z-9999'>
              <DropdownMenuItem
                onClick={() => {
                  setEditingIndex(row.index);
                  setEditingValue(tagOptions[row.index].value);
                }}
              >
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                variant='destructive'
                className='hover:bg-destructive/10'
                onClick={() => onDelete(row.index)}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
      width: '50px',
    },
  ];

  return (
    <>
      <div
        className={`flex flex-col gap-3 rounded-md ${tagOptions.length === 0 ? '' : 'border'}`}
      >
        <DndContext
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
          sensors={sensors}
        >
          <Table>
            <TableBody className=''>
              <SortableContext
                items={dataIds}
                strategy={verticalListSortingStrategy}
              >
                {tagOptions.map((option, index) => (
                  <DraggableTagRow
                    key={option.id}
                    row={{
                      id: option.id,
                      index,
                      original: option,
                      getVisibleCells: () =>
                        columns.map((column) => ({
                          id: column.id,
                          column: { columnDef: column },
                          getContext: () => ({
                            row: { original: option, index },
                          }),
                        })),
                    }}
                    _onUpdate={onUpdate}
                    _onDelete={onDelete}
                    _onEdit={() => setEditingIndex(index)}
                  />
                ))}
              </SortableContext>
            </TableBody>
          </Table>
        </DndContext>
      </div>
      <div className='flex gap-2'>
        <Input
          value={newTagOption}
          onChange={(e) => setNewTagOption(e.target.value)}
          placeholder='Add new tag option'
        />
        <Button type='button' onClick={handleAddTagOption}>
          Add
        </Button>
      </div>
    </>
  );
}
