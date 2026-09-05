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

import { useGridViewContext } from './GridViewContext';
import { useRequestRelativeRecordHandler } from '@/hooks/useRequestRelativeRecordHandler';
import recordContorllers from '@/lib/record';

import type { ITableRowsCtx } from '@/components/table-view/TableView';
import type { IFilter, ISortingRule, ISortingRules } from '@/types';
import { useEventHandler } from '@/hooks/useEventHandler';
import {
  applyFilterToRecordsBatch,
  applyFilterToRecord,
  applySortingRuleToRecord,
  decodeRelationData,
  isEncodedRelationData,
  sortRecordsByRule,
  viewFieldToTableField,
} from '@/lib/utils';
import { useLocalTableHiddenRows } from '@/hooks/useLocalTableHiddenRows';
import { toast } from 'sonner';
import {
  DEV_DEMO_TABLE_ID,
  DEV_DEMO_TABLE_2_ID,
  DEV_DEMO_TABLE_3_ID,
  DEV_DEMO_TABLE_4_ID,
  DEV_DEMO_VIEW_ID,
  DEV_DEMO_VIEW_2_ID,
  DEV_DEMO_VIEW_3_ID,
  getDevDemo2Records,
  getDevDemo3Records,
  getDevDemo4Records,
  getDevDemoRecords,
  getDevTableRecords,
  isDevDemoTable,
} from '@/lib/dev-demo-data';

const GridViewRowsContext = createContext<ITableRowsCtx>({
  data: [],
  limit: -1,
  isLoading: true,
  isLoadingMore: false,
  methods: {
    loadMoreRecords: () => null,
    setLimit: (_limit: number) => null,
  },
});

