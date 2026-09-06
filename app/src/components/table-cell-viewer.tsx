import React, { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { dadixEvents } from '@/constants/events';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  LucideArrowDown,
  LucideArrowUp,
  LucideFileText,
  LucideLayoutGrid,
  LucideMoreVertical,
  LucideMousePointerClick,
  LucidePencil,
  LucidePlus,
  LucideRouteOff,
  LucideScrollText,
  LucideTrash2,
  LucideX,
  GripVertical,
} from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis, restrictToWindowEdges } from '@dnd-kit/modifiers';
import { motion, AnimatePresence } from 'framer-motion';
import tableService from '@/lib/table';
import { formatNumber } from '@/lib/numberFormat';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
} from '@/components/ui/alert-dialog';
import Tag from '@/components/tag';
// Calendar utilities for single-input date picker
import { Calendar as CalendarIcon } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
// import { LoadingIndicator } from '@/components/loading-indicator/LoadingIndicator';
import recordControllers from '@/lib/record';
import { FormulaEval } from './formula-eval/FormulaEval';
import { FileFieldControl } from '@/components/file-field/FileFieldControl';
import { fileFieldDisplayName } from '@/lib/fileField';
import { availableDadixFieldsDataTypes } from '@/constants';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRequestRelativeRecord } from '@/hooks/useRequestRelativeRecord';
import recordContorllers from '@/lib/record';
import { UserLocalStorage } from '@/lib/userLocalStorage';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useTableContext, type ITableContext } from '@/context/TableContext';
import { Relation } from '@/components/record-editor/relation/Relation';
import { getDocumentTemplates } from '@/lib/documentTemplates';
import {
  injectRecordIntoDocumentContent,
  renderDocumentToHtml,
} from '@/components/document-editor/documentPlaceholders';
import { TableIcon, availableTableIcons } from '@/components/table-icon/TableIcon';
import {
  openEditTableFieldPanel,
  FIELD_PANEL_LAYOUT_OPENED,
  FIELD_PANEL_LAYOUT_CLOSED,
} from '@/components/table-editor/EditTableFieldPanel';
import { openRecordEditorButtonPanel } from '@/components/record-editor/RecordEditorButtonPanel';
import type { DocumentTemplate, Field, TextFieldOptions } from '@/types';

import { useEventHandler } from '@/hooks/useEventHandler';
import { evalDadixCode } from '@/lib/dadixCodeEval';
import { decodeRelationData, isEncodedRelationData } from '@/lib/utils';
import { findLocalTableById } from '@/lib/dev-demo-data';
import { useMutex } from '@/hooks/useMutex';
import { useLanguage } from '@/context/LanguageContext';
import { useAuthContext } from '@/context/AuthContext';

export const OPEN_RECORD_EDITOR_EVENT = 'dadix--open-record-editor-event';
export const CLOSE_RECORD_EDITOR_EVENT = 'dadix--close-record-editor-event';

const RECORD_EDITOR_LAYOUT_KEY = 'dadix-record-editor-layout';
const MAX_COLS_PER_ROW = 3;

/** GOLDEN RULE: Gap between field blocks in record editor. Always 15px, edit mode or not. Do not change. */
const RECORD_EDITOR_BLOCK_GAP_PX = 15;

/**
 * Strip single-line (//) and multi-line (/* *\/) comments from button code
 * so that alert() parsing and execution ignore comments.
 */
function stripButtonCodeComments(code: string): string {
  let out = '';
  let i = 0;
  const n = code.length;
  while (i < n) {
    // Single-line comment: // to end of line
    if (i + 1 < n && code[i] === '/' && code[i + 1] === '/') {
      i += 2;
      while (i < n && code[i] !== '\n') i++;
      if (i < n) out += code[i++]; // keep the newline
      continue;
    }
    // Multi-line comment: /* ... */
    if (i + 1 < n && code[i] === '/' && code[i + 1] === '*') {
      i += 2;
      while (i + 1 < n && !(code[i] === '*' && code[i + 1] === '/')) i++;
      i = i + 2 <= n ? i + 2 : n;
      continue;
    }
    out += code[i++];
  }
  return out;
}

/** 'content' = button width fits text, left-aligned; 'full' = full width like a field, text centered */
export type RecordEditorButtonWidthMode = 'content' | 'full';

export type RecordEditorButtonConfig = {
  title: string;
  code: string;
  widthMode?: RecordEditorButtonWidthMode;
};

type RecordEditorRow = {
  fieldIds: (number | null)[];
  widths?: number[];
  decoration?: boolean;
  /** When set, row is duo (2 slots), trio (3 slots), or button (custom button with title + code). */
  decorationType?: 'duo' | 'trio' | 'button';
  /** Used when decorationType === 'button'. */
  buttonConfig?: RecordEditorButtonConfig;
};
type RecordEditorLayout = { rows: RecordEditorRow[] };

function getRecordFieldValue(
  record: Record<string, unknown> | null,
  field: Field
): unknown {
  if (!record || !field) return undefined;
  if (Object.prototype.hasOwnProperty.call(record, field.name)) {
    return record[field.name];
  }
  const idKey = String(field.id);
  if (Object.prototype.hasOwnProperty.call(record, idKey)) {
    return record[idKey];
  }
  const wanted = String(field.name).toLowerCase();
  const match = Object.keys(record).find((key) => key.toLowerCase() === wanted);
  return match ? record[match] : undefined;
}

function getDefaultRecordEditorLayout(sortedFields: Field[]): RecordEditorLayout {
  return {
    rows: (sortedFields ?? []).map((f) => ({ fieldIds: [f.id] })),
  };
}

function loadRecordEditorLayout(
  tableId: string | undefined,
  sortedFields: Field[]
): RecordEditorLayout {
  if (!tableId || typeof window === 'undefined' || !sortedFields?.length)
    return getDefaultRecordEditorLayout(sortedFields);
  try {
    const raw = localStorage.getItem(`${RECORD_EDITOR_LAYOUT_KEY}-${tableId}`);
    if (!raw) return getDefaultRecordEditorLayout(sortedFields);
    const parsed = JSON.parse(raw) as RecordEditorLayout;
    if (!parsed?.rows || !Array.isArray(parsed.rows))
      return getDefaultRecordEditorLayout(sortedFields);
    const existingIds = new Set(sortedFields.map((f) => f.id));
    const used = new Set<number>();
    const rows: RecordEditorRow[] = [];
    for (const row of parsed.rows) {
      const rawIds = (row.fieldIds || []) as (number | null)[];
      let fieldIds: (number | null)[] = rawIds
        .slice(0, MAX_COLS_PER_ROW)
        .map((id) => {
          if (id === null || id === undefined) return null;
          if (existingIds.has(id) && !used.has(id)) {
            used.add(id);
            return id;
          }
          return null;
        });
      // Non-decoration rows: only one field per row
      if (!row.decoration) {
        const first = fieldIds.find((id) => id !== null);
        fieldIds = first !== undefined ? [first] : [];
      }
      const hasAny = fieldIds.some((id) => id !== null);
      const isButton = (row as { decorationType?: string }).decorationType === 'button';
      const buttonConfig = (row as { buttonConfig?: RecordEditorButtonConfig }).buttonConfig;
      if (hasAny || row.decoration || isButton) {
        rows.push({
          fieldIds: isButton ? [] : fieldIds,
          widths: row.widths,
          decoration: !!row.decoration || isButton,
          ...(isButton && { decorationType: 'button' as const }),
          ...(isButton && buttonConfig && { buttonConfig: { title: buttonConfig.title ?? 'Button', code: buttonConfig.code ?? '', widthMode: buttonConfig.widthMode ?? 'content' } }),
        });
      }
    }
    for (const f of sortedFields) {
      if (!used.has(f.id)) rows.push({ fieldIds: [f.id] });
    }
    return { rows };
  } catch {
    return getDefaultRecordEditorLayout(sortedFields);
  }
}

function saveRecordEditorLayout(
  tableId: string | undefined,
  layout: RecordEditorLayout
) {
  if (!tableId || typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      `${RECORD_EDITOR_LAYOUT_KEY}-${tableId}`,
      JSON.stringify(layout)
    );
  } catch {
    // ignore
  }
}

/** Remove empty rows (no non-null fields and not decoration/button). */
function filterEmptyRows(rows: RecordEditorRow[]): RecordEditorRow[] {
  return rows.filter(
    (row) =>
      row.fieldIds.some((id) => id !== null) ||
      row.decoration ||
      row.decorationType === 'button'
  );
}

function layoutRemoveField(layout: RecordEditorLayout, fieldId: number): RecordEditorLayout {
  const rows = layout.rows.map((row) => ({
    ...row,
    fieldIds: row.fieldIds.map((id) => (id === fieldId ? null : id)),
  }));
  return { rows: filterEmptyRows(rows) };
}

/**
 * Insert field at (rowIndex, colIndex). Computed once in onDragEnd.
 * - Drop at end: append one row.
 * - Decoration row: set slot; if slot was occupied, reflow displaced into next row (insert row at rowIndex+1).
 * - Non-decoration: insert one row at rowIndex (shifts rows down). No padding, no push-to-end.
 */
function layoutInsertAt(
  layout: RecordEditorLayout,
  rowIndex: number,
  colIndex: number,
  fieldId: number
): RecordEditorLayout {
  const rows = layout.rows.map((r) => ({
    ...r,
    fieldIds: [...r.fieldIds],
  }));
  const col = Math.min(colIndex, MAX_COLS_PER_ROW - 1);

  if (rowIndex >= rows.length) {
    rows.push({ fieldIds: [fieldId] });
    return { rows: filterEmptyRows(rows) };
  }

  const targetRow = rows[rowIndex];
  if (targetRow?.decoration) {
    const row = rows[rowIndex];
    while (row.fieldIds.length <= col) row.fieldIds.push(null);
    const displaced = row.fieldIds[col] ?? null;
    row.fieldIds[col] = fieldId;
    if (displaced !== null && displaced !== fieldId) {
      rows.splice(rowIndex + 1, 0, { fieldIds: [displaced] });
    }
    return { rows: filterEmptyRows(rows) };
  }

  rows.splice(rowIndex, 0, { fieldIds: [fieldId] });
  return { rows: filterEmptyRows(rows) };
}

