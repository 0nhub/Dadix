import { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { LucideSearch } from 'lucide-react';
import { dadixEvents } from '@/constants/events';
import { useSearchParams } from 'next/navigation';

function OpenViewSearch() {
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const currentViewId = searchParams.get('viewId');

  useEffect(() => {
    // handle open/close view search events
    window.addEventListener(
      dadixEvents.viewEvents.openSearch,
      handleOpenSearchEvent
    );
    window.addEventListener(
      dadixEvents.viewEvents.closeSearch,
      handleCloseSearchEvent
    );
    return () => {
      window.removeEventListener(
        dadixEvents.viewEvents.openSearch,
        handleOpenSearchEvent
      );
      window.removeEventListener(
        dadixEvents.viewEvents.closeSearch,
        handleCloseSearchEvent
      );
    };

    function handleOpenSearchEvent(evnt: Event) {
      const { viewId } = (evnt as CustomEvent).detail || {};
      if (`${viewId}` !== `${currentViewId}`) return;
      setIsOpen(true);
    }
    function handleCloseSearchEvent(evnt: Event) {
      const { viewId } = (evnt as CustomEvent).detail || {};
      if (`${viewId}` !== `${currentViewId}`) return;
      setIsOpen(false);
    }
  }, [isOpen, currentViewId]);

  if (isOpen) return null;

  return (
    <Button
      size='icon'
      variant='outline'
      onClick={() => {
        openViewSearch({ viewId: parseInt(currentViewId || '') });
      }}
    >
      <LucideSearch />
    </Button>
  );
}

function openViewSearch({ viewId }: { viewId: number }) {
  window.dispatchEvent(
    new CustomEvent(dadixEvents.viewEvents.openSearch, { detail: { viewId } })
  );
}
function closeViewSearch({ viewId }: { viewId: number }) {
  window.dispatchEvent(
    new CustomEvent(dadixEvents.viewEvents.closeSearch, { detail: { viewId } })
  );
}

export { OpenViewSearch, openViewSearch, closeViewSearch };
