'use client';

import { dadixEvents } from '@/constants/events';
import { useEventHandler } from '@/hooks/useEventHandler';
import { UserLocalStorage } from '@/lib/userLocalStorage';
import { filtersToString, viewFieldToTableField } from '@/lib/utils';
import { getView, patchView } from '@/lib/view';
import { patchGridViewColumn } from '@/lib/views/gridView';
import type { Field, IDadixGridView, IDadixGridViewField, IFilter, ISortingRule, ISortingRules } from '@/types';
import { findLocalView, isDevTable, tableFieldsToGridViewFields, usesLocalViews } from '@/lib/dev-demo-data';
import tableService from '@/lib/table';
import { useLanguage } from '@/context/LanguageContext';
// import { useSearchParams } from 'next/navigation';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

function parseJsonArray(raw: unknown): unknown {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function parseViewFilters(raw: unknown): IFilter[] {
  const parsed = parseJsonArray(raw);
  return Array.isArray(parsed) ? (parsed as IFilter[]) : [];
}

function parseViewSort(raw: unknown): ISortingRules {
  const parsed = parseJsonArray(raw);
  const asRule = (value: unknown): ISortingRule | null => {
    if (!value || typeof value !== 'object') return null;
    const fieldId = Number((value as ISortingRule).fieldId);
    const direction = (value as ISortingRule).direction;
    if (!Number.isFinite(fieldId) || (direction !== 'ASC' && direction !== 'DESC')) {
      return null;
    }
    return { fieldId, direction };
  };
  if (Array.isArray(parsed)) {
    return parsed.map(asRule).filter((rule): rule is ISortingRule => rule != null);
  }
  const single = asRule(parsed);
  return single ? [single] : [];
}

function cacheMatchesView(
  cached: { view?: IDadixGridView } | undefined,
  tableId: string | undefined,
  viewId: string | number | undefined
): boolean {
  return (
    !!cached?.view &&
    String(cached.view.id) === String(viewId) &&
    String(cached.view.tableId) === String(tableId)
  );
}

interface IGridViewCtx {
  id: number | undefined;
  view: IDadixGridView | undefined;
  filters: IFilter[];
  sort: ISortingRules;
  searchFilters: IFilter[];
  parsedGlobalAndViewFilters: string;
  isLoading: boolean;
  initialized: boolean;
  error: string;
  methods: {
    setFilters: (_filters: IFilter[]) => void;
    setSearchFilters: (
      _filters: IFilter[] | ((_filters: IFilter[]) => IFilter[])
    ) => void;
    setSortingRule: (_sortingRules: ISortingRules) => void;
  };
}

const GridViewContext = createContext<IGridViewCtx>({
  id: undefined,
  view: undefined,
  filters: [],
  sort: [],
  searchFilters: [],
  parsedGlobalAndViewFilters: '',
  isLoading: true,
  initialized: false,
  error: '',
  methods: {
    setFilters: (_filters: IFilter[]) => null,
    setSearchFilters: (
      _filters: IFilter[] | ((_filters: IFilter[]) => IFilter[])
    ) => null,
    setSortingRule: (_sortingRules: ISortingRules) => null,
  },
});

interface GridViewContextProviderProps {
  tableId: string | undefined;
  viewId: string | undefined;
  globalFilter: Record<number, IFilter[]>;
  children: React.ReactNode;
}

export function GridViewContextProvider({
  tableId,
  viewId,
  globalFilter,
  children,
}: GridViewContextProviderProps) {
  const { t } = useLanguage();
  const viewIdRef = useRef<number | undefined>(undefined);
  const tableIdRef = useRef<string | undefined>(undefined);
  const lastRequestViewId = useRef<number>(0);
  const lastRequestedKey = useRef<string | undefined>(undefined);
  const gridViewCacheRef = useRef<
    Record<string, { view: IDadixGridView; filters: IFilter[]; sort: ISortingRules }>
  >({});
  /** Pending new columns (hidden→visible) to merge when view is still loading */
  const pendingNewColumnsRef = useRef<
    Record<string, IDadixGridViewField[]>
  >({});

  // const [viewId, setViewId] = useState<number | undefined>(undefined);
  const [gridView, setGridView] = useState<IDadixGridView | undefined>(
    undefined
  );
  const [error, setError] = useState<string>('');
  const [initialized, setInetialized] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [filters, setFilters] = useState<IFilter[]>([]);
  const [sortingRule, setSortingRule] = useState<ISortingRules>([]);
  const [searchFilters, setSearchFilters] = useState<IFilter[]>([]);

  const parsedFilters = useMemo(() => {
    const tableFields = (gridView?.fields || []).map((field) => ({
      ...viewFieldToTableField(field),
    }));
    const parsedFilters = filtersToString(filters, tableFields);
    const parsedSearchFilters = filtersToString(searchFilters, tableFields);
    return parsedFilters.trim() && parsedSearchFilters.trim()
      ? `and(${parsedFilters},${parsedSearchFilters})`
      : parsedFilters.trim() || parsedSearchFilters.trim();
  }, [gridView?.fields, filters, searchFilters]);

  const parsedGlobalFilters = useMemo(() => {
    const filters: IFilter[] = [];
    Object.keys(globalFilter).map((key) => {
      globalFilter[key as unknown as number].map((filter: IFilter) => {
        filters.push({ ...filter });
        return null;
      });
      return null;
    });
    return filtersToString(
      filters,
      (gridView?.fields || []).map((field) => ({
        ...viewFieldToTableField(field),
      }))
    );
  }, [gridView?.fields, globalFilter]);

  // const tableId = useSearchParams().get('tableId');
  // const viewId = useSearchParams().get('viewId');

  useEffect(() => {
    const sameTarget =
      `${viewIdRef.current}` === `${viewId}` &&
      `${tableIdRef.current}` === `${tableId}`;
    if (sameTarget) return;
    const cacheKey = `${tableId}-${viewId}`;
    const cached = gridViewCacheRef.current[cacheKey];
    viewIdRef.current = viewId ? parseInt(viewId, 10) : undefined;
    tableIdRef.current = tableId;
    setError('');
    if (cacheMatchesView(cached, tableId, viewId)) {
      setGridView(cached.view);
      setFilters(cached.filters);
      setSortingRule(parseViewSort(cached.sort));
      setIsLoading(false);
      setInetialized(true);
    } else {
      setGridView(undefined);
      setFilters([]);
      setSortingRule([]);
      setInetialized(false);
      setIsLoading(true);
    }
  }, [viewId, tableId]);

  useEffect(() => {
    if (initialized) return;

    if (!tableId) {
      return;
    }
    const requestKey = `${tableId}-${viewId || ''}`;
    if (lastRequestedKey.current === requestKey && initialized) return;
    lastRequestedKey.current = requestKey;

    const cacheKey = requestKey;
    const cached = gridViewCacheRef.current[cacheKey];

    if (!viewId) {
      lastRequestViewId.current++;
      const requestViewId = lastRequestViewId.current;
      tableService
        .getTable({
          tableId: `${tableId}`,
          projectId: '',
        })
        .then((tableRes) => {
          if (requestViewId !== lastRequestViewId.current) return;
          const tableFields = ((tableRes as { data?: { fields?: Field[] } })?.data?.fields ??
            []) as Field[];
          const fallback: IDadixGridView = {
            id: 0,
            tableId: String(tableId),
            name: t('table.allEntries'),
            icon: 'LayoutGrid',
            order: 0,
            filter: '[]',
            sort: '[]',
            type: 'gridView',
            fields: tableFieldsToGridViewFields(tableFields),
          };
          gridViewCacheRef.current[cacheKey] = { view: fallback, filters: [], sort: [] };
          setGridView(fallback);
          setFilters([]);
          setSortingRule([]);
          setIsLoading(false);
          setInetialized(true);
        })
        .catch(() => {
          if (requestViewId !== lastRequestViewId.current) return;
          setGridView({
            id: 0,
            tableId: String(tableId),
            name: t('table.allEntries'),
            icon: 'LayoutGrid',
            order: 0,
            filter: '[]',
            sort: '[]',
            type: 'gridView',
            fields: [],
          });
          setIsLoading(false);
          setInetialized(true);
        });
      return;
    }

    if (cacheMatchesView(cached, tableId, viewId)) {
      setGridView(cached.view);
      setFilters(cached.filters);
      setSortingRule(parseViewSort(cached.sort));
      UserLocalStorage.setViewId(`${viewId}`, tableId);
      setIsLoading(false);
      setInetialized(true);
    } else {
      setGridView(undefined);
      setError('');
      setInetialized(false);
      setIsLoading(true);
    }

    lastRequestViewId.current++;
    const requestViewId = lastRequestViewId.current;
    const requestedViewId = viewId;

    if (usesLocalViews(tableId)) {
      const local = findLocalView(tableId, viewId);
      const fields = [...(local?.fields ?? [])].sort(
        (a, b) => (a.fieldOrder ?? a.order) - (b.fieldOrder ?? b.order)
      );
      const view = local
        ? { ...local, fields }
        : undefined;
      if (view) {
        const filters = parseViewFilters(view.filter);
        const sort = parseViewSort(view.sort);
        gridViewCacheRef.current[cacheKey] = { view, filters, sort };
        setGridView(view);
        setFilters(filters);
        setSortingRule(sort);
        UserLocalStorage.setViewId(`${viewId}`, tableId);
        setIsLoading(false);
        setInetialized(true);
        return;
      }
    }

    getView({
      tableId: `${tableId}`,
      id: parseInt(viewId),
    })
      .then(async (res) => {
        if (
          requestViewId !== lastRequestViewId.current ||
          `${viewIdRef.current}` !== `${requestedViewId}` ||
          `${tableIdRef.current}` !== `${tableId}`
        ) {
          return;
        }
        const view = {
          ...(res as unknown as IDadixGridView),
          fields: (res as unknown as IDadixGridView).fields?.sort(
            (field1, field2) => {
              if (field1.id < 0) return 1;
              if (field2.id < 0) return -1;
              return field1.order - field2.order;
            }
          ),
        };
        let filters: IFilter[] = [];
        const sort = parseViewSort((res as Record<string, unknown>)?.sort);
        try {
          const filterStr = (res as Record<string, unknown>)?.filter as string;
          filters = JSON.parse(filterStr || '[]');
        } catch (err) {
          console.warn('Error while parsing grid view filters', err);
        }
        const pendingNewColumns = pendingNewColumnsRef.current[cacheKey];
        let finalView = view;
        try {
          const tableRes = await tableService.getTable({
            tableId: `${tableId}`,
            projectId: '',
          });
          const tableFields = ((tableRes as { data?: { fields?: Field[] } })?.data?.fields ??
            []) as Field[];
          if (tableFields.length) {
            const have = new Set((finalView.fields || []).map((field) => Number(field.fieldId)));
            const extras = tableFieldsToGridViewFields(
              tableFields.filter((field) => !have.has(Number(field.id)))
            );
            if (extras.length) {
              finalView = { ...finalView, fields: [...(finalView.fields || []), ...extras] };
            }
          }
        } catch {
          /* table fields are optional for the view payload */
        }
        if (pendingNewColumns?.length) {
          const existingIds = new Set((view.fields || []).map((f) => f.fieldId));
          const toAdd = pendingNewColumns.filter((f) => !existingIds.has(f.fieldId));
          const merged = [
            ...(view.fields || []).map((f) => {
              const updated = pendingNewColumns.find((p) => p.fieldId === f.fieldId);
              return updated ? { ...f, ...updated } : f;
            }),
            ...toAdd,
          ].sort((a, b) => {
            if (a.id < 0) return 1;
            if (b.id < 0) return -1;
            return (a.order ?? 0) - (b.order ?? 0);
          });
          finalView = { ...view, fields: merged };
          pendingNewColumnsRef.current[cacheKey] = [];
        }
        gridViewCacheRef.current[cacheKey] = { view: finalView, filters, sort };
        setGridView(finalView);
        setFilters(filters);
        setSortingRule(sort);
        UserLocalStorage.setViewId(`${viewId}`, tableId);
        setIsLoading(false);
        setInetialized(true);
        return;
      })
      .catch(async (err) => {
        if (
          requestViewId !== lastRequestViewId.current ||
          `${viewIdRef.current}` !== `${requestedViewId}`
        ) {
          return;
        }
        console.error('fetch error:', err);
        setError(err.toString());
        try {
          const tableRes = await tableService.getTable({
            tableId: `${tableId}`,
            projectId: '',
          });
          const tableFields = ((tableRes as { data?: { fields?: Field[] } })?.data?.fields ??
            []) as Field[];
          const fallback: IDadixGridView = {
            id: parseInt(viewId, 10),
            tableId: String(tableId),
            name: t('table.allEntries'),
            icon: 'LayoutGrid',
            order: 0,
            filter: '[]',
            sort: '[]',
            type: 'gridView',
            fields: tableFieldsToGridViewFields(tableFields),
          };
          setGridView(fallback);
          setFilters([]);
          setSortingRule([]);
        } catch {
          setGridView({
            id: parseInt(viewId, 10),
            tableId: String(tableId),
            name: t('table.allEntries'),
            icon: 'LayoutGrid',
            order: 0,
            filter: '[]',
            sort: '[]',
            type: 'gridView',
            fields: [],
          });
        }
        setIsLoading(false);
        setInetialized(true);
        return;
      });
  }, [viewId, initialized, tableId]);

  useEffect(() => {
    if (!isDevTable(tableId) || !viewId) return;
    if ((gridView?.fields?.length ?? 0) > 0) return;
    let cancelled = false;
    getView({ tableId: `${tableId}`, id: parseInt(viewId, 10) })
      .then((res) => {
        if (cancelled) return;
        const view = res as unknown as IDadixGridView;
        if (!view?.fields?.length) return;
        if (
          String(view.id) !== String(viewId) ||
          String(view.tableId) !== String(tableId)
        ) {
          return;
        }
        const filters = parseViewFilters(view.filter);
        const sort = parseViewSort(view.sort);
        gridViewCacheRef.current[`${tableId}-${viewId}`] = {
          view,
          filters,
          sort,
        };
        setGridView(view);
        setFilters(filters);
        setSortingRule(sort);
        setIsLoading(false);
        setInetialized(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [tableId, viewId, gridView?.fields?.length]);

  // keep grid view cache in sync when view/filters/sort change
  useEffect(() => {
    if (
      gridView &&
      tableId &&
      viewId &&
      String(gridView.id) === String(viewId) &&
      String(gridView.tableId) === String(tableId)
    ) {
      gridViewCacheRef.current[`${tableId}-${viewId}`] = {
        view: gridView,
        filters,
        sort: sortingRule,
      };
    }
  }, [gridView, filters, sortingRule, tableId, viewId]);

  // Refetch view when editor adds a column (hidden → visible) so grid shows it from server
  useEffect(() => {
    const handler = async (evnt: Event) => {
      const { viewId: evViewId, tableId: evTableId } = (evnt as CustomEvent).detail || {};
      if (evTableId && `${tableId}` !== `${evTableId}` && `${tableIdRef.current}` !== `${evTableId}`) {
        return;
      }
      const targetTableId = evTableId ?? tableId ?? tableIdRef.current;
      const targetViewId = evViewId ?? viewIdRef.current ?? viewId;
      if (!targetTableId) return;
      if (targetViewId == null || `${targetViewId}` === '' || `${targetViewId}` === 'undefined') {
        try {
          const tableRes = await tableService.getTable({
            tableId: `${targetTableId}`,
            projectId: '',
          });
          const tableFields = ((tableRes as { data?: { fields?: Field[] } })?.data?.fields ??
            []) as Field[];
          setGridView((prev) => ({
            id: prev?.id ?? 0,
            tableId: String(targetTableId),
            name: prev?.name ?? t('table.allEntries'),
            icon: prev?.icon ?? 'LayoutGrid',
            order: prev?.order ?? 0,
            filter: prev?.filter ?? '[]',
            sort: prev?.sort ?? '[]',
            type: 'gridView',
            fields: tableFieldsToGridViewFields(tableFields),
            buttons: prev?.buttons,
          }));
          setIsLoading(false);
          setInetialized(true);
        } catch {
          /* keep current view */
        }
        return;
      }
      if (evViewId && `${viewIdRef.current}` !== `${evViewId}` && `${viewId}` !== `${evViewId}`) {
        return;
      }
      try {
        const res = await getView({ tableId: `${targetTableId}`, id: parseInt(String(targetViewId), 10) });
        if (!res || (res as { error?: boolean }).error) return;
        const view = {
          ...(res as unknown as IDadixGridView),
          fields: (res as unknown as IDadixGridView).fields?.sort(
            (a: IDadixGridViewField, b: IDadixGridViewField) => {
              if (a.id < 0) return 1;
              if (b.id < 0) return -1;
              return (a.order ?? 0) - (b.order ?? 0);
            }
          ),
        };
        let filters: IFilter[] = [];
        const sort = parseViewSort((res as Record<string, unknown>)?.sort);
        try {
          const filterStr = (res as Record<string, unknown>)?.filter as string;
          filters = JSON.parse(filterStr || '[]');
        } catch {
          /* ignore */
        }
        let finalView = view;
        try {
          const tableRes = await tableService.getTable({
            tableId: `${targetTableId}`,
            projectId: '',
          });
          const tableFields = ((tableRes as { data?: { fields?: Field[] } })?.data?.fields ??
            []) as Field[];
          if (tableFields.length) {
            const have = new Set((finalView.fields || []).map((field) => Number(field.fieldId)));
            const extras = tableFieldsToGridViewFields(
              tableFields.filter((field) => !have.has(Number(field.id)))
            );
            if (extras.length) {
              finalView = { ...finalView, fields: [...(finalView.fields || []), ...extras] };
            }
          }
        } catch {
          /* table fields are optional */
        }
        const cacheKey = `${targetTableId}-${targetViewId}`;
        gridViewCacheRef.current[cacheKey] = { view: finalView, filters, sort };
        setGridView(finalView);
        setFilters(filters);
        setSortingRule(sort);
        setIsLoading(false);
        setInetialized(true);
      } catch {
        /* ignore refetch errors */
      }
    };
    window.addEventListener(dadixEvents.gridViewEvents.onRefetchView, handler);
    return () => window.removeEventListener(dadixEvents.gridViewEvents.onRefetchView, handler);
  }, [tableId]);

  useEffect(() => {
    // handle gridView fields update
    window.addEventListener(
      dadixEvents.gridViewEvents.onPatchField,
      handlePatchFieldEvent
    );
    return () => {
      window.removeEventListener(
        dadixEvents.gridViewEvents.onPatchField,
        handlePatchFieldEvent
      );
    };
    function handlePatchFieldEvent(evnt: Event) {
      const { viewId: evViewId, id, data } = (evnt as CustomEvent).detail || {};
      if (!evViewId || !id || !data) return;
      if (`${viewIdRef.current}` !== `${evViewId}`) return;
      const eventTableId = (evnt as CustomEvent).detail?.tableId;
      if (eventTableId && `${eventTableId}` !== `${tableIdRef.current}`) return;

      const detail = (evnt as CustomEvent).detail as { newField?: IDadixGridViewField; tableId?: string };
      const isNewColumnFromHidden = id < 0 && data?.id != null;

      // View still loading: queue new column so we merge it when the view loads
      if (!gridView && isNewColumnFromHidden && detail?.newField && detail?.tableId) {
        const cacheKey = `${detail.tableId}-${evViewId}`;
        const pending = pendingNewColumnsRef.current[cacheKey] || [];
        const without = pending.filter((f) => f.fieldId !== detail.newField!.fieldId);
        pendingNewColumnsRef.current[cacheKey] = [...without, detail.newField!];
        return;
      }

      if (!gridView) return;
      const updatedField = gridView.fields?.find(
        (field) => `${field.id}` === `${id}`
      );

      // New column added from Hidden fields (id was negative, server returned new id)
      // Prefer merging newField from event to avoid getView (which can 401 in some setups)
      if (!updatedField && isNewColumnFromHidden && gridView?.tableId != null) {
        if (detail?.newField) {
          setGridView((prev) => {
            if (!prev?.fields) return prev;
            const exists = prev.fields.some(
              (f) => f.fieldId === detail.newField!.fieldId || f.id === detail.newField!.id
            );
            if (exists) {
              return {
                ...prev,
                fields: prev.fields.map((f) =>
                  f.fieldId === detail.newField!.fieldId ? { ...f, ...detail.newField } : f
                ),
              };
            }
            const sorted = [...prev.fields, detail.newField!].sort((a, b) => {
              if (a.id < 0) return 1;
              if (b.id < 0) return -1;
              return (a.order ?? 0) - (b.order ?? 0);
            });
            return { ...prev, fields: sorted };
          });
          const tableIdStr = `${gridView.tableId}`;
          const viewIdNum = Number(evViewId);
          const mergedFields = [...(gridView.fields || []), detail.newField!].sort((a, b) => {
            if (a.id < 0) return 1;
            if (b.id < 0) return -1;
            return (a.order ?? 0) - (b.order ?? 0);
          });
          gridViewCacheRef.current[`${tableIdStr}-${viewIdNum}`] = {
            view: { ...gridView, fields: mergedFields },
            filters,
            sort: sortingRule,
          };
        }
        return;
      }

      if (!updatedField) return;
      setGridView((gridView) => {
        if (!gridView) return undefined;
        const fieldsToBeUpdated = {
          [`${id}`]: { ...data },
        };
        const fieldsAttributesToBeUpdated = Object.keys(data);

        if (fieldsAttributesToBeUpdated.indexOf('order') >= 0) {
          const reorderFrom = updatedField?.order ?? 0;
          const reorderTo = data.order ?? 0;
          if (reorderFrom === reorderTo) return gridView;
          const reorderDirection = Math.sign(reorderFrom - reorderTo);
          const minOrder = Math.min(reorderFrom, reorderTo);
          const maxOrder = Math.max(reorderFrom, reorderTo);
          gridView.fields?.map((field) => {
            if (`${field.id}` === `${id}`) return null;
            if (field.order < minOrder || field.order > maxOrder) return null;
            fieldsToBeUpdated[`${field.id}`] = {
              ...(fieldsToBeUpdated[`${field.id}`] || {}),
              order: field.order + reorderDirection,
              fieldOrder: field.order + reorderDirection,
            };
            return null;
          });
        }
        return {
          ...gridView,
          fields: gridView.fields
            ?.map((field) => {
              if (fieldsToBeUpdated[`${field.id}`]) {
                return { ...field, ...fieldsToBeUpdated[`${field.id}`] };
              }
              return field;
            })
            .sort((field1, field2) => {
              if (field1.id < 0) return 1;
              if (field2.id < 0) return -1;
              return field1.order - field2.order;
            }),
        };
      });
    }
  }, [viewId, gridView]);

  useEffect(() => {
    // handle create table field event
    window.addEventListener(
      dadixEvents.tableEvents.onCreateField,
      handleCreateTableFieldEvent
    );
    return () => {
      window.removeEventListener(
        dadixEvents.tableEvents.onCreateField,
        handleCreateTableFieldEvent
      );
    };

    function handleCreateTableFieldEvent(evnt: Event) {
      const { tableId, data, addToView } = (evnt as CustomEvent).detail || {};
      if (!tableId || !gridView || !viewId || !data?.id) return;
      if (`${tableId}` !== `${gridView.tableId}`) return;

      if (addToView === true) {
        // Created via Hidden fields: add to view state as visible
        setGridView((prev) => {
          if (!prev) return prev;
          const existing = prev.fields?.some((f) => f.fieldId === data.id);
          if (existing) return prev;
          return {
            ...prev,
            fields: [
              ...(prev.fields || []),
              {
                ...data,
                id: -data.id,
                fieldId: data.id,
                fieldName: data.name,
                fieldOrder: data.order ?? (prev.fields?.length ?? 0),
                isVisible: true,
              } as IDadixGridViewField,
            ],
          };
        });
        return;
      }

      // Created via Field Editor: create GridView column (visible) so new column appears in grid
      const tableIdStr = `${gridView.tableId}`;
      const currentViewId = gridView.id;
      patchGridViewColumn({
        tableId: tableIdStr,
        gridViewId: gridView.id,
        tableColumnId: data.id,
        id: -data.id,
        data: { isVisible: true },
        silent: true,
      })
        .catch((error) => {
          console.error('[dadix] VIEW_COLUMN_UPDATE_FAILED after field create', error);
          return { id: -data.id };
        })
        .then((res) => {
          // res is response.data from API (created GridView row with id)
          const raw = res && typeof res === 'object' ? res : null;
          const newId = raw != null && 'id' in raw ? Number((raw as { id: unknown }).id) : -data.id;
          if (newId == null || Number.isNaN(newId)) return;
          const newField: IDadixGridViewField = {
            ...data,
            id: newId,
            fieldId: data.id,
            fieldName: data.name ?? '',
            fieldOrder: data.order ?? (gridView.fields?.length ?? 0),
            isVisible: true,
          } as IDadixGridViewField;
          setGridView((prev) => {
            if (!prev) return prev;
            if (prev.fields?.some((f) => f.fieldId === data.id)) return prev;
            const next = [
              ...(prev.fields || []),
              newField,
            ].sort((a, b) => {
              if (a.id < 0) return 1;
              if (b.id < 0) return -1;
              return (a.order ?? 0) - (b.order ?? 0);
            });
            return { ...prev, fields: next };
          });
          const cacheKey = `${tableIdStr}-${currentViewId}`;
          const cached = gridViewCacheRef.current[cacheKey];
          if (cached) {
            const merged = [...(cached.view.fields || []), newField].sort((a, b) => {
              if (a.id < 0) return 1;
              if (b.id < 0) return -1;
              return (a.order ?? 0) - (b.order ?? 0);
            });
            gridViewCacheRef.current[cacheKey] = { ...cached, view: { ...cached.view, fields: merged } };
          }
          // Refetch view so grid has full merged structure (getGridViewAttributes) and new column is visible
          getView({ tableId: tableIdStr, id: currentViewId })
            .then((viewRes) => {
              if (`${viewIdRef.current}` !== `${currentViewId}` || !viewRes) return;
              const view = {
                ...(viewRes as unknown as IDadixGridView),
                fields: (viewRes as unknown as IDadixGridView).fields?.sort(
                  (field1: IDadixGridViewField, field2: IDadixGridViewField) => {
                    if (field1.id < 0) return 1;
                    if (field2.id < 0) return -1;
                    return (field1.order ?? 0) - (field2.order ?? 0);
                  }
                ),
              };
              let filters: IFilter[] = [];
              const sort = parseViewSort((viewRes as Record<string, unknown>)?.sort);
              try {
                const filterStr = (viewRes as Record<string, unknown>)?.filter as string;
                filters = JSON.parse(filterStr || '[]');
              } catch {
                /* ignore */
              }
              gridViewCacheRef.current[cacheKey] = { view, filters, sort };
              setGridView(view);
              setFilters(filters);
              setSortingRule(sort);
            })
            .catch(() => {
              /* keep optimistic update */
            });
        })
        .catch(() => {
          // Fallback: refetch view so at least the new column appears as hidden
          window.dispatchEvent(
            new CustomEvent(dadixEvents.gridViewEvents.onRefetchView, {
              detail: { viewId: gridView.id, tableId: tableIdStr },
            })
          );
        });
    }
  }, [viewId, gridView]);

  useEffect(() => {
    // handle delete table field event
    window.addEventListener(
      dadixEvents.tableEvents.onDeleteField,
      handleDeleteTableFieldEvent
    );
    return () => {
      window.removeEventListener(
        dadixEvents.tableEvents.onDeleteField,
        handleDeleteTableFieldEvent
      );
    };

    function handleDeleteTableFieldEvent(evnt: Event) {
      const { tableId, fieldId } = (evnt as CustomEvent).detail;
      if (!tableId || !fieldId || !gridView || !viewId) return;
      if (`${tableId}` !== `${gridView.tableId}`) return;

      const deletedField = gridView.fields.find(
        (field) => `${field.fieldId}` === `${fieldId}`
      );
      if (!deletedField) return;

      setGridView((gridView) => {
        if (!gridView) {
          return gridView;
        }
        return {
          ...gridView,
          fields: gridView.fields
            ?.filter((field) => field.fieldId !== fieldId)
            .sort((field1, field2) => {
              if (field1.id < 0) return -1;
              if (field2.id < 0) return 1;
              return field1.order - field2.order;
            })
            .map((field, index) => ({ ...field, order: index })),
        };
      });
    }
  }, [viewId, gridView]);

  // handle create table field option event
  useEventHandler(
    dadixEvents.tableEvents.onCreateFieldOption,
    (evnt: Event) => {
      const { tableId, fieldId, data } = (evnt as CustomEvent).detail;
      if (!tableId || !fieldId || !data) return;
      if (`${gridView?.tableId}` !== `${tableId}`) return;
      setGridView((currentGridView) => {
        if (!currentGridView) {
          return currentGridView;
        }
        const updatedGridView = {
          ...currentGridView,
          fields: currentGridView.fields?.map((field) => {
            if (`${field.fieldId}` !== `${fieldId}`) return { ...field };
            return {
              ...field,
              options: [...(field.options || []), { ...data }],
            };
          }),
        };
        return updatedGridView;
      });
    },
    [viewId, gridView]
  );

  // handle update table field option event
  useEventHandler(
    dadixEvents.tableEvents.onPatchFieldOption,
    (evnt: Event) => {
      const { tableId, fieldId, optionId, data } = (evnt as CustomEvent).detail;
      if (!tableId || !fieldId || !optionId || !data) return;
      if (`${gridView?.tableId}` !== `${tableId}`) return;
      setGridView((currentGridView) => {
        if (!currentGridView) {
          return currentGridView;
        }
        const fieldOptionsToBeUpdated = {
          [`${optionId}`]: { ...data },
        };
        const fieldOptionsAttributesToBeUpdated = Object.keys(data);

        if (fieldOptionsAttributesToBeUpdated.indexOf('order') >= 0) {
          const targetField = currentGridView.fields?.find(
            (field) => `${field.fieldId}` === `${fieldId}`
          );
          const reorderFrom =
            targetField?.options?.filter(
              (option) => `${option.id}` === `${optionId}`
            )[0]?.order ?? 0;
          const reorderTo = data.order ?? 0;
          if (reorderFrom === reorderTo) return currentGridView;
          const reorderDirection = Math.sign(reorderFrom - reorderTo);
          const minOrder = Math.min(reorderFrom, reorderTo);
          const maxOrder = Math.max(reorderFrom, reorderTo);
          targetField?.options?.map((option) => {
            if (`${option.id}` === `${optionId}`) return null;
            if (option.order < minOrder || option.order > maxOrder) return null;
            fieldOptionsToBeUpdated[`${option.id}`] = {
              ...(fieldOptionsToBeUpdated[`${option.id}`] || {}),
              order: option.order + reorderDirection,
              value: option.value,
            };
            return null;
          });
        }
        const updatedGridView = {
          ...currentGridView,
          fields: currentGridView.fields?.map((field) => {
            if (`${field.fieldId}` !== `${fieldId}`) return { ...field };
            return {
              ...field,
              options: field.options
                ?.map((option) => {
                  if (fieldOptionsToBeUpdated[`${option.id}`]) {
                    return {
                      ...option,
                      ...fieldOptionsToBeUpdated[`${option.id}`],
                    };
                  }
                  return { ...option };
                })
                .sort((option1, option2) => option1.order - option2.order),
            };
          }),
        };
        return updatedGridView;
      });
    },
    [viewId, gridView]
  );

  // handle delete table field option event
  useEventHandler(
    dadixEvents.tableEvents.onDeleteFieldOption,
    (evnt: Event) => {
      const { tableId, fieldId, optionId } = (evnt as CustomEvent).detail;
      if (!optionId || !fieldId || !tableId) return;
      if (`${gridView?.tableId}` !== `${tableId}`) return;
      setGridView((currentGridView) => {
        if (!currentGridView) {
          return currentGridView;
        }
        return {
          ...currentGridView,
          fields: (currentGridView?.fields || []).map((field) => {
            if (`${field.fieldId}` === `${fieldId}`) {
              return {
                ...field,
                options: [
                  ...(field.options || [])
                    .filter((option) => `${option.id}` !== `${optionId}`)
                    .sort((option1, option2) => option1.order - option2.order)
                    .map((option, i) => ({ ...option, order: i })),
                ],
              };
            }
            return { ...field };
          }),
        };
      });
    },
    [viewId, gridView]
  );

  useEffect(() => {
    // handle update table formula field event
    window.addEventListener(
      dadixEvents.tableEvents.onPatchFieldFormula,
      handleUpdateTableFormulaFieldEvent
    );
    return () => {
      window.removeEventListener(
        dadixEvents.tableEvents.onPatchFieldFormula,
        handleUpdateTableFormulaFieldEvent
      );
    };

    function handleUpdateTableFormulaFieldEvent(evnt: Event) {
      const { tableId, columnId, value } = (evnt as CustomEvent).detail || {};
      if (!gridView || `${gridView.tableId}` !== `${tableId}`) return;

      setGridView({
        ...gridView,
        fields: gridView.fields
          ?.map((field) => {
            if (`${field.fieldId}` === `${columnId}`) {
              return { ...field, formula: value };
            }
            return field;
          })
          .sort((field1, field2) => {
            if (field1.id < 0) return -1;
            if (field2.id < 0) return 1;
            return field1.order - field2.order;
          }),
      });
    }
  }, [viewId, gridView]);

  useEffect(() => {
    // handle update table text field event
    window.addEventListener(
      dadixEvents.tableEvents.onPatchTextFieldOptions,
      handleUpdateTableTextFieldOptionsEvent
    );
    return () => {
      window.removeEventListener(
        dadixEvents.tableEvents.onPatchFieldFormula,
        handleUpdateTableTextFieldOptionsEvent
      );
    };

    function handleUpdateTableTextFieldOptionsEvent(evnt: Event) {
      const { tableId, columnId, data } = (evnt as CustomEvent).detail || {};
      if (!gridView || `${gridView.tableId}` !== `${tableId}`) return;

      setGridView({
        ...gridView,
        fields: gridView.fields
          ?.map((field) => {
            if (`${field.fieldId}` === `${columnId}`) {
              return {
                ...field,
                textOptions: { ...field.textOptions, ...data },
              };
            }
            return field;
          })
          .sort((field1, field2) => {
            if (field1.id < 0) return -1;
            if (field2.id < 0) return 1;
            return field1.order - field2.order;
          }),
      });
    }
  }, [viewId, gridView]);

  useEffect(() => {
    window.addEventListener(
      dadixEvents.tableEvents.onPatchNumberFieldOptions,
      handleUpdateTableNumberFieldOptionsEvent
    );
    return () => {
      window.removeEventListener(
        dadixEvents.tableEvents.onPatchNumberFieldOptions,
        handleUpdateTableNumberFieldOptionsEvent
      );
    };

    function handleUpdateTableNumberFieldOptionsEvent(evnt: Event) {
      const { tableId, columnId, data } = (evnt as CustomEvent).detail || {};
      if (!gridView || `${gridView.tableId}` !== `${tableId}`) return;

      setGridView({
        ...gridView,
        fields: gridView.fields
          ?.map((field) => {
            if (`${field.fieldId}` === `${columnId}`) {
              return {
                ...field,
                numberOptions: { ...field.numberOptions, ...data },
              };
            }
            return field;
          })
          .sort((field1, field2) => {
            if (field1.id < 0) return -1;
            if (field2.id < 0) return 1;
            return field1.order - field2.order;
          }),
      });
    }
  }, [viewId, gridView]);

  // handle update table relation field options event
  useEventHandler(
    dadixEvents.tableEvents.onPatchRelationFieldOptions,
    (evnt: Event) => {
      const { tableId, columnId, data } = (evnt as CustomEvent).detail || {};
      if (!gridView || `${gridView.tableId}` !== `${tableId}`) return;

      setGridView({
        ...gridView,
        fields: gridView.fields
          ?.map((field) => {
            if (`${field.fieldId}` === `${columnId}`) {
              return {
                ...field,
                relationOptions: { ...field.relationOptions, ...data },
              };
            }
            return field;
          })
          .sort((field1, field2) => field1.order - field2.order),
      });
    },
    [viewId, gridView]
  );

  // handle update table field (name, action) event
  useEventHandler(
    dadixEvents.tableEvents.onPatchField,
    (evnt: Event) => {
      const {
        tableId,
        fieldId: columnId,
        data,
      } = (evnt as CustomEvent).detail || {};
      if (
        !data ||
        (`${tableIdRef.current}` !== `${tableId}` && `${gridView?.tableId}` !== `${tableId}`)
      ) {
        return;
      }
      const trackedAttributes = ['name', 'action'];
      const updates: Record<string, unknown> = {};
      Object.keys(data).forEach((attribute) => {
        if (trackedAttributes.indexOf(attribute) >= 0) {
          updates[attribute] = data[attribute];
        }
      });
      if (Object.keys(updates).length === 0) return;

      setGridView((prev) => {
        if (!prev || `${prev.tableId}` !== `${tableId}`) return prev;
        const fields = prev.fields
          ?.map((field) => {
            if (`${field.fieldId}` === `${columnId}`) {
              const nextName =
                typeof updates.name === 'string' && updates.name.trim()
                  ? updates.name.trim()
                  : field.fieldName;
              return {
                ...field,
                ...updates,
                fieldName: nextName,
                name: nextName,
              };
            }
            return field;
          })
          .sort((field1, field2) => field1.order - field2.order);
        const next = { ...prev, fields };
        const cacheKey = `${prev.tableId}-${prev.id}`;
        const cached = gridViewCacheRef.current[cacheKey];
        if (cached) {
          gridViewCacheRef.current[cacheKey] = { ...cached, view: next };
        }
        return next;
      });
    },
    [viewId, gridView]
  );

  function handleUpdateFilters(filters: IFilter[]) {
    if (!viewIdRef.current || !tableId) return;
    patchView({
      id: viewIdRef.current,
      tableId,
      data: { filter: JSON.stringify(filters) },
    });
    setFilters(filters);
  }

  function handleUpdateSortingRule(rules: ISortingRules) {
    if (!viewIdRef.current || !tableId) return;
    const valid = parseViewSort(rules);
    const sortJson = JSON.stringify(valid);
    setSortingRule(valid);
    setGridView((prev) => (prev ? { ...prev, sort: sortJson } : prev));
    const cacheKey = `${tableId}-${viewIdRef.current}`;
    const cached = gridViewCacheRef.current[cacheKey];
    if (cached) {
      gridViewCacheRef.current[cacheKey] = {
        ...cached,
        sort: valid,
        view: { ...cached.view, sort: sortJson },
      };
    }
    void patchView({
      id: viewIdRef.current,
      tableId,
      data: { sort: sortJson },
    }).catch((err) => {
      console.error('Failed to persist view sort', err);
    });
  }

  return (
    <GridViewContext.Provider
      value={{
        id: viewId ? parseInt(viewId) : undefined,
        view: gridView,
        filters,
        searchFilters,
        parsedGlobalAndViewFilters:
          parsedGlobalFilters.trim() && parsedFilters.trim()
            ? `and(${parsedGlobalFilters},${parsedFilters})`
            : parsedGlobalFilters.trim() || parsedFilters.trim(),
        sort: sortingRule,
        isLoading,
        initialized,
        error,
        methods: {
          setFilters: handleUpdateFilters,
          setSearchFilters,
          setSortingRule: handleUpdateSortingRule,
        },
      }}
    >
      {children}
    </GridViewContext.Provider>
  );
}

export function useGridViewContext() {
  const context = useContext(GridViewContext);
  if (context === undefined) {
    throw new Error(
      'useGridViewContext must be used within a GridViewContextProvider'
    );
  }
  return context;
}
