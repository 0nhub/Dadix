import { cn } from '@/lib/utils';
import { flexRender } from '@tanstack/react-table';
import type { Cell, Row, Table } from '@tanstack/react-table';
import type { TableStyleTheme } from '@/lib/userLocalStorage';
import {
  isRowNumberColumn,
  rowNumberBodyStickyClassName,
} from './tableStickyStyles';

interface TableRowCellProps {
  table: Table<Record<string, unknown>>;
  activeRecordId: string;
  cell: Cell<Record<string, unknown>, unknown>;
  row: Row<Record<string, unknown>>;
  cellIdx: number;
  className?: string;
  tableStyleTheme?: TableStyleTheme;
  isFindHighlight?: boolean;
}

export const TableRowCell = ({
  table,
  activeRecordId,
  cell,
  row,
  cellIdx,
  className,
  tableStyleTheme = 'classic',
  isFindHighlight,
}: TableRowCellProps) => {
  const meta = cell.column.columnDef.meta as Record<string, unknown>;

  if (meta && !meta.isVisible) {
    return null;
  }

  const fixed = !!(meta && meta.fixed);
  const isRowNumber = isRowNumberColumn(cell.column.id, cellIdx);
  const isActiveRow = `${activeRecordId}` === `${row.id}`;
  const headers = table.getHeaderGroups()[0]?.headers ?? [];
  let stickyLeftPx = 0;
  if (fixed && headers.length > 0) {
    stickyLeftPx += headers[0].column.columnDef.size || 0;
    for (let j = 1; j < cellIdx; j++) {
      const jMeta = headers[j].column.columnDef.meta as Record<string, unknown> | undefined;
      if (jMeta && jMeta.fixed) stickyLeftPx += headers[j].column.columnDef.size || 0;
    }
  }

  return (
    <div
      key={`${row.id}_${cellIdx}`}
      aria-description='TableCell'
      data-column-id={cell.column.id}
      data-row-selected={isActiveRow}
      data-cell-idx={cellIdx}
      className={cn([
        'flex flex-row flex-nowrap shrink-0 items-center',
        meta.contentAlign === 'right' ? 'justify-end' : '',
        meta.contentAlign === 'center' ? 'justify-center' : '',
        !meta.contentAlign || meta.contentAlign === 'left'
          ? 'justify-start'
          : '',
        'p-0 px-2.5 h-full overflow-hidden z-0 cursor-default',
        !isRowNumber && tableStyleTheme === 'classic' && 'bg-background',
        !isRowNumber && tableStyleTheme === 'lineless' && 'bg-transparent',
        !isRowNumber && tableStyleTheme === 'panel' && 'bg-transparent',
        'first-of-type:border-l group-last-of-type/row:first-of-type:rounded-bl-md group-[*]/no-left-radius:rounded-bl-none! group-last-of-type/row:last-of-type:rounded-br-md',
        'data-[columnid=actions]:grow data-[column-id=actions]:px-1 data-[column-id=actions]:rtl data-[row-selected=true]:bg-accent',
        isRowNumber &&
          rowNumberBodyStickyClassName(
            tableStyleTheme,
            row.index,
            isActiveRow
          ),
        fixed && 'sticky z-[20] shadow-[2px_0_6px_-2px_rgba(0,0,0,0.08)]',
        !isRowNumber && 'group-hover/row:bg-(--accent-50)',
        isFindHighlight && 'bg-primary/20 ring-1 ring-primary',
        className,
      ])}
      style={{
        width: `${table.getHeaderGroups()[0].headers[cellIdx].column.columnDef.size}px`,
        ...(fixed ? { left: `${stickyLeftPx}px` } : {}),
      }}
    >
      {flexRender(cell.column.columnDef.cell, cell.getContext())}
    </div>
  );
};
