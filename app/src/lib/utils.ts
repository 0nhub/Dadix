import { availableDadixFieldsDataTypes } from '@/constants';
import { validateDadixCode } from '@/lib/dadixCodeEval';
import type {
  Field,
  IDadixGridViewField,
  IFilter,
  ISortingRule,
} from '@/types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export async function copyText(text: string) {
  return await navigator.clipboard.writeText(text);
}

export function filtersToString(
  filters: IFilter[],
  tableFields: Field[]
): string {
  let stringifyedFilter = '';
  const orFiltersGroup = [];
  let andFiltersGroup = [];
  for (let i = filters.length - 1; i >= 0; i--) {
    const filter = filters[i];
    const field = tableFields.filter(
      (field) => `${field.id}` === `${filter.fieldId}`
    )[0];
    if (!field) continue;
    if (!filter.value) continue;

    let filterOperation;
    let date;
    const h23m59s59 = (23 * 60 * 60 + 59 * 60 + 59) * 1000; // 23:59:59 in ms
    switch (filter.operation) {
      case 'notnull':
      case 'isnull':
        // handle operators that doesn't need a value
        filterOperation = `${filter.operation}(${field.name})`;
        break;
      default:
        switch (field.type) {
          case 'TEXT':
          case 'CHOICE':
            // handle string value
            if (filter.operation === 'in') {
              filterOperation = `${filter.operation}(${field.name},${filter.value})`;
            } else {
              filterOperation = `${filter.operation}(${field.name},"${filter.value.replaceAll('"', '\\"')}")`;
            }
            break;
          case 'DATE':
            // handle date value
            date = new Date(filter.value);
            date.setHours(0);
            date.setMinutes(0);
            date.setSeconds(0);
            date.setMilliseconds(0);
            switch (filter.operation) {
              case 'eq':
                filterOperation = `and(lte(${field.name}, '${new Date(date.getTime() + h23m59s59).toISOString()}'),gte(${field.name}, '${date.toISOString()}'))`;
                break;
              case 'neq':
                filterOperation = `or(gte(${field.name}, '${new Date(date.getTime() + h23m59s59).toISOString()}'),lte(${field.name}, '${date.toISOString()}'))`;
                break;
              case 'lte':
                filterOperation = `lte(${field.name}, '${new Date(date.getTime() + h23m59s59).toISOString()}')`;
                break;
              case 'gte':
                filterOperation = `gte(${field.name}, '${date.toISOString()}')`;
                break;
            }
            break;
          default:
            filterOperation = `${filter.operation}(${field.name},${filter.value})`;
        }
    }
    if (filter.relation === 'or') {
      if (andFiltersGroup.length > 0) {
        orFiltersGroup.unshift(
          `and(${filterOperation},${andFiltersGroup.join(',')})`
        );
        andFiltersGroup = [];
      } else {
        orFiltersGroup.unshift(`${filterOperation}`);
      }
    } else {
      andFiltersGroup.unshift(`${filterOperation}`);
    }
  }
  if (andFiltersGroup.length > 0) {
    orFiltersGroup.unshift(`and(${andFiltersGroup.join(',')})`);
  }
  if (orFiltersGroup.length > 1) {
    stringifyedFilter = `or(${orFiltersGroup.join(',')})`;
  } else {
    stringifyedFilter = `${orFiltersGroup[0] || ''}`;
  }
  return stringifyedFilter;
}

export function viewFieldToTableField(field: IDadixGridViewField): Field {
  return {
    id: field.fieldId,
    name: field.fieldName,
    isVisible: field.isVisible,
    order: field.fieldOrder,
    size: field.size,
    type: field.type,
    contentAlign: field.contentAlign,
    formula: field.formula,
    options: field.options,
    choiceMode: field.choiceMode,
    textOptions: field.textOptions,
    numberOptions: field.numberOptions,
    relationOptions: field.relationOptions,
    action: field.action,
  };
}

