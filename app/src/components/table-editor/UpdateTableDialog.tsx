import { useEffect, useRef, useState } from 'react';

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

import { LoadingIndicator } from '../loading-indicator/LoadingIndicator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { LucideX } from 'lucide-react';
import { toast } from 'sonner';
import { useCurrentProjectContext } from '@/context/CurrentProjectContext';
import {
  TableIcon,
  availableTableIcons,
} from '@/components/table-icon/TableIcon';
import tableService from '@/lib/table';

import type { Table } from '@/types';

const OPEN_UPDATE_TABLE_DIALOG_EVENT = 'dadix-events-open-update-table-dialog';

function UpdateTableDialog() {
  const currentProjectCtx = useCurrentProjectContext();
  const editedTableRef = useRef<Table>(undefined);

  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tableName, setTableName] = useState<string>('');
  const [selectedIcon, setSelectedIcon] = useState<string>('');

  useEffect(() => {
    window.addEventListener(
      OPEN_UPDATE_TABLE_DIALOG_EVENT,
      handleOpenDialogEvent
    );
    return () => {
      window.removeEventListener(
        OPEN_UPDATE_TABLE_DIALOG_EVENT,
        handleOpenDialogEvent
      );
    };
    function handleOpenDialogEvent(evnt: Event) {
      if (isOpen) return;

      const { id, projectId } = (evnt as CustomEvent).detail || {};
      if (!id) return;
      if (
        projectId &&
        currentProjectCtx.id &&
        `${projectId}` !== `${currentProjectCtx.id}`
      ) {
        return;
      }

      const editedTable = currentProjectCtx.tables.find(
        (table) => `${table.id}` === `${id}`
      );
      editedTableRef.current = editedTable
        ? { ...editedTable }
        : ({ id, name: '', icon: 'Table' } as Table);
      setTableName(editedTable?.name ?? '');
      setSelectedIcon(editedTable?.icon || 'Table');
      handleOpenChange(true);
    }
  }, [isOpen, currentProjectCtx.id, currentProjectCtx.tables]);

  const onConfirmSave = () => {
    if (!editedTableRef.current) return;
    const newTableName = tableName.trim();
    const newTableIcon = selectedIcon;

    if (!newTableName) {
      toast.error("Table name can't be empty");
      return;
    }
    let isThereAnyChanges = false;
    const changes: { name?: string; icon?: string } = {};
    if (newTableName !== editedTableRef.current.name) {
      changes.name = newTableName;
      isThereAnyChanges = true;
    }
    if (newTableIcon !== editedTableRef.current.icon) {
      changes.icon = newTableIcon;
      isThereAnyChanges = true;
    }
    if (!isThereAnyChanges) {
      handleOpenChange(false);
      return;
    }

    setLoading(true);
    tableService
      .patchTable({
        projectId: `${currentProjectCtx.id}`,
        tableId: `${editedTableRef.current.id}`,
        data: { ...changes },
      })
      .then((response) => {
        toast.success('Table updated successfully!');
        setIsOpen(false);
        setTableName('');
        setLoading(false);
        return response;
      })
      .catch((err) => {
        setLoading(false);
        toast.error('Error updating table');
        console.error('Error updating table:', err);
      });
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setTableName('');
      editedTableRef.current = undefined;
    }
  };

  return (
    <Dialog modal={true} open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className='sm:max-w-lg' showCloseButton={false}>
        <DialogHeader className='flex flex-row flex-nowrap justify-start items-center'>
          <DialogClose asChild>
            <Button size='icon' variant='outline' className='shrink-0 grow-0'>
              <LucideX />
            </Button>
          </DialogClose>
          <DialogTitle className='shrink grow text-left' hidden>
            Update view
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
                  <DialogTitle hidden>select view icon</DialogTitle>
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
                placeholder='Enter view name'
                value={tableName}
                onChange={(e) => {
                  const value = e.target.value;
                  setTableName(value);
                  // viewNameRef.current = value;
                }}
                disabled={loading}
                autoFocus
                className='mt-2'
                required
              />
            </div>
          </div>
          <DialogFooter className='flex-row justify-end'>
            <DialogClose asChild>
              <Button type='button' variant='outline' disabled={loading}>
                Discard
              </Button>
            </DialogClose>
            <Button type='button' onClick={onConfirmSave} disabled={loading}>
              {/*{loading ? <LoadingIndicator visibilityDelay={false} /> : <></>}*/}
              Save
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function openUpdateTableDialog({
  tableId,
  projectId,
}: {
  tableId: string;
  projectId: string;
}) {
  window.dispatchEvent(
    new CustomEvent(OPEN_UPDATE_TABLE_DIALOG_EVENT, {
      detail: { id: tableId, projectId },
    })
  );
}

export { UpdateTableDialog, openUpdateTableDialog };
