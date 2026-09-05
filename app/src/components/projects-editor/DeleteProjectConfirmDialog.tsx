import { useEffect, useRef, useState } from 'react';

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
import { buttonVariants } from '@/components/ui/button';
import { LoadingIndicator } from '@/components/loading-indicator/LoadingIndicator';

import { cn } from '@/lib/utils';
import { callApi } from '@/lib/api';
import { dadixEvents } from '@/constants/events';
import { UserLocalStorage } from '@/lib/userLocalStorage';

const OPEN_DELETE_PROJECT_CONFIRM_DIALOG_EVENT =
  'dadix--open-confirm-delete-project-dialog-event';

const DeleteProjectConfirmDialog = () => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isDeletingProject, setIsDeletingProject] = useState<boolean>(false);
  const projectIdRef = useRef<string>(undefined);

  useEffect(() => {
    window.addEventListener(
      OPEN_DELETE_PROJECT_CONFIRM_DIALOG_EVENT,
      handleOpenDialog
    );
    return () => {
      window.removeEventListener(
        OPEN_DELETE_PROJECT_CONFIRM_DIALOG_EVENT,
        handleOpenDialog
      );
    };
    function handleOpenDialog(evnt: Event) {
      const { projectId } = (evnt as CustomEvent).detail || {};
      if (!projectId || isOpen) return;
      projectIdRef.current = projectId;
      if (UserLocalStorage.getSkipDeleteConfirmation()) {
        deleteProject();
        return;
      }
      setIsOpen(true);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      projectIdRef.current = undefined;
    }
  }, [isOpen]);

  const deleteProject = () => {
    setIsDeletingProject(true);
    const deletedProjectId = projectIdRef.current;
    callApi
      .delete(`/project/${deletedProjectId}`)
      .then((res) => {
        if (res.status !== 200) {
          throw new Error('Error saving project icon');
        }
        window.dispatchEvent(
          new CustomEvent(dadixEvents.projectEvents.onDelete, {
            detail: {
              projectId: deletedProjectId,
            },
          })
        );
        setIsDeletingProject(false);
        setIsOpen(false);
        return res;
      })
      .catch((err) => {
        setIsDeletingProject(false);
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
            project data from our servers.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel autoFocus>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={`${cn(buttonVariants({ variant: 'destructive' }))}`}
            onClick={(evnt) => {
              evnt.preventDefault();
              deleteProject();
            }}
          >
            {/*{isDeletingProject && <LoadingIndicator visibilityDelay={false} />}*/}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

function openDeleteProjectConfirmDialog({ projectId }: { projectId: string }) {
  window.dispatchEvent(
    new CustomEvent(OPEN_DELETE_PROJECT_CONFIRM_DIALOG_EVENT, {
      detail: { projectId },
    })
  );
}

export { DeleteProjectConfirmDialog, openDeleteProjectConfirmDialog };
