'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/context/LanguageContext';
import { useTableContext } from '@/context/TableContext';
import { callApi } from '@/lib/api';
import { dadixEvents } from '@/constants/events';
import { toast } from 'sonner';

type MissingSource = {
  source_id: number;
  expected_path?: string;
  stored_uri?: string | null;
};

export function LinkedFileBanner() {
  const { t } = useLanguage();
  const tableCtx = useTableContext();
  const sourceKind = tableCtx.table?.sourceKind;
  const sourceId = Number(tableCtx.table?.sourceId ?? 0);
  const [missing, setMissing] = useState<MissingSource | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (sourceKind !== 'linked_file' || !sourceId) {
      setMissing(null);
      return;
    }
    try {
      const res = await callApi.get('/source/missing');
      const rows = Array.isArray(res.data) ? (res.data as MissingSource[]) : [];
      setMissing(rows.find((row) => Number(row.source_id) === sourceId) ?? null);
    } catch {
      setMissing(null);
    }
  }, [sourceKind, sourceId]);

  useEffect(() => {
    void refresh();
  }, [refresh, tableCtx.id]);

  const locate = async () => {
    if (!sourceId) return;
    setBusy(true);
    try {
      const picked = await callApi.post('/source/pick-file', {
        extensions: ['csv', 'tsv', 'parquet', 'json', 'jsonl', 'ndjson'],
      });
      const path = String((picked.data as { path?: string } | undefined)?.path ?? '');
      if (!path) return;
      await callApi.post(`/source/${sourceId}/relink`, { path });
      setMissing(null);
      toast.success(t('table.source.relinked'));
      window.dispatchEvent(new CustomEvent(dadixEvents.sourceEvents.onRelinked, {
        detail: { sourceId, tableId: tableCtx.id },
      }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('table.source.pickFailed'));
    } finally {
      setBusy(false);
    }
  };

  if (sourceKind !== 'linked_file' || !missing) return null;

  return (
    <div className='mx-3 mt-2 flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2'>
      <div className='min-w-0'>
        <p className='text-sm font-medium leading-5'>{t('table.source.missingTitle')}</p>
        <p className='text-xs text-muted-foreground leading-5'>
          {t('table.source.missingBody')}
        </p>
        {missing.expected_path || missing.stored_uri ? (
          <p className='truncate text-xs text-muted-foreground leading-5'>
            {missing.expected_path || missing.stored_uri}
          </p>
        ) : null}
      </div>
      <Button type='button' size='sm' variant='outline' disabled={busy} onClick={() => void locate()}>
        {t('table.source.locate')}
      </Button>
    </div>
  );
}
