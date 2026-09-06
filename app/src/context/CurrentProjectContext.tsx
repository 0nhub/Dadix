'use client';
//
// this context contains current open project's details
//

import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';

import { dadixEvents } from '@/constants/events';
import { useDashboardContext } from './DashboardContext';
import { UserLocalStorage } from '@/lib/userLocalStorage';
import tableService from '@/lib/table';
import {
  DEV_DEMO_TABLE,
  DEV_DEMO_TABLE_2,
  DEV_DEMO_TABLE_3,
  DEV_DEMO_TABLE_4,
  getLocalProjectTables,
  isDevDemoProject,
  isLocalDevProject,
  saveLocalProjectTables,
} from '@/lib/dev-demo-data';

import type { Table } from '@/types';

const deletedTableIds = new Set<string>();

export function markTableDeleted(id: string | number) {
  deletedTableIds.add(String(id));
}

export function clearTableDeleted(id: string | number) {
  deletedTableIds.delete(String(id));
}

export function isTableMarkedDeleted(id: string | number) {
  return deletedTableIds.has(String(id));
}

interface ICurrentProjectContext {
  id: string | number | undefined;
  tables: Table[];
  isLoading: boolean;
  initialized: boolean;
}

const CurrentProjectContext = createContext<ICurrentProjectContext>({
  id: undefined,
  tables: [],
  isLoading: true,
  initialized: false,
});

function asTables(res: unknown): Table[] {
  if (Array.isArray(res)) return res as Table[];
  if (res && typeof res === 'object') {
    const record = res as Record<string, unknown>;
    if (record.error) {
      throw new Error(String(record.errorMsg ?? record.error));
    }
    if (Array.isArray(record.tables)) return record.tables as Table[];
  }
  return [];
}

function mergeTables(incoming: Table[], previous: Table[]): Table[] {
  const incomingLive = incoming.filter((table) => !deletedTableIds.has(String(table.id)));
  if (incoming.length === 0 && previous.length > 0) {
    return previous
      .filter((table) => !deletedTableIds.has(String(table.id)))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((table, index) => ({ ...table, order: index }));
  }
  const prevById = new Map(previous.map((table) => [String(table.id), table]));
  return incomingLive
    .map((table) => {
      const old = prevById.get(String(table.id));
      if (!old) return table;
      const incomingName = String(table.name ?? '').trim();
      return incomingName ? { ...old, ...table } : { ...old, ...table, name: old.name };
    })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((table, index) => ({ ...table, order: index }));
}

