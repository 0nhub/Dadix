import { cn } from '@/lib/utils';
import type { TableStyleTheme } from '@/lib/userLocalStorage';

const ROW_NUMBER_SHADOW = 'shadow-[2px_0_6px_-2px_rgba(0,0,0,0.08)]';

export function isRowNumberColumn(columnId: string, index: number): boolean {
  return index === 0 || columnId === 'select';
}

/** Header corner cell: sticky top + left while scrolling. */
export function rowNumberHeaderStickyClassName(
  tableStyleTheme: TableStyleTheme = 'classic'
): string {
  return cn(
    'sticky left-0 z-[41] shrink-0',
    ROW_NUMBER_SHADOW,
    tableStyleTheme === 'panel' ? 'bg-muted' : 'bg-muted'
  );
}

/** Body row number cell: stays visible when scrolling horizontally. */
export function rowNumberBodyStickyClassName(
  tableStyleTheme: TableStyleTheme,
  rowIndex: number,
  isActiveRow: boolean
): string {
  if (isActiveRow) {
    return cn('sticky left-0 z-[31] shrink-0 bg-muted', ROW_NUMBER_SHADOW);
  }

  if (tableStyleTheme === 'lineless') {
    return cn(
      'sticky left-0 z-[31] shrink-0',
      ROW_NUMBER_SHADOW,
      rowIndex % 2 === 1 ? 'bg-muted/30' : 'bg-background',
      'group-hover/row:bg-muted/50'
    );
  }

  if (tableStyleTheme === 'panel') {
    return cn(
      'sticky left-0 z-[31] shrink-0',
      ROW_NUMBER_SHADOW,
      rowIndex % 2 === 1 ? 'bg-muted' : 'bg-background',
      'group-hover/row:bg-muted/50'
    );
  }

  return cn(
    'sticky left-0 z-[31] shrink-0 bg-background',
    ROW_NUMBER_SHADOW,
    'group-hover/row:bg-muted/50'
  );
}
