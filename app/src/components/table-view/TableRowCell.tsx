import { cn } from '@/lib/utils';
import { fileFieldDisplayName } from '@/lib/fileField';
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
  liveWidth?: number;
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
  liveWidth,
}: TableRowCellProps) => {
  const meta = cell.column.columnDef.meta as Record<string, unknown>;
  const rawCellValue = cell.getValue();
  const cellValue =
    meta?.type === 'FILE'
      ? fileFieldDisplayName(rawCellValue)
      : String(rawCellValue ?? '');

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
      data-field-id={meta?.fieldId != null ? String(meta.fieldId) : meta?.id != null ? String(meta.id) : undefined}
      data-field-name={meta?.fieldName != null ? String(meta.fieldName) : meta?.name != null ? String(meta.name) : undefined}
      data-field-type={meta?.type != null ? String(meta.type) : undefined}
      data-field-action={meta?.action != null ? String(meta.action) : undefined}
      data-row-selected={isActiveRow}
      data-cell-idx={cellIdx}
      data-cell-value={cellValue}
      className={cn([
        'flex flex-row flex-nowrap shrink-0 items-center',
        meta.contentAlign === 'right' ? 'justify-end' : '',
        meta.contentAlign === 'center' ? 'justify-center' : '',
        !meta.contentAlign || meta.contentAlign === 'left'
          ? 'justify-start'
          : '',
        'p-0 px-2.5 h-full overflow-hidden z-0',
        meta?.action === 'openUrl' || meta?.action === 'copy'
          ? 'cursor-pointer'
          : 'cursor-default',
        !isRowNumber && tableStyleTheme === 'classic' && 'bg-background',
        !isRowNumber && tableStyleTheme === 'lineless' && 'bg-transparent',
        !isRowNumber && tableStyleTheme === 'panel' && 'bg-transparent',
        !isRowNumber &&
          'first-of-type:border-l group-last-of-type/row:last-of-type:rounded-br-md',
        isRowNumber && 'rounded-none border-0',
        'data-[columnid=actions]:grow data-[column-id=actions]:px-1 data-[column-id=actions]:rtl data-[row-selected=true]:bg-muted data-[row-selected=true]:group-hover/row:bg-muted',
        isRowNumber &&
          rowNumberBodyStickyClassName(
            tableStyleTheme,
            row.index,
            isActiveRow
          ),
        fixed && 'sticky z-[20] shadow-[2px_0_6px_-2px_rgba(0,0,0,0.08)]',
        !isRowNumber && !isActiveRow && 'group-hover/row:bg-(--accent-50)',
        isFindHighlight &&
          'bg-[#E8F4FF] ring-0 group-hover/row:bg-[#E8F4FF] data-[row-selected=true]:bg-[#E8F4FF] data-[row-selected=true]:group-hover/row:bg-[#E8F4FF]',
        className,
      ])}
      style={{
        width: `${liveWidth ?? table.getHeaderGroups()[0].headers[cellIdx].column.columnDef.size}px`,
        ...(fixed ? { left: `${stickyLeftPx}px` } : {}),
      }}
    >
      {flexRender(cell.column.columnDef.cell, cell.getContext())}
    </div>
  );
};
