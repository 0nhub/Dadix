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
import { LoadingIndicator } from '@/components/loading-indicator/LoadingIndicator';
import { UserLocalStorage } from '@/lib/userLocalStorage';

const OPEN_DELETE_TABLE_CONFIRM_DIALOG_EVENT =
  'dadix--open-delete-table-confirm-dialog-event';

const DeleteTableConfirmDialog = () => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isDeletingTable, setIsDeletingTable] = useState<boolean>(false);
  const tableIdRef = useRef<string>(undefined);
  const projectIdRef = useRef<string>(undefined);

  useEffect(() => {
    window.addEventListener(
      OPEN_DELETE_TABLE_CONFIRM_DIALOG_EVENT,
      handleOpenDialog
    );
    return () => {
      window.removeEventListener(
        OPEN_DELETE_TABLE_CONFIRM_DIALOG_EVENT,
        handleOpenDialog
      );
    };
    function handleOpenDialog(evnt: Event) {
      const { tableId, projectId } = (evnt as CustomEvent).detail || {};
      if (!projectId || !tableId || isOpen) return;
      tableIdRef.current = tableId;
      projectIdRef.current = projectId;
      if (UserLocalStorage.getSkipDeleteConfirmation()) {
        deleteTable();
        return;
      }
      setIsOpen(true);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      tableIdRef.current = undefined;
      projectIdRef.current = undefined;
    }
  }, [isOpen]);

  const deleteTable = () => {
    if (!projectIdRef.current || !tableIdRef.current) return;
    setIsDeletingTable(true);
    const tableId = tableIdRef.current;
    const projectId = projectIdRef.current;
    tableService
      .deleteTable({
        projectId,
        tableId,
      })
      .then((res) => {
        if (res.status !== 200) {
          throw new Error('Error deleting table');
        }
        setIsOpen(false);
        return res;
      })
      .finally(() => {
        setIsDeletingTable(false);
      })
      .catch((err) => {
        console.error(err);
      });
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete your
            <b> table</b> and all it&apos;s data from our servers.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel autoFocus>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={`${cn(buttonVariants({ variant: 'destructive' }))}`}
            onClick={(evnt) => {
              evnt.preventDefault();
              deleteTable();
            }}
          >
            {/*{isDeletingTable && <LoadingIndicator visibilityDelay={false} />}*/}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

function openDeleteTableConfirmDialog({
  tableId,
  projectId,
}: {
  tableId: string | number;
  projectId: string | number;
}) {
  window.dispatchEvent(
    new CustomEvent(OPEN_DELETE_TABLE_CONFIRM_DIALOG_EVENT, {
      detail: { tableId, projectId },
    })
  );
}

export { DeleteTableConfirmDialog, openDeleteTableConfirmDialog };
