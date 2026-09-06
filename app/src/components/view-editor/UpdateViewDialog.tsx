import { LoadingIndicator } from '../loading-indicator/LoadingIndicator';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  availableDadixViewIcons,
  DadixViewIcon,
} from '../dadix-view-icon/DadixViewIcon';
import { useEffect, useRef, useState } from 'react';
import { LucideX } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { patchView } from '@/lib/view';
import { toast } from 'sonner';
import type { IDadixView } from '@/types';
import { useTableViewsContext } from '@/context/TableViewsContext';

const OPEN_UPDATE_VIEW_DIALOG_EVENT = 'dadix-events-open-update-view-dialog';

function UpdateViewDialog() {
  const currentTableViewsCtx = useTableViewsContext();
  const searchParams = useSearchParams();

  const currentTableIdRef = useRef<string>(undefined);
  const editedViewRef = useRef<IDadixView>(undefined);
  const viewNameRef = useRef<string>(undefined);
  const selectedIconRef = useRef<string>(
    availableDadixViewIcons[
      Math.floor(Math.random() * availableDadixViewIcons.length)
    ]
  );

  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [viewName, setViewName] = useState<string>('');
  const [selectedIcon, setSelectedIcon] = useState<string>(
    selectedIconRef.current
  );

  useEffect(() => {
    currentTableIdRef.current = searchParams.get('tableId') || undefined;
  }, [searchParams]);

  useEffect(() => {
    selectedIconRef.current = selectedIcon;
  }, [selectedIcon]);

  useEffect(() => {
    viewNameRef.current = viewName;
  }, [viewName]);

  useEffect(() => {
    window.addEventListener(
      OPEN_UPDATE_VIEW_DIALOG_EVENT,
      handleOpenDialogEvent
    );
    return () => {
      window.removeEventListener(
        OPEN_UPDATE_VIEW_DIALOG_EVENT,
        handleOpenDialogEvent
      );
    };
    function handleOpenDialogEvent(evnt: Event) {
      if (isOpen) return;

      const { id } = (evnt as CustomEvent).detail || {};
      if (!id) return;

      const editedView = currentTableViewsCtx.views.find(
        (view) => `${view.id}` === `${id}`
      );
      if (!editedView) return;

      editedViewRef.current = { ...editedView };
      setViewName(editedView.name);
      setSelectedIcon(editedView.icon);
      handleOpenChange(true);
    }
  }, [isOpen, currentTableViewsCtx.views]);

  const onConfirmSave = () => {
    if (!editedViewRef.current) return;
    const viewName = (viewNameRef.current || '').trim();
    const viewIcon = selectedIconRef.current;
    if (!viewName) {
      toast.error("View name can't be empty");
      return;
    }
    let isThereAnyChanges = false;
    const changes: { name?: string; icon?: string } = {};
    if (viewName !== editedViewRef.current.name) {
      changes.name = viewName;
      isThereAnyChanges = true;
    }
    if (viewIcon !== editedViewRef.current.icon) {
      changes.icon = viewIcon;
      isThereAnyChanges = true;
    }
    if (!isThereAnyChanges) {
      handleOpenChange(false);
      return;
    }

    setLoading(true);
    patchView({
      tableId: `${currentTableIdRef.current}`,
      id: editedViewRef.current.id,
      data: { ...changes },
    })
      .then((response) => {
        toast.success('View updated successfully!');
        setIsOpen(false);
        setViewName('');
        setLoading(false);
        return response;
      })
      .catch((err) => {
        setLoading(false);
        toast.error('Error updating view');
        console.error('Error updating view:', err);
      });
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setViewName('');
      editedViewRef.current = undefined;
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
                  <DadixViewIcon
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
                  {availableDadixViewIcons.map((iconName) => (
                    <DialogClose key={iconName} asChild>
                      <Button
                        type='button'
                        variant='outline'
                        size='icon'
                        aria-pressed={selectedIcon === iconName}
                        title={iconName}
                        onClick={() => {
                          selectedIconRef.current = iconName;
                          setSelectedIcon(iconName);
                        }}
                        className={`shadow-none ${selectedIcon === iconName ? 'border' : 'border-none'}`}
                      >
                        <DadixViewIcon name={iconName} className='size-6' />
                      </Button>
                    </DialogClose>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
            <div className='w-full'>
              <Input
                placeholder='Enter view name'
                value={viewName}
                onChange={(e) => {
                  const value = e.target.value;
                  setViewName(value);
                  viewNameRef.current = value;
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

function openUpdateViewDialog({ viewId }: { viewId: number }) {
  window.dispatchEvent(
    new CustomEvent(OPEN_UPDATE_VIEW_DIALOG_EVENT, { detail: { id: viewId } })
  );
}

export { UpdateViewDialog, openUpdateViewDialog };
