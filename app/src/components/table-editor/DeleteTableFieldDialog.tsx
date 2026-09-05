import { useEffect, useRef, useState } from 'react';
import tableService from '@/lib/table';
import { dadixEvents } from '@/constants/events';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { toast } from 'sonner';
import { UserLocalStorage } from '@/lib/userLocalStorage';

export const OPEN_DELETE_TABLE_FIELD_CONFIRM_DIALOG_EVENT =
  'dadix--open-delete-table-field-confirm-dialog-event';

export const DeleteTableFieldConfirmDialog = () => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isDeletingTableField, setIsDeletingTableField] =
    useState<boolean>(false);
  const tableIdRef = useRef<string>(undefined);
  const fieldIdRef = useRef<number>(undefined);

  useEffect(() => {
    window.addEventListener(
      OPEN_DELETE_TABLE_FIELD_CONFIRM_DIALOG_EVENT,
      handleOpenDialog
    );
    return () => {
      window.removeEventListener(
        OPEN_DELETE_TABLE_FIELD_CONFIRM_DIALOG_EVENT,
        handleOpenDialog
      );
    };
    function handleOpenDialog(evnt: Event) {
      const { fieldId, tableId } = (evnt as CustomEvent).detail || {};
      if (fieldId == null || tableId == null) return;
      tableIdRef.current = String(tableId);
      fieldIdRef.current = Number(fieldId);
      if (UserLocalStorage.getSkipDeleteConfirmation()) {
        void deleteTableField();
        return;
      }
      setIsOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      tableIdRef.current = undefined;
      fieldIdRef.current = undefined;
    }
  }, [isOpen]);

  const deleteTableField = async () => {
    const tableId = tableIdRef.current;
    const deletedFieldId = fieldIdRef.current;
    if (!tableId || deletedFieldId == null) {
      toast.error('Cannot delete: missing table or field.');
      return;
    }
    setIsDeletingTableField(true);
    try {
      const res = await tableService.deleteTableField({
        tableId: String(tableId),
        id: deletedFieldId,
      });
      if (res.status !== 200) {
        throw new Error(res?.data?.message ?? 'Delete failed');
      }
      window.dispatchEvent(
        new CustomEvent(dadixEvents.tableEvents.onDeleteField, {
          detail: { tableId, fieldId: deletedFieldId },
        })
      );
      setIsOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg || 'Failed to delete field');
    } finally {
      setIsDeletingTableField(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete your
            table field and all it&apos;s data from our servers.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel autoFocus>Cancel</AlertDialogCancel>
          <AlertDialogAction
            type='button'
            className={cn(buttonVariants({ variant: 'destructive' }))}
            onClick={(evnt) => {
              evnt.preventDefault();
              evnt.stopPropagation();
              void deleteTableField();
            }}
            disabled={isDeletingTableField}
          >
            {isDeletingTableField ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export function openDeleteTableFieldConfirmDialog({
  tableId,
  fieldId,
}: {
  tableId: string | number;
  fieldId: number;
}) {
  window.dispatchEvent(
    new CustomEvent(OPEN_DELETE_TABLE_FIELD_CONFIRM_DIALOG_EVENT, {
      detail: { tableId, fieldId },
    })
  );
}
