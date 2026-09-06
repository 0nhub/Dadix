import type {
  Field,
  IDadixGridViewField,
  NumberFieldOptions,
  RelationFieldOptions,
  TextFieldOptions,
} from '@/types';
import { callApi } from './api';
import { dadixEvents } from '@/constants/events';
import { getTableViews } from './view';
import {
  createLocalTable,
  findLocalTable,
  findLocalTableById,
  getLocalProjectTables,
  isDevDemoTable,
  isDevTable,
  isLocalDevProject,
  setDevDemoFieldOrder,
  persistTableFieldAction,
  setDevDemoFieldOverride,
  upsertLocalTable,
} from './dev-demo-data';

function announceCreatedTable(projectId: string, createdTable: unknown) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(dadixEvents.tableEvents.onCreate, {
      detail: { projectId, createdTable },
    })
  );
  window.dispatchEvent(new CustomEvent(dadixEvents.tableEvents.onRefetchTables));
}

async function withDefaultView<T extends { id?: string | number; defaultViewId?: string | number }>(
  createdTable: T
): Promise<T> {
  if (createdTable.defaultViewId != null || createdTable.id == null) {
    return createdTable;
  }
  try {
    const viewsRes = await getTableViews({ tableId: String(createdTable.id) });
    const first = (viewsRes as { views?: Array<{ id: string | number }> }).views?.[0];
    if (first?.id != null) {
      return { ...createdTable, defaultViewId: first.id };
    }
  } catch {
    // Default view is created in core; a later views fetch will pick it up.
  }
  return createdTable;
}

async function createTable({
  projectId,
  name,
  icon,
  silent = false,
  sourceKind = 'local',
  filePath,
  fileFormat,
  connection,
}: {
  projectId: string;
  name: string;
  icon: string;
  silent?: boolean;
  sourceKind?: 'local' | 'linked_file' | 'external_database';
  filePath?: string;
  fileFormat?: string;
  connection?: Record<string, unknown>;
}) {
  if (process.env.NODE_ENV === 'development' && isLocalDevProject(projectId)) {
    const mockTable = createLocalTable(projectId, name, icon);
    if (!silent) announceCreatedTable(projectId, mockTable);
    return mockTable;
  }
  const result = await callApi.post('/table', {
    projectId,
    name: name.trim(),
    icon,
    sourceKind,
    filePath,
    fileFormat,
    connection,
  });
  if (result.status !== 201)
    throw new Error(result?.data?.message || 'Error creating table');
  const createdTable = await withDefaultView({ ...result.data });
  if (!silent) {
    announceCreatedTable(projectId, createdTable);
  }
  return createdTable;
}

async function getTables({ projectId }: { projectId: string }) {
  if (isLocalDevProject(projectId)) {
    return getLocalProjectTables(projectId);
  }
  const response = await callApi.get(`/table?projectId=${projectId}`);
  if (!response) {
    return [];
  }
  if (Array.isArray(response.data)) {
    return response.data;
  }
  if (Array.isArray(response.data?.tables)) {
    return response.data.tables;
  }
  return [];
}

async function getTable({
  tableId,
  projectId,
}: {
  tableId: string;
  projectId: string;
}) {
  if (isLocalDevProject(projectId) || isDevDemoTable(tableId) || isDevTable(tableId)) {
    const table = findLocalTable(projectId, tableId);
    if (table) {
      return { data: table };
    }
  }
  return await callApi.get(`/table/${tableId}?projectId=${projectId}`);
}

async function patchTable({
  tableId,
  projectId,
  data,
  silent = false,
}: {
  tableId: string;
  projectId: string;
  data: {
    icon?: string | undefined;
    name?: string | undefined;
    order?: number | undefined;
  };
  silent?: boolean;
}) {
  const res = await callApi.patch(`/table/${tableId}?projectId=${projectId}`, {
    data,
  });
  if (res.status !== 200)
    throw new Error(res.data.message || 'Error updating table');

  if (!silent) {
    window.dispatchEvent(
      new CustomEvent(dadixEvents.tableEvents.onPatch, {
        detail: {
          tableId,
          projectId,
          data,
        },
        bubbles: false,
        cancelable: false,
      })
    );
  }

  return res;
}

