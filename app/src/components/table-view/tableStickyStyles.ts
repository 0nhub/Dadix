import { cn } from '@/lib/utils';
import type { TableStyleTheme } from '@/lib/userLocalStorage';

const ROW_NUMBER_SCROLL_EDGE =
  'group-data-[h-scrolled=true]/hscroll:shadow-[2px_0_8px_-2px_rgba(0,0,0,0.14)]';

export function isRowNumberColumn(columnId: string, index: number): boolean {
  return index === 0 || columnId === 'select';
}

/** Header corner cell: sticky top + left while scrolling. */
export function rowNumberHeaderStickyClassName(
  tableStyleTheme: TableStyleTheme = 'classic'
): string {
  return cn(
    'sticky left-0 z-[41] shrink-0',
    ROW_NUMBER_SCROLL_EDGE,
    tableStyleTheme === 'panel' ? 'bg-muted' : 'bg-muted'
  );
}

/** Body row number cell: stays visible when scrolling horizontally. */
export function rowNumberBodyStickyClassName(
  tableStyleTheme: TableStyleTheme,
  rowIndex: number,
  isActiveRow: boolean
): string {
  const stripe = isActiveRow
    ? 'bg-muted'
    : (tableStyleTheme === 'lineless' || tableStyleTheme === 'panel') &&
        rowIndex % 2 === 1
      ? 'bg-muted'
      : 'bg-background';

  return cn(
    'sticky left-0 z-[31] box-border h-[50px] min-h-[50px] shrink-0 rounded-none border-0 border-b border-border',
    ROW_NUMBER_SCROLL_EDGE,
    stripe,
    isActiveRow ? 'group-hover/row:bg-muted' : 'group-hover/row:bg-(--accent-50)'
  );
}
