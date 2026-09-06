import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GridViewContextProvider, useGridViewContext } from './GridViewContext';
import {
  GridViewRowsContextProvider,
  useGridViewRowsContext,
} from './GridViewRowsContext';
import { TableView } from '@/components/table-view/TableView';
import {
  type ColumnDef,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  LucideAlignLeft,
  LucideArrowRight,
  LucideEyeOff,
  LucidePin,
  LucidePlus,
  LucidePointer,
  LucideRectangleEllipsis,
  LucideSortDesc,
} from 'lucide-react';
import recordControllers from '@/lib/record';
import { openEditTableFieldPanel } from '@/components/table-editor/EditTableFieldPanel';
import Tag from '@/components/tag';
import { CreateNewRecordButton } from '@/components/CreateNewRecordButton';

import { openViewEditor } from '@/components/view-editor/ViewEditor';
import { openTableRecord } from '@/components/table-cell-viewer';
import { openViewFilterDialog } from '@/components/view-filter-dialog/ViewFilterDialog';
import { openViewSortingDialog } from '@/components/view-sorting-dialog/ViewSortingDialog';
import { GridViewSearch } from './GridViewSearch';
import { GridViewFindBar, type FindMatch } from './GridViewFindBar';
import { closeViewSearch } from '../../OpenViewSearch';
import { useFindInViewOptional } from '@/context/FindInViewContext';
import { sortRecordsByRule, viewFieldToTableField } from '@/lib/utils';
import { fileFieldDisplayName } from '@/lib/fileField';
import { FormulaEval } from '@/components/formula-eval/FormulaEval';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useEventHandler } from '@/hooks/useEventHandler';
import { useCurrentProjectContext } from '@/context/CurrentProjectContext';
import { useTableContext } from '@/context/TableContext';
import { dadixEvents } from '@/constants/events';

import type { IDadixGridViewField, IFilter } from '@/types';
import recordService from '@/lib/record';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { patchGridViewColumn } from '@/lib/views/gridView';
import { useTableColumnsRenderer } from '@/hooks/useTableColumnsRenderer';

interface GridViewProps {
  tableId: string;
  viewId: string;
  globalFilter: Record<number, IFilter[]>;
  onOpenRecord?: (_record: Record<string, unknown>) => void;
  isSearchActive: boolean;
  setIsSearchActive: (_value: boolean) => void;
}

const OPEN_GRIDVIEW_FILTERS_DIALOG =
  'dadix--open-gridview-filters-dialog-event';
const OPEN_GRIDVIEW_EDITOR = 'dadix--open-gridview-editor-event';
export const OPEN_VIEW_SORTING_REQUEST = 'dadix--open-view-sorting-request';

const VIEW_RECORD_ORDER_KEY = 'dadix-view-record-order';

