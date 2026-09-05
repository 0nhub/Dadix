'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableIcon } from '@/components/table-icon/TableIcon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LucideSearch, LucideFilter, LucideDownload } from 'lucide-react';
import type { ShareSnapshot } from '@/lib/share';
import { exportToCSV, exportToJSON, exportToExcel } from '@/lib/exportTable';

interface SharedViewContentProps {
  title: string;
  thumbnailUrl?: string;
  snapshot: ShareSnapshot;
}

const fieldLike = (f: { name: string; order: number }) => ({
  id: 0,
  name: f.name,
  type: 'TEXT' as const,
  size: 255,
  order: f.order,
  isVisible: true,
  contentAlign: 'left' as const,
  action: null,
});

export function SharedViewContent({ title, snapshot }: SharedViewContentProps) {
  const [search, setSearch] = useState('');
  const orderedFields = useMemo(
    () =>
      [...(snapshot.tableFields ?? [])].sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0)
      ),
    [snapshot.tableFields]
  );
  const fieldNames = orderedFields.map((f) => f.name);

  const filteredRecords = useMemo(() => {
    if (!search.trim()) return snapshot.records;
    const q = search.trim().toLowerCase();
    return snapshot.records.filter((row) =>
      fieldNames.some((name) => {
        const v = row[name];
        return v != null && String(v).toLowerCase().includes(q);
      })
    );
  }, [snapshot.records, search, fieldNames]);

  const handleExportCSV = () => {
    exportToCSV(
      filteredRecords,
      orderedFields.map((f) => fieldLike(f)),
      snapshot.tableName
    );
  };
  const handleExportJSON = () => {
    exportToJSON(filteredRecords, snapshot.tableName);
  };
  const handleExportExcel = () => {
    exportToExcel(
      filteredRecords,
      orderedFields.map((f) => fieldLike(f)),
      snapshot.tableName
    );
  };

  return (
    <div className='min-h-screen flex flex-col bg-background'>
      <header className='flex items-center justify-between gap-4 px-4 py-3 border-b border-border/40 bg-background/95'>
        <div className='flex items-center gap-2 min-w-0'>
          <div className='flex h-9 items-center gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs min-w-0 max-w-[240px]'>
            <TableIcon
              name={snapshot.tableIcon ?? 'Table'}
              width={18}
              className='shrink-0 text-muted-foreground'
            />
            <span className='truncate font-medium'>{title}</span>
          </div>
        </div>
        <div className='flex items-center gap-2 shrink-0'>
          <div className='flex items-center rounded-md border bg-background pl-2 pr-2 py-1.5 h-9'>
            <LucideSearch className='size-4 text-muted-foreground shrink-0' />
            <Input
              type='text'
              placeholder='Search'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className='h-7 w-36 min-w-0 border-0 bg-transparent shadow-none focus-visible:ring-0 text-sm'
            />
          </div>
          <Button
            variant='outline'
            size='icon'
            title='Filter'
            className='size-9'
          >
            <LucideFilter className='size-4' />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant='outline'
                size='icon'
                title='Download'
                className='size-9'
              >
                <LucideDownload className='size-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem onClick={handleExportCSV}>
                Current view CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportJSON}>
                Current view JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportExcel}>
                Current view Excel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className='flex-1 overflow-auto'>
        <table className='w-full border-collapse text-sm'>
          <thead>
            <tr className='border-b bg-muted/50'>
              {fieldNames.map((name) => (
                <th
                  key={name}
                  className='text-left font-medium px-4 py-2.5 whitespace-nowrap'
                >
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRecords.length === 0 ? (
              <tr>
                <td
                  colSpan={fieldNames.length}
                  className='px-4 py-8 text-center text-muted-foreground'
                >
                  No records
                </td>
              </tr>
            ) : (
              filteredRecords.map((row, idx) => (
                <tr
                  key={idx}
                  className='border-b border-border/40 hover:bg-muted/30'
                >
                  {fieldNames.map((name) => (
                    <td
                      key={name}
                      className='px-4 py-2.5 whitespace-nowrap truncate max-w-[200px]'
                      title={String(row[name] ?? '')}
                    >
                      {row[name] != null ? String(row[name]) : '—'}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