function layoutMoveField(
  layout: RecordEditorLayout,
  fieldId: number,
  toRowIndex: number,
  toColIndex: number
): RecordEditorLayout {
  const without = layoutRemoveField(layout, fieldId);
  return layoutInsertAt(without, toRowIndex, toColIndex, fieldId);
}

function layoutAddDecorationRow(
  layout: RecordEditorLayout,
  type: 'duo' | 'trio' | 'button'
): RecordEditorLayout {
  if (type === 'button') {
    const row: RecordEditorRow = {
      fieldIds: [],
      decoration: true,
      decorationType: 'button',
      buttonConfig: { title: 'Button', code: '', widthMode: 'content' },
    };
    return { rows: [...layout.rows, row] };
  }
  const n = type === 'duo' ? 2 : 3;
  const row: RecordEditorRow = {
    fieldIds: Array.from({ length: n }, () => null),
    widths: Array.from({ length: n }, () => 1 / n),
    decoration: true,
    decorationType: type,
  };
  return { rows: [...layout.rows, row] };
}

function layoutMoveDecorationRow(
  layout: RecordEditorLayout,
  fromIndex: number,
  toIndex: number
): RecordEditorLayout {
  const rows = [...layout.rows];
  if (fromIndex < 0 || fromIndex >= rows.length || toIndex < 0 || toIndex > rows.length)
    return layout;
  const [removed] = rows.splice(fromIndex, 1);
  rows.splice(toIndex > fromIndex ? toIndex - 1 : toIndex, 0, removed);
  return { rows };
}

function layoutRemoveDecorationRow(
  layout: RecordEditorLayout,
  rowIndex: number
): RecordEditorLayout {
  const row = layout.rows[rowIndex];
  if (!row?.decoration) return layout;
  const fieldIds = row.fieldIds.filter((id): id is number => id !== null);
  let rows = layout.rows.filter((_, i) => i !== rowIndex);
  for (const fid of fieldIds) {
    rows = layoutInsertAt({ rows }, rows.length, 0, fid).rows;
  }
  return { rows };
}

// --- Data-first reorder: flat field list + arrayMove ---

/** Extract flat ordered list of field IDs from layout (data source for reordering). */
function getFlatFieldIdsFromLayout(layout: RecordEditorLayout): number[] {
  return layout.rows.flatMap((r) =>
    r.fieldIds.filter((id): id is number => id != null)
  );
}

/** Flat index of the position "before row rowIndex" (for gap-before-N). */
function flatIndexForGap(layout: RecordEditorLayout, rowIndex: number): number {
  return layout.rows.slice(0, rowIndex).reduce(
    (sum, row) =>
      sum + row.fieldIds.filter((id) => id != null).length,
    0
  );
}

/** Flat index where a drop on slot (rowIndex, colIndex) should insert. */
function flatIndexForSlot(
  layout: RecordEditorLayout,
  rowIndex: number,
  colIndex: number
): number {
  const prev = flatIndexForGap(layout, rowIndex);
  const row = layout.rows[rowIndex];
  if (!row) return prev;
  const beforeInRow = row.fieldIds
    .slice(0, colIndex)
    .filter((id) => id != null).length;
  return prev + beforeInRow;
}

/**
 * Stable reorder: move item at fromIndex to toIndex. No overwrite, no lost elements.
 * Supports append: toIndex === arr.length.
 */
function arrayMove<T>(arr: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= arr.length)
    return [...arr];
  const to = Math.max(0, Math.min(toIndex, arr.length));
  const copy = [...arr];
  const [removed] = copy.splice(fromIndex, 1);
  if (removed === undefined) return arr;
  const insertAt = to > fromIndex ? to - 1 : to;
  copy.splice(insertAt, 0, removed);
  return copy;
}

/**
 * Redistribute flat field list back into current row structure (same row counts and slot counts).
 * Preserves decoration and widths; only field order changes.
 */
function layoutFromFlatFieldIds(
  flatFieldIds: number[],
  layout: RecordEditorLayout
): RecordEditorLayout {
  const rows: RecordEditorRow[] = [];
  let idx = 0;
  for (const row of layout.rows) {
    if (row.decorationType === 'button') {
      rows.push({ ...row });
      continue;
    }
    const slotCount = row.fieldIds.length;
    const fieldIds: (number | null)[] = [];
    for (let s = 0; s < slotCount; s++) {
      fieldIds.push(
        idx < flatFieldIds.length ? flatFieldIds[idx++] : null
      );
    }
    rows.push({
      ...row,
      fieldIds,
      widths: row.widths,
      decoration: row.decoration,
    });
  }
  while (idx < flatFieldIds.length) {
    rows.push({ fieldIds: [flatFieldIds[idx++]] });
  }
  return { rows };
}

export type ProtocolEntry = { user: string; action: string; timestamp: string };

const PROTOCOL_STORAGE_KEY = 'dadix-record-protocol';

function getRecordProtocol(tableId: string | undefined, recordId: unknown): ProtocolEntry[] {
  if (!tableId || recordId == null) return [];
  try {
    const key = `${PROTOCOL_STORAGE_KEY}-${tableId}-${recordId}`;
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function ensureProtocolHasCreateEntry(
  tableId: string | undefined,
  recordId: unknown,
  createLabel: string
): ProtocolEntry[] {
  const entries = getRecordProtocol(tableId, recordId);
  if (entries.length > 0) return entries;
  const defaultEntry: ProtocolEntry = {
    user: 'System',
    action: createLabel,
    timestamp: new Date().toISOString(),
  };
  const next = [defaultEntry];
  try {
    const key = `${PROTOCOL_STORAGE_KEY}-${tableId}-${recordId}`;
    if (typeof window !== 'undefined') window.localStorage.setItem(key, JSON.stringify(next));
  } catch {}
  return next;
}

function formatProtocolTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}.${mm}.${yyyy} ${hh}:${min}`;
  } catch {
    return iso;
  }
}

function appendRecordProtocolEntry(
  tableId: string | undefined,
  recordId: unknown,
  entry: ProtocolEntry
): void {
  if (!tableId || recordId == null || typeof window === 'undefined') return;
  try {
    const key = `${PROTOCOL_STORAGE_KEY}-${tableId}-${recordId}`;
    const raw = window.localStorage.getItem(key);
    const list: ProtocolEntry[] = raw ? (JSON.parse(raw) as ProtocolEntry[]) : [];
    list.unshift(entry);
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {}
}

interface RecordEditorState {
  tableId: string | undefined;
  tableFields: Field[];
  recordData: Record<string, unknown>;
}

export function TableRecordEditorsManager() {
  const [recordEditorsStates, setRecordEditorsStates] = useState<
    RecordEditorState[]
  >([]);
  const { acquire: requestWritingToRecordEditorsStates } = useMutex();
  const lastHiddenEditorIndexsRef = useRef<number[]>([]);
  const [lastHiddenEditorIndex, setLastHiddenEditorIndex] =
    useState<number>(-1);
  const [editorWidth, setEditorWidth] = useState<number | undefined>(undefined);
  const [fieldPanelWidth, setFieldPanelWidth] = useState(0);
  const [isFieldPanelOpen, setIsFieldPanelOpen] = useState(false);

  useEventHandler(FIELD_PANEL_LAYOUT_OPENED, (evnt: Event) => {
    const { width } = (evnt as CustomEvent).detail ?? {};
    setFieldPanelWidth(typeof width === 'number' ? width : 420);
    setIsFieldPanelOpen(true);
  });
  useEventHandler(FIELD_PANEL_LAYOUT_CLOSED, () => {
    setIsFieldPanelOpen(false);
  });

  useEffect(() => {
    const savedRecordEditorWidth = UserLocalStorage.getRecordEditorWidth();
    if (savedRecordEditorWidth !== undefined)
      setEditorWidth(parseInt(savedRecordEditorWidth));
  }, []);

  useEffect(() => {
    if (recordEditorsStates.length > 0) return;
    if (
      lastHiddenEditorIndex !== -1 ||
      lastHiddenEditorIndexsRef.current.length > 0
    ) {
      lastHiddenEditorIndexsRef.current = [];
      setLastHiddenEditorIndex(-1);
    }
  }, [recordEditorsStates, lastHiddenEditorIndex]);

  // handle open record event
  useEventHandler(
    dadixEvents.recordEvents.onOpen,
    (evnt: Event) => {
      try {
        const { tableId, tableFields, record } =
          (evnt as CustomEvent).detail || {};
        if (!tableId || !tableFields || !record) return;
        requestWritingToRecordEditorsStates({
          callback: async ({
            lastUpdatedData,
          }: {
            lastUpdatedData: unknown;
          }) => {
            return await new Promise((resolve, reject) => {
              try {
                const currentRecordEditorsStates = ((lastUpdatedData ??
                  recordEditorsStates) ||
                  []) as RecordEditorState[];
                const indexOfTableInTableRecordEditors =
                  currentRecordEditorsStates.findIndex(
                    (tableRecordEditor) => tableId === tableRecordEditor.tableId
                  );
                const newRecordEditorsStates =
                  indexOfTableInTableRecordEditors >= 0
                    ? currentRecordEditorsStates.slice(
                        0,
                        indexOfTableInTableRecordEditors + 1
                      )
                    : currentRecordEditorsStates.slice(0);
                const newRecordEditorState: RecordEditorState = {
                  tableId,
                  recordData: record,
                  tableFields,
                };
                if (indexOfTableInTableRecordEditors < 0) {
                  newRecordEditorsStates.push({ ...newRecordEditorState });
                } else {
                  newRecordEditorsStates[indexOfTableInTableRecordEditors] = {
                    ...newRecordEditorState,
                  };
                }
                setRecordEditorsStates([...newRecordEditorsStates]);
                resolve({ updatedData: [...newRecordEditorsStates] });
              } catch (err) {
                console.warn(err);
                reject();
              }
            });
          },
        });
      } catch (err) {
        console.error(err);
      }
    },
    [recordEditorsStates]
  );

  // handle close record event
  useEventHandler(
    dadixEvents.recordEvents.onClose,
    (evnt: Event) => {
      try {
        const { tableId, recordId } = (evnt as CustomEvent).detail || {};
        if (!tableId || !recordId) return;
        const lastTimeStamp = new Date().getTime();
        requestWritingToRecordEditorsStates({
          callback: async ({
            lastUpdatedData,
          }: {
            lastUpdatedData: unknown;
          }) => {
            return await new Promise((resolve, reject) => {
              try {
                const currentRecordEditorsStates = ((lastUpdatedData ??
                  recordEditorsStates) ||
                  []) as RecordEditorState[];

                // close a recordEditor has an animation so we add this delay to make sure we don't loose the animation
                // we set delay to 0 in case user closed multiple editors so we apply only one delay.
                const delay =
                  new Date().getTime() - lastTimeStamp > 150 ? 0 : 150;
                setTimeout(() => {
                  try {
                    const indexOfTableInTableRecordEditors =
                      currentRecordEditorsStates.findIndex(
                        (tableRecordEditor) =>
                          tableId === tableRecordEditor.tableId &&
                          `${recordId}` ===
                            `${tableRecordEditor.recordData?.id}`
                      );
                    if (indexOfTableInTableRecordEditors < 0) reject();
                    setRecordEditorsStates(
                      currentRecordEditorsStates.slice(
                        0,
                        indexOfTableInTableRecordEditors
                      )
                    );
                    resolve({
                      updatedData: currentRecordEditorsStates.slice(
                        0,
                        indexOfTableInTableRecordEditors
                      ),
                    });
                  } catch (err) {
                    console.warn(err);
                    reject();
                  }
                }, delay);
              } catch (err) {
                console.warn(err);
                reject();
              }
            });
          },
        });
      } catch (err) {
        console.error(err);
      }
    },
    [recordEditorsStates]
  );

  function setIsHidden(hidden: boolean) {
    if (hidden) {
      const newLastHiddenEditorIndex = recordEditorsStates.length - 1;
      if (lastHiddenEditorIndex >= 0) {
        lastHiddenEditorIndexsRef.current.push(lastHiddenEditorIndex);
      }
      setLastHiddenEditorIndex(newLastHiddenEditorIndex);
      return;
    }
    // if !hidden
    const newLastHiddenEditorIndex =
      lastHiddenEditorIndexsRef.current.pop() ?? -1;
    setLastHiddenEditorIndex(newLastHiddenEditorIndex);
  }

  const shiftStep = useMemo(
    () => Math.max(20, 220 - recordEditorsStates.length * 10),
    [recordEditorsStates]
  );

  return (
    <>
      {recordEditorsStates.map((recordEditorState, i) => (
        <TableRecordEditor
          key={`${recordEditorState.tableId}`}
          {...recordEditorState}
          isNotLastEditor={i < recordEditorsStates.length - 1}
          shiftBy={
            (recordEditorsStates.length - 1 - i) * shiftStep +
            (isFieldPanelOpen ? fieldPanelWidth : 0)
          }
          isHidden={i <= lastHiddenEditorIndex}
          setIsHidden={setIsHidden}
          editorWidth={editorWidth}
          setEditorWidth={setEditorWidth}
          isFieldPanelOpen={isFieldPanelOpen}
        />
      ))}
    </>
  );
}

function SortableFieldRow({
  field,
  order,
  label,
  children,
}: {
  field: Field;
  order: number;
  label: ReactNode;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: field.id,
    data: { id: field.id, order },
  });
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col gap-0 pb-3 ${isDragging ? 'opacity-80 z-10' : ''}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <div className='flex items-center gap-1.5 min-h-0'>
        <div
          className='flex shrink-0 cursor-grab active:cursor-grabbing touch-none self-center rounded hover:bg-muted/50'
          {...attributes}
          {...listeners}
        >
          <GripVertical className='size-3.5 text-muted-foreground' />
        </div>
        <div className='flex-1 min-w-0'>{label}</div>
      </div>
      <div className='w-full mt-2'>{children}</div>
    </div>
  );
}

function RecordEditorResizeHandle({
  rowIndex,
  colIndex,
  row,
  getRowWidth,
  onResize,
}: {
  rowIndex: number;
  colIndex: number;
  row: RecordEditorRow;
  getRowWidth: () => number;
  onResize: (rowIndex: number, colIndex: number, deltaFraction: number) => void;
}) {
  const startXRef = useRef(0);
  const handlerRef = useRef<((e: MouseEvent) => void) | null>(null);
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startXRef.current = e.clientX;
      const onMouseMove = (e: MouseEvent) => {
        const width = getRowWidth();
        if (width <= 0) return;
        const deltaX = e.clientX - startXRef.current;
        startXRef.current = e.clientX;
        onResize(rowIndex, colIndex, deltaX / width);
      };
      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      handlerRef.current = onMouseMove;
    },
    [rowIndex, colIndex, getRowWidth, onResize]
  );
  return (
    <div
      role='separator'
      aria-orientation='vertical'
      onMouseDown={onMouseDown}
      className='w-2 shrink-0 self-stretch flex items-center justify-center group cursor-col-resize'
    >
      <div className='w-0.5 h-full min-h-[40px] bg-border group-hover:bg-primary/50 rounded-full transition-colors' />
    </div>
  );
}

function RecordEditorSlot({
  id,
  children,
  isEditMode,
  className,
  style,
  isEmpty,
  flexible,
}: {
  id: string;
  children: ReactNode;
  isEditMode: boolean;
  className?: string;
  style?: React.CSSProperties;
  isEmpty?: boolean;
  /** When true (duo/trio box), slot fills available space */
  flexible?: boolean;
}) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative min-h-[84px] ${flexible ? 'min-w-0 flex-1' : 'w-full'} ${isEditMode ? 'cursor-grab' : ''} ${className ?? ''}`}
    >
      <div className={`relative w-full ${flexible ? 'min-w-0 h-full' : ''}`}>
        {children}
        {isEditMode && isEmpty && (
          <span className='text-xs text-muted-foreground/60'>Drop field</span>
        )}
      </div>
    </div>
  );
}