export function GridViewRowsContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentGridViewCtx = useGridViewContext();

  const lastRequestTableRecordsId = useRef<number>(0);
  const tableIdRef = useRef<string | number | undefined>(undefined);
  const viewIdRef = useRef<number | undefined>(undefined);
  const currentTableRowsOffsetRef = useRef<number>(0);
  const currentTableRowsLimitRef = useRef<number>(100);
  const currentTableRowsTotalRef = useRef<number>(0);
  const currentTableFilterRef = useRef<string>(undefined);
  const currentTableSortingRuleRef = useRef<ISortingRules>([]);
  const recordsCacheRef = useRef<
    Record<string, { rows: Record<string, unknown>[]; total: number }>
  >({});

  // this hook used to store new created records if they don't meet current active filter
  const {
    insertLocalTableHiddenRow,
    updateLocalTableHiddenRow,
    removeLocalTableHiddenRow,
    resetLocalTableHiddenRows,
  } = useLocalTableHiddenRows({
    tableId: currentGridViewCtx.id,
  });

  const [currentTableRows, setCurrentTableRows] = useState<
    Record<string, unknown>[]
  >([]);
  const [currentTableRowsLimit, setCurrentTableRowsLimit] =
    useState<number>(100);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

  useRequestRelativeRecordHandler({
    tableId: currentGridViewCtx.view?.tableId || undefined,
    records: currentTableRows,
    filter: currentGridViewCtx.parsedGlobalAndViewFilters || '',
  });

  useEffect(() => {
    const tableId = currentGridViewCtx.view?.tableId;
    const viewId = currentGridViewCtx.id;
    const filter = currentGridViewCtx.parsedGlobalAndViewFilters || '';
    const sort = currentGridViewCtx.sort;
    const cacheKey = tableId && viewId
      ? `${tableId}-${viewId}-${filter}-${JSON.stringify(sort ?? {})}`
      : '';
    const cached = cacheKey ? recordsCacheRef.current[cacheKey] : null;
    currentTableRowsOffsetRef.current = 0;
    if (cached?.rows) {
      currentTableRowsTotalRef.current = cached.total;
      setCurrentTableRows([...cached.rows]);
    } else {
      currentTableRowsTotalRef.current = 0;
      setCurrentTableRows([]);
    }
  }, [currentGridViewCtx.id, currentGridViewCtx.view?.tableId, currentGridViewCtx.parsedGlobalAndViewFilters, currentGridViewCtx.sort]);

  useEffect(() => {
    currentTableRowsLimitRef.current = currentTableRowsLimit;
  }, [currentTableRowsLimit]);

  useEffect(() => {
    currentTableRowsOffsetRef.current = currentTableRows.length;
  }, [currentTableRows]);

  useEffect(() => {
    if (!currentGridViewCtx.initialized) return;
    if (!currentGridViewCtx.view) {
      setCurrentTableRows([]);
      currentTableRowsOffsetRef.current = 0;
      return;
    }
    const globalFiltersObject = JSON.parse(
      sessionStorage.getItem(
        `${currentGridViewCtx.view.tableId}-globalFilter`
      ) || '{}'
    );
    const globalFilters: IFilter[] = [];
    Object.keys(globalFiltersObject).map((key) => {
      globalFiltersObject[key].map((filter: IFilter) => {
        globalFilters.push({ ...filter });
        return null;
      });
      return null;
    });
    const filter = currentGridViewCtx.parsedGlobalAndViewFilters || '';
    const sortingRules = Array.isArray(currentGridViewCtx.sort) ? currentGridViewCtx.sort : [];
    const doesFiltersChanged = filter !== currentTableFilterRef.current;
    const doesSortingRuleChanged =
      JSON.stringify(sortingRules) !== JSON.stringify(currentTableSortingRuleRef.current);
    if (
      tableIdRef.current === currentGridViewCtx.view.tableId &&
      viewIdRef.current === currentGridViewCtx.id &&
      !doesFiltersChanged &&
      !doesSortingRuleChanged
    ) {
      return;
    }
    if (doesFiltersChanged || doesSortingRuleChanged) {
      currentTableRowsOffsetRef.current = 0;
    }
    tableIdRef.current = currentGridViewCtx.view.tableId;
    viewIdRef.current = currentGridViewCtx.id;
    currentTableFilterRef.current = filter;
    currentTableSortingRuleRef.current = sortingRules;
    if (!tableIdRef.current || !viewIdRef.current) {
      return;
    }

    const recordsCacheKey = `${tableIdRef.current}-${viewIdRef.current}-${filter}-${JSON.stringify(sortingRules)}`;
    const cachedRecords = recordsCacheRef.current[recordsCacheKey];

    if (cachedRecords?.rows) {
      setCurrentTableRows(cachedRecords.rows);
      currentTableRowsTotalRef.current = cachedRecords.total;
      setIsLoading(false);
    } else {
      resetLocalTableHiddenRows();
      setCurrentTableRows([]);
      setIsLoading(true);
    }

    lastRequestTableRecordsId.current++;
    const requestTableRecordsId = lastRequestTableRecordsId.current;
    const requestedTableId = tableIdRef.current;

    if (isDevDemoTable(tableIdRef.current)) {
      const allRecords =
        tableIdRef.current === DEV_DEMO_TABLE_4_ID
          ? getDevDemo4Records()
          : tableIdRef.current === DEV_DEMO_TABLE_3_ID
            ? getDevDemo3Records()
            : tableIdRef.current === DEV_DEMO_TABLE_2_ID
              ? getDevDemo2Records()
              : getDevDemoRecords();
      const tableFields = (currentGridViewCtx.view?.fields || []).map((f) => viewFieldToTableField(f));

      if (!filter || !filter.trim()) {
        const sorted = sortRecordsByRule(
          [...allRecords],
          sortingRules,
          currentGridViewCtx.view?.fields ?? []
        );
        currentTableRowsTotalRef.current = sorted.length;
        recordsCacheRef.current[recordsCacheKey] = { rows: sorted, total: sorted.length };
        setCurrentTableRows(sorted);
        setIsLoading(false);
        return;
      }

      (async () => {
        const results = await applyFilterToRecordsBatch({
          records: allRecords,
          fields: tableFields,
          filter,
        });
        if (
          requestTableRecordsId !== lastRequestTableRecordsId.current ||
          tableIdRef.current !== requestedTableId
        ) {
          return;
        }
        const filtered = allRecords.filter((_, i) => results[i]);
        const sorted = sortRecordsByRule(
          filtered,
          sortingRules,
          currentGridViewCtx.view?.fields ?? []
        );
        currentTableRowsTotalRef.current = sorted.length;
        recordsCacheRef.current[recordsCacheKey] = { rows: sorted, total: sorted.length };
        setCurrentTableRows([...sorted]);
        setIsLoading(false);
      })();
      return;
    }

    if (
      process.env.NODE_ENV === 'development' &&
      String(tableIdRef.current).startsWith('dev-table-')
    ) {
      const allRecords = getDevTableRecords(tableIdRef.current);
      const tableFields = (currentGridViewCtx.view?.fields || []).map((f) => viewFieldToTableField(f));
      const viewFieldsForSortDev = currentGridViewCtx.view?.fields ?? [];

      if (!filter || !filter.trim()) {
        const sorted = sortRecordsByRule([...allRecords], sortingRules, viewFieldsForSortDev);
        currentTableRowsTotalRef.current = sorted.length;
        recordsCacheRef.current[recordsCacheKey] = { rows: sorted, total: sorted.length };
        setCurrentTableRows(sorted);
        setIsLoading(false);
        return;
      }

      (async () => {
        const results = await applyFilterToRecordsBatch({
          records: allRecords,
          fields: tableFields,
          filter,
        });
        if (
          requestTableRecordsId !== lastRequestTableRecordsId.current ||
          tableIdRef.current !== requestedTableId
        ) {
          return;
        }
        const filtered = allRecords.filter((_, i) => results[i]);
        const sorted = sortRecordsByRule(filtered, sortingRules, viewFieldsForSortDev);
        currentTableRowsTotalRef.current = sorted.length;
        recordsCacheRef.current[recordsCacheKey] = { rows: sorted, total: sorted.length };
        setCurrentTableRows([...sorted]);
        setIsLoading(false);
      })();
      return;
    }

    // get current table rows
    const viewFieldsForSort = currentGridViewCtx.view?.fields ?? [];
    if (currentTableRowsLimitRef.current === -1) {
      // get all rows (no server-side sort on /record/all), so sort client-side
      recordContorllers
        .getRecords({
          tableId: tableIdRef.current.toString(),
        })
        .then((res) => {
          if (
            requestTableRecordsId !== lastRequestTableRecordsId.current ||
            tableIdRef.current !== requestedTableId
          ) {
            return;
          }
          const rows = (res as Record<string, unknown>[]) ?? [];
          const sorted = sortRecordsByRule([...rows], sortingRules, viewFieldsForSort);
          recordsCacheRef.current[recordsCacheKey] = {
            rows: sorted,
            total: sorted.length,
          };
          setCurrentTableRows(sorted);
          setIsLoading(false);
          return;
        })
        .catch((err) => {
          if (
            requestTableRecordsId !== lastRequestTableRecordsId.current ||
            tableIdRef.current !== requestedTableId
          ) {
            return;
          }
          console.error('fetch error:', err);
          if (!cachedRecords?.rows) setIsLoading(false);
          return;
        });
    } else {
      // get a limited number of rows
      const requestOffset = currentTableRowsOffsetRef.current;
      recordContorllers
        .getRecordsByOffset({
          tableId: tableIdRef.current.toString(),
          limit: currentTableRowsLimitRef.current,
          offset: requestOffset,
          filter,
          order: currentTableSortingRuleRef.current?.[0]?.direction,
          orderBy: currentGridViewCtx.view.fields.find(
            (field) =>
              field.fieldId === currentTableSortingRuleRef.current?.[0]?.fieldId
          )?.fieldName,
        })
        .then((res) => {
          if (
            requestTableRecordsId !== lastRequestTableRecordsId.current ||
            tableIdRef.current !== requestedTableId
          ) {
            return;
          }
          const total = (res as Record<string, unknown>).total as number;
          currentTableRowsTotalRef.current = total;
          if (Array.isArray(res as Record<string, unknown>)) {
            if (!cachedRecords?.rows) setIsLoading(false);
            toast.error('Error loading records!');
            return;
          }
          const newRecords = (res as Record<string, unknown>).records as Record<
            string,
            unknown
          >[];
          setCurrentTableRows((prev) => {
            const rows = requestOffset === 0 ? newRecords : [...prev, ...newRecords];
            if (requestOffset === 0) {
              recordsCacheRef.current[recordsCacheKey] = { rows, total };
            }
            return rows;
          });
          setIsLoading(false);
          return;
        })
        .catch((err) => {
          if (
            requestTableRecordsId !== lastRequestTableRecordsId.current ||
            tableIdRef.current !== requestedTableId
          ) {
            return;
          }
          toast.error('Error loading records!');
          console.error('fetch records error:', err);
          if (!cachedRecords?.rows) setIsLoading(false);
          return;
        });
    }
  }, [
    currentGridViewCtx.id,
    currentGridViewCtx.view?.tableId,
    currentGridViewCtx.view?.fields?.map((f) => f.fieldId).join(',') ?? '',
    currentGridViewCtx.initialized,
    currentGridViewCtx.parsedGlobalAndViewFilters,
    JSON.stringify(currentGridViewCtx.sort ?? []),
  ]);

  // handle create new row
  useEventHandler(
    dadixEvents.recordEvents.onCreate,
    async (evnt: Event) => {
      try {
        const { tableId, createdRecord } = (evnt as CustomEvent).detail || {};
        if (!createdRecord || tableId !== tableIdRef.current) return;
        // check if full table records are loaded
        if (
          currentTableRowsOffsetRef.current < currentTableRowsTotalRef.current
        )
          return;
        // check if created record meet current filter
        const isCurrentFilterApplysToCreatedRecord = await applyFilterToRecord({
          record: createdRecord,
          fields: (currentGridViewCtx.view?.fields || []).map((field) =>
            viewFieldToTableField(field)
          ),
          filter: currentTableFilterRef.current || '',
        });
        if (!isCurrentFilterApplysToCreatedRecord) {
          // store created record in local table hidden records
          insertLocalTableHiddenRow({ row: { ...createdRecord } });
          return;
        }
        // add created record to visible table records
        setCurrentTableRows((currentTableRows) => [
          ...currentTableRows,
          { ...createdRecord },
        ]);
      } catch (err) {
        console.error(err);
      }
    },
    [currentTableRows, currentGridViewCtx.view?.fields]
  );

  // handle update existing row
  useEventHandler(
    dadixEvents.recordEvents.onChange,
    async (evnt: Event) => {
      const { tableId, recordId, updatedRecordData } =
        (evnt as CustomEvent).detail || {};

      if (!updatedRecordData || tableId !== tableIdRef.current) return;

      const updatedRecordIndex = currentTableRows.findIndex(
        (record) => `${record.id}` === `${recordId}`
      );
      let updatedRecord = null;
      if (updatedRecordIndex >= 0) {
        // if record exist in visible records
        updatedRecord = {
          ...currentTableRows[updatedRecordIndex],
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
        if (
          currentTableRowsOffsetRef.current < currentTableRowsTotalRef.current
        )
          return;
      }
      // check if updated record meet current filter
      const isCurrentFilterApplysToUpdatedRecord = await applyFilterToRecord({
        record: updatedRecord,
        fields: (currentGridViewCtx.view?.fields || []).map((field) =>
          viewFieldToTableField(field)
        ),
        filter: currentTableFilterRef.current || '',
      });
      // check if updated record meet current sorting rule
      const updatedRecordNewIndexWithCurrentSortingRule = false; /*
        applySortingRuleToRecord({
          records: currentTableRows,
          record: updatedRecord,
          recordIndex: updatedRecordIndex,
          tableFields: (currentGridViewCtx.view?.fields || []).map((field) =>
            viewFieldToTableField(field)
          ),
          sortingRule: currentTableSortingRuleRef.current,
          })*/

      if (!isCurrentFilterApplysToUpdatedRecord) {
        if (updatedRecordIndex >= 0) {
          // remove record from visible records
          setCurrentTableRows(
            currentTableRows.filter((row) => `${row.id}` !== `${recordId}`)
          );
          // update totale records
          currentTableRowsTotalRef.current -= 1;
          // store created record in local table hidden records
          insertLocalTableHiddenRow({ row: { ...updatedRecord } });
        }
        return;
      }
      if (updatedRecordIndex >= 0) {
        // save updated record changes
        setCurrentTableRows((currentTableRows) =>
          currentTableRows.map((row) => {
            if (`${row.id}` === `${recordId}`) {
              return { ...updatedRecord };
            }
            return row;
          })
        );
        return;
      }
      // add updated hidden record to visible table records
      setCurrentTableRows((currentTableRows) =>
        [...currentTableRows, { ...updatedRecord }].sort(
          (row1, row2) => (row1.id as number) - (row2.id as number)
        )
      );
      removeLocalTableHiddenRow({ rowId: updatedRecord.id as number });
    },
    [currentTableRows, currentGridViewCtx.view?.fields]
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
        setCurrentTableRows((currentTableRows) => {
          return currentTableRows.filter((row) => {
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
        setCurrentTableRows((currentTableRows) => {
          return currentTableRows.filter((row) => {
            const existInDeletedRows = details.ids.indexOf(`${row.id}`) >= 0;
            deletedRowsFromVisibleRows += existInDeletedRows ? 1 : 0;
            return !existInDeletedRows;
          });
        });
        for (const rowId of details.ids) {
          removeLocalTableHiddenRow({ rowId: rowId as number });
        }
      }
      currentTableRowsTotalRef.current -= deletedRowsFromVisibleRows;
    },
    [currentTableRows]
  );

  // useEffect(() => {
  //   handleNextRecordRequest({
  //     tableId: currentGridViewCtx.view?.tableId,
  //     rows: currentTableRows,
  //     filter: currentTableFilterRef.current,
  //   });
  // }, [
  //   currentTableRows,
  //   currentGridViewCtx.id,
  //   currentGridViewCtx.view?.tableId,
  // ]);

  const loadMoreRecords = useCallback(
    (callBack?: () => void) => {
      if (isLoading || isLoadingMore) {
        return;
      }

      if (currentTableRows.length === currentTableRowsTotalRef.current) {
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
          limit: currentTableRowsLimitRef.current,
          offset: currentTableRowsOffsetRef.current,
          filter: currentTableFilterRef.current,
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
          currentTableRowsTotalRef.current = (res as Record<string, unknown>)
            .total as number;
          setCurrentTableRows((currentTableRows) => [
            ...currentTableRows,
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
    [isLoading, isLoadingMore, currentTableRows]
  );

  return (
    <GridViewRowsContext.Provider
      value={{
        data: currentTableRows,
        limit: currentTableRowsLimit,
        isLoading,
        isLoadingMore,
        methods: {
          loadMoreRecords,
          setLimit: setCurrentTableRowsLimit,
        },
      }}
    >
      {children}
    </GridViewRowsContext.Provider>
  );
}

export function useGridViewRowsContext() {
  const context = useContext(GridViewRowsContext);
  if (context === undefined) {
    throw new Error(
      'useGridViewRowsContext must be used within a gridViewRowsContextProvider'
    );
  }
  return context;
}