function getStoredRecordOrder(tableId: string, viewId: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(`${VIEW_RECORD_ORDER_KEY}-${tableId}-${viewId}`);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

function setStoredRecordOrder(tableId: string, viewId: string, order: string[]) {
  try {
    window.localStorage.setItem(`${VIEW_RECORD_ORDER_KEY}-${tableId}-${viewId}`, JSON.stringify(order));
  } catch {
    // ignore
  }
}

function applyCustomOrder(
  data: Record<string, unknown>[],
  order: string[]
): Record<string, unknown>[] {
  if (!order.length) return [...data];
  const byId = new Map(data.map((r) => [String(r.id), r]));
  const result: Record<string, unknown>[] = [];
  for (const id of order) {
    const r = byId.get(id);
    if (r) result.push(r);
  }
  for (const r of data) {
    if (!order.includes(String(r.id))) result.push(r);
  }
  return result;
}

function GridView({
  tableId,
  viewId,
  globalFilter,
  onOpenRecord,
  isSearchActive,
  setIsSearchActive,
}: GridViewProps) {
  return (
    <GridViewContextProvider
      key={`${tableId}-${viewId}`}
      tableId={tableId}
      viewId={viewId}
      globalFilter={globalFilter}
    >
      <GridViewRowsContextProvider>
        <GridViewContent
          tableId={tableId}
          viewId={viewId}
          onOpenRecord={onOpenRecord}
          isSearchActive={isSearchActive}
          setIsSearchActive={setIsSearchActive}
        />
      </GridViewRowsContextProvider>
    </GridViewContextProvider>
  );
}

interface GridViewContentProps {
  tableId: string;
  viewId: string;
  onOpenRecord?: (_record: Record<string, unknown>) => void;
  isSearchActive: boolean;
  setIsSearchActive: (_value: boolean) => void;
}

function GridViewContent({
  tableId,
  viewId,
  onOpenRecord,
  isSearchActive,
  setIsSearchActive,
}: GridViewContentProps) {
  const gridViewCtx = useGridViewContext();
  const gridViewRowsCtx = useGridViewRowsContext();
  const currentProjectCtx = useCurrentProjectContext();
  const currentTableCtx = useTableContext();

  const tableIdRef = useRef<string>(undefined);
  const gridViewFieldsRef = useRef<IDadixGridViewField[]>([]);
  const gridViewFiltersRef = useRef<IFilter[]>([]);

  const [rowSelection, setRowSelection] = useState({});
  const [activeRecordId, setActiveRecordId] = useState<
    string | number | undefined
  >(undefined);
  const [findInViewOpenLocal, setFindInViewOpenLocal] = useState(false);
  const [findQueryLocal, setFindQueryLocal] = useState('');
  const [findCurrentIndex, setFindCurrentIndex] = useState(0);
  const findCtx = useFindInViewOptional();
  const findQuery = findCtx ? findCtx.findQuery : findQueryLocal;
  const findInViewOpen = findCtx ? isSearchActive : findInViewOpenLocal;

  const { canEditTables, canEditRecords } = useRequireRole();

  const handleDelete = useCallback(
    async (recordId: string) => {
      if (!gridViewCtx.view?.tableId) {
        toast.error('No table selected');
        return;
      }

      try {
        await recordControllers.deleteRecord({
          tableId: gridViewCtx.view.tableId,
          id: recordId,
        });
        // toast.success('Record deleted successfully!');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        console.error('Error deleting record:', error);
        toast.error(error.response?.data?.message || 'Failed to delete record');
      }
    },
    [gridViewCtx.view?.tableId, gridViewCtx.id]
  );

  const handleRecordChange = useCallback(
    ({
      recordId,
      recordFieldName,
      value,
    }: {
      recordId: number;
      recordFieldName: string;
      value: unknown;
    }) => {
      recordService
        .updateRecord({
          tableId: `${tableIdRef.current}`,
          recordId,
          updatedRecordData: { [recordFieldName]: value },
          silence: true,
        })
        .catch((err: Error) => {
          console.error('Error update record!', err);
          toast.error('Error update record!');
        });
      window.dispatchEvent(
        new CustomEvent(dadixEvents.recordEvents.onChange, {
          detail: {
            tableId: gridViewCtx.view?.tableId,
            recordId,
            updatedRecordData: { [recordFieldName]: value },
          },
        })
      );
    },
    [gridViewCtx.view?.tableId, gridViewCtx.id]
  );

  const tableSelectCoulmnDef: ColumnDef<Record<string, unknown>> = useMemo(
    () => ({
      id: 'select',
      header: ({ table }) => (
        <div className='flex h-full w-full items-center justify-center'>
          {!canEditRecords ||
          table.getIsSomeRowsSelected() ||
          table.getIsAllRowsSelected() ? (
            <Checkbox
              checked={table.getIsAllPageRowsSelected()}
              onCheckedChange={(value) =>
                table.toggleAllPageRowsSelected(!!value)
              }
              aria-label='Select all'
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <CreateNewRecordButton
              variant='ghost'
              projectId={currentProjectCtx.id as string}
              tableId={`${tableIdRef.current}`}
              tableFields={
                currentTableCtx?.table?.fields ??
                (gridViewCtx.view?.fields || []).map((f) => viewFieldToTableField(f))
              }
            />
          )}
        </div>
      ),
      cell: ({ row }) => (
        <div
          onClick={(e) => e.stopPropagation()}
          className='relative h-full w-full inline-flex flex-row justify-center items-center group/rowcheckboxgroup overflow-hidden'
        >
          <span
            className='absolute inline-block w-full text-sm text-center text-muted-foreground group-hover/rowcheckboxgroup:hidden'
            style={{
              display: row.getIsSelected() ? 'none' : undefined,
            }}
          >
            {(row.index + 1).toLocaleString('fullwide', {
              useGrouping: false,
            })}
          </span>
          <div
            className='absolute items-center justify-center hidden group-hover/rowcheckboxgroup:flex'
            style={{
              display: row.getIsSelected() ? 'flex' : undefined,
            }}
          >
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(!!value)}
              aria-label='Select all'
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          {/*<DragHandle />*/}
        </div>
      ),
      enableHiding: false,
      enableResizing: false,
      size: 4 * 12,
      meta: { isVisible: true },
    }),
    [
      canEditRecords,
      gridViewCtx.id,
      gridViewCtx.view?.fields,
      currentProjectCtx.id,
    ]
  );

  const hasSortRule = Array.isArray(gridViewCtx.sort) && gridViewCtx.sort.length > 0;
  const tableIdForOrder = gridViewCtx.view?.tableId != null ? `${gridViewCtx.view.tableId}` : '';
  const viewIdForOrder = gridViewCtx.id != null ? `${gridViewCtx.id}` : '';

  const [customRecordOrder, setCustomRecordOrder] = useState<string[]>(() =>
    tableIdForOrder && viewIdForOrder ? getStoredRecordOrder(tableIdForOrder, viewIdForOrder) : []
  );
  useEffect(() => {
    if (!tableIdForOrder || !viewIdForOrder) return;
    if (hasSortRule) {
      setCustomRecordOrder([]);
      setStoredRecordOrder(tableIdForOrder, viewIdForOrder, []);
      return;
    }
    setCustomRecordOrder(getStoredRecordOrder(tableIdForOrder, viewIdForOrder));
  }, [tableIdForOrder, viewIdForOrder, hasSortRule]);

  const displayData = useMemo(() => {
    const raw = gridViewRowsCtx.data || [];
    if (hasSortRule) {
      return sortRecordsByRule([...raw], gridViewCtx.sort, gridViewCtx.view?.fields ?? []);
    }
    if (customRecordOrder.length > 0) return applyCustomOrder(raw, customRecordOrder);
    return raw;
  }, [gridViewRowsCtx.data, hasSortRule, customRecordOrder, gridViewCtx.sort, gridViewCtx.view?.fields]);

  const handleRowReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      const currentOrder = displayData.map((r) => String(r.id));
      const reordered = [...currentOrder];
      const [removed] = reordered.splice(fromIndex, 1);
      if (removed) reordered.splice(toIndex, 0, removed);
      setCustomRecordOrder(reordered);
      if (tableIdForOrder && viewIdForOrder) {
        setStoredRecordOrder(tableIdForOrder, viewIdForOrder, reordered);
      }
    },
    [displayData, tableIdForOrder, viewIdForOrder]
  );

  const handleColumnReorder = useCallback(
    (fromHeaderId: string, toHeaderId: string) => {
      const fields = gridViewCtx.view?.fields;
      const viewId = gridViewCtx.id;
      const tableId = gridViewCtx.view?.tableId;
      if (!fields || !viewId || tableId == null) return;
      const fromField = fields.find((field) => `${field.id}` === fromHeaderId);
      const toField = fields.find((field) => `${field.id}` === toHeaderId);
      if (!fromField || !toField) return;
      const fromOrder = fromField.order ?? fromField.fieldOrder ?? 0;
      const toOrder = toField.order ?? toField.fieldOrder ?? 0;
      if (fromOrder === toOrder) return;
      const direction = Math.sign(fromOrder - toOrder);
      const minOrder = Math.min(fromOrder, toOrder);
      const maxOrder = Math.max(fromOrder, toOrder);
      const nextFields = fields.map((field) => {
        const order = field.order ?? field.fieldOrder ?? 0;
        if (`${field.id}` === `${fromField.id}`) {
          return { ...field, order: toOrder, fieldOrder: toOrder };
        }
        if (order < minOrder || order > maxOrder) return field;
        const shifted = order + direction;
        return { ...field, order: shifted, fieldOrder: shifted };
      });
      window.dispatchEvent(
        new CustomEvent(dadixEvents.gridViewEvents.onPatchField, {
          detail: {
            viewId,
            id: fromField.id,
            data: { order: toOrder, fieldOrder: toOrder },
          },
        })
      );
      nextFields.forEach((field) => {
        const prev = fields.find((item) => `${item.id}` === `${field.id}`);
        const prevOrder = prev?.order ?? prev?.fieldOrder ?? 0;
        if (prevOrder === field.order) return;
        void patchGridViewColumn({
          tableId: `${tableId}`,
          gridViewId: viewId,
          tableColumnId: field.fieldId,
          id: field.id,
          data: { order: field.order, fieldOrder: field.order },
          silent: true,
        });
      });
    },
    [gridViewCtx.view, gridViewCtx.id]
  );

  const onOneTimeSort = useCallback((fieldId: number, direction: 'ASC' | 'DESC') => {
    gridViewCtx.methods.setSortingRule([{ fieldId, direction }]);
    setCustomRecordOrder([]);
    if (tableIdForOrder && viewIdForOrder) {
      setStoredRecordOrder(tableIdForOrder, viewIdForOrder, []);
    }
  }, [gridViewCtx.methods, tableIdForOrder, viewIdForOrder]);

  const tableColumnsDef: ColumnDef<Record<string, unknown>>[] =
    useTableColumnsRenderer({
      tableId: currentTableCtx.id?.toString(),
      tableColumns: currentTableCtx.table?.fields,
      gridViewId: gridViewCtx.id,
      viewButtons: gridViewCtx.view?.buttons ?? [],
      isSearchActive,
      searchFilters: gridViewCtx.searchFilters,
      setSearchFilters: gridViewCtx.methods.setSearchFilters,
      gridViewColumns: gridViewCtx.view?.fields?.length
        ? gridViewCtx.view.fields
        : undefined,
      sortingRule: gridViewCtx?.sort,
      setSortingRule: gridViewCtx.methods.setSortingRule,
      onOneTimeSort,
      onOpenSortingRule: () => {
        openViewSortingDialogRequest({
          viewId: gridViewCtx.id,
          tableId: gridViewCtx.view?.tableId,
        });
      },
      canEditTables,
      canEditRecords,
      handleRecordChange,
      editField: (fieldId: number) =>
        openEditTableFieldPanel({
          fieldId,
          tableContext: currentTableCtx,
          allowNavigation: false,
        }),
    });

  const table = useReactTable({
    data: displayData,
    columns: useMemo(
      () => [tableSelectCoulmnDef, ...tableColumnsDef],
      [tableSelectCoulmnDef, tableColumnsDef]
    ),
    state: {
      rowSelection,
      // pagination,
    },
    getRowId: (row) => (row.id as number | string).toString(),
    enableRowSelection: true,
    enableColumnResizing: canEditTables,
    onRowSelectionChange: setRowSelection,
    //onSortingChange: setSorting,
    //onColumnFiltersChange: setColumnFilters,
    //onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    //getSortedRowModel: getSortedRowModel(),
    //getFacetedRowModel: getFacetedRowModel(),
    //getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  const findMatches: FindMatch[] = useMemo(() => {
    if (!findQuery.trim()) return [];
    const q = findQuery.trim().toLowerCase();
    const rows = table.getRowModel().rows;
    const columns = table.getVisibleLeafColumns().filter((col) => col.id !== 'select');
    const list: FindMatch[] = [];
    rows.forEach((row) => {
      columns.forEach((col) => {
        const val = row.getValue(col.id);
        const meta = (col.columnDef.meta ?? {}) as { type?: string };
        const str =
          meta.type === 'FILE'
            ? fileFieldDisplayName(val)
            : val != null
              ? String(val)
              : '';
        if (str.toLowerCase().includes(q)) list.push({ rowIndex: row.index, columnId: col.id });
      });
    });
    return list;
  }, [table, findQuery]);

  useEffect(() => {
    setFindCurrentIndex((i) => Math.min(Math.max(0, i), Math.max(0, findMatches.length - 1)));
  }, [findMatches.length]);

  useEffect(() => {
    if (!findCtx) return;
    findCtx.setMatchCount(findMatches.length);
    findCtx.setCurrentMatchIndex((i) => Math.min(Math.max(0, i), Math.max(0, findMatches.length - 1)));
  }, [findCtx, findMatches.length]);

  useEffect(() => {
    if (!findCtx) return;
    findCtx.onPrevRef.current = () => {
      findCtx.setCurrentMatchIndex((i) => {
        const n = findMatches.length;
        return n === 0 ? 0 : (i - 1 + n) % n;
      });
    };
    findCtx.onNextRef.current = () => {
      findCtx.setCurrentMatchIndex((i) => {
        const n = findMatches.length;
        return n === 0 ? 0 : (i + 1) % n;
      });
    };
    return () => {
      findCtx.onPrevRef.current = null;
      findCtx.onNextRef.current = null;
    };
  }, [findCtx, findMatches.length]);

  useEventHandler(
    dadixEvents.gridViewEvents.openFindInView,
    () => {
      if (findCtx) return;
      setFindInViewOpenLocal(true);
    },
    [findCtx]
  );

  useEventHandler(dadixEvents.gridViewEvents.closeSearch, () => {
    gridViewCtx.methods.setSearchFilters([]);
    closeViewSearch({ viewId: gridViewCtx.id || 0 });
  }, [gridViewCtx.id]);

  useEffect(() => {
    setIsSearchActive(false);
    closeViewSearch({ viewId: parseInt(viewId) || 0 });
  }, [gridViewCtx.id]);

  useEffect(() => {
    gridViewFieldsRef.current = gridViewCtx.view?.fields || [];
    gridViewFiltersRef.current = gridViewCtx.filters || [];
  }, [gridViewCtx.view, gridViewCtx.filters, gridViewCtx.view?.fields]);

  tableIdRef.current = gridViewCtx.view?.tableId ?? currentTableCtx.id;

  // handle request open filter dialog event
  useEventHandler(
    OPEN_GRIDVIEW_FILTERS_DIALOG,
    (evnt: Event) => {
      const { viewId: requestedViewId, tableId } =
        (evnt as CustomEvent).detail || {};
      if (
        viewId !== `${requestedViewId}` ||
        gridViewCtx.view?.tableId !== `${tableId}`
      ) {
        return;
      }
      openViewFilterDialog({
        tableFields:
          gridViewFieldsRef.current?.map((field) => ({
            ...viewFieldToTableField(field),
          })) || [],
        filters: gridViewFiltersRef.current || [],
        onUpdateFiltersCallback: gridViewCtx.methods.setFilters,
      });
    },
    [viewId, gridViewCtx]
  );

  useEventHandler(
    OPEN_VIEW_SORTING_REQUEST,
    (evnt: Event) => {
      const { viewId: requestedViewId, tableId } =
        (evnt as CustomEvent).detail || {};
      if (
        viewId !== `${requestedViewId}` ||
        gridViewCtx.view?.tableId !== `${tableId}`
      ) {
        return;
      }
      openViewSortingDialog({
        viewId: gridViewCtx.id ?? 0,
        tableId: gridViewCtx.view?.tableId ?? '',
        currentSortRules: Array.isArray(gridViewCtx.sort) ? gridViewCtx.sort : [],
        viewFields: gridViewCtx.view?.fields ?? [],
        onSave: gridViewCtx.methods.setSortingRule,
      });
    },
    [viewId, gridViewCtx]
  );

  // handle request open view editor event
  useEventHandler(
    OPEN_GRIDVIEW_EDITOR,
    (evnt: Event) => {
      const { viewId: requestedViewId, tableId } =
        (evnt as CustomEvent).detail || {};
      if (
        viewId !== `${requestedViewId}` ||
        gridViewCtx.view?.tableId !== `${tableId}`
      ) {
        return;
      }
      openViewEditor({
        viewId: gridViewCtx.id || 0,
        view: gridViewCtx.view,
        viewType: 'gridView',
      });
    },
    [viewId, gridViewCtx]
  );

  // handle open record editor event
  useEventHandler(
    dadixEvents.recordEvents.onOpen,
    (evnt: Event) => {
      if (!tableIdRef.current) return;
      const details = (evnt as CustomEvent).detail || {};
      if (
        !details ||
        String(details.tableId) !== String(tableIdRef.current) ||
        !details.record
      ) {
        return;
      }
      setActiveRecordId(details.record.id);
    }
  );

  // handle close record editor event
  useEventHandler(
    dadixEvents.recordEvents.onClose,
    (evnt: Event) => {
      if (!tableIdRef.current) return;
      const details = (evnt as CustomEvent).detail || {};
      if (!details?.tableId) return;
      if (String(details.tableId) !== String(tableIdRef.current)) return;
      setActiveRecordId(undefined);
    }
  );

  useEffect(() => {
    // handle row selection changes
    const selectedRowsIds = Object.keys(rowSelection);
    window.dispatchEvent(
      new CustomEvent(dadixEvents.recordEvents.onSelectionChange, {
        detail: {
          tableId: tableIdRef.current,
          selectedRecordsIds: selectedRowsIds,
        },
      })
    );
  }, [rowSelection]);

  // handle row selection changes event
  useEventHandler(
    dadixEvents.recordEvents.onSelectionChange,
    (evnt: Event) => {
      const { tableId, selectedRecordsIds } =
        (evnt as CustomEvent).detail || {};
      if (!tableId || tableId !== tableIdRef.current || !selectedRecordsIds) {
        return;
      }
      if (
        Object.keys(rowSelection).length === 0 &&
        selectedRecordsIds.length === 0
      ) {
        return;
      }
      const rowsSelection: Record<string, unknown> = {};
      selectedRecordsIds.map((id: string | number) => {
        rowsSelection[id as string] = true;
        return null;
      });
      setRowSelection(rowsSelection);
    },
    [rowSelection]
  );

  function openRecordSheet(record: Record<string, unknown>) {
    if (!gridViewCtx.view || !gridViewCtx.view.tableId) return;

    setActiveRecordId(record.id as number);
    const contextTable = currentTableCtx?.table;
    const contextMatchesOpenedTable =
      contextTable?.fields?.length &&
      String(contextTable.id) === String(gridViewCtx.view.tableId);
    const tableFields = contextMatchesOpenedTable
      ? contextTable.fields
      : (gridViewCtx.view.fields || []).map((f) => viewFieldToTableField(f));
    openTableRecord({
      tableId: gridViewCtx.view.tableId,
      tableFields: [...tableFields],
      record,
    });
  }

  if (!gridViewCtx.initialized && !currentTableCtx.table) return null;

  const currentIndex = findCtx ? findCtx.currentMatchIndex : findCurrentIndex;
  const findHighlight = findMatches[currentIndex] ?? null;
  const findScrollToRowIndex = findHighlight?.rowIndex ?? null;

  return (
    <div className='relative w-full h-full min-h-0 flex flex-col'>
      {!findCtx && (
        <GridViewFindBar
          open={findInViewOpen}
          onClose={() => setFindInViewOpenLocal(false)}
          query={findQueryLocal}
          onQueryChange={setFindQueryLocal}
          matches={findMatches}
          currentIndex={findCurrentIndex}
          onPrev={() =>
            setFindCurrentIndex((i) =>
              findMatches.length > 0 ? (i - 1 + findMatches.length) % findMatches.length : 0
            )
          }
          onNext={() =>
            setFindCurrentIndex((i) =>
              findMatches.length > 0 ? (i + 1) % findMatches.length : 0
            )
          }
        />
      )}
      <TableView
        table={table}
        tableId={gridViewCtx.view?.tableId}
        viewId={gridViewCtx.id}
        enableRowReorder
        onRowReorder={handleRowReorder}
        enableColumnReorder={canEditTables}
        onColumnReorder={canEditTables ? handleColumnReorder : undefined}
        className='group/no-left-radius w-full max-w-full flex flex-1 min-h-0 h-full flex-col justify-start gap-6'
        openRecord={onOpenRecord || openRecordSheet}
        activeRecordId={activeRecordId as string}
        tableRowsCtx={gridViewRowsCtx}
        onDeleteRecord={canEditRecords ? handleDelete : undefined}
        findScrollToRowIndex={findScrollToRowIndex}
        findHighlight={findHighlight}
        onColumnResizeChange={() => {
          /* live width is applied in TableView; persist only when the drag ends */
        }}
      onColumnResizeEnd={({
        size,
        tableFieldId,
        gridViewFieldId,
      }: {
        size: number;
        tableFieldId: number;
        gridViewFieldId?: number;
      }) => {
        if (gridViewFieldId != null && gridViewCtx.id) {
          window.dispatchEvent(
            new CustomEvent(dadixEvents.gridViewEvents.onPatchField, {
              detail: {
                viewId: gridViewCtx.id,
                id: gridViewFieldId,
                data: { size },
              },
            })
          );
          persistColumnSize({
            size,
            tableFieldId,
            gridViewFieldId,
            tableId: `${gridViewCtx.view?.tableId || tableId}`,
            viewId: gridViewCtx.id,
          });
        } else if (tableFieldId) {
          window.dispatchEvent(
            new CustomEvent(dadixEvents.tableEvents.onPatchField, {
              detail: {
                tableId: `${gridViewCtx.view?.tableId || tableId}`,
                fieldId: tableFieldId,
                data: { size },
              },
            })
          );
        }
      }}
      />
    </div>
  );
}