export function CurrentProjectContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const dashboardCtx = useDashboardContext();

  const lastRequestProjectTablesId = useRef<number>(0);
  const currentProjectIdRef = useRef<number | string | undefined>(undefined);
  const tablesCacheRef = useRef<Record<string, Table[]>>({});
  const [currentProjectTables, setCurrentProjectTables] = useState<Table[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [initialized, setInitialized] = useState<boolean>(false);

  const { projectId: currentProjectId } = useParams();
  const fromHash =
    typeof window !== 'undefined'
      ? window.location.hash.match(/^#\/dashboard\/([^/?]+)/)?.[1]
      : undefined;
  const resolvedProjectId = (currentProjectId as string | undefined) || fromHash;
  currentProjectIdRef.current = resolvedProjectId;

  const applyTables = useCallback((pid: string, tables: Table[]) => {
    tablesCacheRef.current[pid] = tables;
    setCurrentProjectTables(tables);
    UserLocalStorage.setProjectId(pid);
    setIsLoading(false);
    setInitialized(true);
  }, []);

  const loadTables = useCallback(() => {
    if (!dashboardCtx.initialized) return;
    const pid = String(currentProjectIdRef.current ?? '');
    if (!pid) return;
    const cached = tablesCacheRef.current[pid];

    if (cached) {
      setCurrentProjectTables(cached);
      setIsLoading(false);
      setInitialized(true);
    } else {
      setCurrentProjectTables([]);
      setInitialized(false);
      setIsLoading(true);
    }

    if (isDevDemoProject(currentProjectId as string)) {
      const tables = [
        { ...DEV_DEMO_TABLE },
        { ...DEV_DEMO_TABLE_2 },
        { ...DEV_DEMO_TABLE_3 },
        { ...DEV_DEMO_TABLE_4 },
      ];
      applyTables(pid, tables);
      return;
    }

    if (isLocalDevProject(currentProjectId as string)) {
      applyTables(pid, getLocalProjectTables(pid));
      return;
    }

    lastRequestProjectTablesId.current += 1;
    const requestProjectTablesId = lastRequestProjectTablesId.current;

    tableService
      .getTables({
        projectId: currentProjectId as string,
      })
      .then((res: unknown) => {
        if (`${currentProjectIdRef.current}` !== pid) return;
        const incoming = asTables(res)
          .sort((table1, table2) => (table1.order ?? 0) - (table2.order ?? 0))
          .map((table, index) => ({ ...table, order: index }));
        const previous = tablesCacheRef.current[pid] ?? [];
        // A newer empty/stale request must not drop a complete list we already have
        // or that this response just delivered.
        if (
          incoming.length === 0 &&
          requestProjectTablesId !== lastRequestProjectTablesId.current &&
          previous.length > 0
        ) {
          return;
        }
        applyTables(pid, mergeTables(incoming, previous));
      })
      .catch((err: unknown) => {
        if (`${currentProjectIdRef.current}` !== pid) return;
        console.error('fetch current project tables list error:', err);
        const previous = tablesCacheRef.current[pid] ?? cached ?? [];
        tablesCacheRef.current[pid] = previous;
        setCurrentProjectTables(previous);
        setIsLoading(false);
        setInitialized(true);
      });
  }, [applyTables, resolvedProjectId, dashboardCtx.initialized]);

  useEffect(() => {
    const pid = String(resolvedProjectId ?? '');
    if (!pid) return;
    const cached = tablesCacheRef.current[pid];
    if (cached) {
      setCurrentProjectTables(cached);
      setIsLoading(false);
      setInitialized(true);
    } else {
      setInitialized(false);
      setIsLoading(true);
    }
    loadTables();
  }, [resolvedProjectId, dashboardCtx.initialized, loadTables]);

  useEffect(() => {
    const refetch = () => {
      if (!currentProjectIdRef.current) return;
      loadTables();
    };
    window.addEventListener(dadixEvents.tableEvents.onRefetchTables, refetch);
    window.addEventListener(dadixEvents.projectEvents.onPatch, refetch);
    window.addEventListener(dadixEvents.projectEvents.onCreate, refetch);
    return () => {
      window.removeEventListener(dadixEvents.tableEvents.onRefetchTables, refetch);
      window.removeEventListener(dadixEvents.projectEvents.onPatch, refetch);
      window.removeEventListener(dadixEvents.projectEvents.onCreate, refetch);
    };
  }, [loadTables]);

  useEffect(() => {
    window.addEventListener(
      dadixEvents.tableEvents.onCreate,
      handleTableCreateEvent
    );
    return () => {
      window.removeEventListener(
        dadixEvents.tableEvents.onCreate,
        handleTableCreateEvent
      );
    };
    function handleTableCreateEvent(evnt: Event) {
      const { projectId, createdTable } = (evnt as CustomEvent).detail || {};
      if (!createdTable) return;
      if (
        projectId &&
        currentProjectIdRef.current &&
        `${currentProjectIdRef.current}` !== `${projectId}`
      ) {
        return;
      }
      const newTable = { ...(createdTable as unknown as Table) };
      if (newTable.id != null) clearTableDeleted(newTable.id);
      setInitialized(true);
      setIsLoading(false);
      setCurrentProjectTables((prev) => {
        const exists = prev.some((table) => `${table.id}` === `${newTable.id}`);
        const next = exists
          ? prev.map((table) =>
              `${table.id}` === `${newTable.id}` ? { ...table, ...newTable } : table
            )
          : [...prev, newTable];
        tablesCacheRef.current[String(projectId)] = next;
        if (isLocalDevProject(String(projectId))) {
          saveLocalProjectTables(String(projectId), next);
        }
        return next;
      });
    }
  }, [currentProjectId]);

  useEffect(() => {
    window.addEventListener(
      dadixEvents.tableEvents.onPatch,
      handleTableUpdateEvent
    );
    return () => {
      window.removeEventListener(
        dadixEvents.tableEvents.onPatch,
        handleTableUpdateEvent
      );
    };
    function handleTableUpdateEvent(evnt: Event) {
      const {
        tableId: updatedTableId,
        projectId,
        data,
      } = (evnt as CustomEvent).detail || {};

      if (!projectId || !updatedTableId || !data) return;

      const allowedFieldsToUpdate = ['name', 'icon', 'order'];
      const fieldsToUpdate = Object.keys(data);
      if (
        fieldsToUpdate.filter(
          (field) => allowedFieldsToUpdate.indexOf(field) < 0
        ).length > 0
      )
        return;

      setCurrentProjectTables((tables) => {
        const tableToUpdate = tables.find(
          (table) => `${table.id}` === `${updatedTableId}`
        );
        if (!tableToUpdate) return tables;

        const updates: Record<string, Record<string, unknown>> = {
          [`${updatedTableId}`]: data,
        };
        if (fieldsToUpdate.indexOf('order') >= 0) {
          const fromOrder = tableToUpdate.order;
          const toOrder = data.order;
          const reorderDirection = Math.sign(fromOrder - toOrder);
          const minOrder = fromOrder < toOrder ? fromOrder : toOrder - 1;
          const maxOrder = toOrder < fromOrder ? fromOrder : toOrder + 1;
          tables.forEach((table) => {
            if (table.order > minOrder && table.order < maxOrder) {
              updates[`${table.id}`] = {
                ...(updates[`${table.id}`] || {}),
                order: table.order + reorderDirection,
              };
            }
          });
        }
        const next = tables
          .map((table) => {
            if (updates[`${table.id}`]) {
              return { ...table, ...updates[`${table.id}`] };
            }
            return { ...table };
          })
          .sort((table1, table2) => table1.order - table2.order);
        tablesCacheRef.current[String(projectId)] = next;
        return next;
      });
    }
  }, []);

  useEffect(() => {
    window.addEventListener(
      dadixEvents.tableEvents.onDelete,
      handleTableDeleteEvent
    );
    return () => {
      window.removeEventListener(
        dadixEvents.tableEvents.onDelete,
        handleTableDeleteEvent
      );
    };
    function handleTableDeleteEvent(evnt: Event) {
      const { projectId, tableId: deletedTableId } =
        (evnt as CustomEvent).detail || {};
      if (!projectId || !deletedTableId) return;
      markTableDeleted(deletedTableId);
      if (
        `${currentProjectIdRef.current}` !== `${projectId}` &&
        `${currentProjectId}` !== `${projectId}`
      ) {
        return;
      }
      setCurrentProjectTables((tables) => {
        const next = tables
          .filter((table) => `${table.id}` !== `${deletedTableId}`)
          .sort((table1, table2) => table1.order - table2.order)
          .map((table, index) => ({ ...table, order: index }));
        tablesCacheRef.current[String(projectId)] = next;
        return next;
      });
    }
  }, [currentProjectId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    (window as Window & { __dadixProjectTables?: Table[] }).__dadixProjectTables =
      currentProjectTables;
  }, [currentProjectTables]);

  return (
    <CurrentProjectContext.Provider
      value={{
        id: resolvedProjectId as string,
        tables: currentProjectTables,
        isLoading,
        initialized: initialized || currentProjectTables.length > 0,
      }}
    >
      {children}
    </CurrentProjectContext.Provider>
  );
}

export function useCurrentProjectContext() {
  const context = useContext(CurrentProjectContext);
  if (context === undefined) {
    throw new Error(
      'useCurrentProjectContext must be used within a CurrentProjectContextProvider'
    );
  }
  return context;
}
