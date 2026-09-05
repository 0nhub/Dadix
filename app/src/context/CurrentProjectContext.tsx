'use client';
//
// this context contains current open project's details
//

import { createContext, useContext, useEffect, useState, useRef } from 'react';
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

  useEffect(() => {
    if (`${currentProjectIdRef.current}` === `${currentProjectId}`) return;
    const pid = String(currentProjectId);
    const hasCache = (tablesCacheRef.current[pid]?.length ?? -1) >= 0;
    if (!hasCache) {
      setInitialized(false);
      setIsLoading(true);
    }
    if (
      dashboardCtx.projects.find(
        (project) => `${project.id}` === `${currentProjectId}`
      ) ||
      dashboardCtx.sharedProjects.find(
        (project) => `${project.id}` === `${currentProjectId}`
      )
    ) {
      currentProjectIdRef.current = `${currentProjectId}`;
    }
  }, [currentProjectId]);

  useEffect(() => {
    // get current project tables list
    if (!dashboardCtx.initialized) return;
    if (!currentProjectId) return;
    const pid = String(currentProjectId);
    const cached = tablesCacheRef.current[pid];

    if (cached && cached.length >= 0) {
      setCurrentProjectTables(cached);
      setIsLoading(false);
      setInitialized(true);
    } else {
      setCurrentProjectTables([]);
      setInitialized(false);
      setIsLoading(true);
    }

    if (isDevDemoProject(currentProjectId as string)) {
      const tables = [{ ...DEV_DEMO_TABLE }, { ...DEV_DEMO_TABLE_2 }, { ...DEV_DEMO_TABLE_3 }, { ...DEV_DEMO_TABLE_4 }];
      tablesCacheRef.current[pid] = tables;
      setCurrentProjectTables(tables);
      UserLocalStorage.setProjectId(`${currentProjectId}`);
      setIsLoading(false);
      setInitialized(true);
      return;
    }

    if (isLocalDevProject(currentProjectId as string)) {
      const tables = getLocalProjectTables(pid);
      tablesCacheRef.current[pid] = tables;
      setCurrentProjectTables(tables);
      UserLocalStorage.setProjectId(`${currentProjectId}`);
      setIsLoading(false);
      setInitialized(true);
      return;
    }

    lastRequestProjectTablesId.current++;
    const requestProjectTablesId = lastRequestProjectTablesId.current;

    tableService
      .getTables({
        projectId: currentProjectId as string,
      })
      .then((res: unknown) => {
        if ((res as Record<string, unknown>)?.error) {
          throw new Error(`${(res as Record<string, unknown>)?.errorMsg}`);
        }
        if (requestProjectTablesId !== lastRequestProjectTablesId.current)
          return;
        const tables = (res as Table[])
          .sort((table1, table2) => table1.order - table2.order)
          .map((table, index) => ({ ...table, order: index }));
        tablesCacheRef.current[pid] = tables;
        setCurrentProjectTables(tables);
        UserLocalStorage.setProjectId(`${currentProjectId}`);
        setIsLoading(false);
        setInitialized(true);
        return;
      })
      .catch((err: unknown) => {
        if (requestProjectTablesId !== lastRequestProjectTablesId.current)
          return;
        console.error('fetch current project tables list error:', err);
        if (!cached) setIsLoading(false);
        return;
      });
  }, [currentProjectId, dashboardCtx.initialized]);

  useEffect(() => {
    // handle create table event
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
      if (!projectId || !createdTable) return;
      if (`${currentProjectId}` !== `${projectId}`) return;
      if (
        currentProjectTables.filter(
          (table) => `${table.id}` === `${createdTable.id}`
        )[0]
      ) {
        return;
      }
      const newTable = { ...(createdTable as unknown as Table) };
      setCurrentProjectTables((prev) => {
        const next = [...prev, newTable];
        tablesCacheRef.current[String(projectId)] = next;
        if (isLocalDevProject(String(projectId))) {
          saveLocalProjectTables(String(projectId), next);
        }
        return next;
      });
    }
  }, [currentProjectTables, dashboardCtx.initialized, currentProjectId]);

  useEffect(() => {
    // handle update table event
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

      // check if table exist
      const tableToUpdate = currentProjectTables.filter(
        (table) => `${table.id}` === `${updatedTableId}`
      )[0];
      if (!tableToUpdate) return;

      const updates = { [`${updatedTableId}`]: data };
      // check if order updated
      if (fieldsToUpdate.indexOf('order') >= 0) {
        // update reordered tables order
        const fromOrder = tableToUpdate.order;
        const toOrder = data.order;
        const reorderDirection = Math.sign(fromOrder - toOrder);
        const minOrder = fromOrder < toOrder ? fromOrder : toOrder - 1;
        const maxOrder = toOrder < fromOrder ? fromOrder : toOrder + 1;
        currentProjectTables.map((table) => {
          if (table.order > minOrder && table.order < maxOrder) {
            updates[`${table.id}`] = {
              ...(updates[`${table.id}`] || {}),
              order: table.order + reorderDirection,
            };
          }
          return null;
        });
      }
      const tablesToUpdate = Object.keys(updates);
      setCurrentProjectTables((tables) => {
        const next = tables
          .map((table) => {
            if (tablesToUpdate.indexOf(`${table.id}`) >= 0) {
              return { ...table, ...updates[`${table.id}`] };
            }
            return { ...table };
          })
          .sort((table1, table2) => table1.order - table2.order);
        tablesCacheRef.current[String(projectId)] = next;
        return next;
      });
    }
  }, [currentProjectTables, setCurrentProjectTables, dashboardCtx.initialized]);

  useEffect(() => {
    // handle delete table event
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
      if (`${currentProjectId}` !== `${projectId}`) return;
      setCurrentProjectTables((tables) => {
        const next = tables
          .filter((table) => `${table.id}` !== `${deletedTableId}`)
          .sort((table1, table2) => table1.order - table2.order)
          .map((table, index) => ({ ...table, order: index }));
        tablesCacheRef.current[String(projectId)] = next;
        return next;
      });
    }
  }, [currentProjectTables, dashboardCtx.initialized, currentProjectId]);

  return (
    <CurrentProjectContext.Provider
      value={{
        id: currentProjectId as string,
        tables: currentProjectTables,
        isLoading,
        initialized,
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