async function deleteTable({
  tableId,
  projectId,
  silent = false,
}: {
  tableId: string;
  projectId: string;
  silent?: boolean;
}) {
  const deleteTableResult = await callApi.delete(
    `/table/${tableId}?projectId=${projectId}`
  );
  if (deleteTableResult.status !== 200) {
    throw new Error(deleteTableResult.data?.message || 'Error deleting table');
  }
  if (!silent) {
    window.dispatchEvent(
      new CustomEvent(dadixEvents.tableEvents.onDelete, {
        detail: {
          tableId,
          projectId,
        },
      })
    );
  }
  return deleteTableResult;
}

async function createTableField({
  tableId,
  fieldData,
}: {
  tableId: string;
  fieldData: Partial<Field>;
}) {
  const isDevDemo = process.env.NODE_ENV === 'development' && isDevDemoTable(tableId);
  const isDevOnlyTable = process.env.NODE_ENV === 'development' && String(tableId).startsWith('dev-table-');

  if (isDevDemo || isDevOnlyTable) {
    const order =
      typeof (fieldData as Record<string, unknown>).order === 'number'
        ? (fieldData as Record<string, unknown>).order as number
        : 0;
    const id = 100000 + Math.floor(Math.random() * 899999);
    const type = (fieldData.type || 'TEXT') as Field['type'];
    const mockField: Field = {
      id,
      name: (fieldData.name || 'Feld').trim(),
      type,
      size: type === 'TEXT' ? 255 : type === 'FILE' ? 180 : 0,
      order,
      options: type === 'CHOICE' ? [] : undefined,
      isVisible: true,
      contentAlign: 'left',
      action: type === 'FILE' ? 'edit' : null,
    };
    if (fieldData.textOptions) mockField.textOptions = fieldData.textOptions;
    if (fieldData.relationOptions) mockField.relationOptions = fieldData.relationOptions;
    if (fieldData.placeholder !== undefined) mockField.placeholder = fieldData.placeholder;
    if (fieldData.defaultValue !== undefined && type !== 'AI' && type !== 'FILE') mockField.defaultValue = fieldData.defaultValue;
    if (type === 'AI') mockField.aiOptions = fieldData.aiOptions ?? { prompt: '', outputType: 'TEXT', apiKeyId: '' };
    if (isDevOnlyTable) {
      const table = findLocalTableById(tableId);
      if (table) {
        upsertLocalTable({
          ...table,
          fields: [...(table.fields ?? []), mockField],
        });
      }
    }
    return { status: 201, data: mockField };
  }

  const name = String(fieldData.name ?? '').trim();
  const typeName = String(fieldData.type ?? 'TEXT');
  if (!name) {
    throw new Error(`FIELD_CREATE_FAILED table_id=${tableId} type=${typeName} reason=name is required`);
  }
  try {
    const res = await callApi.post(`/column`, {
      tableId,
      name,
      type: typeName,
      options: fieldData.options || undefined,
      ...(typeName === 'FILE' ? { action: 'edit', size: 180 } : {}),
    });
    return res;
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    if (/^[A-Z][A-Z0-9_]+/.test(raw)) throw err;
    throw new Error(`FIELD_CREATE_FAILED table_id=${tableId} type=${typeName} reason=${raw}`);
  }
}

