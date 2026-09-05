import { LoadingIndicator } from '@/components/loading-indicator/LoadingIndicator';
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
import { useRouter, useSearchParams } from 'next/navigation';
import { createView } from '@/lib/view';
import { toast } from 'sonner';

const OPEN_CREATE_NEW_VIEW_DIALOG_EVENT =
  'dadix-events-open-create-new-view-dialog';

function CreateViewDialog() {
  const currentTableIdRef = useRef<string>(undefined);
  const viewNameRef = useRef<string>(undefined);
  const selectedIconRef = useRef<string>(
    availableDadixViewIcons[
      Math.floor(Math.random() * availableDadixViewIcons.length)
    ]
  );

  const searchParams = useSearchParams();
  const router = useRouter();

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
    window.addEventListener(
      OPEN_CREATE_NEW_VIEW_DIALOG_EVENT,
      handleOpenDialogEvent
    );
    return () => {
      window.removeEventListener(
        OPEN_CREATE_NEW_VIEW_DIALOG_EVENT,
        handleOpenDialogEvent
      );
    };
    function handleOpenDialogEvent(_evnt: Event) {
      if (isOpen) {
        return;
      }
      setSelectedIcon(
        availableDadixViewIcons[
          Math.floor(Math.random() * availableDadixViewIcons.length)
        ]
      );
      handleOpenChange(true);
    }
  }, [isOpen]);

  const handleSubmit = () => {
    const viewName = (viewNameRef.current || '').trim();
    const viewIcon = selectedIconRef.current;
    const viewType = 'gridView';
    if (!viewName) {
      toast.error("View name can't be empty");
      return;
    }
    if (!currentTableIdRef.current || !viewIcon || !viewType) {
      return;
    }

    setLoading(true);
    createView({
      tableId: currentTableIdRef.current,
      name: viewName,
      icon: viewIcon,
      type: viewType,
    })
      .then((response) => {
        if (response.view) {
          // Navigate to the new view using its id
          const createdViewId = (response.view as Record<string, unknown>).id;
          if (!createdViewId) {
            // document.location.reload();
            return;
          }
          toast.success('View created successfully!');
          router.push(
            `${document.location.pathname}?tableId=${currentTableIdRef.current}&viewId=${createdViewId}`
          );

          // Reset form and close dialog
          setIsOpen(false);
          setViewName('');
          setLoading(false);
        }
        return response;
      })
      .catch((err: unknown) => {
        setLoading(false);
        console.error('Error creating view:', err);
        const status = (err as { response?: { status?: number } })?.response?.status;
        const msg = (err as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message
          ?? (err as Error)?.message
          ?? 'View konnte nicht erstellt werden.';
        if (status === 401) {
          toast.error('Nicht angemeldet', {
            description: 'Bitte melde dich erneut an und versuche es nochmal.',
          });
        } else {
          toast.error('Fehler', { description: msg });
        }
      });
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setViewName('');
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
            create view
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
                        onClick={() => setSelectedIcon(iconName)}
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

function openCreateNewViewDialog() {
  window.dispatchEvent(new CustomEvent(OPEN_CREATE_NEW_VIEW_DIALOG_EVENT));
}

export { CreateViewDialog, openCreateNewViewDialog };
