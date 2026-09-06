'use client';
//
// this context contains current open table's details
//

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Table, IFilter, Field } from '@/types';
import tableService from '@/lib/table';
import { dadixEvents } from '@/constants/events';
import { preferRealFieldName } from '@/lib/fieldNames';
import { getStoredLocale, t } from '@/lib/i18n';
import {
  DEV_DEMO_TABLE,
  DEV_DEMO_TABLE_2,
  DEV_DEMO_TABLE_2_ID,
  DEV_DEMO_TABLE_3,
  DEV_DEMO_TABLE_3_ID,
  DEV_DEMO_TABLE_4,
  DEV_DEMO_TABLE_4_ID,
  getDevDemoExtraFields,
  getDevDemoFieldOrder,
  getDevDemoFieldOverrides,
  isDevDemoProject,
  isDevDemoTable,
  isDevTable,
  isLocalDevProject,
  findLocalTable,
  upsertLocalTable,
  setDevDemoExtraFields,
  setDevDemoFieldOrder,
} from '@/lib/dev-demo-data';
import { UserLocalStorage } from '@/lib/userLocalStorage';
import { useEventHandler } from '@/hooks/useEventHandler';

export interface ITableContext {
  id: string | number | undefined;
  table: Table | undefined;
  filters: Record<number, IFilter[]>;
  isLoading: boolean;
  initialized: boolean;
  error: string;
  methods: {
    setFilters: (
      _filters:
        | Record<number, IFilter[]>
        | ((_filters: Record<number, IFilter[]>) => Record<number, IFilter[]>)
    ) => void;
  };
}

function mergeTableFields(previous: Field[] | undefined, incoming: Field[] | undefined): Field[] {
  const next = incoming ?? [];
  const prevById = new Map((previous ?? []).map((field) => [String(field.id), field]));
  return next.map((field) => {
    const old = prevById.get(String(field.id));
    if (!old) return field;
    return {
      ...old,
      ...field,
      name: preferRealFieldName(field.name, old.name),
    };
  });
}

const TableContext = createContext<ITableContext>({
  id: undefined,
  table: undefined,
  filters: {},
  isLoading: true,
  initialized: false,
  error: '',
  methods: {
    setFilters: (
      _filters:
        | Record<number, IFilter[]>
        | ((_filters: Record<number, IFilter[]>) => Record<number, IFilter[]>)
    ) => null,
  },
});