let evalFormulaWorker: Worker | undefined = undefined;
export async function evalFormula({
  formula,
  record,
  fieldId,
  fields,
}: {
  formula: string;
  record: Record<string, unknown>;
  fieldId: number;
  fields: Field[];
}): Promise<string> {
  return await new Promise((resolve, _reject) => {
    try {
      if (Worker) {
        if (!evalFormulaWorker) {
          evalFormulaWorker = new Worker('/js/workers/formulaEvalWorker.js');
        }

        formula = parseFormula({ formula, fields, record });
        evalFormulaWorker.postMessage({
          formula,
          record,
          fieldId,
          fields,
        });
        evalFormulaWorker.addEventListener('message', (evnt: Event) => {
          const { data } = (evnt as MessageEvent) || {};
          if (data.recordId !== record.id || data.fieldId !== fieldId) return;
          resolve(data?.result);
        });
        evalFormulaWorker.addEventListener('error', (e) => {
          console.error(e);
          resolve('');
        });
      } else {
        resolve('');
      }
    } catch (err) {
      console.error(err);
      resolve('');
    }
  });
}

export function parseFormula({
  formula,
  fields,
  record,
}: {
  formula: string;
  fields: Field[];
  record?: Record<string, unknown>;
}): string {
  fields = fields.sort(
    (field1, field2) => field2.name.length - field1.name.length
  );
  fields.map((field) => {
    switch (field.type) {
      case availableDadixFieldsDataTypes.TEXT:
        formula = formula.replaceAll(
          `#${field.name}`,
          `\`\${record[\`${field.name}\`]}\``
        );
        break;
      case availableDadixFieldsDataTypes.DATE:
        formula = formula.replaceAll(
          `#${field.name}`,
          `new Date(\`\${record[\`${field.name}\`]}\`).getTime()`
        );
        break;
      case availableDadixFieldsDataTypes.FORMULA:
        formula = formula.replaceAll(
          `#${field.name}`,
          `(${parseFormula({
            fields: fields.filter((f) => f.id !== field.id),
            formula: field.formula || '',
            record,
          })})`
        );
        break;
      case availableDadixFieldsDataTypes.CODE:
        if (record != null) {
          const { valid, result: value } = validateDadixCode({
            code: field.formula || '',
            record,
            fields,
          });
          const jsValue = valid ? (Number.isNaN(Number(value)) ? 0 : Number(value)) : 0;
          formula = formula.replaceAll(`#${field.name}`, String(jsValue));
        } else {
          formula = formula.replaceAll(
            `#${field.name}`,
            `record[\`${field.name}\`]`
          );
        }
        break;
      default:
        formula = formula.replaceAll(
          `#${field.name}`,
          `record[\`${field.name}\`]`
        );
    }
    return null;
  });
  return formula;
}

let filterWorker: Worker | undefined = undefined;

function getFilterWorker(): Worker | undefined {
  if (typeof Worker === 'undefined') return undefined;
  if (!filterWorker) {
    try {
      filterWorker = new Worker('/js/workers/filterWorker.js');
    } catch {
      return undefined;
    }
  }
  return filterWorker;
}

/** Fast sync path for a single like(fieldName,"value") or and(like(...)) filter. */
function applySimpleLikeFilterSync(
  filter: string,
  records: Record<string, unknown>[]
): boolean[] | null {
  const trimmed = filter.trim();
  const inner = trimmed.startsWith('and(') && trimmed.endsWith(')')
    ? trimmed.slice(4, -1).trim()
    : trimmed;
  const m = inner.match(/^like\(\s*([^,)]+)\s*,\s*"((?:[^"\\]|\\.)*)"\s*\)$/);
  if (!m) return null;
  const fieldName = m[1].trim();
  const search = (m[2] || '').toLowerCase();
  if (!search) return records.map(() => true);
  return records.map((record) => {
    const v = record[fieldName];
    const s = (v == null ? '' : String(v)).toLowerCase();
    return s.includes(search);
  });
}

