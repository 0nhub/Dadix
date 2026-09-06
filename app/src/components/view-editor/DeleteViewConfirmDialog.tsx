import { useEffect, useRef, useState } from 'react';
import type { IDadixView } from '@/types';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LoadingIndicator } from '@/components/loading-indicator/LoadingIndicator';
import { deleteView } from '@/lib/view';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useRouter, useSearchParams } from 'next/navigation';
import { UserLocalStorage } from '@/lib/userLocalStorage';
import { useCurrentProjectContext } from '@/context/CurrentProjectContext';
import { projectTableHref } from '@/lib/projectHref';

const OPEN_DELETE_VIEW_CONFIRM_DIALOG_EVENT =
  'dadix--open-delete-view-confirm-dialog-event';

function DeleteViewConfirmDialog() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const currentProjectCtx = useCurrentProjectContext();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [view, setView] = useState<IDadixView | undefined>(undefined);
  const viewRef = useRef<IDadixView | undefined>(undefined);
  const tableIdRef = useRef<string | number | undefined>(undefined);

  useEffect(() => {
    window.addEventListener(
      OPEN_DELETE_VIEW_CONFIRM_DIALOG_EVENT,
      handleOpenDialog
    );
    return () => {
      window.removeEventListener(
        OPEN_DELETE_VIEW_CONFIRM_DIALOG_EVENT,
        handleOpenDialog
      );
    };
    function handleOpenDialog(evnt: Event) {
      const { view, tableId } = (evnt as CustomEvent).detail || {};
      if (!view || !tableId || isOpen) return;
      tableIdRef.current = tableId;
      viewRef.current = { ...view };
      setView({ ...view });
      if (UserLocalStorage.getSkipDeleteConfirmation()) {
        onConfirmDelete();
        return;
      }
      setIsOpen(true);
    }
  }, [isOpen]);

  const onConfirmDelete = () => {
    if (!viewRef.current || !tableIdRef.current) return;
    deleteView({ id: viewRef.current.id, tableId: `${tableIdRef.current}` })
      .then((res) => {
        setIsDeleting(false);
        setIsOpen(false);
        if (`${searchParams.get('viewId')}` === `${viewRef.current?.id}`) {
          router.replace(
            projectTableHref(
              currentProjectCtx.id,
              searchParams.get('tableId') ?? tableIdRef.current
            )
          );
        }
        return res;
      })
      .catch((err) => {
        setIsDeleting(false);
        console.error('Error deleting view:', err);
        toast.error(err instanceof Error ? err.message : 'Error deleting view');
      });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen} modal={false}>
      <DialogContent>
        <DialogHeader className='items-start'>
          <DialogTitle>Delete View</DialogTitle>
          <DialogDescription className='text-left text-pretty'>
            Are you sure you want to delete &quot;{view?.name}&quot; view? This
            action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className='flex-row justify-end'>
          <DialogClose asChild>
            <Button variant='ghost' disabled={isDeleting}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            variant='destructive'
            onClick={onConfirmDelete}
            disabled={isDeleting}
          >
            {/*{isDeleting && <LoadingIndicator visibilityDelay={false} />}*/}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function openDeleteViewConfirmDialog({
  tableId,
  view,
}: {
  tableId: string | number;
  view: IDadixView;
}) {
  window.dispatchEvent(
    new CustomEvent(OPEN_DELETE_VIEW_CONFIRM_DIALOG_EVENT, {
      detail: { tableId, view },
    })
  );
}

export { DeleteViewConfirmDialog, openDeleteViewConfirmDialog };
