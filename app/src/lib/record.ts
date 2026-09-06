import { apiBase } from '@/constants';
import { callApi } from './api';
import { dadixEvents } from '@/constants/events';
import {
  decodeRelationData,
  encodeRelationData,
  isEncodedRelationData,
} from './utils';
import {
  DEV_DEMO_TABLE_2_ID,
  DEV_DEMO_TABLE_3_ID,
  DEV_DEMO_TABLE_4_ID,
  isDevDemoTable,
  getDevDemoRecords,
  getDevDemo2Records,
  getDevDemo3Records,
  getDevDemo4Records,
  setDevDemoRecords,
  setDevDemo2Records,
  setDevDemo3Records,
  setDevDemo4Records,
  isDevTable,
  getDevTableRecords,
  setDevTableRecords,
} from './dev-demo-data';

async function createRecord({
  tableId,
  projectId,
  recordData,
}: {
  tableId: string | number;
  projectId: string;
  recordData?: Partial<Record<string, unknown>>;
}) {
  if (isDevDemoTable(tableId)) {
    const isTable4 = String(tableId) === DEV_DEMO_TABLE_4_ID;
    const isTable3 = String(tableId) === DEV_DEMO_TABLE_3_ID;
    const isTable2 = String(tableId) === DEV_DEMO_TABLE_2_ID;
    const records = isTable4 ? getDevDemo4Records() : isTable3 ? getDevDemo3Records() : isTable2 ? getDevDemo2Records() : getDevDemoRecords();
    const setRecords = isTable4 ? setDevDemo4Records : isTable3 ? setDevDemo3Records : isTable2 ? setDevDemo2Records : setDevDemoRecords;
    const nextId = records.length > 0 ? Math.max(...records.map((r) => Number(r.id) || 0)) + 1 : 1;
    const now = new Date().toISOString();
    const created = { id: nextId, ...recordData, createdAt: now, updatedAt: now } as Record<string, unknown>;
    const next = [...records, created];
    setRecords(next);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(dadixEvents.recordEvents.onCreate, {
          detail: { createdRecord: created, tableId, projectId },
        })
      );
    }
    return created;
  }
  if (isDevTable(tableId)) {
    const records = getDevTableRecords(tableId as string);
    const nextId = records.length > 0 ? Math.max(...records.map((r) => Number(r.id) || 0)) + 1 : 1;
    const now = new Date().toISOString();
    const created = { id: nextId, ...recordData, createdAt: now, updatedAt: now } as Record<string, unknown>;
    const next = [...records, created];
    setDevTableRecords(tableId as string, next);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(dadixEvents.recordEvents.onCreate, {
          detail: { createdRecord: created, tableId, projectId },
        })
      );
    }
    return created;
  }
  const response = await callApi.post('/record', {
    tableId,
    data: { ...recordData },
  });
  if (response.status !== 201) {
    throw new Error('Error create record');
  }
  if (response.data && Array.isArray(response.data) && response.data[0]) {
    window.dispatchEvent(
      new CustomEvent(dadixEvents.recordEvents.onCreate, {
        detail: {
          createdRecord: response.data[0],
          tableId,
          projectId,
        },
      })
    );
    return response.data[0];
  }
  throw new Error('Error create record');
}

async function createRelatedRecord({
  tableId,
  recordId,
  relationId,
  relatedToTableWithId,
  relateToRecordWithId,
  silence = false,
}: {
  tableId: string;
  recordId: number;
  relationId: number;
  relatedToTableWithId: string;
  relateToRecordWithId: number;
  silence?: boolean;
}) {
  const response = await callApi.post(`/record/${recordId}/related`, {
    tableId,
    relatedToTableWithId,
    relateToRecordWithId,
    relationId,
  });
  if (response.status !== 201) {
    throw new Error('Error create relation');
  }
  if (response.data) {
    window.dispatchEvent(
      new CustomEvent(dadixEvents.recordEvents.onCreate, {
        detail: {
          createdRecord: response.data,
          tableId: encodeRelationData({
            tableId,
            recordId,
            relationId,
            relatedToTableWithId,
          }),
        },
      })
    );
    return response.data;
  }
  throw new Error('Error create relation');
}

