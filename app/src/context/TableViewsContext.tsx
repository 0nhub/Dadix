import type { IDadixView } from '@/types';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { getTableViews } from '@/lib/view';
import { dadixEvents } from '@/constants/events';
import {
  DEV_DEMO_VIEW,
  DEV_DEMO_VIEW_2,
  DEV_DEMO_VIEW_3,
  DEV_DEMO_VIEW_4,
  DEV_DEMO_TABLE_ID,
  DEV_DEMO_TABLE_2_ID,
  DEV_DEMO_TABLE_3_ID,
  DEV_DEMO_TABLE_4_ID,
  isDevDemoTable,
  findLocalTableById,
  tableFieldsToGridViewFields,
} from '@/lib/dev-demo-data';

interface ITableViews {
  tableId: string | undefined;
  views: IDadixView[];
  isLoading: boolean;
  initialized: boolean;
}

const TableViewsContext = createContext<ITableViews>({
  tableId: undefined,
  views: [],
  isLoading: true,
  initialized: false,
});

interface TableViewsContextProviderProps {
  tableId: string;
  children: React.ReactNode;
}

export function TableViewsContextProvider({
  tableId,
  children,
}: TableViewsContextProviderProps) {
  // const currentTableCtx = useCurrentTableContext();

  const [views, setViews] = useState<IDadixView[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [initialized, setInitialized] = useState<boolean>(false);
  const tableIdRef = useRef<string>(undefined);
  const viewsCacheRef = useRef<Record<string, IDadixView[]>>({});

  useEffect(() => {
    if (tableId === tableIdRef.current) return;
    if (!tableId) {
      setInitialized(false);
      setViews([]);
      return;
    }

    const tid = String(tableId);
    const cached = viewsCacheRef.current[tid];
    if (cached && cached.length >= 0) {
      setViews(cached);
      setIsLoading(false);
      setInitialized(true);
    } else {
      setIsLoading(true);
      setInitialized(false);
    }
    tableIdRef.current = tableId;

    if (isDevDemoTable(tableId)) {
      const list =
        tableId === DEV_DEMO_TABLE_4_ID
          ? [DEV_DEMO_VIEW_4]
          : tableId === DEV_DEMO_TABLE_3_ID
            ? [DEV_DEMO_VIEW_3]
            : tableId === DEV_DEMO_TABLE_2_ID
              ? [DEV_DEMO_VIEW_2]
              : [DEV_DEMO_VIEW];
      viewsCacheRef.current[tid] = list;
      viewsCacheRef.current[DEV_DEMO_TABLE_ID] = [DEV_DEMO_VIEW];
      viewsCacheRef.current[DEV_DEMO_TABLE_2_ID] = [DEV_DEMO_VIEW_2];
      viewsCacheRef.current[DEV_DEMO_TABLE_3_ID] = [DEV_DEMO_VIEW_3];
      viewsCacheRef.current[DEV_DEMO_TABLE_4_ID] = [DEV_DEMO_VIEW_4];
      setViews(list);
      setIsLoading(false);
      setInitialized(true);
      return;
    }

    if (
      process.env.NODE_ENV === 'development' &&
      String(tableId).startsWith('dev-table-')
    ) {
      const table = findLocalTableById(tableId);
      const list = [
        {
          id: 1,
          tableId: String(tableId),
          name: 'Alle Einträge',
          icon: 'LayoutGrid',
          order: 0,
          filter: '',
          sort: '',
          type: 'gridView',
          fields: tableFieldsToGridViewFields(table?.fields),
        } as IDadixView,
      ];
      viewsCacheRef.current[tid] = list;
      setViews(list);
      setIsLoading(false);
      setInitialized(true);
      return;
    }

    getTableViews({ tableId })
      .then((res) => {
        if (!res || !res.views) {
          throw new Error('Error getting views list');
        }
        const list = [
          ...(res.views as IDadixView[]).sort(
            (view1, view2) => view1.order - view2.order
          ),
        ];
        viewsCacheRef.current[tid] = list;
        setViews(list);
        setIsLoading(false);
        setInitialized(true);
        return res;
      })
      .catch((err) => {
        if (!cached) setIsLoading(false);
        console.error('error getting views::', err);
      });
  }, [tableId]);

  useEffect(() => {
    // handle create new view event
    window.addEventListener(
      dadixEvents.viewEvents.onCreate,
      handleCreateViewEvent
    );
    return () => {
      window.removeEventListener(
        dadixEvents.viewEvents.onCreate,
        handleCreateViewEvent
      );
    };
    function handleCreateViewEvent(event: Event) {
      const { tableId, createdView } = (event as CustomEvent).detail || {};
      if (!tableId || `${tableId}` !== tableIdRef.current || !createdView) {
        return;
      }
      setViews((prev) => {
        const next = [...prev, { ...createdView }];
        viewsCacheRef.current[String(tableId)] = next;
        return next;
      });
    }
  }, []);

  useEffect(() => {
    // handle patch view event
    window.addEventListener(
      dadixEvents.viewEvents.onPatch,
      handleUpdateViewEvent
    );
    return () => {
      window.removeEventListener(
        dadixEvents.viewEvents.onPatch,
        handleUpdateViewEvent
      );
    };

    function handleUpdateViewEvent(evnt: Event) {
      const { tableId, id, updates } = (evnt as CustomEvent).detail || {};
      if (`${tableIdRef.current}` !== `${tableId}` || !id || !updates) return;

      const editedView = views.find((view) => `${view.id}` === `${id}`);
      if (!editedView) return;

      setViews((views) => {
        const viewsToBeUpdated = {
          [`${id}`]: { ...updates },
        };
        const viewsAttributesToBeUpdated = Object.keys(updates);

        if (viewsAttributesToBeUpdated.indexOf('order') >= 0) {
          const reorderFrom = editedView.order ?? 0;
          const reorderTo = updates.order ?? 0;
          if (reorderFrom === reorderTo) return views;
          const reorderDirection = Math.sign(reorderFrom - reorderTo);
          const minOrder = Math.min(reorderFrom, reorderTo);
          const maxOrder = Math.max(reorderFrom, reorderTo);
          views.map((view) => {
            if (`${view.id}` === `${id}`) return null;
            if (view.order < minOrder || view.order > maxOrder) return null;
            viewsToBeUpdated[`${view.id}`] = {
              ...(viewsToBeUpdated[`${view.id}`] || {}),
              order: view.order + reorderDirection,
            };
            return null;
          });
        }
        const next = views
          .map((view) => {
            if (viewsToBeUpdated[`${view.id}`]) {
              return { ...view, ...viewsToBeUpdated[`${view.id}`] };
            }
            return view;
          })
          .sort((field1, field2) => field1.order - field2.order);
        viewsCacheRef.current[String(tableIdRef.current)] = next;
        return next;
      });
    }
  }, []);

  useEffect(() => {
    // handle delete view event
    window.addEventListener(
      dadixEvents.viewEvents.onDelete,
      handleDeleteViewEvent
    );
    return () => {
      window.removeEventListener(
        dadixEvents.viewEvents.onDelete,
        handleDeleteViewEvent
      );
    };

    function handleDeleteViewEvent(evnt: Event) {
      const { tableId, id } = (evnt as CustomEvent).detail || {};
      if (!tableId || !id) return;
      if (`${tableIdRef.current}` !== `${tableId}`) return;

      setViews((views) => {
        const next = views
          .filter((view) => `${view.id}` !== `${id}`)
          .sort((view1, view2) => view1.order - view2.order)
          .map((view, index) => ({ ...view, order: index }));
        viewsCacheRef.current[String(tableIdRef.current)] = next;
        return next;
      });
    }
  }, []);

  return (
    <TableViewsContext.Provider
      value={{
        tableId,
        views,
        isLoading,
        initialized,
      }}
    >
      {children}
    </TableViewsContext.Provider>
  );
}

export function useTableViewsContext() {
  const context = useContext(TableViewsContext);
  if (context === undefined) {
    throw new Error(
      'useTableViewsContext must be used within a TableViewsContextProvider'
    );
  }
  return context;
}