async function patchTableField({
  tableId,
  id,
  field,
  silent = false,
  optimistic = false,
  devFieldOrder,
}: {
  tableId: string;
  id: number;
  field: Partial<Field>;
  silent?: boolean;
  optimistic?: boolean;
  /** In dev: persist this field order so Table Editor and Open Record stay in sync (localStorage). */
  devFieldOrder?: number[];
}) {
  const isDev =
    process.env.NODE_ENV === 'development' &&
    (isDevDemoTable(tableId) || isDevTable(tableId));

  if (isDev) {
    if ('placeholder' in field || 'defaultValue' in field || 'aiOptions' in field) {
      setDevDemoFieldOverride(tableId, id, {
        placeholder: field.placeholder,
        defaultValue: field.defaultValue,
        aiOptions: field.aiOptions,
      });
    }
    if ('action' in field) {
      persistTableFieldAction(tableId, id, field.action ?? null);
    }
    if (devFieldOrder?.length && isDevDemoTable(tableId)) {
      setDevDemoFieldOrder(tableId, devFieldOrder);
    }
    if (isDevTable(tableId)) {
      const table = findLocalTableById(tableId);
      if (table?.fields) {
        upsertLocalTable({
          ...table,
          fields: table.fields.map((item) =>
            Number(item.id) === Number(id) ? { ...item, ...field } : item
          ),
        });
      }
    }
    // Always dispatch so TableContext and UI update (even when silent)
    window.dispatchEvent(
      new CustomEvent(dadixEvents.tableEvents.onPatchField, {
        detail: { tableId, fieldId: id, data: { ...field } },
      })
    );
    return { status: 200, data: {} };
  }

  if (optimistic && !silent) {
    dispatchUpdateEvent();
  }

  const res = await callApi.patch(`/column/${id}`, {
    tableId,
    data: { ...field },
  });

  if (res.status === 200 && !silent && !optimistic) {
    dispatchUpdateEvent();
  }

  return res;

  function dispatchUpdateEvent() {
    window.dispatchEvent(
      new CustomEvent(dadixEvents.tableEvents.onPatchField, {
        detail: {
          tableId,
          fieldId: id,
          data: { ...field },
        },
      })
    );
  }
}

async function deleteTableField({
  tableId,
  id,
}: {
  tableId: string;
  id: number;
}) {
  if (process.env.NODE_ENV === 'development' && isDevDemoTable(tableId)) {
    return { status: 200, data: {} };
  }
  return await callApi.delete(`/column/${id}?tableId=${tableId}`);
}

async function createTableFieldOption({
  tableId,
  fieldId,
  optionData,
}: {
  tableId: string;
  fieldId: string | number;
  optionData: Partial<{ value: string; color: string }>;
}) {
  const res = await callApi.post(`/tag`, {
    tableId,
    columnId: fieldId,
    value: optionData.value,
    color: optionData.color,
  });
  return res;
}

async function patchTableFieldOption({
  tableId,
  fieldId,
  optionId,
  optionData,
}: {
  tableId: string;
  fieldId: string | number;
  optionId: string | number;
  optionData: Partial<{ value: string; color: string; order: number }>;
}) {
  const res = await callApi.patch(`/tag/${optionId}`, {
    tableId,
    columnId: fieldId,
    data: { ...optionData },
  });

  return res;
}

async function deleteTableFieldOption({
  tableId,
  fieldId,
  id,
}: {
  tableId: string;
  fieldId: number | string;
  id: number;
}) {
  const res = await callApi.delete(
    `/tag/${id}?columnId=${fieldId}&tableId=${tableId}`
  );

  return res;
}

async function patchTableFieldFormula({
  tableId,
  fieldId,
  newValue,
  silent = false,
}: {
  tableId: string;
  fieldId: string | number;
  newValue: string;
  silent?: boolean;
}) {
  if (process.env.NODE_ENV === 'development' && isDevDemoTable(tableId)) {
    setDevDemoFieldOverride(tableId, Number(fieldId), { formula: newValue ?? '' });
    if (!silent) {
      window.dispatchEvent(
        new CustomEvent(dadixEvents.tableEvents.onPatchFieldFormula, {
          detail: {
            tableId,
            columnId: fieldId,
            value: newValue,
          },
        })
      );
    }
    return { status: 200, data: {} };
  }

  const res = await callApi.patch('/column/formula', {
    tableId,
    columnId: fieldId,
    value: newValue || '',
  });

  if (!silent) {
    window.dispatchEvent(
      new CustomEvent(dadixEvents.tableEvents.onPatchFieldFormula, {
        detail: {
          tableId,
          columnId: fieldId,
          value: newValue,
        },
      })
    );
  }

  return res;
}