function persistColumnSize({
  size,
  tableFieldId,
  gridViewFieldId,
  tableId,
  viewId,
}: {
  size: number;
  tableFieldId: number;
  gridViewFieldId: number;
  tableId: string;
  viewId: number;
}) {
  if (!tableId || tableId === 'undefined' || !viewId) return;
  patchGridViewColumn({
    tableId,
    gridViewId: viewId,
    tableColumnId: tableFieldId,
    id: gridViewFieldId,
    data: { size },
    silent: true,
  });
}

function openGridViewFiltersDialog({
  viewId,
  tableId,
}: {
  viewId: number | undefined;
  tableId: string | undefined;
}) {
  if (!viewId || !tableId) return;
  dispatchEvent(
    new CustomEvent(OPEN_GRIDVIEW_FILTERS_DIALOG, {
      detail: { viewId, tableId },
    })
  );
}
function openGridViewEditor({
  viewId,
  tableId,
}: {
  viewId: number | undefined;
  tableId: string | undefined;
}) {
  if (!viewId || !tableId) return;
  dispatchEvent(
    new CustomEvent(OPEN_GRIDVIEW_EDITOR, { detail: { viewId, tableId } })
  );
}

function openViewSortingDialogRequest({
  viewId,
  tableId,
}: {
  viewId: number | undefined;
  tableId: string | undefined;
}) {
  if (!viewId || !tableId) return;
  dispatchEvent(
    new CustomEvent(OPEN_VIEW_SORTING_REQUEST, { detail: { viewId, tableId } })
  );
}

export { GridView, openGridViewFiltersDialog, openGridViewEditor, openViewSortingDialogRequest };
