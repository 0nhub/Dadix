import { useEffect } from 'react';

import { dadixEvents } from '@/constants/events';

interface UseRequestRelativeRecordHandlerProps {
  tableId: string | undefined;
  records: Record<string, unknown>[] | undefined;
  filter: string;
}

export function useRequestRelativeRecordHandler({
  tableId,
  records,
  filter,
}: UseRequestRelativeRecordHandlerProps) {
  useEffect(() => {
    if (!tableId || !records) return;

    function handleRequestRelativeRecord(evnt: Event) {
      const { tableId: requestedTableId, recordId, relation, resolve } =
        (evnt as CustomEvent).detail || {};
      if (requestedTableId !== tableId || !records) return;

      const recordIndex = records.findIndex(
        (record) => `${record.id}` === `${recordId}`
      );

      if (recordIndex < 0)
        return resolve({ record: null, filter, outOfIndex: true });

      let relativeRecordIndex = recordIndex + 1;
      if (relation === 'before') {
        relativeRecordIndex = recordIndex - 1;
      }

      if (relativeRecordIndex < 0) return resolve({ record: null });

      if (relativeRecordIndex >= records.length) {
        return resolve({ record: null, filter, outOfIndex: true });
      }

      return resolve({ record: records[relativeRecordIndex] });
    }

    function handleRequestFirstOrLast(evnt: Event) {
      const { tableId: requestedTableId, which, resolve } =
        (evnt as CustomEvent).detail || {};
      if (requestedTableId !== tableId || !records || !resolve) return;
      if (which === 'first' && records.length > 0)
        return resolve({ record: records[0] });
      if (which === 'last' && records.length > 0)
        return resolve({ record: records[records.length - 1] });
      return resolve({ record: null });
    }

    window.addEventListener(
      dadixEvents.recordEvents.onRequestRelativeRecord,
      handleRequestRelativeRecord
    );
    window.addEventListener(
      dadixEvents.recordEvents.onRequestFirstOrLastRecord,
      handleRequestFirstOrLast
    );
    return () => {
      window.removeEventListener(
        dadixEvents.recordEvents.onRequestRelativeRecord,
        handleRequestRelativeRecord
      );
      window.removeEventListener(
        dadixEvents.recordEvents.onRequestFirstOrLastRecord,
        handleRequestFirstOrLast
      );
    };
  }, [tableId, records, filter]);
  return {};
}
