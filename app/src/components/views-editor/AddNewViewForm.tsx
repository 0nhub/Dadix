'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { LucidePlus } from 'lucide-react';
import { toast } from 'sonner';

import { createNewViewDirect } from '@/lib/view';
import { useTableContext } from '@/context/TableContext';
import { useTableViewsContext } from '@/context/TableViewsContext';

function AddNewViewForm() {
  const currentTableCtx = useTableContext();
  const tableViewsCtx = useTableViewsContext();
  const [isSaving, setIsSaving] = useState(false);

  const tableId = currentTableCtx.id ?? tableViewsCtx.tableId;
  const viewsCount = (tableViewsCtx.views || []).length;

  function handleAddView() {
    if (!tableId) return;
    setIsSaving(true);
    createNewViewDirect(tableId, viewsCount)
      .then(() => {
        setIsSaving(false);
      })
      .catch((err: unknown) => {
        setIsSaving(false);
        console.error(err);
        const status = (err as { response?: { status?: number } })?.response?.status;
        const msg =
          (err as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message ??
          (err as Error)?.message ??
          'View konnte nicht erstellt werden.';
        if (status === 401) {
          toast.error('Nicht angemeldet', {
            description: 'Bitte melde dich erneut an und versuche es nochmal.',
          });
        } else {
          toast.error('Fehler', { description: msg });
        }
      });
  }

  if (!tableId) return null;

  return (
    <Button
      variant='outline'
      onClick={handleAddView}
      disabled={isSaving}
      className='gap-2'
    >
      <LucidePlus className='size-4' />
      Add view
    </Button>
  );
}

export { AddNewViewForm };
