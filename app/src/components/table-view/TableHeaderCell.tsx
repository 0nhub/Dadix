import { useRef } from 'react';

import { flexRender } from '@tanstack/react-table';

import type { DragEvent } from 'react';
import type { Header, Table } from '@tanstack/react-table';
import { cn } from '@/lib/utils';
import type { TableStyleTheme } from '@/lib/userLocalStorage';
import {
  isRowNumberColumn,
  rowNumberHeaderStickyClassName,
} from './tableStickyStyles';

interface TableHeaderCellProps {
  table: Table<Record<string, unknown>>;
  tableId: string | undefined;
  header: Header<Record<string, unknown>, unknown>;
  idx: number;
  viewId: number | undefined;
  className?: string;
  tableStyleTheme?: TableStyleTheme;
  onColumnResizeChange: ({
    ..._props
  }: {
    size: number;
    tableFieldId: number;
    gridViewFieldId?: number;
  }) => void;
  onColumnResizeEnd: ({
    ..._props
  }: {
    size: number;
    tableFieldId: number;
    gridViewFieldId?: number;
  }) => void;
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
}: TableHeaderCellProps) => {
  const dragHandleRef = useRef<HTMLSpanElement>(null);
  const dragHandleLastXPosRef = useRef<number>(0);
  const fieldSizeRef = useRef<number>(0);

  const meta = header.column.columnDef.meta as Record<string, unknown>;

  const handleResizeColumnStart = (evnt: DragEvent<HTMLSpanElement>) => {
    if (!dragHandleRef.current) return;
    evnt.stopPropagation();
    evnt.dataTransfer.setData('resize', 'resizing table column');
    evnt.dataTransfer.effectAllowed = 'move';
    dragHandleLastXPosRef.current = evnt.clientX;
    fieldSizeRef.current = header.column.columnDef.size || 0;
  };

  const handleResizeColumn = (evnt: DragEvent<HTMLSpanElement>) => {
    if (!dragHandleRef.current) return;
    const newDragHandleXPos = evnt.clientX;
    const dx = newDragHandleXPos - dragHandleLastXPosRef.current;
    if (dx < 1 && dx > -2) return;
    if (fieldSizeRef.current + dx < 30) return;
    fieldSizeRef.current += dx;

    const isItATable = !viewId || viewId === 0;
    const tableFieldId = isItATable
      ? parseInt(header.column.id)
      : (meta.fieldId as number);
    const gridViewFieldId = isItATable ? undefined : (meta.id as number);

    onColumnResizeChange({
      tableFieldId,
      gridViewFieldId,
      size: Math.floor(fieldSizeRef.current),
    });
    dragHandleLastXPosRef.current = newDragHandleXPos;
  };

  const handleResizeColumnEnd = (_evnt: DragEvent<HTMLSpanElement>) => {
    const isItATable = !viewId || viewId === 0;
    const tableFieldId = isItATable
      ? parseInt(header.column.id)
      : (meta.fieldId as number);
    const gridViewFieldId = isItATable ? undefined : (meta.id as number);

    onColumnResizeEnd({
      tableFieldId,
      gridViewFieldId,
      size: Math.floor(fieldSizeRef.current),
    });
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

  return (
    <div
      key={`column_${header.id}`}
      data-idx={idx}
      className={cn([
        'relative flex flex-row flex-nowrap shrink-0 items-center justify-start h-full p-0 pl-0 pr-2.5 overflow-visible',
        tableStyleTheme === 'panel' && 'bg-muted',
        tableStyleTheme !== 'panel' && 'bg-inherit',
        'first-of-type:border-l first-of-type:rounded-tl-md group-[*]/no-left-radius:rounded-tl-none! last-of-type:rounded-tr-md',
        isRowNumber && rowNumberHeaderStickyClassName(tableStyleTheme),
        fixed && 'sticky z-[20] shadow-[2px_0_6px_-2px_rgba(0,0,0,0.08)]',
        !isRowNumber && 'hover:z-1',
        className,
      ])}
      style={{
        width: `${header.column.columnDef.size}px`,
        ...(fixed ? { left: `${stickyLeftPx}px` } : {}),
      }}
    >
      {header.isPlaceholder ? (
        <></>
      ) : (
        <div
          className={cn([
            'flex flex-row items-stretch w-full min-w-0 max-w-full overflow-hidden whitespace-nowrap text-ellipsis',
            meta.contentAlign === 'right' ? 'justify-end' : '',
            meta.contentAlign === 'center' ? 'justify-center' : '',
            !meta.contentAlign || meta.contentAlign === 'left'
              ? 'justify-start'
              : '',
          ])}
        >
          <div className='w-full min-w-0 flex-1 flex'>
            {flexRender(header.column.columnDef.header, header.getContext())}
          </div>
        </div>
      )}
      {header.column.getCanResize() && (
        <span
          ref={dragHandleRef}
          aria-label='Resize column'
          className='cursor-ew-resize absolute right-0 w-2 h-full translate-x-1 bg-primary z-2 opacity-0 hover:opacity-100 active:opacity-100'
        >
          <span
            className='absolute right-0 w-full h-full bg-transparent opacity-0'
            onDragStartCapture={handleResizeColumnStart}
            onDragCapture={handleResizeColumn}
            onDragEndCapture={handleResizeColumnEnd}
            draggable
          />
        </span>
      )}
    </div>
  );
};
