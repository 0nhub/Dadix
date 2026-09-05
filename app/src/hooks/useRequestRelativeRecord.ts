import { useState } from 'react';

import recordControllers from '@/lib/record';
import { dadixEvents } from '@/constants/events';

export function useRequestRelativeRecord() {
  const [isLoadingNext, setIsLoadingNext] = useState<boolean>(false);
  const [isLoadingLast, setIsLoadingLast] = useState<boolean>(false);

  async function getRelativeRecord({
    tableId,
    recordId,
    relation,
  }: {
    tableId: string;
    recordId: number;
    relation: 'after' | 'before';
  }): Promise<{ record: Record<string, unknown> | null }> {
    if (relation === 'after') setIsLoadingNext(true);
    else setIsLoadingLast(true);

    const result: Record<string, unknown> = await new Promise(
      (_resolve, _reject) => {
        const resolve = (data: {
          record: Record<string, unknown> | null;
          filter?: string;
          recordIndex?: number;
        }) => {
          if (relation === 'after') setIsLoadingNext(false);
          else setIsLoadingLast(false);
          _resolve(data);
        };

        const getRecord = async (data: {
          record: Record<string, unknown>;
          filter?: string;
          outOfIndex?: boolean;
        }) => {
          if (data.record) return resolve(data);
          if (!data.outOfIndex) return resolve(data);

          const targetRecordFilter = `${relation === 'after' ? 'gt' : 'lt'}(id,${recordId})`;
          try {
            const getRecordFromServerResult =
              await recordControllers.getRecordsByOffset({
                tableId,
                filter: data.filter
                  ? `and(${data.filter}, ${targetRecordFilter})`
                  : `${targetRecordFilter}`,
                limit: 1,
                offset: 0,
                order: relation === 'after' ? 'ASC' : 'DESC',
              });
            const resData = getRecordFromServerResult as {
              records: Record<string, unknown>[];
            } & Record<string, unknown>;

            if (resData && resData.records && resData.records[0]) {
              return resolve({
                record: { ...resData.records[0] },
              });
            }
          } catch (err) {
            console.error(err);
          }
          return resolve({ record: null });
        };

        window.dispatchEvent(
          new CustomEvent(dadixEvents.recordEvents.onRequestRelativeRecord, {
            detail: {
              tableId,
              recordId,
              relation,
              resolve: getRecord,
            },
          })
        );
      }
    );
    if (!result || !result.record) return { record: null };
    return { record: result.record as Record<string, unknown> };
  }

  async function getFirstOrLastRecord({
    tableId,
    which,
  }: {
    tableId: string;
    which: 'first' | 'last';
  }): Promise<{ record: Record<string, unknown> | null }> {
    const result = await new Promise<{
      record: Record<string, unknown> | null;
    }>((resolve) => {
      const timeout = setTimeout(
        () => resolve({ record: null }),
        2000
      );
      window.dispatchEvent(
        new CustomEvent(dadixEvents.recordEvents.onRequestFirstOrLastRecord, {
          detail: {
            tableId,
            which,
            resolve: (data: { record: Record<string, unknown> | null }) => {
              clearTimeout(timeout);
              resolve(data);
            },
          },
        })
      );
    });
    return result ?? { record: null };
  }

  return {
    getRelativeRecord,
    getFirstOrLastRecord,
    isLoadingNext,
    isLoadingLast,
  };
}