async function getRecordsByOffset({
  tableId,
  limit = 100,
  offset = 0,
  filter = '',
  order = 'ASC',
  orderBy = 'id',
  sort,
}: {
  tableId: string;
  limit?: number;
  offset?: number;
  filter?: string;
  order?: 'ASC' | 'DESC';
  orderBy?: string;
  sort?: string;
}) {
  if (tableId.indexOf('relation_') === 0) {
    const {
      recordId,
      tableId: relationTableId,
      relatedToTableWithId,
      relationId,
    } = decodeRelationData(tableId);
    return getRelatedRecordsByOffset({
      recordId,
      relatedToTableWithId,
      relationId,
      tableId: relationTableId,
      limit,
      offset,
      order,
    });
  }
  const sortQuery = sort ? `&sort=${encodeURIComponent(sort)}` : '';
  const response = await callApi.get(
    `/record?tableId=${tableId}&limit=${limit}&offset=${offset}&filter=${filter}&order=${order}&orderBy=${orderBy}${sortQuery}`
  );
  if (response.status !== 200) {
    throw new Error('Error get table records');
  }
  if (
    response.data &&
    response.data.records &&
    Array.isArray(response.data.records)
  ) {
    return response.data;
  }
  throw new Error('Error get table records');
}

async function getRelatedRecordsByOffset({
  tableId,
  relatedToTableWithId,
  relationId,
  recordId,
  limit = 100,
  offset = 0,
  filter = '',
  order = 'ASC',
}: {
  tableId: string;
  relatedToTableWithId: string;
  relationId: number;
  recordId: number;
  limit?: number;
  offset?: number;
  filter?: string;
  order?: 'ASC' | 'DESC';
}) {
  const response = await callApi.get(
    `/record/${recordId}/related?tableId=${tableId}&relatedToTableWithId=${relatedToTableWithId}&relationId=${relationId}&filter=${filter}&limit=${limit}&offset=${offset}&order=${order}`
  );
  if (response.status !== 200) {
    throw new Error('Error get table records');
  }
  if (
    response.data &&
    response.data.records &&
    Array.isArray(response.data.records)
  ) {
    return response.data;
  }
  throw new Error('Error get record related records');
}

async function getRecords({
  tableId,
  mode = 'fullData',
}: {
  tableId: string;
  mode?: 'fullData' | 'pagination';
}) {
  if (mode === 'pagination') {
    const response = await callApi.get(`/record?tableId=${tableId}`);
    if (
      response.data &&
      response.data.records &&
      Array.isArray(response.data.records)
    ) {
      return response.data?.records || [];
    }
    return [];
  }

  // get all records
  const response = await fetch(`${apiBase}/record/all?tableId=${tableId}`, {
    method: 'GET',
    credentials: 'include',
  });
  if (!response || !response.body) {
    return;
  }
  const reader = response.body.getReader(); // Create a reader for the stream
  const decoder = new TextDecoder('utf-8'); // Create a text decoder
  let records: Record<string, unknown>[] = [];

  const endChunkText = '--end-data-chunk--';
  let recivedData = '';
  while (true) {
    const result = await reader.read();
    if (result.done) {
      break;
    }
    recivedData += decoder.decode(result.value, {
      stream: true,
    });
    let indexOfEndOfChunk = recivedData.indexOf(endChunkText);
    while (indexOfEndOfChunk >= 0) {
      const chunk = recivedData.substring(0, indexOfEndOfChunk);
      records = [...records, ...JSON.parse(chunk || '[]')];
      recivedData = recivedData.substring(
        indexOfEndOfChunk + endChunkText.length
      );
      indexOfEndOfChunk = recivedData.indexOf(endChunkText);
    }
  }
  return records;
}

/** Get all records for a table (handles dev demo/tables; use for export). */
export async function getAllRecordsForExport(
  tableId: string | number
): Promise<Record<string, unknown>[]> {
  const id = String(tableId);
  if (isDevDemoTable(tableId)) {
    const isTable4 = id === DEV_DEMO_TABLE_4_ID;
    const isTable3 = id === DEV_DEMO_TABLE_3_ID;
    const isTable2 = id === DEV_DEMO_TABLE_2_ID;
    const records = isTable4
      ? getDevDemo4Records()
      : isTable3
        ? getDevDemo3Records()
        : isTable2
          ? getDevDemo2Records()
          : getDevDemoRecords();
    return Promise.resolve([...records]);
  }
  if (isDevTable(tableId)) {
    return Promise.resolve([...getDevTableRecords(id)]);
  }
  const result = await getRecords({ tableId: id });
  return Array.isArray(result) ? result : [];
}

