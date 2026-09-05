'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DialogClose } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LucideGripVertical, LucideMoreVertical, LucidePlus, LucideTrash2, LucideX } from 'lucide-react';
import type { IDadixGridViewField, ISortingRule, ISortingRules } from '@/types';
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
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

const OPEN_VIEW_SORTING_DIALOG_EVENT = 'dadix--open-view-sorting-dialog-event';

function SortableRuleRow({
  rule,
  index,
  viewFields,
  updateRule,
  removeRule,
}: {
  rule: ISortingRule;
  index: number;
  viewFields: IDadixGridViewField[];
  updateRule: (index: number, patch: Partial<ISortingRule>) => void;
  removeRule: (index: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `rule-${index}` });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex flex-row items-center gap-4 rounded-md border bg-background px-4 py-3 ${isDragging ? 'opacity-80 shadow-md z-10' : ''}`}
    >
      <span
        className='cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground shrink-0'
        {...attributes}
        {...listeners}
      >
        <LucideGripVertical className='size-4' />
      </span>
      <div className='flex-1 min-w-0'>
        <Select
          value={rule.fieldId != null ? String(rule.fieldId) : 'none'}
          onValueChange={(v) =>
            updateRule(index, {
              fieldId: v === 'none' ? undefined : parseInt(v, 10),
            })
          }
        >
          <SelectTrigger className='w-full'>
            <SelectValue placeholder='Field' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='none'>—</SelectItem>
            {viewFields
              .filter((f) => f.fieldName)
              .map((f) => (
                <SelectItem key={f.id} value={String(f.fieldId)}>
                  {f.fieldName}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
      <div className='w-32 shrink-0'>
        <Select
          value={rule.direction ?? 'ASC'}
          onValueChange={(v) =>
            updateRule(index, { direction: v as 'ASC' | 'DESC' })
          }
        >
          <SelectTrigger className='w-full'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='ASC'>A → Z</SelectItem>
            <SelectItem value='DESC'>Z → A</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button
        type='button'
        variant='ghost'
        size='icon'
        className='h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive'
        onClick={() => removeRule(index)}
        aria-label='Remove rule'
      >
        <LucideTrash2 className='size-4' />
      </Button>
    </div>
  );
}

function ViewSortingDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [viewId, setViewId] = useState<number | null>(null);
  const [tableId, setTableId] = useState<string | null>(null);
  const [viewFields, setViewFields] = useState<IDadixGridViewField[]>([]);
  const [rules, setRules] = useState<ISortingRule[]>([]);
  const onSaveRef = useRef<(rules: ISortingRules) => void>(() => {});

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 5 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = rules.findIndex((_, i) => `rule-${i}` === active.id);
    const toIndex = rules.findIndex((_, i) => `rule-${i}` === over.id);
    if (fromIndex < 0 || toIndex < 0) return;
    setRules((prev) => {
      const next = [...prev];
      const [removed] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, removed);
      return next;
    });
  };

  useEffect(() => {
    const handler = (evnt: Event) => {
      const d = (evnt as CustomEvent).detail;
      if (!d?.viewId || !d?.tableId) return;
      setViewId(d.viewId);
      setTableId(d.tableId);
      setViewFields(d.viewFields ?? []);
      const current = d.currentSortRules as ISortingRules | undefined;
      if (Array.isArray(current) && current.length > 0) {
        setRules(
          current.map((r) => ({
            fieldId: r?.fieldId,
            direction: r?.direction ?? 'ASC',
          }))
        );
      } else {
        setRules([]);
      }
      onSaveRef.current = typeof d.onSave === 'function' ? d.onSave : () => {};
      setIsOpen(true);
    };
    window.addEventListener(OPEN_VIEW_SORTING_DIALOG_EVENT, handler);
    return () => window.removeEventListener(OPEN_VIEW_SORTING_DIALOG_EVENT, handler);
  }, []);

  const updateRule = (index: number, patch: Partial<ISortingRule>) => {
    setRules((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...patch } : r))
    );
  };

  const addRule = () => {
    const firstFieldId = viewFields.filter((f) => f.fieldName)[0]?.fieldId;
    setRules((prev) => [
      ...prev,
      { fieldId: firstFieldId ?? undefined, direction: 'ASC' },
    ]);
  };

  const removeRule = (index: number) => {
    setRules((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    const valid = rules.filter((r) => r?.fieldId != null && r?.direction);
    onSaveRef.current(valid);
    setIsOpen(false);
  };

  const handleClear = () => {
    setRules([]);
    onSaveRef.current([]);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent showCloseButton={false} className='sm:max-w-[620px]'>
        <DialogHeader className='flex-row flex-nowrap items-center relative'>
          <DialogClose asChild>
            <Button variant='outline' size='icon' aria-label='Close' className='absolute left-0'>
              <LucideX />
            </Button>
          </DialogClose>
          <DialogTitle className='flex-1 text-center px-10'>Sorting</DialogTitle>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='outline' size='icon' aria-label='Menu' className='absolute right-0'>
                <LucideMoreVertical className='size-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem onClick={handleClear}>
                <LucideTrash2 className='size-4 mr-2' />
                Clear all sorting
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </DialogHeader>
        <div className='flex flex-col gap-4 pt-2'>
          <DndContext
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={handleDragEnd}
            sensors={sensors}
          >
            <SortableContext
              items={rules.map((_, i) => `rule-${i}`)}
              strategy={verticalListSortingStrategy}
            >
              <div className='flex flex-col gap-3'>
                {rules.map((rule, index) => (
                  <SortableRuleRow
                    key={`rule-${index}`}
                    rule={rule}
                    index={index}
                    viewFields={viewFields}
                    updateRule={updateRule}
                    removeRule={removeRule}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <div className='flex flex-row items-center justify-between pt-2'>
            <Button type='button' variant='outline' size='sm' onClick={addRule}>
              <LucidePlus className='size-4 mr-1' />
              Add rule
            </Button>
            <div className='flex flex-row gap-2'>
              <Button variant='outline' onClick={handleClear}>
                Clear
              </Button>
              <Button onClick={handleSave}>Save</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function openViewSortingDialog({
  viewId,
  tableId,
  currentSortRules,
  viewFields,
  onSave,
}: {
  viewId: number;
  tableId: string;
  currentSortRules?: ISortingRules;
  viewFields?: IDadixGridViewField[];
  onSave: (rules: ISortingRules) => void;
}) {
  window.dispatchEvent(
    new CustomEvent(OPEN_VIEW_SORTING_DIALOG_EVENT, {
      detail: { viewId, tableId, currentSortRules, viewFields, onSave },
    })
  );
}

export { ViewSortingDialog, openViewSortingDialog };