/** Filter many records in one worker call (much faster than one call per record). */
export function applyFilterToRecordsBatch({
  filter,
  records,
  fields,
}: {
  filter: string;
  records: Record<string, unknown>[];
  fields: Field[];
}): Promise<boolean[]> {
  const syncResults = applySimpleLikeFilterSync(filter, records);
  if (syncResults) return Promise.resolve(syncResults);

  return new Promise((resolve) => {
    const worker = getFilterWorker();
    if (!worker || !records.length) {
      resolve(records.map(() => true));
      return;
    }
    const id = `batch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const onMessage = (evnt: MessageEvent) => {
      const { data } = evnt;
      if (data?.id !== id || !Array.isArray(data.results)) return;
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      resolve(data.results);
    };
    const onError = () => {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      resolve(records.map(() => true));
    };
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.postMessage({ type: 'batch', id, records, fields, filter });
  });
}

export async function applyFilterToRecord({
  filter,
  record,
  fields,
}: {
  filter: string;
  record: Record<string, unknown>;
  fields: Field[];
}): Promise<boolean> {
  return await new Promise((resolve) => {
    try {
      const worker = getFilterWorker();
      if (!worker) {
        resolve(false);
        return;
      }
      const id = `${new Date().getTime()}${Math.floor(Math.random() * 999)}${Math.floor(Math.random() * 999)}`;
      worker.postMessage({
        id,
        filter,
        record,
        fields,
      });
      const onMessage = (evnt: Event) => {
        const { data } = (evnt as MessageEvent) || {};
        if (data.recordId !== record.id || data.id !== id) return;
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        resolve(data?.result);
      };
      const onError = () => {
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        resolve(false);
      };
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
    } catch (err) {
      console.error(err);
      resolve(false);
    }
  });
}

/**
 * Sort records by the first sorting rule (client-side). Use when all records are loaded (limit -1).
 */
export function sortRecordsByRule(
  records: Record<string, unknown>[],
  sortingRules: ISortingRules,
  viewFields: { fieldId: number; fieldName?: string; name?: string; type?: string }[]
): Record<string, unknown>[] {
  const rule = Array.isArray(sortingRules) ? sortingRules[0] : undefined;
  if (!rule?.fieldId || !rule?.direction || !viewFields?.length) return records;
  const sortField = viewFields.find((f) => f.fieldId === rule.fieldId);
  const fieldName = sortField?.fieldName ?? sortField?.name ?? 'id';
  const fieldType = (sortField?.type ?? 'TEXT').toUpperCase();
  const dir = rule.direction === 'DESC' ? -1 : 1;

  return [...records].sort((a, b) => {
    let aVal: number | string = a[fieldName] as number | string;
    let bVal: number | string = b[fieldName] as number | string;
    if (fieldType === 'DATE') {
      aVal = aVal != null ? new Date(aVal as string).getTime() : 0;
      bVal = bVal != null ? new Date(bVal as string).getTime() : 0;
      return ((aVal as number) - (bVal as number)) * dir;
    }
    if (fieldType === 'INTEGER' || fieldType === 'SERIAL') {
      aVal = Number(aVal) ?? 0;
      bVal = Number(bVal) ?? 0;
      return ((aVal as number) - (bVal as number)) * dir;
    }
    aVal = aVal != null ? String(aVal) : '';
    bVal = bVal != null ? String(bVal) : '';
    return (aVal as string).localeCompare(bVal as string, undefined, { numeric: true }) * dir;
  });
}

let sortingWorker: Worker | undefined = undefined;
export async function applySortingRuleToRecord({
  records,
  record,
  recordIndex,
  tableFields,
  sortingRule,
}: {
  records: Record<string, unknown>[];
  record: Record<string, unknown>;
  recordIndex: number;
  tableFields: Field[];
  sortingRule: ISortingRule | undefined;
}): Promise<number> {
  return await new Promise((resolve) => {
    if (!sortingRule || !sortingRule.fieldId || !sortingRule.direction)
      sortingRule = { fieldId: -1, direction: 'ASC' };

    const sortingByField = tableFields.find(
      (field) => field.id === sortingRule?.fieldId
    ) || { id: -1, name: 'id', type: 'SERIAL' };

    const lastRecord =
      recordIndex === records.length - 1
        ? records[records.length - 2]
        : records[records.length - 1];
    if (!lastRecord) return resolve(recordIndex);
    let recordValue, lastRecordValue;
    switch (sortingByField.type) {
      case 'DATE':
        recordValue = new Date(record[sortingByField.name] as string).getTime();
        lastRecordValue = new Date(
          lastRecord[sortingByField.name] as string
        ).getTime();
        break;
      case 'INTEGER':
      case 'SERIAL':
        recordValue = record[sortingByField.name] as number;
        lastRecordValue = lastRecord[sortingByField.name] as number;
        break;
      default:
        recordValue = record[sortingByField.name] as string;
        lastRecordValue = lastRecord[sortingByField.name] as string;
    }

    const doesItMeetSortingRule =
      sortingRule.direction === 'DESC'
        ? lastRecordValue < recordValue
        : lastRecordValue > recordValue;
    if (!doesItMeetSortingRule) return resolve(-1);
    // get new record index after applying sorting rule
    try {
      if (Worker) {
        if (!sortingWorker) {
          sortingWorker = new Worker('/js/workers/sortingWorker.js');
        }
        const id = `${new Date().getTime()}${Math.floor(Math.random() * 999)}${Math.floor(Math.random() * 999)}`;
        sortingWorker.postMessage({
          id,
          sortingRule,
          record,
          records,
          tableFields,
        });
        sortingWorker.addEventListener('message', (evnt: Event) => {
          const { data } = (evnt as MessageEvent) || {};
          if (data.recordId !== record.id || data.id !== id) return;
          resolve(data?.newRecordIndex ?? -1);
        });
        sortingWorker.addEventListener('error', (e) => {
          console.error(e);
          resolve(-1);
        });
      } else {
        resolve(-1);
      }
    } catch (err) {
      console.error(err);
      resolve(-1);
    }
  });
}

export function isEncodedRelationData(relationData: string): boolean {
  return (relationData || '').indexOf('relation_') === 0;
}

export function encodeRelationData({
  tableId,
  relationId,
  recordId,
  relatedToTableWithId,
}: {
  tableId: string;
  relationId: number;
  recordId: number;
  relatedToTableWithId: string;
}): string {
  return `relation_${relationId}_${tableId}_${recordId}_${relatedToTableWithId}`;
}

export function decodeRelationData(relationData: string): {
  tableId: string;
  relationId: number;
  recordId: number;
  relatedToTableWithId: string;
} {
  if (!isEncodedRelationData(relationData))
    throw new Error(`error parsing relationData: ${relationData}`);
  const [_pref, relationId, tableId, recordId, relatedToTableWithId] = (
    relationData || ''
  ).split('_');
  return {
    tableId,
    relationId: parseInt(relationId),
    recordId: parseInt(recordId),
    relatedToTableWithId,
  };
}

/**
 * Build initial record data from field default values.
 * For DATE fields, defaultValue "TODAY" is resolved to today's date (ISO string).
 */
export function getDefaultRecordData(fields: Field[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!fields?.length) return out;
  const today = new Date().toISOString().split('T')[0];
  for (const field of fields) {
    if (field.type === 'AI') continue;
    const dv = field.defaultValue;
    if (dv === undefined || dv === '') continue;
    if (field.type === 'DATE' && dv === 'TODAY') {
      out[field.name] = today;
      continue;
    }
    if (field.type === 'INTEGER') {
      const n = Number(dv);
      out[field.name] = Number.isNaN(n) ? dv : n;
      continue;
    }
    if (field.type === 'BOOLEAN') {
      out[field.name] = dv === 'true';
      continue;
    }
    out[field.name] = dv;
  }
  return out;
}
