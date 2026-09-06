import { useRef, useState, type CSSProperties, type HTMLAttributes, type MouseEvent, type PointerEvent } from 'react';

import { flexRender } from '@tanstack/react-table';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import type { Header, Table } from '@tanstack/react-table';
import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/numberFormat';
import { fileFieldDisplayName } from '@/lib/fileField';
import type { NumberFieldOptions } from '@/types';
import type { TableStyleTheme } from '@/lib/userLocalStorage';
import {
  isRowNumberColumn,
  rowNumberHeaderStickyClassName,
} from './tableStickyStyles';

const AUTO_FIT_MIN = 48;
const AUTO_FIT_MAX = 800;
const AUTO_FIT_PAD = 24;
const RESIZE_DRAG_THRESHOLD = 3;

function cellDisplayText(value: unknown, meta: Record<string, unknown> | undefined): string {
  if (value == null || value === '') return '';
  const type = String(meta?.type ?? '');
  if (type === 'BOOLEAN') return '';
  if (type === 'FILE') return fileFieldDisplayName(value);
  if (type === 'DATE') {
    const date = new Date(String(value));
    if (!Number.isNaN(date.getTime())) {
      return date
        .toLocaleDateString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })
        .replace(/\//g, '.');
    }
  }
  if (type === 'INTEGER' && typeof value === 'number') {
    return formatNumber(value, meta?.numberOptions as NumberFieldOptions | undefined);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        item && typeof item === 'object' && 'value' in item
          ? String((item as { value: unknown }).value ?? '')
          : String(item ?? '')
      )
      .filter(Boolean)
      .join(', ');
  }
  if (typeof value === 'object' && value && 'value' in value) {
    return String((value as { value: unknown }).value ?? '');
  }
  return String(value);
}

function measureColumnAutoWidth(
  table: Table<Record<string, unknown>>,
  columnId: string,
  headerRoot: HTMLElement
): number {
  const column = table.getColumn(columnId);
  const meta = (column?.columnDef.meta ?? {}) as Record<string, unknown>;
  const headerLabel = String(meta.fieldName ?? meta.name ?? '');
  const probe = headerRoot.querySelector('button, span') ?? headerRoot;
  const style = getComputedStyle(probe);
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return AUTO_FIT_MIN;
  ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

  let max = headerLabel ? ctx.measureText(headerLabel).width : 0;
  const tableRoot = headerRoot.closest('[aria-description="Table"]');
  tableRoot
    ?.querySelectorAll<HTMLElement>(
      `[aria-description="TableCell"][data-column-id="${CSS.escape(columnId)}"]`
    )
    .forEach((cell) => {
      const inner = cell.querySelector(':scope > *') as HTMLElement | null;
      const width = inner?.scrollWidth ?? cell.scrollWidth;
      if (width > max) max = width;
    });

  const type = String(meta.type ?? '');
  for (const row of table.getPrePaginationRowModel().rows) {
    let raw: unknown;
    try {
      raw = row.getValue(columnId);
    } catch {
      raw = row.original?.[columnId];
    }
    const text = cellDisplayText(raw, meta);
    if (!text) continue;
    let width = ctx.measureText(text).width;
    if (type === 'CHOICE') width += 20;
    if (width > max) max = width;
  }
  if (type === 'BOOLEAN') max = Math.max(max, 44);
  if (type === 'FILE') max = Math.max(max, 72);

  return Math.min(AUTO_FIT_MAX, Math.max(AUTO_FIT_MIN, Math.ceil(max + AUTO_FIT_PAD)));
}

interface TableHeaderCellProps {
  table: Table<Record<string, unknown>>;
  tableId: string | undefined;
  header: Header<Record<string, unknown>, unknown>;
  idx: number;
  viewId: number | undefined;
  className?: string;
  tableStyleTheme?: TableStyleTheme;
  sortableRef?: (node: HTMLElement | null) => void;
  sortableListeners?: HTMLAttributes<HTMLElement>;
  sortableAttributes?: HTMLAttributes<HTMLElement>;
  sortableStyle?: CSSProperties;
  isDragging?: boolean;
  onColumnResizeChange: ({
    ..._props
  }: {
    size: number;
    tableFieldId: number;
    gridViewFieldId?: number;
    columnId: string;
  }) => void;
  onColumnResizeEnd: ({
    ..._props
  }: {
    size: number;
    tableFieldId: number;
    gridViewFieldId?: number;
    columnId: string;
  }) => void;
  liveWidth?: number;
}

