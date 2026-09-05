'use client';

import { useState, useCallback, memo, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LucideX } from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useCurrentProjectContext } from '@/context/CurrentProjectContext';
import {
  availableTableIcons,
  TableIcon,
} from '@/components/table-icon/TableIcon';
import { LoadingIndicator } from '@/components/loading-indicator/LoadingIndicator';
import tableService from '@/lib/table';

import type { Table } from '@/types';

const OPEN_CREATE_NEW_TABLE_DIALOG_EVENT =
  'dadix-events-open-create-new-table-dialog';

function CreateTableDialogComponent() {
  const currentProjectCtx = useCurrentProjectContext();
  const selectedIconRef = useRef<string>(
    availableTableIcons[Math.floor(Math.random() * availableTableIcons.length)]
  );
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tableName, setTableName] = useState('');
  const [error, setError] = useState('');
  const [selectedIcon, setSelectedIcon] = useState<string>(
    selectedIconRef.current
  );
  const router = useRouter();

  useEffect(() => {
    selectedIconRef.current = selectedIcon;
  }, [selectedIcon]);

  const handleSubmit = useCallback(async () => {
    if (!tableName.trim()) {
      setError('Table name is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const createdTable = await tableService.createTable({
        projectId: `${currentProjectCtx.id}`,
        name: tableName.trim(),
        icon: selectedIconRef.current,
      });

      toast.success('Table created successfully!');

      // Reset form and close dialog
      setTableName('');
      setError('');
      setIsOpen(false);

      // Navigate to the new table using its id
      router.push(
        `/dashboard/${currentProjectCtx.id}?tableId=${(createdTable as Table)?.id || ''}`
      );
    } catch (error: unknown) {
      console.error('Error creating table:', error);
      toast.error(
        error instanceof Error ? error.message : 'Tabelle konnte nicht erstellt werden.'
      );
    } finally {
      setLoading(false);
    }
  }, [tableName, router, currentProjectCtx.id]);

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setTableName('');
      setError('');
    }
  }, []);

  useEffect(() => {
    window.addEventListener(
      OPEN_CREATE_NEW_TABLE_DIALOG_EVENT,
      handleOpenDialogEvent
    );
    return () => {
      window.removeEventListener(
        OPEN_CREATE_NEW_TABLE_DIALOG_EVENT,
        handleOpenDialogEvent
      );
    };
    function handleOpenDialogEvent(_evnt: Event) {
      if (isOpen) {
        return;
      }
      setSelectedIcon(
        availableTableIcons[
          Math.floor(Math.random() * availableTableIcons.length)
        ]
      );
      handleOpenChange(true);
    }
  }, [isOpen]);

  return (
    <Dialog modal={true} open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className='sm:max-w-lg' showCloseButton={false}>
        <DialogHeader className='flex flex-row flex-nowrap justify-start items-center gap-4'>
          <DialogClose asChild>
            <Button size='icon' variant='outline' className='shrink-0 grow-0'>
              <LucideX />
            </Button>
          </DialogClose>
          <DialogTitle className='shrink grow text-left' hidden>
            create Table
          </DialogTitle>
        </DialogHeader>
        <div className='space-y-4'>
          <div className='flex flex-col items-center gap-4'>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant='outline' className='w-21 h-21'>
                  <TableIcon
                    name={selectedIcon}
                    color='var(--primary)'
                    className='size-14 opacity-90'
                  />
                </Button>
              </DialogTrigger>
              <DialogContent
                showCloseButton={false}
                className='max-w-[300px]! max-h-[400px]'
              >
                <DialogHeader>
                  <DialogTitle hidden>select table icon</DialogTitle>
                </DialogHeader>
                {/* Icon selection */}
                <div className='grid grid-cols-6 max-[420px]:grid-cols-6 gap-2 justify-center'>
                  {availableTableIcons.map((iconName) => (
                    <DialogClose key={iconName} asChild>
                      <Button
                        type='button'
                        variant='outline'
                        size='icon'
                        aria-pressed={selectedIcon === iconName}
                        title={iconName}
                        onClick={() => setSelectedIcon(iconName)}
                        className={`shadow-none ${selectedIcon === iconName ? 'border' : 'border-none'}`}
                      >
                        <TableIcon name={iconName} className='size-6' />
                      </Button>
                    </DialogClose>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
            <div className='w-full'>
              <Input
                id='tablename'
                placeholder='Enter table name'
                value={tableName}
                onChange={(e) => {
                  setTableName(e.target.value);
                  if (error) setError('');
                }}
                disabled={loading}
                autoFocus
                className='mt-2'
              />
              {error && (
                <p className='text-sm font-medium text-destructive mt-1'>
                  {error}
                </p>
              )}
            </div>
          </div>
          <DialogFooter className='flex-row justify-end'>
            <DialogClose asChild>
              <Button type='button' variant='outline' disabled={loading}>
                Discard
              </Button>
            </DialogClose>
            <Button type='button' onClick={handleSubmit} disabled={loading}>
              {/*{loading ? <LoadingIndicator visibilityDelay={false} /> : <></>}*/}
              Create
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function openCreateNewTableDialog() {
  window.dispatchEvent(new CustomEvent(OPEN_CREATE_NEW_TABLE_DIALOG_EVENT));
}

export const CreateTableDialog = memo(CreateTableDialogComponent);
