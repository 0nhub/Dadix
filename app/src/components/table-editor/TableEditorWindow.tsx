'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LucideChevronDown, LucideMoreVertical, LucidePencil, LucideTrash2 } from 'lucide-react';
import { TableEditor } from '@/components/table-editor/TableEditor';
import { TableIcon } from '@/components/table-icon/TableIcon';
import { useCurrentProjectContext } from '@/context/CurrentProjectContext';
import { useTableContext } from '@/context/TableContext';
import { cn } from '@/lib/utils';
import { openUpdateTableDialog } from './UpdateTableDialog';
import { openDeleteTableConfirmDialog } from './DeleteTableDialog';

export function TableEditorWindow({
  projectId,
  tableId,
  onTableChange,
}: {
  projectId: string;
  tableId: string;
  onTableChange?: (nextTableId: string) => void;
}) {
  const currentProjectCtx = useCurrentProjectContext();
  const currentTableCtx = useTableContext();
  const [isTableMenuOpen, setIsTableMenuOpen] = useState(false);
  const currentTable =
    currentProjectCtx.tables?.find((table) => `${table.id}` === `${tableId}`) ??
    currentTableCtx.table;
  const tables =
    currentProjectCtx.tables?.length
      ? currentProjectCtx.tables
      : currentTable
        ? [currentTable]
        : [];

  return (
    <div className='dadix-project-shell flex h-full min-h-0 w-full flex-col bg-background'>
      <header className='dadix-app-titlebar z-50 flex h-11 min-h-11 w-full items-stretch border-b bg-background'>
        <span className='dadix-traffic-close' aria-hidden />
        <DropdownMenu open={isTableMenuOpen} onOpenChange={setIsTableMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type='button'
              data-state={isTableMenuOpen ? 'open' : 'closed'}
              className={cn(
                'group/table-tab inline-flex h-full w-auto shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-none border-0 border-r border-border bg-transparent px-3 text-sm font-medium text-foreground shadow-none',
                'hover:bg-foreground/6'
              )}
            >
              <TableIcon
                name={currentTable?.icon}
                className='size-4 shrink-0 text-foreground'
              />
              <span className='whitespace-nowrap'>
                {currentTable?.name || 'Table'}
              </span>
              <LucideChevronDown className='size-4 shrink-0 opacity-70 group-data-[state=open]/table-tab:rotate-180' />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='start' className='min-w-46'>
            {tables.map((table) => (
              <DropdownMenuItem
                key={table.id}
                onClick={() => onTableChange?.(`${table.id}`)}
              >
                <TableIcon name={table.icon} className='text-foreground' />
                <span>{table.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className='dadix-titlebar-drag h-full min-w-8 flex-1' data-tauri-drag-region />
        <div className='flex h-full items-stretch'>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant='ghost'
                size='icon'
                className='size-auto h-full min-h-11 w-11 rounded-none border-0 border-l border-border bg-transparent shadow-none hover:bg-foreground/6'
                aria-label='Table options'
              >
                <LucideMoreVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem
                onClick={() => {
                  openUpdateTableDialog({ projectId, tableId });
                }}
              >
                <LucidePencil />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                variant='destructive'
                onClick={() => {
                  openDeleteTableConfirmDialog({ projectId, tableId });
                }}
              >
                <LucideTrash2 />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div id='dadix-window-controls-slot' className='flex h-full items-stretch' />
        </div>
      </header>
      <main className='min-h-0 flex-1 overflow-auto'>
        <TableEditor />
      </main>
    </div>
  );
}