export function TableContextProvider({
  projectId,
  tableId,
  children,
}: {
  projectId: string;
  tableId: string | number | undefined;
  children: React.ReactNode;
}) {
  const tableIdRef = useRef<string | number | undefined>(undefined);
  const tableCacheRef = useRef<Record<string, Table>>({});
  const refetchGenRef = useRef(0);
  const [currentTable, setCurrentTable] = useState<Table | undefined>(
    undefined
  );
  const [initialized, setInetialized] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [filters, setFilters] = useState<Record<number, IFilter[]>>({});

  useEffect(() => {
    if (tableIdRef.current === tableId) return;
    const cacheKey = `${projectId}-${tableId}`;
    const cached = tableCacheRef.current[cacheKey];
    tableIdRef.current = tableId;
    setError('');
    if (cached && String(cached.id) === String(tableId)) {
      setCurrentTable(cached);
      setIsLoading(false);
      setInetialized(true);
    } else {
      setCurrentTable(undefined);
      setInetialized(false);
      setIsLoading(true);
    }
  }, [tableId, projectId]);

  useEffect(() => {
    if (initialized) return;
    if (!projectId) return;

    if (!tableId) {
      setInetialized(false);
      setIsLoading(false);
      setError('Table not found');
      return;
    }

    const cacheKey = `${projectId}-${tableId}`;
    const cached = tableCacheRef.current[cacheKey];

    if (cached && String(cached.id) === String(tableId)) {
      setCurrentTable(cached);
      UserLocalStorage.setTableId(`${tableId}`);
      setIsLoading(false);
      setInetialized(true);
    } else {
      setCurrentTable(undefined);
      setInetialized(false);
      setIsLoading(true);
    }
    setError('');
    const requestedTableId = tableId;

    if (isDevDemoProject(projectId)) {
      const baseTable =
        `${tableId}` === DEV_DEMO_TABLE_4_ID
          ? { ...DEV_DEMO_TABLE_4, fields: DEV_DEMO_TABLE_4.fields?.sort((a, b) => a.order - b.order) }
          : `${tableId}` === DEV_DEMO_TABLE_3_ID
            ? { ...DEV_DEMO_TABLE_3, fields: DEV_DEMO_TABLE_3.fields?.sort((a, b) => a.order - b.order) }
            : `${tableId}` === DEV_DEMO_TABLE_2_ID
              ? { ...DEV_DEMO_TABLE_2, fields: DEV_DEMO_TABLE_2.fields?.sort((a, b) => a.order - b.order) }
              : { ...DEV_DEMO_TABLE, fields: DEV_DEMO_TABLE.fields?.sort((a, b) => a.order - b.order) };
      const overrides = getDevDemoFieldOverrides(tableId as string);
      let fieldsWithOverrides = (baseTable.fields ?? []).map((f) => {
        const o = overrides[String(f.id)];
        if (!o) return f;
        const merged = { ...f, ...o };
        if ((merged.type === 'AI' || merged.type === 'FILE') && 'defaultValue' in merged) {
          const { defaultValue: _, ...rest } = merged;
          return rest as typeof merged;
        }
        return merged;
      });
      const extraFieldsRaw = getDevDemoExtraFields(tableId as string);
      const baseIds = new Set((baseTable.fields ?? []).map((f) => Number(f.id)));
      const extraFields = extraFieldsRaw.filter((f) => !baseIds.has(Number(f.id)));
      const seenExtraIds = new Set<number>();
      const extraDeduped = extraFields.filter((f) => {
        const id = Number(f.id);
        if (seenExtraIds.has(id)) return false;
        seenExtraIds.add(id);
        return true;
      });
      const extraWithOverrides = extraDeduped.map((f) => {
        const o = overrides[String(f.id)];
        return o ? { ...f, ...o } : f;
      });
      let allFields = [...fieldsWithOverrides, ...extraWithOverrides];
      const persistedOrder = getDevDemoFieldOrder(tableId as string);
      if (persistedOrder?.length && allFields.length > 0) {
        const orderMap: Record<number, number> = {};
        persistedOrder.forEach((id, i) => {
          orderMap[id] = i;
        });
        allFields = [...allFields]
          .sort((a, b) => (orderMap[a.id as number] ?? 999) - (orderMap[b.id as number] ?? 999))
          .map((f, i) => ({ ...f, order: i }));
      }
      const table = { ...baseTable, fields: allFields };
      tableCacheRef.current[cacheKey] = table;
      setCurrentTable(table);
      UserLocalStorage.setTableId(`${tableId}`);
      setIsLoading(false);
      setInetialized(true);
      return;
    }

    if (isDevTable(tableId) || isLocalDevProject(projectId)) {
      const localTable = findLocalTable(projectId, tableId);
      if (localTable) {
        tableCacheRef.current[cacheKey] = localTable;
        setCurrentTable(localTable);
        UserLocalStorage.setTableId(`${tableId}`);
        setIsLoading(false);
        setInetialized(true);
        return;
      }
    }

    tableService
      .getTable({
        tableId: `${tableId}`,
        projectId: projectId?.toString() || '',
      })
      .then((res) => {
        if (tableIdRef.current !== requestedTableId) {
          return;
        }
        const incoming = res.data as Table;
        const previous = tableCacheRef.current[cacheKey];
        const table = {
          ...incoming,
          fields: mergeTableFields(previous?.fields, incoming.fields)
            .sort((field1, field2) => field1.order - field2.order)
            .map((field, index) => ({ ...field, order: index })),
        };
        tableCacheRef.current[cacheKey] = table;
        setCurrentTable(table);
        UserLocalStorage.setTableId(`${tableId}`);
        setIsLoading(false);
        setInetialized(true);
        return;
      })
      .catch((err) => {
        if (tableIdRef.current !== requestedTableId) {
          return;
        }
        console.error('fetch error:', err);
        if (
          process.env.NODE_ENV === 'development' &&
          `${requestedTableId}`.startsWith('dev-table-')
        ) {
          const now = new Date().toISOString();
          const stub = {
            id: requestedTableId,
            name: t(getStoredLocale(), 'table.newTable'),
            icon: 'Table',
            userId: 'dev-user',
            projectId: projectId?.toString() || '',
            order: 0,
            fields: [],
            createdAt: now,
            updatedAt: now,
          };
          tableCacheRef.current[cacheKey] = stub as Table;
          setCurrentTable(stub as Table);
          UserLocalStorage.setTableId(`${requestedTableId}`);
        }
        setIsLoading(false);
        setInetialized(true);
        return;
      });
  }, [tableId, projectId, initialized]);

  // keep cache in sync whenever currentTable changes (e.g. from events)
  useEffect(() => {
    if (
      currentTable &&
      projectId &&
      tableId &&
      String(currentTable.id) === String(tableId)
    ) {
      tableCacheRef.current[`${projectId}-${tableId}`] = currentTable;
    }
  }, [currentTable, projectId, tableId]);

  // handle update table event
  useEventHandler(
    dadixEvents.tableEvents.onPatch,
    (evnt: Event) => {
      const detail = (evnt as CustomEvent).detail;
      if (String(tableIdRef.current) === String(detail.tableId)) {
        const { name, icon } = detail.data || {};
        setCurrentTable((currentTable) => {
          if (!currentTable) {
            return currentTable;
          }
          const updatedTable = { ...currentTable };
          if (name) {
            updatedTable.name = name;
          }
          if (icon) {
            updatedTable.icon = icon;
          }
          return updatedTable;
        });
      }
    },
    [tableId, currentTable]
  );

  // handle create table field event (e.g. from Hidden fields or Table Editor)
  useEventHandler(
    dadixEvents.tableEvents.onCreateField,
    (evnt: Event) => {
      const detail = (evnt as CustomEvent).detail;
      if (!detail?.data) return;
      const eventTableId = detail.tableId;
      if (eventTableId == null || String(tableIdRef.current) !== String(eventTableId)) {
        return;
      }
      setCurrentTable((currentTable) => {
        if (!currentTable) {
          return currentTable;
        }
        const newField = { ...detail.data };
        const orders = (currentTable.fields ?? []).map((f) => Number(f.order ?? 0));
        const nextOrder = orders.length > 0 ? Math.max(0, ...orders) + 1 : 0;
        if (newField.order == null || Number.isNaN(Number(newField.order))) {
          newField.order = nextOrder;
        }
        const existingIndex = (currentTable.fields || []).findIndex(
          (field) => String(field.id) === String(newField.id)
        );
        const fields =
          existingIndex >= 0
            ? (currentTable.fields || []).map((field, index) =>
                index === existingIndex
                  ? {
                      ...field,
                      ...newField,
                      name: preferRealFieldName(newField.name, field.name),
                    }
                  : field
              )
            : [...(currentTable.fields || []), newField];
        const updatedTable = {
          ...currentTable,
          fields,
        };
        const cacheKey = `${projectId}-${tableId}`;
        if (projectId && tableId != null) {
          tableCacheRef.current[cacheKey] = updatedTable;
        }
        if (isDevDemoTable(eventTableId)) {
          const extra = getDevDemoExtraFields(eventTableId as string);
          const alreadyExists = extra.some((f) => Number(f.id) === Number(newField.id));
          if (!alreadyExists) {
            setDevDemoExtraFields(eventTableId as string, [...extra, newField]);
          }
          setDevDemoFieldOrder(eventTableId as string, updatedTable.fields!.map((f) => Number(f.id)));
        } else if (isDevTable(eventTableId) || isLocalDevProject(projectId)) {
          upsertLocalTable(updatedTable);
        }
        return updatedTable;
      });
    },
    [tableId, currentTable, projectId]
  );

  // refetch table so Table Editor shows latest fields (e.g. after adding via Hidden fields)
  useEventHandler(
    dadixEvents.tableEvents.onRefetchTable,
    (evnt: Event) => {
      const requestedTableId = (evnt as CustomEvent).detail?.tableId;
      if (requestedTableId == null || String(tableIdRef.current) !== String(requestedTableId)) {
        return;
      }
      if (!projectId || !tableId) return;
      if (isDevDemoProject(projectId) || isDevTable(tableId) || isLocalDevProject(projectId)) return;

      const cacheKey = `${projectId}-${tableId}`;
      const gen = ++refetchGenRef.current;
      tableService
        .getTable({ tableId: `${tableId}`, projectId: projectId?.toString() || '' })
        .then((res) => {
          if (tableIdRef.current !== requestedTableId) return;
          if (gen !== refetchGenRef.current) return;
          const incoming = res.data as Table;
          setCurrentTable((prev) => {
            const table = {
              ...incoming,
              fields: mergeTableFields(prev?.fields ?? tableCacheRef.current[cacheKey]?.fields, incoming.fields)
                .sort((field1, field2) => field1.order - field2.order)
                .map((field, index) => ({ ...field, order: index })),
            };
            tableCacheRef.current[cacheKey] = table;
            return table;
          });
        })
        .catch((err) => {
          console.error('Table refetch failed:', err);
        });
    },
    [projectId, tableId]
  );

  // handle update table field event
  useEventHandler(
    dadixEvents.tableEvents.onPatchField,
    (evnt: Event) => {
      const detail = (evnt as CustomEvent).detail;
      if (String(tableIdRef.current) === String(detail.tableId)) {
        setCurrentTable((currentTable) => {
          if (!currentTable) {
            return currentTable;
          }
          const fieldsToBeUpdated = {
            [`${detail.fieldId}`]: { ...detail.data },
          };
          const fieldsAttributesToBeUpdated = Object.keys(detail.data);

          if (fieldsAttributesToBeUpdated.indexOf('order') >= 0) {
            const reorderFrom =
              currentTable.fields?.filter(
                (field) => `${field.id}` === `${detail.fieldId}`
              )[0]?.order ?? 0;
            const reorderTo = detail.data.order ?? 0;
            if (reorderFrom === reorderTo) return currentTable;
            const reorderDirection = Math.sign(reorderFrom - reorderTo);
            const minOrder = Math.min(reorderFrom, reorderTo);
            const maxOrder = Math.max(reorderFrom, reorderTo);
            currentTable.fields?.map((field) => {
              if (`${field.id}` === `${detail.fieldId}`) return null;
              if (field.order < minOrder || field.order > maxOrder) return null;
              fieldsToBeUpdated[`${field.id}`] = {
                ...(fieldsToBeUpdated[`${field.id}`] || {}),
                order: field.order + reorderDirection,
              };
              return null;
            });
          }
          const updatedTable = {
            ...currentTable,
            fields: currentTable.fields
              ?.map((field) => {
                if (fieldsToBeUpdated[`${field.id}`]) {
                  return { ...field, ...fieldsToBeUpdated[`${field.id}`] };
                }
                return field;
              })
              .sort((field1, field2) => field1.order - field2.order),
          };
          if (
            isDevDemoTable(detail.tableId) &&
            updatedTable.fields?.length
          ) {
            setDevDemoFieldOrder(
              String(detail.tableId),
              updatedTable.fields.map((f) => Number(f.id))
            );
          }
          const cacheKey = `${projectId}-${tableId}`;
          if (projectId && tableId != null) {
            tableCacheRef.current[cacheKey] = updatedTable;
          }
          return updatedTable;
        });
      }
    },
    [tableId, currentTable, projectId]
  );

  // handle delete table field event
  useEventHandler(
    dadixEvents.tableEvents.onDeleteField,
    (evnt: Event) => {
      const detail = (evnt as CustomEvent).detail;
      if (String(tableIdRef.current) === String(detail.tableId)) {
        setCurrentTable((currentTable) => {
          if (!currentTable) {
            return currentTable;
          }
          const updatedTable = {
            ...currentTable,
            fields: currentTable.fields
              ?.filter((field) => field.id !== detail.fieldId)
              .sort((field1, field2) => field1.order - field2.order)
              .map((field, index) => ({ ...field, order: index })),
          };
          const cacheKey = `${projectId}-${tableId}`;
          if (projectId && tableId != null) {
            tableCacheRef.current[cacheKey] = updatedTable;
          }
          if (isDevDemoTable(detail.tableId) && updatedTable.fields?.length != null) {
            const extra = getDevDemoExtraFields(detail.tableId as string).filter(
              (f) => Number(f.id) !== Number(detail.fieldId)
            );
            setDevDemoExtraFields(detail.tableId as string, extra);
            setDevDemoFieldOrder(detail.tableId as string, updatedTable.fields.map((f) => Number(f.id)));
          }
          return updatedTable;
        });
      }
    },
    [tableId, currentTable, projectId]
  );

  useEventHandler(
    dadixEvents.tableEvents.onDelete,
    (evnt: Event) => {
      const deletedTableId = (evnt as CustomEvent).detail?.tableId;
      if (deletedTableId == null) return;
      delete tableCacheRef.current[`${projectId}-${deletedTableId}`];
      if (String(tableIdRef.current) !== String(deletedTableId)) return;
      setCurrentTable(undefined);
      setError('Table not found');
      setIsLoading(false);
      setInetialized(true);
    },
    [projectId]
  );

  // handle create table field option event
  useEventHandler(
    dadixEvents.tableEvents.onCreateFieldOption,
    (evnt: Event) => {
      const { tableId, fieldId, data } = (evnt as CustomEvent).detail;
      if (!tableId || !fieldId || !data) return;
      if (tableIdRef.current !== tableId) return;
      setCurrentTable((currentTable) => {
        if (!currentTable) {
          return currentTable;
        }
        const updatedTable = {
          ...currentTable,
          fields: currentTable.fields?.map((field) => {
            if (`${field.id}` !== `${fieldId}`) return { ...field };
            return {
              ...field,
              options: [...(field.options || []), { ...data }],
            };
          }),
        };
        return updatedTable;
      });
    },
    [tableId, currentTable]
  );

  // handle update table field option event
  useEventHandler(
    dadixEvents.tableEvents.onPatchFieldOption,
    (evnt: Event) => {
      const { tableId, fieldId, optionId, data } = (evnt as CustomEvent).detail;
      if (!tableId || !fieldId || !optionId || !data) return;
      if (String(tableIdRef.current) === String(tableId)) {
        setCurrentTable((currentTable) => {
          if (!currentTable) {
            return currentTable;
          }
          const fieldOptionsToBeUpdated = {
            [`${optionId}`]: { ...data },
          };
          const fieldOptionsAttributesToBeUpdated = Object.keys(data);

          if (fieldOptionsAttributesToBeUpdated.indexOf('order') >= 0) {
            const targetField = currentTable.fields?.filter(
              (field) => `${field.id}` === `${fieldId}`
            )[0];
            const reorderFrom =
              targetField?.options?.filter(
                (option) => `${option.id}` === `${optionId}`
              )[0]?.order ?? 0;
            const reorderTo = data.order ?? 0;
            if (reorderFrom === reorderTo) return currentTable;
            const reorderDirection = Math.sign(reorderFrom - reorderTo);
            const minOrder = Math.min(reorderFrom, reorderTo);
            const maxOrder = Math.max(reorderFrom, reorderTo);
            targetField?.options?.map((option) => {
              if (`${option.id}` === `${optionId}`) return null;
              if (option.order < minOrder || option.order > maxOrder)
                return null;
              fieldOptionsToBeUpdated[`${option.id}`] = {
                ...(fieldOptionsToBeUpdated[`${option.id}`] || {}),
                order: option.order + reorderDirection,
                value: option.value,
              };
              return null;
            });
          }
          const updatedTable = {
            ...currentTable,
            fields: currentTable.fields?.map((field) => {
              if (`${field.id}` !== `${fieldId}`) return { ...field };
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
          return updatedTable;
        });
      }
    },
    [tableId, currentTable]
  );

  // handle delete table field option event
  useEventHandler(
    dadixEvents.tableEvents.onDeleteFieldOption,
    (evnt: Event) => {
      const { tableId, fieldId, optionId } = (evnt as CustomEvent).detail;
      if (!optionId || !fieldId || !tableId) return;
      if (tableIdRef.current !== tableId) return;
      setCurrentTable((currentTable) => {
        if (!currentTable) {
          return currentTable;
        }
        return {
          ...currentTable,
          fields: (currentTable?.fields || []).map((field) => {
            if (`${field.id}` === `${fieldId}`) {
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
    [tableId, currentTable]
  );

  // handle update table formula field event
  useEventHandler(
    dadixEvents.tableEvents.onPatchFieldFormula,
    (evnt: Event) => {
      const { tableId: evTableId, columnId, value } = (evnt as CustomEvent).detail || {};
      if (tableIdRef.current !== evTableId) return;

      setCurrentTable((currentTable) => {
        if (!currentTable) return currentTable;
        const updatedTable = {
          ...currentTable,
          fields: currentTable.fields
            ?.map((field) => {
              if (`${field.id}` === `${columnId}`) {
                return { ...field, formula: value };
              }
              return field;
            })
            .sort((field1, field2) => field1.order - field2.order),
        };
        const cacheKey = `${projectId}-${tableId}`;
        if (projectId && tableId != null) {
          tableCacheRef.current[cacheKey] = updatedTable;
        }
        return updatedTable;
      });
    },
    [tableId, currentTable, projectId]
  );

  // handle update table text field options event
  useEventHandler(
    dadixEvents.tableEvents.onPatchTextFieldOptions,
    (evnt: Event) => {
      const { tableId: evTableId, columnId, data } = (evnt as CustomEvent).detail || {};
      if (tableIdRef.current !== evTableId) return;

      setCurrentTable((currentTable) => {
        if (!currentTable) return currentTable;
        const updatedTable = {
          ...currentTable,
          fields: currentTable.fields
            ?.map((field) => {
              if (`${field.id}` === `${columnId}`) {
                return {
                  ...field,
                  textOptions: { ...field.textOptions, ...data },
                };
              }
              return field;
            })
            .sort((field1, field2) => field1.order - field2.order),
        };
        const cacheKey = `${projectId}-${tableId}`;
        if (projectId && tableId != null) {
          tableCacheRef.current[cacheKey] = updatedTable;
        }
        return updatedTable;
      });
    },
    [tableId, currentTable, projectId]
  );

  // handle update table number field options event
  useEventHandler(
    dadixEvents.tableEvents.onPatchNumberFieldOptions,
    (evnt: Event) => {
      const { tableId: evTableId, columnId, data } = (evnt as CustomEvent).detail || {};
      if (tableIdRef.current !== evTableId) return;

      setCurrentTable((currentTable) => {
        if (!currentTable) return currentTable;
        const updatedTable = {
          ...currentTable,
          fields: currentTable.fields
            ?.map((field) => {
              if (`${field.id}` === `${columnId}`) {
                return {
                  ...field,
                  numberOptions: { ...field.numberOptions, ...data },
                };
              }
              return field;
            })
            .sort((field1, field2) => field1.order - field2.order),
        };
        const cacheKey = `${projectId}-${tableId}`;
        if (projectId && tableId != null) {
          tableCacheRef.current[cacheKey] = updatedTable;
        }
        return updatedTable;
      });
    },
    [tableId, currentTable, projectId]
  );

  // handle update table relation field options event
  useEventHandler(
    dadixEvents.tableEvents.onPatchRelationFieldOptions,
    (evnt: Event) => {
      const { tableId: evTableId, columnId, data } = (evnt as CustomEvent).detail || {};
      if (tableIdRef.current !== evTableId) return;

      setCurrentTable((currentTable) => {
        if (!currentTable) return currentTable;
        const updatedTable = {
          ...currentTable,
          fields: currentTable.fields
            ?.map((field) => {
              if (`${field.id}` === `${columnId}`) {
                return {
                  ...field,
                  relationOptions: { ...field.relationOptions, ...data },
                };
              }
              return field;
            })
            .sort((field1, field2) => field1.order - field2.order),
        };
        const cacheKey = `${projectId}-${tableId}`;
        if (projectId && tableId != null) {
          tableCacheRef.current[cacheKey] = updatedTable;
        }
        return updatedTable;
      });
    },
    [tableId, currentTable, projectId]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    (window as Window & { __dadixTableFields?: string[] }).__dadixTableFields =
      (currentTable?.fields ?? []).map((field) => `${field.id}:${field.name}:${field.type}`);
  }, [currentTable]);

  return (
    <TableContext.Provider
      value={{
        id: tableId || undefined,
        table: currentTable,
        filters,
        isLoading,
        initialized,
        error,
        methods: {
          setFilters,
        },
      }}
    >
      {children}
    </TableContext.Provider>
  );
}

export function useTableContext() {
  const context = useContext(TableContext);
  if (context === undefined) {
    throw new Error(
      'useTableContext must be used within a TableContextProvider'
    );
  }
  return context;
}
