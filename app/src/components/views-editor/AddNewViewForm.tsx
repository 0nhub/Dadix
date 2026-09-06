'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { LucidePlus } from 'lucide-react';
import { toast } from 'sonner';

import { createNewViewDirect } from '@/lib/view';
import { useTableContext } from '@/context/TableContext';
import { useTableViewsContext } from '@/context/TableViewsContext';
import { useLanguage } from '@/context/LanguageContext';

function AddNewViewForm() {
  const currentTableCtx = useTableContext();
  const tableViewsCtx = useTableViewsContext();
  const { t } = useLanguage();
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
          t('table.viewCreateFailed');
        if (status === 401) {
          toast.error(t('table.notSignedIn'), {
            description: t('table.signInAgain'),
          });
        } else {
          toast.error(t('table.error'), { description: msg });
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
