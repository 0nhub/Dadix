'use client';

import { dadixEvents } from '@/constants/events';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import { useRequestRelativeRecordHandler } from '@/hooks/useRequestRelativeRecordHandler';
import recordContorllers from '@/lib/record';

import { useEventHandler } from '@/hooks/useEventHandler';
import {
  applyFilterToRecord,
  decodeRelationData,
  isEncodedRelationData,
} from '@/lib/utils';
import { useLocalTableHiddenRows } from '@/hooks/useLocalTableHiddenRows';
import { toast } from 'sonner';

import type { ITableRowsCtx } from '@/components/table-view/TableView';
import type { Field } from '@/types';

const TableRowsContext = createContext<ITableRowsCtx>({
  data: [],
  limit: -1,
  isLoading: true,
  isLoadingMore: false,
  methods: {
    loadMoreRecords: () => null,
    setLimit: (_limit: number) => null,
  },
});

export function TableRowsContextProvider({
  children,
  tableId,
  tableFields,
  parsedTableFilters,
}: {
  children: React.ReactNode;
  tableId: string | undefined;
  tableFields: Field[];
  parsedTableFilters: string;
}) {
  const lastTableRecordsRequest = useRef<{
    tableId: string | undefined;
    id: number;
  }>({ tableId: undefined, id: 0 });
  const tableIdRef = useRef<string | number | undefined>(undefined);
  const tableRowsOffsetRef = useRef<number>(0);
  const tableRowsLimitRef = useRef<number>(100);
  const tableRowsTotalRef = useRef<number>(0);
  const tableFilterRef = useRef<string>(undefined);

  // this hook used to store new created records if they don't meet current active filter
  const {
    insertLocalTableHiddenRow,
    updateLocalTableHiddenRow,
    removeLocalTableHiddenRow,
    resetLocalTableHiddenRows,
  } = useLocalTableHiddenRows({
    tableId,
  });

  const [tableRows, setTableRows] = useState<Record<string, unknown>[]>([]);
  const [tableRowsLimit, setTableRowsLimit] = useState<number>(100);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

  useRequestRelativeRecordHandler({
    tableId,
    records: tableRows,
    filter: parsedTableFilters || '',
  });

  useEffect(() => {
    tableRowsOffsetRef.current = 0;
    tableRowsTotalRef.current = 0;
    setTableRows([]);
  }, [tableId]);

  useEffect(() => {
    tableRowsLimitRef.current = tableRowsLimit;
  }, [tableRowsLimit]);

  useEffect(() => {
    tableRowsOffsetRef.current = tableRows.length;
  }, [tableRows]);

  useEffect(() => {
    const filter = parsedTableFilters || '';
    if (tableIdRef.current === tableId && filter === tableFilterRef.current) {
      return;
    }
    if (filter !== tableFilterRef.current) {
      tableRowsOffsetRef.current = 0;
    }
    tableIdRef.current = tableId;
    tableFilterRef.current = filter;
    if (!tableIdRef.current) {
      return;
    }
    lastTableRecordsRequest.current.id++;
    const requestTableRecordsId = lastTableRecordsRequest.current.id;
    lastTableRecordsRequest.current.tableId = tableId;
    const requestedRecordsForTableId = tableId;
    resetLocalTableHiddenRows();
    setTableRows([]);
    setIsLoading(true);

    // get current table rows
    if (tableRowsLimitRef.current === -1) {
      // get all rows
      recordContorllers
        .getRecords({
          tableId: tableIdRef.current.toString(),
        })
        .then((res) => {
          if (
            requestTableRecordsId !== lastTableRecordsRequest.current?.id ||
            tableIdRef.current !== requestedRecordsForTableId
          ) {
            return;
          }
          setTableRows(res as Record<string, unknown>[]);
          setIsLoading(false);
          return;
        })
        .catch((err) => {
          if (
            requestTableRecordsId !== lastTableRecordsRequest.current?.id ||
            tableIdRef.current !== requestedRecordsForTableId
          ) {
            return;
          }
          console.error('fetch error:', err);
          setIsLoading(false);
          return;
        });
    } else {
      // get a limited number of rows
      recordContorllers
        .getRecordsByOffset({
          tableId: tableIdRef.current.toString(),
          limit: tableRowsLimitRef.current,
          offset: tableRowsOffsetRef.current,
          filter,
        })
        .then((res) => {
          if (
            requestTableRecordsId !== lastTableRecordsRequest.current?.id ||
            tableIdRef.current !== requestedRecordsForTableId
          ) {
            return;
          }
          tableRowsTotalRef.current = (res as Record<string, unknown>)
            .total as number;
          if (Array.isArray(res as Record<string, unknown>)) {
            setIsLoading(false);
            toast.error('Error loading records!');
            return;
          }
          setTableRows((tableRows) => [
            ...tableRows,
            ...((res as Record<string, unknown>).records as Record<
              string,
              unknown
            >[]),
          ]);
          setIsLoading(false);
          return;
        })
        .catch((err) => {
          if (
            requestTableRecordsId !== lastTableRecordsRequest.current?.id ||
            tableIdRef.current !== requestedRecordsForTableId
          ) {
            return;
          }
          toast.error('Error loading records!');
          console.error('fetch records error:', err);
          setIsLoading(false);
          return;
        });
    }
  }, [tableId, parsedTableFilters]);

  // handle create new row
  useEventHandler(
    dadixEvents.recordEvents.onCreate,
    async (evnt: Event) => {
      try {
        const { tableId, createdRecord } = (evnt as CustomEvent).detail || {};
        if (!createdRecord || tableId !== tableIdRef.current) return;
        // check if full table records are loaded
        if (tableRowsOffsetRef.current < tableRowsTotalRef.current) return;
        // check if created record meet current filter
        const isCurrentFilterApplysToCreatedRecord = await applyFilterToRecord({
          record: createdRecord,
          fields: tableFields,
          filter: tableFilterRef.current || '',
        });
        if (!isCurrentFilterApplysToCreatedRecord) {
          // store created record in local table hidden records
          insertLocalTableHiddenRow({ row: { ...createdRecord } });
          return;
        }
        // add created record to visible table records
        setTableRows((tableRows) => [...tableRows, { ...createdRecord }]);
      } catch (err) {
        console.error(err);
      }
    },
    [tableRows, tableFields]
  );

  // handle update existing row
  useEventHandler(
    dadixEvents.recordEvents.onChange,
    async (evnt: Event) => {
      const { tableId, recordId, updatedRecordData } =
        (evnt as CustomEvent).detail || {};

      const currentTableId = isEncodedRelationData(tableIdRef.current as string)
        ? decodeRelationData(tableIdRef.current as string).relatedToTableWithId
        : tableIdRef.current;

      if (!updatedRecordData && tableId !== currentTableId) return;

      const updatedRecordIndex = tableRows.findIndex(
        (record) => `${record.id}` === `${recordId}`
      );
      let updatedRecord = null;
      if (updatedRecordIndex >= 0) {
        // if record exist in visible records
        updatedRecord = {
          ...tableRows[updatedRecordIndex],
          ...updatedRecordData,
        };
      } else {
        // else check if record exist in hidden records
        updatedRecord = await updateLocalTableHiddenRow({
          rowId: recordId,
          updates: updatedRecordData,
        });
        if (!updatedRecord) return;
        // check if full table records are loaded
        if (tableRowsOffsetRef.current < tableRowsTotalRef.current) return;
      }
      // check if created record meet current filter
      const isCurrentFilterApplysToCreatedRecord = await applyFilterToRecord({
        record: updatedRecord,
        fields: tableFields,
        filter: tableFilterRef.current || '',
      });
      if (!isCurrentFilterApplysToCreatedRecord) {
        if (updatedRecordIndex >= 0) {
          // remove record from visible records
          setTableRows(
            tableRows.filter((row) => `${row.id}` !== `${recordId}`)
          );
          // update totale records
          tableRowsTotalRef.current -= 1;
          // store created record in local table hidden records
          insertLocalTableHiddenRow({ row: { ...updatedRecord } });
        }
        return;
      }
      if (updatedRecordIndex >= 0) {
        // save updated record changes
        setTableRows((tableRows) =>
          tableRows.map((row) => {
            if (`${row.id}` === `${recordId}`) {
              return { ...updatedRecord };
            }
            return row;
          })
        );
        return;
      }
      // add created record to visible table records
      setTableRows((tableRows) =>
        [...tableRows, { ...updatedRecord }].sort(
          (row1, row2) => (row1.id as number) - (row2.id as number)
        )
      );
      removeLocalTableHiddenRow({ rowId: updatedRecord.id as number });
    },
    [tableRows, tableFields]
  );

  // handle deleting rows
  useEventHandler(
    dadixEvents.recordEvents.onDelete,
    (evnt: Event) => {
      const details = (evnt as CustomEvent).detail || {};
      const isUpdatedTableIdARelation = isEncodedRelationData(
        `${details.tableId}`
      );
      const isCurrentTableIdARelation = isEncodedRelationData(
        `${tableIdRef.current}`
      );

      const isNotSameTable =
        (isUpdatedTableIdARelation && !isCurrentTableIdARelation) ||
        (isCurrentTableIdARelation === isUpdatedTableIdARelation &&
          `${details.tableId}` !== `${tableIdRef.current}`) ||
        (!isCurrentTableIdARelation &&
          isCurrentTableIdARelation &&
          `${details.tableId}` !==
            decodeRelationData(`${tableIdRef.current}`).relatedToTableWithId);

      if (isNotSameTable || !details.ids || details.ids.length === 0) {
        return;
      }

      let deletedRowsFromVisibleRows = 0;
      if (isUpdatedTableIdARelation && isCurrentTableIdARelation) {
        setTableRows((tableRows) => {
          return tableRows.filter((row) => {
            const deletedRecordIdIndex = details.ids.indexOf(`${row.id}`);
            const existInDeletedRows =
              deletedRecordIdIndex >= 0 &&
              details.relationRecordsIds[deletedRecordIdIndex] ===
                `${row._relation_record_id}`;
            deletedRowsFromVisibleRows += existInDeletedRows ? 1 : 0;
            return !existInDeletedRows;
          });
        });
      } else {
        setTableRows((tableRows) => {
          return tableRows.filter((row) => {
            const existInDeletedRows = details.ids.indexOf(`${row.id}`) >= 0;
            deletedRowsFromVisibleRows += existInDeletedRows ? 1 : 0;
            return !existInDeletedRows;
          });
        });
        for (const rowId of details.ids) {
          removeLocalTableHiddenRow({ rowId: rowId as number });
        }
      }
      tableRowsTotalRef.current -= deletedRowsFromVisibleRows;
    },
    [tableRows]
  );

  const loadMoreRecords = useCallback(
    (callBack?: () => void) => {
      if (isLoading || isLoadingMore) {
        return;
      }

      if (tableRows.length === tableRowsTotalRef.current) {
        return;
      }

      const requestedTableId = tableIdRef.current;
      if (!requestedTableId) {
        return;
      }

      setIsLoadingMore(true);

      recordContorllers
        .getRecordsByOffset({
          tableId: requestedTableId.toString(),
          limit: tableRowsLimitRef.current,
          offset: tableRowsOffsetRef.current,
          filter: tableFilterRef.current,
        })
        .then((_res) => {
          const res = _res as {
            records: Record<string, unknown>[];
            total: number;
          };
          if (!res || !res.records) {
            return;
          }
          if (tableIdRef.current !== requestedTableId) {
            return;
          }
          tableRowsTotalRef.current = (res as Record<string, unknown>)
            .total as number;
          setTableRows((tableRows) => [
            ...tableRows,
            ...((res as Record<string, unknown>).records as Record<
              string,
              unknown
            >[]),
          ]);
          setIsLoadingMore(false);
          if (callBack) {
            callBack();
          }
          return;
        })
        .catch((err) => {
          if (tableIdRef.current !== requestedTableId) {
            return;
          }
          console.error('fetch error:', err);
          setIsLoadingMore(false);
          return;
        });
    },
    [isLoading, isLoadingMore, tableRows]
  );

  return (
    <TableRowsContext.Provider
      value={{
        data: tableRows,
        limit: tableRowsLimit,
        isLoading,
        isLoadingMore,
        methods: {
          loadMoreRecords,
          setLimit: setTableRowsLimit,
        },
      }}
    >
      {children}
    </TableRowsContext.Provider>
  );
}

export function useTableRowsContext() {
  const context = useContext(TableRowsContext);
  if (context === undefined) {
    throw new Error(
      'useTableRowsContext must be used within a TableRowsContextProvider'
    );
  }
  return context;
}
