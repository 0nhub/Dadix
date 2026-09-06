import type { IDadixView } from '@/types';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { getTableViews } from '@/lib/view';
import { dadixEvents } from '@/constants/events';
import { getLocalViewsForTable, usesLocalViews } from '@/lib/dev-demo-data';

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
    tableIdRef.current = tableId;

    if (usesLocalViews(tableId)) {
      const list = getLocalViewsForTable(tableId);
      viewsCacheRef.current[tid] = list;
      setViews(list);
      setIsLoading(false);
      setInitialized(true);
      return;
    }

    const cached = viewsCacheRef.current[tid];
    if (cached) {
      setViews(cached);
      setIsLoading(false);
      setInitialized(true);
    } else {
      setViews([]);
      setIsLoading(true);
      setInitialized(false);
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
        setInitialized(true);
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
      if (`${tableIdRef.current}` !== `${tableId}` || id == null || !updates)
        return;

      setViews((currentViews) => {
        const editedView = currentViews.find(
          (view) => `${view.id}` === `${id}`
        );
        if (!editedView) return currentViews;

        const viewsToBeUpdated: Record<string, Partial<IDadixView>> = {
          [`${id}`]: { ...updates },
        };
        const viewsAttributesToBeUpdated = Object.keys(updates);

        if (viewsAttributesToBeUpdated.indexOf('order') >= 0) {
          const reorderFrom = editedView.order ?? 0;
          const reorderTo = updates.order ?? 0;
          if (reorderFrom !== reorderTo) {
            const reorderDirection = Math.sign(reorderFrom - reorderTo);
            const minOrder = Math.min(reorderFrom, reorderTo);
            const maxOrder = Math.max(reorderFrom, reorderTo);
            currentViews.forEach((view) => {
              if (`${view.id}` === `${id}`) return;
              if (view.order < minOrder || view.order > maxOrder) return;
              viewsToBeUpdated[`${view.id}`] = {
                ...(viewsToBeUpdated[`${view.id}`] || {}),
                order: view.order + reorderDirection,
              };
            });
          }
        }
        const next = currentViews
          .map((view) => {
            if (viewsToBeUpdated[`${view.id}`]) {
              return { ...view, ...viewsToBeUpdated[`${view.id}`] };
            }
            return view;
          })
          .sort((view1, view2) => view1.order - view2.order);
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