async function patchTableTextFieldOptions({
  tableId,
  fieldId,
  data,
  silent = false,
}: {
  tableId: string | number;
  fieldId: number;
  data: Partial<TextFieldOptions>;
  silent?: boolean;
}) {
  const res = await callApi.patch('/column/text-options', {
    tableId,
    columnId: fieldId,
    data,
  });

  if (res.status === 200 && !silent) {
    window.dispatchEvent(
      new CustomEvent(dadixEvents.tableEvents.onPatchTextFieldOptions, {
        detail: {
          tableId,
          columnId: fieldId,
          data,
        },
      })
    );
  }

  return res;
}

async function patchTableFieldNumberOptions({
  tableId,
  fieldId,
  data,
  silent = false,
}: {
  tableId: string | number;
  fieldId: number;
  data: Partial<NumberFieldOptions>;
  silent?: boolean;
}) {
  const res = await callApi.patch('/column/number-options', {
    tableId,
    columnId: fieldId,
    data,
  });

  if (res.status === 200 && !silent) {
    window.dispatchEvent(
      new CustomEvent(dadixEvents.tableEvents.onPatchNumberFieldOptions, {
        detail: {
          tableId,
          columnId: fieldId,
          data,
        },
      })
    );
  }

  return res;
}

async function patchTableRelationFieldOptions({
  tableId,
  fieldId,
  data,
  silent = false,
}: {
  tableId: string | number;
  fieldId: number;
  data: Partial<RelationFieldOptions>;
  silent?: boolean;
}) {
  const res = await callApi.patch('/column/relation-options', {
    tableId,
    columnId: fieldId,
    data,
  });

  if (res.status === 200 && !silent) {
    window.dispatchEvent(
      new CustomEvent(dadixEvents.tableEvents.onPatchRelationFieldOptions, {
        detail: {
          tableId,
          columnId: fieldId,
          data,
        },
      })
    );
  }

  return res;
}

async function getRelationTableViewFields({
  relatedToTableWithId,
  relationId,
}: {
  relatedToTableWithId: string;
  relationId: number;
}) {
  const res = await callApi.get(
    `/column/relation-options/${relationId}/relation-table-view-column?tableId=${relatedToTableWithId}`
  );

  return res;
}

async function patchRelationTableViewField({
  relatedToTableWithId,
  relationId,
  tableFieldId,
  id,
  data,
  silent = false,
}: {
  relatedToTableWithId: string;
  relationId: number;
  tableFieldId: number;
  id: number;
  data: Partial<IDadixGridViewField>;
  silent?: boolean;
}) {
  const res = await callApi.patch(
    `/column/relation-options/relation-table-view-column/${id}`,
    {
      relationId,
      tableId: relatedToTableWithId,
      tableColumnId: tableFieldId,
      data,
    }
  );

  if (res.status === 200 && !silent) {
    data.id = res.data.id;
    window.dispatchEvent(
      new CustomEvent(dadixEvents.tableEvents.onPatchRelationTableViewField, {
        detail: {
          relatedToTableWithId,
          relationId,
          id,
          data,
        },
      })
    );
  }

  return res;
}

const tableService = {
  createTable,
  getTable,
  getTables,
  patchTable,
  deleteTable,
  /* -------------- */
  createTableField,
  patchTableField,
  deleteTableField,
  /* -------------- */
  createTableFieldOption,
  patchTableFieldOption,
  deleteTableFieldOption,
  /* -------------- */
  patchTableFieldFormula,
  /* -------------- */
  patchTableTextFieldOptions,
  patchTableFieldNumberOptions,
  /* -------------- */
  patchTableRelationFieldOptions,
  getRelationTableViewFields,
  patchRelationTableViewField,
};

export default tableService;