async function updateRecord({
  tableId,
  recordId,
  updatedRecordData,
  silence = false,
}: {
  tableId: string | number;
  recordId: string | number;
  updatedRecordData?: Partial<Record<string, unknown>>;
  silence?: boolean;
}) {
  if (isEncodedRelationData(tableId as string)) {
    tableId = decodeRelationData(tableId as string).relatedToTableWithId;
  }
  if (isDevDemoTable(tableId)) {
    const isTable4 = String(tableId) === DEV_DEMO_TABLE_4_ID;
    const isTable3 = String(tableId) === DEV_DEMO_TABLE_3_ID;
    const isTable2 = String(tableId) === DEV_DEMO_TABLE_2_ID;
    const records = isTable4 ? getDevDemo4Records() : isTable3 ? getDevDemo3Records() : isTable2 ? getDevDemo2Records() : getDevDemoRecords();
    const setRecords = isTable4 ? setDevDemo4Records : isTable3 ? setDevDemo3Records : isTable2 ? setDevDemo2Records : setDevDemoRecords;
    const idx = records.findIndex((r) => `${r.id}` === `${recordId}`);
    if (updatedRecordData) {
      const now = new Date().toISOString();
      const next = [...records];
      if (idx >= 0) {
        next[idx] = { ...records[idx], ...updatedRecordData, updatedAt: now };
      } else {
        next.push({ id: recordId, ...updatedRecordData, createdAt: now, updatedAt: now });
      }
      setRecords(next);
      if (!silence && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent(dadixEvents.recordEvents.onChange, {
            detail: { tableId, recordId, updatedRecordData },
          })
        );
      }
    }
    return { status: 201, data: {} };
  }
  if (isDevTable(tableId)) {
    const records = getDevTableRecords(tableId as string);
    const idx = records.findIndex((r) => `${r.id}` === `${recordId}`);
    if (updatedRecordData) {
      const now = new Date().toISOString();
      const next = [...records];
      if (idx >= 0) {
        next[idx] = { ...records[idx], ...updatedRecordData, updatedAt: now };
      } else {
        next.push({ id: recordId, ...updatedRecordData, createdAt: now, updatedAt: now });
      }
      setDevTableRecords(tableId as string, next);
      if (!silence && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent(dadixEvents.recordEvents.onChange, {
            detail: { tableId, recordId, updatedRecordData },
          })
        );
      }
    }
    return { status: 201, data: {} };
  }
  const response = await callApi.patch(`/record/${recordId}`, {
    tableId,
    data: { ...updatedRecordData },
  });
  if (!silence && response.status === 201 && response.data) {
    window.dispatchEvent(
      new CustomEvent(dadixEvents.recordEvents.onChange, {
        detail: {
          tableId,
          recordId,
          updatedRecordData,
        },
      })
    );
  }
  return response;
}

async function deleteRecord({
  id,
  tableId,
  silence = false,
}: {
  id: string | number;
  tableId: string | number;
  silence?: boolean;
}) {
  if (isEncodedRelationData(tableId as string)) {
    tableId = decodeRelationData(tableId as string).relatedToTableWithId;
  }
  if (isDevDemoTable(tableId)) {
    const isTable4 = String(tableId) === DEV_DEMO_TABLE_4_ID;
    const isTable3 = String(tableId) === DEV_DEMO_TABLE_3_ID;
    const isTable2 = String(tableId) === DEV_DEMO_TABLE_2_ID;
    const records = (isTable4 ? getDevDemo4Records() : isTable3 ? getDevDemo3Records() : isTable2 ? getDevDemo2Records() : getDevDemoRecords()).filter((r) => `${r.id}` !== `${id}`);
    (isTable4 ? setDevDemo4Records : isTable3 ? setDevDemo3Records : isTable2 ? setDevDemo2Records : setDevDemoRecords)(records);
    if (!silence && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(dadixEvents.recordEvents.onDelete, {
          detail: { tableId, ids: [`${id}`] },
        })
      );
    }
    return { status: 200, data: {} };
  }
  if (isDevTable(tableId)) {
    const records = getDevTableRecords(tableId as string).filter((r) => `${r.id}` !== `${id}`);
    setDevTableRecords(tableId as string, records);
    if (!silence && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(dadixEvents.recordEvents.onDelete, {
          detail: { tableId, ids: [`${id}`] },
        })
      );
    }
    return { status: 200, data: {} };
  }
  const res = await callApi.delete(`/record/${id}?tableId=${tableId}`);
  if (res.status !== 200) {
    throw new Error(res.data?.message || 'Error deleting selected rows');
  }
  if (!silence) {
    window.dispatchEvent(
      new CustomEvent(dadixEvents.recordEvents.onDelete, {
        detail: { tableId, ids: [`${id}`] },
      })
    );
  }
  return res;
}

