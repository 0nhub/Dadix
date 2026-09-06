import { useState } from 'react';

import { LucidePlus } from 'lucide-react';

import { toast } from 'sonner';
import { openTableRecord } from '@/components/table-cell-viewer';
import recordService from '@/lib/record';
import { getDefaultRecordData } from '@/lib/utils';
import { useTableContext } from '@/context/TableContext';

import type { Field } from '@/types';

export function CreateNewRecordButton({
  tableId,
  projectId,
  tableFields,
  variant,
}: {
  tableId: string | undefined;
  projectId: string | undefined;
  tableFields: Field[];
  variant: 'outline' | 'secondary' | 'ghost' | undefined;
}) {
  const [isAddingNewRecord, setIsAddingNewRecord] = useState<boolean>(false);
  const liveTableCtx = useTableContext();

  const fieldsForDefaultsAndOpen = (liveTableCtx?.id != null && String(liveTableCtx.id) === String(tableId) && liveTableCtx?.table?.fields?.length)
    ? liveTableCtx.table.fields
    : (tableFields ?? []);

  const handleCreateNewRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableId || !projectId) {
      toast.error('Error create new record');
      return;
    }

    try {
      setIsAddingNewRecord(true);
      const recordData = getDefaultRecordData(fieldsForDefaultsAndOpen);
      const createdRecord = await recordService.createRecord({
        tableId,
        projectId,
        recordData,
      });

      if (!createdRecord) {
        throw new Error('Error creating new record');
      }
      openTableRecord({
        tableId,
        tableFields: fieldsForDefaultsAndOpen,
        record: { ...createdRecord },
      });
      // toast.success('Record created successfully!');
    } catch (error: unknown) {
      const apiErr = error as { response?: { data?: { error?: string } } };
      console.error('Error creating record:', error);
      toast.error(apiErr.response?.data?.error || 'Failed to create record');
    } finally {
      setIsAddingNewRecord(false);
    }
  };

  return (
    <button
      type='button'
      disabled={isAddingNewRecord}
      onClick={handleCreateNewRecord}
      aria-label='New record'
      className='flex h-full w-full items-center justify-center rounded-none border-0 bg-transparent p-0 text-muted-foreground outline-none hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none disabled:opacity-50'
      data-variant={variant}
    >
      <LucidePlus className='size-4 shrink-0' />
    </button>
  );
}