export const TableHeaderCell = ({
  table,
  tableId,
  header,
  idx,
  viewId,
  onColumnResizeChange,
  onColumnResizeEnd,
  className,
  tableStyleTheme = 'classic',
  sortableRef,
  sortableListeners,
  sortableAttributes,
  sortableStyle,
  isDragging = false,
  liveWidth,
}: TableHeaderCellProps) => {
  const dragRef = useRef<{
    startX: number;
    startSize: number;
    lastSize: number;
    didMove: boolean;
  } | null>(null);
  const [localLiveSize, setLocalLiveSize] = useState<number | null>(null);

  const meta = header.column.columnDef.meta as Record<string, unknown>;

  const resizeTarget = () => {
    const isItATable = !viewId || viewId === 0;
    const tableFieldId = isItATable
      ? Number(meta?.fieldId ?? header.column.id)
      : Number(meta?.fieldId);
    const gridViewFieldId = isItATable ? undefined : Number(meta?.id);
    return {
      tableFieldId: Number.isFinite(tableFieldId) ? tableFieldId : 0,
      gridViewFieldId:
        gridViewFieldId != null && Number.isFinite(gridViewFieldId)
          ? gridViewFieldId
          : undefined,
      columnId: header.column.id,
    };
  };

  const applyColumnSize = (size: number) => {
    const next = Math.max(30, Math.round(size));
    setLocalLiveSize(next);
    onColumnResizeChange({
      ...resizeTarget(),
      size: next,
    });
    onColumnResizeEnd({
      ...resizeTarget(),
      size: next,
    });
    setLocalLiveSize(null);
  };

  const handleResizePointerDown = (event: PointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    const columnEl = handle.parentElement;
    if (!columnEl) return;

    const startRect = columnEl.getBoundingClientRect();
    const grabOffset = startRect.right - event.clientX;
    const pointerId = event.pointerId;
    const sizeFromPointer = (clientX: number) => {
      const left = columnEl.getBoundingClientRect().left;
      return Math.max(30, Math.round(clientX + grabOffset - left));
    };
    const startSize = sizeFromPointer(event.clientX);
    dragRef.current = {
      startX: event.clientX,
      startSize,
      lastSize: startSize,
      didMove: false,
    };

    const onMove = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const drag = dragRef.current;
      if (!drag) return;
      ev.preventDefault();
      if (!drag.didMove) {
        if (Math.abs(ev.clientX - drag.startX) < RESIZE_DRAG_THRESHOLD) return;
        drag.didMove = true;
        try {
          handle.setPointerCapture(pointerId);
        } catch {
          /* pointer capture is optional */
        }
        document.body.style.userSelect = 'none';
        document.documentElement.classList.add('dadix-col-resizing');
      }
      const next = sizeFromPointer(ev.clientX);
      if (next === drag.lastSize) return;
      drag.lastSize = next;
      setLocalLiveSize(next);
      onColumnResizeChange({
        ...resizeTarget(),
        size: next,
      });
    };
    const onUp = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const drag = dragRef.current;
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
      document.body.style.userSelect = '';
      document.documentElement.classList.remove('dadix-col-resizing');
      try {
        if (handle.hasPointerCapture(pointerId)) {
          handle.releasePointerCapture(pointerId);
        }
      } catch {
        /* already released */
      }
      if (!drag?.didMove) return;
      const size = Math.max(30, Math.round(drag.lastSize));
      onColumnResizeEnd({
        ...resizeTarget(),
        size,
      });
      setLocalLiveSize(null);
    };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
  };

  const handleResizeDoubleClick = (event: MouseEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const columnEl = event.currentTarget.parentElement;
    if (!columnEl) return;
    applyColumnSize(measureColumnAutoWidth(table, header.column.id, columnEl));
  };

  const stopResizeFromReorder = (event: { preventDefault: () => void; stopPropagation: () => void }) => {
    event.preventDefault();
    event.stopPropagation();
  };

  if (meta && !meta.isVisible) {
    return null;
  }

  const fixed = !!(meta && meta.fixed);
  const isRowNumber = isRowNumberColumn(header.column.id, idx);
  const headers = table.getHeaderGroups()[0]?.headers ?? [];
  let stickyLeftPx = 0;
  if (fixed && headers.length > 0) {
    stickyLeftPx += headers[0].column.columnDef.size || 0;
    for (let j = 1; j < idx; j++) {
      const jMeta = headers[j].column.columnDef.meta as Record<string, unknown> | undefined;
      if (jMeta && jMeta.fixed) stickyLeftPx += headers[j].column.columnDef.size || 0;
    }
  }

  const widthPx = localLiveSize ?? liveWidth ?? header.column.columnDef.size ?? 140;
  const colWidth = `${widthPx}px`;

  return (
    <div
      key={`column_${header.id}`}
      ref={sortableRef}
      data-idx={idx}
      data-field-name={
        typeof meta?.fieldName === 'string'
          ? meta.fieldName
          : typeof meta?.name === 'string'
            ? meta.name
            : undefined
      }
      data-column-width={widthPx}
      data-dragging={isDragging ? 'true' : undefined}
      className={cn([
        'relative flex flex-none flex-row flex-nowrap items-center h-full p-0',
        isRowNumber ? 'justify-center overflow-hidden' : 'justify-start overflow-visible',
        tableStyleTheme === 'panel' && 'bg-muted',
        tableStyleTheme !== 'panel' && 'bg-inherit',
        isRowNumber
          ? 'rounded-none border-l-0'
          : 'rounded-none first-of-type:border-l',
        isRowNumber && rowNumberHeaderStickyClassName(tableStyleTheme),
        fixed && !isDragging && 'sticky z-[20] shadow-[2px_0_6px_-2px_rgba(0,0,0,0.08)]',
        isDragging && 'z-30 opacity-40',
        sortableListeners && 'cursor-grab touch-none [&_button]:cursor-grab',
        isDragging && 'cursor-grabbing [&_button]:cursor-grabbing',
        className,
      ])}
      style={{
        width: colWidth,
        minWidth: colWidth,
        maxWidth: colWidth,
        ...(fixed && !isDragging ? { left: `${stickyLeftPx}px` } : {}),
        ...sortableStyle,
      }}
      {...sortableAttributes}
      {...sortableListeners}
      onContextMenu={
        isRowNumber
          ? undefined
          : (event) => {
              event.preventDefault();
            }
      }
    >
      {header.isPlaceholder ? (
        <></>
      ) : (
        <div
          className={cn([
            'flex h-full min-w-0 items-center',
            isRowNumber ? 'w-full justify-center overflow-hidden' : 'max-w-full overflow-visible px-2.5',
          ])}
        >
          <div
            className={cn(
              'flex h-full min-w-0 items-center',
              isRowNumber ? 'w-full justify-center' : 'max-w-full'
            )}
          >
            {flexRender(header.column.columnDef.header, header.getContext())}
          </div>
        </div>
      )}
      {header.column.getCanResize() && (
        <span
          aria-label='Resize column'
          className='group/col-resize absolute right-0 top-0 z-30 h-full w-2.5 cursor-ew-resize touch-none'
          onPointerDown={handleResizePointerDown}
          onMouseDown={stopResizeFromReorder}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={handleResizeDoubleClick}
        >
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-y-0 right-0 w-[2px] bg-transparent group-hover/col-resize:bg-[#00B4FF]',
              localLiveSize != null && 'bg-[#00B4FF]'
            )}
          />
        </span>
      )}
    </div>
  );
};

export function SortableTableHeaderCell(props: TableHeaderCellProps) {
  const meta = props.header.column.columnDef.meta as Record<string, unknown> | undefined;
  const disabled =
    isRowNumberColumn(props.header.column.id, props.idx) || Boolean(meta?.isViewButton);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: `col-${props.header.id}`,
      disabled,
    });

  if (disabled) {
    return <TableHeaderCell {...props} />;
  }

  return (
    <TableHeaderCell
      {...props}
      sortableRef={setNodeRef}
      sortableListeners={listeners}
      sortableAttributes={attributes}
      sortableStyle={{
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      isDragging={isDragging}
    />
  );
}