async function deleteRecords({
  ids,
  tableId,
  silence = false,
}: {
  ids: (string | number)[];
  tableId: string | number | undefined;
  silence?: boolean;
}) {
  if (!tableId || !ids || ids.length === 0) {
    return;
  }
  if (isEncodedRelationData(tableId as string)) {
    tableId = decodeRelationData(tableId as string).relatedToTableWithId;
  }
  if (isDevDemoTable(tableId)) {
    const isTable4 = String(tableId) === DEV_DEMO_TABLE_4_ID;
    const isTable3 = String(tableId) === DEV_DEMO_TABLE_3_ID;
    const isTable2 = String(tableId) === DEV_DEMO_TABLE_2_ID;
    const set = new Set(ids.map((i) => `${i}`));
    const records = (isTable4 ? getDevDemo4Records() : isTable3 ? getDevDemo3Records() : isTable2 ? getDevDemo2Records() : getDevDemoRecords()).filter((r) => !set.has(`${r.id}`));
    (isTable4 ? setDevDemo4Records : isTable3 ? setDevDemo3Records : isTable2 ? setDevDemo2Records : setDevDemoRecords)(records);
    if (!silence && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(dadixEvents.recordEvents.onDelete, {
          detail: { tableId, ids },
        })
      );
    }
    return;
  }
  if (isDevTable(tableId)) {
    const set = new Set(ids.map((i) => `${i}`));
    const records = getDevTableRecords(tableId as string).filter((r) => !set.has(`${r.id}`));
    setDevTableRecords(tableId as string, records);
    if (!silence && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(dadixEvents.recordEvents.onDelete, {
          detail: { tableId, ids },
        })
      );
    }
    return;
  }
  const res = await callApi.delete(
    `/record/?tableId=${tableId}&ids=${ids.join(',')}`
  );
  if (!silence) {
    window.dispatchEvent(
      new CustomEvent(dadixEvents.recordEvents.onDelete, {
        detail: { tableId, ids },
      })
    );
  }
  return res;
}

async function deleteRelatedRecord({
  tableId,
  recordId,
  relationId,
  relationRecordId,
  relatedToTableWithId,
  relatedToRecordWithId,
  silence = false,
}: {
  tableId: string;
  recordId: number;
  relationId: number;
  relationRecordId: number;
  relatedToTableWithId: string;
  relatedToRecordWithId: number;
  silence?: boolean;
}) {
  const response = await callApi.delete(
    `/record/${recordId}/related?tableId=${tableId}&relatedToRecordWithId=${relatedToRecordWithId}&relationId=${relationId}&relationRecordId=${relationRecordId}`
  );
  if (response.status !== 200) {
    throw new Error('Error disconnect record');
  }
  if (!silence) {
    window.dispatchEvent(
      new CustomEvent(dadixEvents.recordEvents.onDelete, {
        detail: {
          tableId: encodeRelationData({
            relationId,
            tableId,
            recordId,
            relatedToTableWithId,
          }),
          ids: [`${relatedToRecordWithId}`],
          relationRecordsIds: [`${relationRecordId}`],
        },
      })
    );
  }
  return response;
}

const recordService = {
  createRecord,
  createRelatedRecord,
  getRecordsByOffset,
  getRelatedRecordsByOffset,
  getRecords,
  updateRecord,
  patchRecord: updateRecord,
  deleteRecord,
  deleteRecords,
  deleteRelatedRecord,
};

export default recordService;