/** Row wrapper that is also the droppable for gap-before-{rowIndex}. No extra DOM = no layout shift. */
function RecordEditorRowWrapper({
  rowIndex,
  children,
}: {
  rowIndex: number;
  children: ReactNode;
}) {
  const id = `gap-before-${rowIndex}`;
  const { setNodeRef } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className='relative flex flex-col min-h-0'>
      {children}
    </div>
  );
}

/** Drop target for "after last row"; absolutely positioned so it takes no layout space. */
function LastGapDropTarget({ rowIndex }: { rowIndex: number }) {
  const id = `gap-before-${rowIndex}`;
  const { setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className='absolute bottom-0 left-0 right-0 h-0 w-full max-w-xl pointer-events-auto'
      aria-hidden
    />
  );
}

const DECORATION_ROW_DRAG_PREFIX = 'decoration-row-';

function DecorationRowDraggable({
  rowIndex,
  slotCount,
  rowRef,
  onDelete,
  onEditButton,
  dragHandleMode,
  showRowMenu = true,
  children,
}: {
  rowIndex: number;
  slotCount: number;
  rowRef: (el: HTMLDivElement | null) => void;
  onDelete: () => void;
  onEditButton?: () => void;
  /** When 'content', the whole content area is draggable (no separate grip). When 'grip' or undefined, show grip. */
  dragHandleMode?: 'grip' | 'content';
  /** When false, the three-dots row menu is hidden (e.g. for buttons: edit via click on button). */
  showRowMenu?: boolean;
  children: ReactNode;
}) {
  const id = `${DECORATION_ROW_DRAG_PREFIX}${rowIndex}`;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  const dragHandle = (
    <div
      ref={dragHandleMode === 'content' ? undefined : setNodeRef}
      className='flex shrink-0 cursor-grab active:cursor-grabbing touch-none self-center rounded hover:bg-muted/50 p-1'
      {...attributes}
      {...listeners}
    >
      <GripVertical className='size-4 text-muted-foreground' />
    </div>
  );
  const contentArea = (
    <div
      ref={(el) => {
        rowRef(el);
        if (dragHandleMode === 'content') setNodeRef(el);
      }}
      className={`flex flex-row flex-1 min-w-0 gap-4 items-stretch ${dragHandleMode === 'content' ? 'cursor-grab active:cursor-grabbing touch-none' : ''}`}
      {...(dragHandleMode === 'content' ? { ...attributes, ...listeners } : {})}
    >
      {children}
    </div>
  );
  return (
    <div
      style={transform ? { transform: CSS.Transform.toString(transform) } : undefined}
      className={`flex flex-row items-stretch w-full max-w-xl gap-2 ${isDragging ? 'opacity-50' : ''}`}
    >
      {dragHandleMode === 'content' ? null : dragHandle}
      {contentArea}
      {showRowMenu && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant='ghost'
              size='icon'
              className='h-8 w-8 shrink-0 self-center'
              aria-label='Row menu'
            >
              <LucideMoreVertical className='size-4' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            {onEditButton != null && (
              <DropdownMenuItem onClick={onEditButton}>
                <LucidePencil className='size-4' />
                Edit
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onDelete} className='text-destructive'>
              <LucideTrash2 className='size-4' />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function RecordEditorDraggableCell({
  fieldId,
  label,
  children,
  isDraggingOverlay,
  tableContext,
}: {
  fieldId: number;
  label: ReactNode;
  children: ReactNode;
  isDraggingOverlay?: boolean;
  tableContext?: ITableContext;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: fieldId });
  // When dragging: no transform on placeholder so it stays in layout; overlay is shown via portal.
  const style =
    isDraggingOverlay
      ? undefined
      : isDragging
        ? undefined
        : { transform: CSS.Transform.toString(transform), transition };
  const openFieldEditor = useCallback(() => {
    if (tableContext) {
      openEditTableFieldPanel({
        fieldId,
        tableContext,
        allowNavigation: true,
      });
    }
  }, [fieldId, tableContext]);

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, visibility: isDragging && !isDraggingOverlay ? 'hidden' : 'visible' }}
      className='flex flex-col gap-0 flex-1 min-w-0 pb-4 cursor-grab active:cursor-grabbing touch-none [&_input]:cursor-grab [&_textarea]:cursor-grab [&_select]:cursor-grab [&_label]:cursor-grab [&_[contenteditable]]:cursor-grab'
      {...attributes}
      {...listeners}
    >
      <div className='flex items-center gap-1.5 min-h-0'>
        <div
          className='flex-1 min-w-0 cursor-pointer hover:opacity-80'
          onClick={(e) => {
            e.stopPropagation();
            openFieldEditor();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          role='button'
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openFieldEditor();
            }
          }}
        >
          {label}
        </div>
        {tableContext && (
          <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant='ghost'
                  size='icon'
                  className='h-7 w-7 shrink-0'
                  aria-label='Field menu'
                >
                  <LucideMoreVertical className='size-3.5' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuItem
                  onClick={() =>
                    openEditTableFieldPanel({
                      fieldId,
                      tableContext,
                      allowNavigation: true,
                    })
                  }
                >
                  <LucidePencil className='size-3.5' />
                  Edit
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
      <div className='w-full mt-2 pointer-events-none select-none'>{children}</div>
    </div>
  );
}

interface TableRecordEditorProps {
  tableId: string | undefined;
  tableFields: Field[];
  recordData: Record<string, unknown>;
  isNotLastEditor: boolean;
  shiftBy: number;
  isHidden: boolean;
  setIsHidden: (_v: boolean) => void;
  editorWidth: number | undefined;
  setEditorWidth: (_v: number) => void;
  /** When true, do not close record on outside interaction (field editor open = keep record open like connected field). */
  isFieldPanelOpen?: boolean;
}

function TableRecordEditor({
  tableId,
  tableFields,
  recordData,
  isNotLastEditor,
  shiftBy,
  isHidden,
  setIsHidden,
  editorWidth,
  setEditorWidth,
  isFieldPanelOpen = false,
}: TableRecordEditorProps) {
  const liveTableCtx = useTableContext();
  const closePanelTimoutRef = useRef<NodeJS.Timeout>(undefined);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const isOpenRef = useRef<boolean>(false);
  const tableIdRef = useRef<string | undefined>(undefined);
  const recordIdRef = useRef<number | undefined>(undefined);
  const rowUpdatesRef = useRef<Record<string, unknown>>({});
  const saveRowUpdatesTimoutRef = useRef<NodeJS.Timeout>(undefined);
  const pendingProtocolOldValuesRef = useRef<Record<string, unknown>>({});

  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [record, setRecord] = useState<Record<string, unknown> | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isEditFieldOrder, setIsEditFieldOrder] = useState<boolean>(false);
  const [isProtocolView, setIsProtocolView] = useState<boolean>(false);
  const [recordMenuOpen, setRecordMenuOpen] = useState<boolean>(false);
  const [documentPreviewTemplate, setDocumentPreviewTemplate] = useState<DocumentTemplate | null>(null);
  const [protocolVersion, setProtocolVersion] = useState(0);
  const [alertQueue, setAlertQueue] = useState<string[]>([]);
  const { t } = useLanguage();
  const authCtx = useAuthContext();
  const protocolUserName = authCtx?.state?.user?.username || authCtx?.state?.user?.email || 'User';

  const tableFieldsToUse = useMemo(() => {
    const contextTable = liveTableCtx?.table;
    if (
      contextTable?.fields?.length &&
      String(contextTable.id) === String(tableId)
    ) {
      return contextTable.fields;
    }
    if (tableFields?.length) {
      return tableFields;
    }
    return findLocalTableById(tableId ?? '')?.fields ?? [];
  }, [liveTableCtx?.table, tableId, tableFields]);

  const sortedFields = useMemo(
    () =>
      (tableFieldsToUse ?? [])
        .filter((f) => f.type !== 'SERIAL')
        .sort((a, b) => a.order - b.order),
    [tableFieldsToUse]
  );

  const [recordLayout, setRecordLayout] = useState<RecordEditorLayout>(() =>
    getDefaultRecordEditorLayout(sortedFields)
  );
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [activeDragFieldId, setActiveDragFieldId] = useState<number | null>(null);
  const [activeDragDecorationRowIndex, setActiveDragDecorationRowIndex] = useState<number | null>(null);
  const [overSlotId, setOverSlotId] = useState<string | null>(null);
  const lastOverIdRef = useRef<string | null>(null);
  useEffect(() => {
    setRecordLayout((prev) =>
      loadRecordEditorLayout(tableId ?? undefined, sortedFields)
    );
  }, [tableId, sortedFields]);

  const handleRowResize = useCallback(
    (rowIndex: number, colIndex: number, deltaFraction: number) => {
      setRecordLayout((prev) => {
        const rows = prev.rows.map((r) => ({
          ...r,
          fieldIds: [...r.fieldIds],
          widths: r.widths ? [...r.widths] : r.fieldIds.map(() => 1 / r.fieldIds.length),
        }));
        const row = rows[rowIndex];
        if (!row || colIndex <= 0 || colIndex >= row.widths.length) return prev;
        const w = row.widths;
        w[colIndex - 1] = Math.max(0.15, Math.min(0.85, w[colIndex - 1] + deltaFraction));
        w[colIndex] = Math.max(0.15, Math.min(0.85, w[colIndex] - deltaFraction));
        const next = { rows };
        saveRecordEditorLayout(tableId ?? undefined, next);
        return next;
      });
    },
    [tableId]
  );

  const protocolEntries = useMemo(() => {
    if (!record?.id || !tableId) return [];
    const entries = ensureProtocolHasCreateEntry(
      tableId,
      record.id,
      t('record.protocol.createRecord')
    );
    return [...entries].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [tableId, record?.id, t, protocolVersion]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { delay: 0, distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, distance: 10 } }),
    useSensor(KeyboardSensor, {})
  );

  /** Layout is computed once on drop (onDragEnd). No state updates during drag; stable target from event. */
  const handleFieldReorder = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      const resolvedOver = over ?? (lastOverIdRef.current ? { id: lastOverIdRef.current } : null);
      if (!resolvedOver || active.id === resolvedOver.id || !tableIdRef.current) return;
      lastOverIdRef.current = null;
      const overId = String(resolvedOver.id);
      const activeStr = String(active.id);

      if (activeStr.startsWith(DECORATION_ROW_DRAG_PREFIX) && overId.startsWith('gap-before-')) {
        const fromIndex = parseInt(activeStr.replace(DECORATION_ROW_DRAG_PREFIX, ''), 10);
        const toIndex = parseInt(overId.replace('gap-before-', ''), 10);
        if (!Number.isNaN(fromIndex) && !Number.isNaN(toIndex)) {
          setRecordLayout((prev) => {
            const next = layoutMoveDecorationRow(prev, fromIndex, toIndex);
            saveRecordEditorLayout(tableIdRef.current ?? undefined, next);
            return next;
          });
        }
        setActiveDragDecorationRowIndex(null);
        return;
      }

      // Field drag: data-first reorder via flat array + arrayMove + validation
      const fieldId = Number(active.id);
      if (Number.isNaN(fieldId)) return;

      setRecordLayout((prev) => {
        const flatFieldIds = getFlatFieldIdsFromLayout(prev);
        const fromIndex = flatFieldIds.indexOf(fieldId);
        if (fromIndex === -1) return prev;

        let toFlatIndex: number;
        if (overId.startsWith('gap-before-')) {
          const rowIndex = parseInt(overId.replace('gap-before-', ''), 10);
          if (Number.isNaN(rowIndex)) return prev;
          toFlatIndex = flatIndexForGap(prev, rowIndex);
          // Drop at end: gap-before-rows.length → append
          if (rowIndex >= prev.rows.length) toFlatIndex = flatFieldIds.length;
        } else if (overId.startsWith('slot-')) {
          const [, r, c] = overId.split('-').map(Number);
          if (Number.isNaN(r) || Number.isNaN(c)) return prev;
          toFlatIndex = flatIndexForSlot(prev, r, c);
        } else {
          // Drop on another field (over.id = field id)
          const overFieldId = Number(resolvedOver.id);
          if (Number.isNaN(overFieldId)) return prev;
          toFlatIndex = flatFieldIds.indexOf(overFieldId);
          if (toFlatIndex === -1) return prev;
        }

        const newFlat = arrayMove(flatFieldIds, fromIndex, toFlatIndex);

        // Validation: no data loss
        if (newFlat.length !== flatFieldIds.length) return prev;
        const beforeSet = new Set(flatFieldIds);
        const afterSet = new Set(newFlat);
        if (beforeSet.size !== afterSet.size || [...beforeSet].some((id) => !afterSet.has(id)))
          return prev;
        if (!newFlat.includes(fieldId)) return prev;

        const next = layoutFromFlatFieldIds(newFlat, prev);
        saveRecordEditorLayout(tableIdRef.current ?? undefined, next);
        return next;
      });
    },
    []
  );

  const { getRelativeRecord, getFirstOrLastRecord, isLoadingNext, isLoadingLast } =
    useRequestRelativeRecord();
  const { canEditRecords } = useRequireRole();

  const isARelatedRecord: boolean = useMemo(
    () => isEncodedRelationData(tableId || ''),
    [tableId]
  );

  useEffect(() => {
    if (!tableId || !recordData || !recordData.id) return;
    if (
      tableId === tableIdRef.current &&
      (recordData.id as number) === recordIdRef.current
    )
      return;
    clearTimeout(closePanelTimoutRef.current);
    tableIdRef.current = tableId;
    recordIdRef.current = recordData.id as number;
    setRecord({ ...recordData });
    setIsOpen(true);
    rowUpdatesRef.current = {};
    pendingProtocolOldValuesRef.current = {};
  }, [tableId, recordData]);

  useEffect(() => {
    if (!record || !tableIdRef.current) return;
    isOpenRef.current = isOpen;
    if (!isOpen) {
      dispatchOnRecordCloseEvent({
        tableId: tableIdRef.current,
        recordId: record?.id as string | number,
      });
    }
  }, [isOpen, record]);

  const handleDelete = useCallback(() => {
    if (!tableIdRef.current || !record) {
      toast.error('No table selected');
      return;
    }

    try {
      setIsDeleting(true);
      recordControllers
        .deleteRecord({
          tableId: tableIdRef.current,
          id: record.id as string | number,
        })
        .then((res) => {
          toast.success('Record deleted successfully!');
          setIsOpen(false);
          setIsDeleting(false);
          return res;
        })
        .catch((err) => {
          setIsDeleting(false);
          console.error(err);
          throw new Error('Error deleting record');
        });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error deleting record:', error);
      toast.error(error.response?.data?.message || 'Failed to delete record');
    }
  }, [record]);

  const handleDeleteRelation = useCallback(() => {
    if (!tableIdRef.current || !record) {
      toast.error('No table selected');
      return;
    }

    try {
      const { tableId, relatedToTableWithId, recordId, relationId } =
        decodeRelationData(tableIdRef.current);
      if (
        !tableId ||
        !relatedToTableWithId ||
        !recordId ||
        !relatedToTableWithId
      )
        return;
      setIsDeleting(true);
      recordControllers
        .deleteRelatedRecord({
          tableId,
          relatedToTableWithId,
          recordId,
          relatedToRecordWithId: record.id as number,
          relationId,
          relationRecordId: record._relation_record_id as number,
        })
        .then((res) => {
          toast.success('Record deleted successfully!');
          setIsOpen(false);
          setIsDeleting(false);
          return res;
        })
        .catch((err) => {
          setIsDeleting(false);
          console.error(err);
          throw new Error('Error deleting record');
        });
    } catch (error) {
      console.error('Error deleting record:', error);
      toast.error('Failed to delete record');
    }
  }, [record]);

  const handleItemChange = useCallback(
    ({ itemFieldName, value }: { itemFieldName: string; value: unknown }) => {
      setRecord((prev) => {
        if (pendingProtocolOldValuesRef.current[itemFieldName] === undefined) {
          pendingProtocolOldValuesRef.current[itemFieldName] = prev?.[itemFieldName];
        }
        return { ...prev, [itemFieldName]: value };
      });
      rowUpdatesRef.current = {
        ...(rowUpdatesRef.current || {}),
        [itemFieldName]: value,
      };
      const rowId = record?.id;
      const updates = { ...rowUpdatesRef.current };
      clearTimeout(saveRowUpdatesTimoutRef.current);
      try {
        saveRowUpdatesTimoutRef.current = setTimeout(() => {
          if (rowId === record?.id) rowUpdatesRef.current = {};
          const tableIdForProtocol = tableIdRef.current;
          const fieldNames = Object.keys(updates);
          if (fieldNames.length > 0 && tableIdForProtocol && rowId != null) {
            const oldValues = { ...pendingProtocolOldValuesRef.current };
            pendingProtocolOldValuesRef.current = {};
            const formatVal = (v: unknown) => {
              if (v === undefined || v === null || v === '') return '(leer)';
              const fileName = fileFieldDisplayName(v);
              if (fileName) return `"${fileName}"`;
              const s = String(v);
              return s.length > 40 ? `"${s.slice(0, 37)}..."` : `"${s}"`;
            };
            const actionParts = fieldNames.map(
              (fn) => `${fn}: ${formatVal(oldValues[fn])} → ${formatVal(updates[fn])}`
            );
            const action =
              actionParts.length === 1
                ? `${t('record.protocol.updateField')} ${actionParts[0]}`
                : actionParts.map((p) => `${t('record.protocol.updateField')} ${p}`).join('; ');
            appendRecordProtocolEntry(tableIdForProtocol, rowId, {
              user: protocolUserName,
              action,
              timestamp: new Date().toISOString(),
            });
            setProtocolVersion((v) => v + 1);
          }
          recordContorllers
            .updateRecord({
              tableId: `${tableIdRef.current}`,
              recordId: rowId as number,
              updatedRecordData: { ...updates },
              silence: true,
            })
            .catch((err) => {
              console.warn('Error update record!');
              console.error(err);
              toast.error('Error update record!');
            });
        }, 2000);
      } catch (err) {
        console.error('Error upadting record', err);
        toast.error('Error saving record changes');
      }
      window.dispatchEvent(
        new CustomEvent(dadixEvents.recordEvents.onChange, {
          detail: {
            tableId: isEncodedRelationData(tableIdRef.current as string)
              ? decodeRelationData(tableIdRef.current as string)
                  .relatedToTableWithId
              : tableIdRef.current,
            recordId: rowId,
            updatedRecordData: { [itemFieldName]: value },
          },
        })
      );
    },
    [record, protocolUserName, t]
  );

  const openRecordById = useCallback(
    (nextRecord: Record<string, unknown>) => {
      if (!tableIdRef.current) return;
      openTableRecord({
        tableId: tableIdRef.current,
        tableFields: tableFieldsToUse,
        record: nextRecord,
      });
    },
    [tableFieldsToUse]
  );

  const getNextRecord = useCallback(() => {
    if (!tableIdRef.current || !record?.id) return;
    getRelativeRecord({
      tableId: tableIdRef.current,
      recordId: record.id as number,
      relation: 'after',
    })
      .then((res) => {
        if (res.record && tableIdRef.current) {
          openRecordById(res.record);
        } else if (tableIdRef.current) {
          getFirstOrLastRecord({ tableId: tableIdRef.current, which: 'first' }).then(
            (first) => first.record && openRecordById(first.record)
          );
        }
        return res;
      })
      .catch((err) => console.error(err));
  }, [record?.id, getRelativeRecord, getFirstOrLastRecord, openRecordById]);

  const getPreviousRecord = useCallback(() => {
    if (!tableIdRef.current || !record?.id) return;
    getRelativeRecord({
      tableId: tableIdRef.current,
      recordId: record.id as number,
      relation: 'before',
    })
      .then((res) => {
        if (res.record && tableIdRef.current) {
          openRecordById(res.record);
        } else if (tableIdRef.current) {
          getFirstOrLastRecord({ tableId: tableIdRef.current, which: 'last' }).then(
            (last) => last.record && openRecordById(last.record)
          );
        }
        return res;
      })
      .catch((err) => console.error(err));
  }, [record?.id, getRelativeRecord, getFirstOrLastRecord, openRecordById]);

  useEffect(() => {
    if (!isOpen || !record) return;
    const onKeyDown = (evnt: KeyboardEvent) => {
      const target = evnt.target as Node | null;
      const editable =
        target &&
        (target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement ||
          (target instanceof HTMLElement && target.isContentEditable));
      if (editable) return;
      if (evnt.key === 'ArrowDown') {
        evnt.preventDefault();
        getNextRecord();
      } else if (evnt.key === 'ArrowUp') {
        evnt.preventDefault();
        getPreviousRecord();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, record, getNextRecord, getPreviousRecord]);

  return (
    <>
    <Sheet
      modal={false}
      open={isOpen}
      onOpenChange={
        isNotLastEditor || isHidden
          ? undefined
          : (open) => {
              if (open) {
                setIsOpen(true);
                return;
              }
              if (isFieldPanelOpen) return;
              clearTimeout(closePanelTimoutRef.current);
              closePanelTimoutRef.current = setTimeout(() => {
                setIsOpen(false);
              }, 320);
            }
      }
    >
      <SheetContent
        resizable
        size={editorWidth}
        minSize={420}
        onResizeEnd={(newWidth) => {
          setEditorWidth(newWidth);
          UserLocalStorage.setRecordEditorWidth(newWidth);
        }}
        onResize={(newWidth) => {
          setEditorWidth(newWidth);
        }}
        className={`fixed flex flex-col ${isHidden && 'invisible! **:transition-none'}`}
        style={{ transform: `translateX(-${shiftBy}px)` }}
      >
        {record && (
          <>
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
                {!isEditFieldOrder && !isProtocolView && (
                  <>
                    <Button
                      onClick={getPreviousRecord}
                      size='icon'
                      variant='outline'
                      disabled={isLoadingNext || isLoadingLast}
                    >
                      <LucideArrowUp />
                    </Button>
                    <Button
                      onClick={getNextRecord}
                      size='icon'
                      variant='outline'
                      disabled={isLoadingNext || isLoadingLast}
                    >
                      <LucideArrowDown />
                    </Button>
                  </>
                )}
                {(isEditFieldOrder || isProtocolView) && (
                  <Button
                    size='icon'
                    variant='default'
                    className='h-9 w-auto min-w-9 px-3'
                    onClick={() => {
                      setIsEditFieldOrder(false);
                      setIsProtocolView(false);
                    }}
                  >
                    {t('record.done')}
                  </Button>
                )}
                {isEditFieldOrder && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size='icon' variant='outline' aria-label='Add decoration'>
                        <LucidePlus className='size-4' />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align='end' sideOffset={4}>
                      <DropdownMenuItem
                        onClick={() => {
                          setRecordLayout((prev) => {
                            const next = layoutAddDecorationRow(prev, 'duo');
                            saveRecordEditorLayout(tableId ?? undefined, next);
                            return next;
                          });
                        }}
                      >
                        <LucideLayoutGrid className='size-4' />
                        Duo box
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setRecordLayout((prev) => {
                            const next = layoutAddDecorationRow(prev, 'trio');
                            saveRecordEditorLayout(tableId ?? undefined, next);
                            return next;
                          });
                        }}
                      >
                        <LucideLayoutGrid className='size-4' />
                        Trio box
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setRecordLayout((prev) => {
                            const next = layoutAddDecorationRow(prev, 'button');
                            saveRecordEditorLayout(tableId ?? undefined, next);
                            return next;
                          });
                        }}
                      >
                        <LucideMousePointerClick className='size-4' />
                        Button
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <DropdownMenu modal={true} open={recordMenuOpen} onOpenChange={setRecordMenuOpen}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size='icon'
                      variant='outline'
                      disabled={!canEditRecords || isDeleting}
                      autoFocus={false}
                    >
                      <LucideMoreVertical />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side='bottom'
                    align='end'
                    sideOffset={6}
                    className='min-w-[11rem] px-3 py-2.5 [&_svg]:!text-muted-foreground [&_[data-slot=dropdown-menu-item]]:gap-2 [&_[data-slot=dropdown-menu-item]]:py-2 [&_[data-slot=dropdown-menu-sub-trigger]]:gap-2 [&_[data-slot=dropdown-menu-sub-trigger]]:py-2'
                  >
                    {!isARelatedRecord && canEditRecords && !isEditFieldOrder && (
                      <DropdownMenuItem
                        onClick={(evnt) => {
                          evnt.preventDefault();
                          setIsEditFieldOrder(true);
                          setRecordMenuOpen(false);
                        }}
                      >
                        <LucidePencil className='size-4' />
                        {t('common.edit')}
                      </DropdownMenuItem>
                    )}
                    {!isARelatedRecord && canEditRecords && isEditFieldOrder && (
                      <DropdownMenuItem
                        onClick={(evnt) => {
                          evnt.preventDefault();
                          setIsEditFieldOrder(false);
                          setRecordMenuOpen(false);
                        }}
                      >
                        <LucideX className='size-4' />
                        Close edit
                      </DropdownMenuItem>
                    )}
                    {!isARelatedRecord && tableId && record && (() => {
                      const docTemplates = getDocumentTemplates(tableId);
                      if (docTemplates.length === 0) return null;
                      return (
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger className='gap-2'>
                            <LucideFileText className='size-4 shrink-0' />
                            Documents
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent className='[&_svg]:!text-muted-foreground [&_[data-slot=dropdown-menu-item]]:gap-2'>
                            {docTemplates.map((t) => (
                              <DropdownMenuItem
                                key={t.id}
                                onClick={(evnt) => {
                                  evnt.preventDefault();
                                  setDocumentPreviewTemplate(t);
                                  setRecordMenuOpen(false);
                                }}
                              >
                                <TableIcon
                                  name={availableTableIcons.includes(t.icon ?? '') ? (t.icon as string) : availableTableIcons[0]}
                                  className='size-4 shrink-0'
                                />
                                {t.name}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      );
                    })()}
                    {!isARelatedRecord && !isProtocolView && (
                      <DropdownMenuItem
                        onClick={(evnt) => {
                          evnt.preventDefault();
                          setIsProtocolView(true);
                          setRecordMenuOpen(false);
                        }}
                      >
                        <LucideScrollText className='size-4' />
                        {t('record.protocol')}
                      </DropdownMenuItem>
                    )}
                    {!isARelatedRecord && isProtocolView && (
                      <DropdownMenuItem
                        onClick={(evnt) => {
                          evnt.preventDefault();
                          setIsProtocolView(false);
                          setRecordMenuOpen(false);
                        }}
                      >
                        <LucideX className='size-4' />
                        {t('record.closeProtocol')}
                      </DropdownMenuItem>
                    )}
                    {isARelatedRecord && (
                      <DropdownMenuItem
                        disabled={isDeleting}
                        onClick={(evnt) => {
                          evnt.preventDefault();
                          handleDeleteRelation();
                        }}
                      >
                        {/*{isDeleting ? (
                          <LoadingIndicator
                            visibilityDelay={false}
                            className='size-4'
                          />
                        ) : (
                          <LucideRouteOff />
                        )}*/}
                        <LucideRouteOff />
                        Disconnect
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      variant='destructive'
                      disabled={isDeleting}
                      onClick={(evnt) => {
                        evnt.preventDefault();
                        handleDelete();
                      }}
                    >
                      {/*{isDeleting ? (
                        <LoadingIndicator
                          visibilityDelay={false}
                          className='size-4'
                        />
                      ) : (
                        <LucideTrash2 />
                      )}*/}
                      <LucideTrash2 />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SheetTitle>
            </SheetHeader>
            <ScrollArea className='flex-1 min-h-0'>
              <div
                className={isProtocolView ? 'w-full px-4 pt-2 pb-4' : 'w-full p-4'}
                ref={contentRef}
                style={{ maxWidth: `${editorWidth}px` }}
              >
                {isProtocolView ? (
                  <div
                    className={`flex flex-col gap-0 mb-14 max-w-xl ${isNotLastEditor ? '' : 'mx-auto'}`}
                  >
                    {protocolEntries.map((entry, idx) => (
                      <div
                        key={idx}
                        className='flex flex-col gap-0.5 border-b border-border py-3 last:border-b-0'
                      >
                        <div className='flex items-center justify-between gap-2'>
                          <span className='text-sm font-medium text-foreground'>
                            {entry.user}
                          </span>
                          <span className='text-xs text-muted-foreground shrink-0'>
                            {formatProtocolTimestamp(entry.timestamp)}
                          </span>
                        </div>
                        <div className='text-sm text-muted-foreground'>
                          {entry.action}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                <div
                  className={`relative flex flex-col mb-14 max-w-xl ${isNotLastEditor ? '' : 'mx-auto'} ${isEditFieldOrder ? 'cursor-grab [&_input]:cursor-grab [&_textarea]:cursor-grab [&_select]:cursor-grab [&_label]:cursor-grab [&_[contenteditable]]:cursor-grab' : ''}`}
                  style={{ gap: `${RECORD_EDITOR_BLOCK_GAP_PX}px` }}
                >
                  {(() => {
                    const fieldContentMap: Record<
                      number,
                      { labelContent: ReactNode; fieldInputs: ReactNode }
                    > = {};
                    sortedFields.forEach((field) => {
                      const fieldValue = getRecordFieldValue(record, field);
                      const labelContent = <Label>{field.name}</Label>;
                      const fieldInputs = (
                        <>
                          {field.type ===
                            availableDadixFieldsDataTypes.TEXT && (
                            <TextFieldInput
                              recordId={record.id as number}
                              fieldId={field.id}
                              fieldName={field.name}
                              textOptions={field.textOptions}
                              disabled={!canEditRecords}
                              fieldValue={fieldValue as string}
                              handleItemChange={handleItemChange}
                              placeholder={field.placeholder}
                            />
                          )}
                          {field.type ===
                            availableDadixFieldsDataTypes.CHOICE && (
                            <Tag
                              value={
                                fieldValue ? String(fieldValue) : undefined
                              }
                              disabled={!canEditRecords}
                              size='default'
                              options={field.options}
                              placeholder={field.placeholder}
                              multi={field.choiceMode === 'multi'}
                              onValueChange={(newValue: string) => {
                                handleItemChange({
                                  itemFieldName: field.name,
                                  value: newValue,
                                });
                              }}
                            />
                          )}
                          {field.type ===
                            availableDadixFieldsDataTypes.BOOLEAN && (
                            <Switch
                              checked={Boolean(fieldValue) || false}
                              onCheckedChange={(newValue) => {
                                handleItemChange({
                                  itemFieldName: field.name,
                                  value: newValue,
                                });
                              }}
                              disabled={!canEditRecords}
                              className='data-disabled:opacity-100'
                            />
                          )}
                          {field.type ===
                            availableDadixFieldsDataTypes.INTEGER &&
                            (canEditRecords ? (
                              <Input
                                type='number'
                                id={field.name}
                                placeholder={field.placeholder}
                                value={
                                  fieldValue === undefined || fieldValue === ''
                                    ? ''
                                    : String(fieldValue)
                                }
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  const valueToStore =
                                    raw.trim() === '' ? '' : parseInt(raw, 10);
                                  handleItemChange({
                                    itemFieldName: field.name,
                                    value: valueToStore,
                                  });
                                }}
                              />
                            ) : (
                              <span className='text-sm'>
                                {fieldValue !== undefined && fieldValue !== '' && fieldValue !== null
                                  ? formatNumber(Number(fieldValue), field.numberOptions)
                                  : (field.placeholder ?? '')}
                              </span>
                            ))}
                          {(field.type ===
                            availableDadixFieldsDataTypes.FORMULA ||
                            field.type === availableDadixFieldsDataTypes.CODE) && (
                            <div className='flex flex-row flew-wrap justify-start items-center px-3 py-1 min-h-9 text-sm bg-muted/15 border rounded-md'>
                              <FormulaEval
                                forceCode={field.type === availableDadixFieldsDataTypes.CODE}
                                field={field}
                                record={record}
                                fields={tableFieldsToUse}
                              />
                            </div>
                          )}
                          {field.type ===
                            availableDadixFieldsDataTypes.DATE && (
                            <SingleDateInput
                              fieldKey={field.name}
                              rawValue={fieldValue}
                              disabled={!canEditRecords}
                              placeholder={field.placeholder}
                              onCommit={(date) => {
                                handleItemChange({
                                  itemFieldName: field.name,
                                  value: date,
                                });
                              }}
                            />
                          )}
                          {field.type === availableDadixFieldsDataTypes.AI && (
                            <div className='flex flex-row flex-wrap items-center px-3 py-1 min-h-9 text-sm bg-muted/15 border rounded-md'>
                              {fieldValue != null && String(fieldValue).trim() !== ''
                                ? String(fieldValue)
                                : (field.placeholder ?? t('table.formulaPlaceholder'))}
                            </div>
                          )}
                          {field.type === availableDadixFieldsDataTypes.FILE && (
                            <FileFieldControl
                              value={fieldValue}
                              disabled={!canEditRecords}
                              placeholder={field.placeholder}
                              onChange={(next) => {
                                handleItemChange({
                                  itemFieldName: field.name,
                                  value: next,
                                });
                              }}
                            />
                          )}
                          {field.type ===
                            availableDadixFieldsDataTypes.RELATION && (
                            <Relation
                              tableId={
                                isEncodedRelationData(
                                  tableIdRef.current as string
                                )
                                  ? decodeRelationData(
                                      tableIdRef.current as string
                                    ).tableId
                                  : tableIdRef.current
                              }
                              recordId={record.id as number}
                              relation={field.relationOptions}
                              makeRecordEditorHidden={setIsHidden}
                            />
                          )}
                        </>
                      );
                      fieldContentMap[field.id] = { labelContent, fieldInputs };
                    });
                    const fieldById = Object.fromEntries(
                      sortedFields.map((f) => [f.id, f])
                    );
                    const rowsToRender =
                      recordLayout.rows.length > 0
                        ? recordLayout.rows
                        : getDefaultRecordEditorLayout(sortedFields).rows;
                    const RowWrapper = isEditFieldOrder ? RecordEditorRowWrapper : 'div';
                    const layoutRows = (
                      <>
                        {rowsToRender.map((row, rowIndex) => (
                          <RowWrapper
                            key={`block-${rowIndex}`}
                            {...(isEditFieldOrder ? { rowIndex } : { className: 'relative flex flex-col min-h-0' })}
                          >
                            {row.decoration && isEditFieldOrder ? (
                              <DecorationRowDraggable
                                rowIndex={rowIndex}
                                slotCount={row.decorationType === 'button' ? 1 : row.fieldIds.length}
                                rowRef={(el) => {
                                  if (el) rowRefs.current[rowIndex] = el;
                                }}
                                onDelete={() => {
                                  setRecordLayout((prev) => {
                                    const next = layoutRemoveDecorationRow(prev, rowIndex);
                                    saveRecordEditorLayout(tableId ?? undefined, next);
                                    return next;
                                  });
                                }}
                                dragHandleMode={row.decorationType === 'button' ? 'content' : 'grip'}
                                showRowMenu={row.decorationType !== 'button'}
                                onEditButton={
                                  row.decorationType === 'button'
                                    ? undefined
                                    : undefined
                                }
                              >
                                {row.decorationType === 'button' ? (
                                  <div
                                    className={`flex flex-1 min-w-0 items-center gap-2 py-2 cursor-pointer ${row.buttonConfig?.widthMode === 'full' ? 'w-full justify-center' : 'justify-start'}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openRecordEditorButtonPanel({
                                        tableId: tableId ?? undefined,
                                        rowIndex,
                                        buttonConfig: row.buttonConfig ?? {
                                          title: 'Button',
                                          code: '',
                                          widthMode: 'content',
                                        },
                                        fieldNames: sortedFields.map((f) => f.name),
                                        onSave: (config) => {
                                          setRecordLayout((prev) => {
                                            const next = {
                                              ...prev,
                                              rows: prev.rows.map((r, i) =>
                                                i === rowIndex && r.decorationType === 'button'
                                                  ? { ...r, buttonConfig: config }
                                                  : r
                                              ),
                                            };
                                            saveRecordEditorLayout(tableId ?? undefined, next);
                                            return next;
                                          });
                                        },
                                        onDelete: () => {
                                          setRecordLayout((prev) => {
                                            const next = layoutRemoveDecorationRow(prev, rowIndex);
                                            saveRecordEditorLayout(tableId ?? undefined, next);
                                            return next;
                                          });
                                        },
                                      });
                                    }}
                                    role='button'
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        (e.currentTarget as HTMLElement).click();
                                      }
                                    }}
                                  >
                                    <Button
                                      type='button'
                                      variant='secondary'
                                      className={`pointer-events-none ${row.buttonConfig?.widthMode === 'full' ? 'w-full justify-center' : ''}`}
                                    >
                                      {row.buttonConfig?.title ?? 'Button'}
                                    </Button>
                                  </div>
                                ) : (
                                row.fieldIds.map((fieldId, colIndex) => {
                                  const slotId = `slot-${rowIndex}-${colIndex}`;
                                  const flexVal =
                                    row.widths?.[colIndex] ??
                                    1 / row.fieldIds.length;
                                  const isEmpty = fieldId === null;
                                  const field = fieldId !== null ? fieldById[fieldId] : null;
                                  const stableKey = field != null ? `field-${field.id}` : slotId;
                                  return (
                                    <React.Fragment key={stableKey}>
                                      {colIndex > 0 &&
                                        row.fieldIds.length > 1 && (
                                          <RecordEditorResizeHandle
                                            rowIndex={rowIndex}
                                            colIndex={colIndex}
                                            row={row}
                                            getRowWidth={() =>
                                              rowRefs.current[rowIndex]?.getBoundingClientRect()
                                                ?.width ?? 1
                                            }
                                            onResize={handleRowResize}
                                          />
                                        )}
                                      <RecordEditorSlot
                                        id={slotId}
                                        isEditMode={isEditFieldOrder}
                                        className='flex min-w-0'
                                        style={row.decoration ? { flex: flexVal } : undefined}
                                        isEmpty={isEmpty}
                                        flexible={row.decoration}
                                      >
                                        {field ? (
                                          <RecordEditorDraggableCell
                                            fieldId={field.id}
                                            label={
                                              (fieldContentMap[field.id] ?? { labelContent: null }).labelContent
                                            }
                                            tableContext={liveTableCtx ?? undefined}
                                          >
                                            {(fieldContentMap[field.id] ?? { fieldInputs: null }).fieldInputs}
                                          </RecordEditorDraggableCell>
                                        ) : null}
                                      </RecordEditorSlot>
                                    </React.Fragment>
                                  );
                                })
                                )}
                              </DecorationRowDraggable>
                            ) : (
                              <div
                                ref={(el) => {
                                  if (el) rowRefs.current[rowIndex] = el;
                                }}
                                className={`flex flex-row w-full max-w-xl items-stretch ${row.decoration ? 'gap-4' : 'gap-0'}`}
                              >
                                {row.decorationType === 'button' ? (
                                  <div
                                    className={`flex flex-1 min-w-0 items-center py-2 ${row.buttonConfig?.widthMode === 'full' ? 'w-full justify-center' : 'justify-start'}`}
                                  >
                                    <Button
                                      type='button'
                                      variant='secondary'
                                      className={row.buttonConfig?.widthMode === 'full' ? 'w-full justify-center' : ''}
                                      onClick={() => {
                                        try {
                                          const code = stripButtonCodeComments(row.buttonConfig?.code ?? '').trim();
                                          if (code) {
                                            evalDadixCode({
                                              code,
                                              record: record ?? {},
                                              fields: sortedFields,
                                              onAlert: (msg) => setAlertQueue((q) => [...q, msg]),
                                              onFieldSet: (fieldName, value) =>
                                                handleItemChange({ itemFieldName: fieldName, value }),
                                            });
                                          }
                                        } catch (err) {
                                          const msg = err instanceof Error ? err.message : String(err);
                                          toast.error(t('common.error', 'Error') + (msg ? `: ${msg}` : ''));
                                        }
                                      }}
                                    >
                                      {row.buttonConfig?.title ?? 'Button'}
                                    </Button>
                                  </div>
                                ) : (
                                row.fieldIds.map((fieldId, colIndex) => {
                                  const slotId = `slot-${rowIndex}-${colIndex}`;
                                  const flexVal =
                                    row.widths?.[colIndex] ??
                                    1 / row.fieldIds.length;
                                  const isEmpty = fieldId === null;
                                  const field = fieldId !== null ? fieldById[fieldId] : null;
                                  const stableKey = field != null ? `field-${field.id}` : slotId;
                                  return (
                                    <React.Fragment key={stableKey}>
                                      {colIndex > 0 &&
                                        isEditFieldOrder &&
                                        row.decoration &&
                                        row.fieldIds.length > 1 && (
                                          <RecordEditorResizeHandle
                                            rowIndex={rowIndex}
                                            colIndex={colIndex}
                                            row={row}
                                            getRowWidth={() =>
                                              rowRefs.current[rowIndex]?.getBoundingClientRect()
                                                ?.width ?? 1
                                            }
                                            onResize={handleRowResize}
                                          />
                                        )}
                                      <RecordEditorSlot
                                        id={slotId}
                                        isEditMode={isEditFieldOrder}
                                        className='flex min-w-0'
                                        style={row.decoration ? { flex: flexVal } : undefined}
                                        isEmpty={isEmpty}
                                        flexible={row.decoration}
                                      >
                                        {field ? (
                                          isEditFieldOrder ? (
                                            <RecordEditorDraggableCell
                                              fieldId={field.id}
                                              label={
                                                (fieldContentMap[field.id] ?? { labelContent: null }).labelContent
                                              }
                                              tableContext={liveTableCtx ?? undefined}
                                            >
                                              {(fieldContentMap[field.id] ?? { fieldInputs: null }).fieldInputs}
                                            </RecordEditorDraggableCell>
                                          ) : (
                                            <div className='flex flex-col gap-2 w-full'>
                                              {(fieldContentMap[field.id] ?? {}).labelContent}
                                              {(fieldContentMap[field.id] ?? {}).fieldInputs}
                                            </div>
                                          )
                                        ) : null}
                                      </RecordEditorSlot>
                                    </React.Fragment>
                                  );
                                })
                                )}
                              </div>
                            )}
                          </RowWrapper>
                        ))}
                      </>
                    );
                    return isEditFieldOrder ? (
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        modifiers={[restrictToWindowEdges]}
                        autoScroll={false}
                        measuring={{
                          draggable: {
                            measure: (element) => element.getBoundingClientRect(),
                          },
                        }}
                        onDragStart={(e: DragStartEvent) => {
                          const id = e.active.id;
                          const str = String(id);
                          if (str.startsWith(DECORATION_ROW_DRAG_PREFIX)) {
                            setActiveDragDecorationRowIndex(
                              parseInt(str.replace(DECORATION_ROW_DRAG_PREFIX, ''), 10)
                            );
                            setActiveDragFieldId(null);
                          } else {
                            setActiveDragFieldId(Number(id));
                            setActiveDragDecorationRowIndex(null);
                          }
                        }}
                        onDragOver={(e: DragOverEvent) => {
                          const id = e.over ? String(e.over.id) : null;
                          lastOverIdRef.current = id;
                          setOverSlotId(id);
                        }}
                        onDragEnd={(e) => {
                          handleFieldReorder(e);
                          setActiveDragFieldId(null);
                          setActiveDragDecorationRowIndex(null);
                          setOverSlotId(null);
                          lastOverIdRef.current = null;
                        }}
                        onDragCancel={() => {
                          setActiveDragFieldId(null);
                          setActiveDragDecorationRowIndex(null);
                          setOverSlotId(null);
                          lastOverIdRef.current = null;
                        }}
                      >
                        <SortableContext
                          items={getFlatFieldIdsFromLayout(recordLayout)}
                          strategy={verticalListSortingStrategy}
                        >
                          {layoutRows}
                          <LastGapDropTarget rowIndex={rowsToRender.length} />
                        </SortableContext>
                        {createPortal(
                          <DragOverlay
                            dropAnimation={null}
                            adjustScale
                            style={{ zIndex: 9999, isolation: 'isolate' }}
                          >
                            {activeDragDecorationRowIndex != null && (() => {
                              const row = rowsToRender[activeDragDecorationRowIndex];
                              if (!row?.decoration) return null;
                              const label =
                                row.decorationType === 'button'
                                  ? 'Button'
                                  : row.fieldIds.length === 2
                                    ? 'Duo box'
                                    : 'Trio box';
                              return (
                                <div className='rounded-lg border border-border bg-background px-4 py-3 shadow-lg cursor-grabbing flex items-center gap-2 min-w-[120px]'>
                                  <GripVertical className='size-4 text-muted-foreground' />
                                  <span className='text-sm font-medium'>
                                    {label}
                                  </span>
                                </div>
                              );
                            })()}
                            {activeDragFieldId != null && (() => {
                              const field = fieldById[activeDragFieldId];
                              if (!field) return null;
                              const content = fieldContentMap[activeDragFieldId];
                              if (!content) return null;
                              return (
                                <div className='rounded-lg border border-border bg-background cursor-grabbing min-w-[180px] max-w-full p-3 shadow-lg'>
                                  <div className='flex items-center gap-1.5 min-h-0'>
                                    <div className='flex-1 min-w-0'>{content.labelContent}</div>
                                  </div>
                                  <div className='w-full mt-2'>{content.fieldInputs}</div>
                                </div>
                              );
                            })()}
                          </DragOverlay>,
                          document.body
                        )}
                      </DndContext>
                    ) : (
                      layoutRows
                    );
                  })()}
                </div>
                )}
              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
    <AlertDialog open={alertQueue.length > 0} onOpenChange={() => {}}>
      <AlertDialogContent>
        <AlertDialogHeader>
          {alertQueue[0] != null && (
            <p className='text-base font-normal text-foreground'>{alertQueue[0]}</p>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={() => setAlertQueue((q) => q.slice(1))}>
            OK
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    {documentPreviewTemplate && record &&
      createPortal(
        <div className='fixed inset-0 z-[100] bg-black/20 overflow-hidden'>
          <div
            role='dialog'
            aria-modal='true'
            className='flex flex-col absolute top-[10px] left-[10px] right-[10px] bottom-[10px] bg-background rounded-md border overflow-hidden'
          >
            <div className='flex items-center justify-between gap-2 p-4 border-b bg-background shrink-0'>
              <h2 className='text-lg font-medium truncate'>{documentPreviewTemplate.name}</h2>
              <Button
                variant='outline'
                size='icon'
                onClick={() => setDocumentPreviewTemplate(null)}
              >
                <LucideX className='size-4' />
              </Button>
            </div>
            <ScrollArea className='flex-1 min-h-0'>
              <div
                className='p-6 prose prose-sm max-w-none text-foreground'
                style={{ maxWidth: '210mm', margin: '0 auto' }}
                dangerouslySetInnerHTML={{
                  __html: renderDocumentToHtml(
                    injectRecordIntoDocumentContent(
                      documentPreviewTemplate.content as Record<string, unknown>,
                      record
                    )
                  ),
                }}
              />
            </ScrollArea>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// Single date input with embedded calendar popover (one visual input only)
function SingleDateInput({
  fieldKey,
  rawValue,
  onCommit,
  disabled,
  placeholder,
}: {
  fieldKey: string;
  rawValue: unknown;
  onCommit: (_date: Date | undefined) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const formatDisplay = (d: Date) => {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}.${mm}.${yyyy}`;
  };
  const [inputValue, setInputValue] = useState(() =>
    date ? formatDisplay(date) : ''
  );

  // Month / year select state derived from current date or today
  const current = date || new Date();
  const year = current.getFullYear();
  const monthIndex = current.getMonth();
  const MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const years: number[] = [];
  for (let y = year + 10; y >= year - 60; y--) years.push(y);

  useEffect(() => {
    if (!rawValue) return undefined;
    const d = new Date(String(rawValue));
    setDate(isNaN(d.getTime()) ? undefined : d);
    setInputValue(formatDisplay(d) || '');
  }, [rawValue]);

  const commitDate = (d: Date | undefined) => {
    setDate(d);
    if (d) setInputValue(formatDisplay(d));
    onCommit(d);
  };

  const handleTyped = (raw: string) => {
    // Strip non-digits, limit to 8 digits (DDMMYYYY)
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    let formatted = '';
    if (digits.length <= 2) {
      formatted = digits;
    } else if (digits.length <= 4) {
      formatted = `${digits.slice(0, 2)}.${digits.slice(2)}`;
    } else if (digits.length <= 8) {
      formatted = `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
    }
    setInputValue(formatted);

    if (/^\d{2}\.\d{2}\.\d{4}$/.test(formatted)) {
      const [dd, mm, yyyy] = formatted.split('.').map(Number);
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        const d = new Date(yyyy, mm - 1, dd);
        if (
          d.getFullYear() === yyyy &&
          d.getMonth() === mm - 1 &&
          d.getDate() === dd
        ) {
          commitDate(d);
        }
      }
    }
  };

  const setMonthYear = (m: number, y: number) => {
    const base = date || new Date();
    const d = new Date(base);
    d.setFullYear(y);
    d.setMonth(m);
    commitDate(d);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className='relative'>
        <input
          id={`${fieldKey}-date`}
          type='text'
          placeholder={placeholder}
          /* Accept manual entry */
          className='w-full rounded-md border border-input bg-background pr-10 pl-3 py-2 text-sm outline-none placeholder:text-muted-foreground'
          value={inputValue}
          inputMode='numeric'
          onChange={(e) => handleTyped(e.target.value)}
          onFocus={() => setOpen(false)}
          disabled={disabled}
        />
        <PopoverTrigger asChild>
          <button
            type='button'
            className='absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground hover:text-foreground'
            aria-label='Open calendar'
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }}
            disabled={disabled}
          >
            <CalendarIcon className='size-4 cursor-pointer' />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align='end'
          data-sheet-floating
          className='w-auto p-3 z-999' /* high z to float above sheet content */
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className='flex items-center justify-between gap-2 mb-2'>
            <Select
              value={MONTHS[monthIndex]}
              onValueChange={(m) => {
                const idx = MONTHS.indexOf(m);
                setMonthYear(idx, year);
              }}
            >
              <SelectTrigger className='w-[120px] h-8'>
                <SelectValue placeholder='Month' />
              </SelectTrigger>
              <SelectContent className='max-h-60 overflow-y-auto min-h-[120px]'>
                <SelectGroup>
                  {MONTHS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              value={year.toString()}
              onValueChange={(y) => setMonthYear(monthIndex, parseInt(y))}
            >
              <SelectTrigger className='w-[100px] h-8'>
                <SelectValue placeholder='Year' />
              </SelectTrigger>
              <SelectContent className='max-h-60 overflow-y-auto min-h-[120px]'>
                <SelectGroup>
                  {years.map((y) => (
                    <SelectItem key={y} value={y.toString()}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <Calendar
            mode='single'
            selected={date}
            onSelect={(d) => {
              commitDate(d);
              setOpen(false);
            }}
            month={date || new Date()}
            onMonthChange={(m) => commitDate(m)}
          />
        </PopoverContent>
      </div>
    </Popover>
  );
}

interface TextFieldInputProps {
  recordId: number;
  fieldId: number;
  fieldName: string;
  fieldValue: string;
  textOptions: TextFieldOptions | undefined;
  handleItemChange: ({
    ..._params
  }: {
    itemFieldName: string;
    value: string;
  }) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function TextFieldInput({
  recordId,
  fieldId,
  fieldName,
  fieldValue,
  textOptions,
  handleItemChange,
  disabled,
  placeholder,
}: TextFieldInputProps) {
  const recordIdRef = useRef<number>(undefined);
  const fieldIdRef = useRef<number>(undefined);
  const multiLinesInputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const multiLinesInput = multiLinesInputRef.current;
    if (!multiLinesInput || !multiLinesInput.parentElement) return;

    if (fieldId === fieldIdRef.current && recordId === recordIdRef.current)
      return;
    fieldIdRef.current = fieldId;
    recordIdRef.current = recordId;

    multiLinesInput.parentElement.style.minHeight = 'unset';
    multiLinesInput.parentElement.style.maxHeight = 'unset';
    multiLinesInput.innerText = '';

    const lineHeight = multiLinesInput.getBoundingClientRect().height;
    const paddingY =
      multiLinesInput.parentElement.getBoundingClientRect().height - lineHeight;
    const minLines = textOptions?.minLines || 1;
    const maxLines = textOptions?.maxLines ?? 0;
    const minHeight = minLines * lineHeight + paddingY;
    const maxHeight = maxLines === 0 ? 0 : maxLines * lineHeight + paddingY;

    multiLinesInput.parentElement.style.minHeight = `${minHeight}px`;
    multiLinesInput.parentElement.style.maxHeight =
      maxHeight === 0 ? 'unset' : `${maxHeight}px`;

    multiLinesInput.innerText = fieldValue;
  }, [recordId, textOptions, fieldId, fieldValue]);

  const multilines = useMemo(
    () =>
      textOptions?.multiLines &&
      (textOptions?.maxLines > 1 || textOptions?.maxLines === 0),
    [textOptions?.multiLines, textOptions?.maxLines]
  );

  if (multilines) {
    const isEmpty = !fieldValue || String(fieldValue).trim() === '';
    return (
      <div className='relative w-full px-3 py-1 border border-input shadow-xs rounded-md scrollbar-thin overflow-auto'>
        {placeholder && isEmpty && (
          <span
            className='pointer-events-none absolute left-3 top-2.5 text-sm text-muted-foreground'
            aria-hidden
          >
            {placeholder}
          </span>
        )}
        <div
          ref={multiLinesInputRef}
          className='max-w-full p-0 m-0 wrap-anywhere whitespace-normal leading-6.5 text-sm focus-visible:outline-0 focus-visible:shadow-none focus-visible:border-0 focus-within:outline-0 focus-within:shadow-none focus-within:border-0'
          onInput={(e) => {
            const newValue = (e.target as HTMLDivElement).innerText;
            handleItemChange({
              itemFieldName: fieldName,
              value: newValue,
            });
          }}
          onPaste={() => {
            setTimeout(() => {
              if (!multiLinesInputRef.current) return;
              const text = multiLinesInputRef.current.innerText;
              multiLinesInputRef.current.innerText = text;
            }, 30);
          }}
          onDrop={() => {
            setTimeout(() => {
              if (!multiLinesInputRef.current) return;
              const text = multiLinesInputRef.current.innerText;
              multiLinesInputRef.current.innerText = text;
            }, 30);
          }}
          contentEditable={!disabled}
        />
      </div>
    );
  }

  return (
    <Input
      id={fieldName}
      value={fieldValue === undefined ? '' : String(fieldValue || '')}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => {
        const newValue = e.target.value;
        handleItemChange({
          itemFieldName: fieldName,
          value: newValue,
        });
      }}
      className='disabled:opacity-100 disabled:pointer-events-auto disabled:cursor-text'
    />
  );
}

function dispatchOnRecordCloseEvent({
  tableId,
  recordId,
}: {
  tableId: string;
  recordId: string | number;
}) {
  window.dispatchEvent(
    new CustomEvent(dadixEvents.recordEvents.onClose, {
      detail: { recordId, tableId },
    })
  );
}

export function openTableRecord({
  tableId,
  tableFields,
  record,
}: {
  tableId: string | number;
  tableFields: Field[];
  record: Record<string, unknown>;
}) {
  if (!tableId || !record) return;

  window.dispatchEvent(
    new CustomEvent(dadixEvents.recordEvents.onOpen, {
      detail: {
        tableId,
        tableFields,
        record,
      },
    })
  );
}
