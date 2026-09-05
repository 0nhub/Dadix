/**
 * AI completion client: batch completion via backend, prompt template with #FieldName replacement.
 */

import { callApi } from './api';
import type { Field } from '@/types';
import type { AIFieldOutputType } from '@/types';
import { getAIApiKeyById } from './aiApiKeys';
import recordControllers from './record';

export const AI_BATCH_SIZE_STORAGE_KEY = 'dadix-ai-batch-size';
const DEFAULT_BATCH_SIZE = 10;

export function getAIBatchSize(): number {
  if (typeof window === 'undefined') return DEFAULT_BATCH_SIZE;
  try {
    const raw = localStorage.getItem(AI_BATCH_SIZE_STORAGE_KEY);
    if (raw == null) return DEFAULT_BATCH_SIZE;
    const n = parseInt(raw, 10);
    return Number.isNaN(n) || n < 1 ? DEFAULT_BATCH_SIZE : Math.min(50, Math.max(1, n));
  } catch {
    return DEFAULT_BATCH_SIZE;
  }
}

export function setAIBatchSize(size: number): void {
  if (typeof window === 'undefined') return;
  const n = Math.min(50, Math.max(1, Math.floor(size)));
  localStorage.setItem(AI_BATCH_SIZE_STORAGE_KEY, String(n));
}

export interface AICompleteItem {
  prompt: string;
  outputType: AIFieldOutputType;
}

export interface AICompleteConfig {
  provider: string;
  apiKey: string;
  model?: string;
}

/**
 * Replace #FieldName in prompt with record[fieldName].
 * Field names are case-sensitive in the template; record keys are matched by name.
 */
export function buildPromptWithContext(
  template: string,
  record: Record<string, unknown>,
  fieldNames: string[]
): string {
  let out = template;
  for (const name of fieldNames) {
    const value = record[name];
    const str = value == null ? '' : String(value).trim();
    const regex = new RegExp(
      `#${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
      'g'
    );
    out = out.replace(regex, str);
  }
  return out;
}

/**
 * Call backend POST /ai/complete with batch of items; returns array of result strings.
 */
function getApiErrorMessage(err: unknown): string {
  const ax = err as { response?: { data?: { message?: string }; status?: number } };
  if (ax?.response?.data?.message) return ax.response.data.message;
  if (ax?.response?.status === 401) return 'Not authenticated or session expired.';
  if (ax?.response?.status === 500) return ax?.response?.data?.message ?? 'Server error on AI request.';
  return err instanceof Error ? err.message : String(err);
}

export async function completeBatch(
  items: AICompleteItem[],
  config: AICompleteConfig
): Promise<string[]> {
  if (!items.length) return [];
  const res = await callApi.post<{ results: string[] }>('/ai/complete', {
    items: items.map(({ prompt, outputType }) => ({ prompt, outputType })),
    provider: config.provider || 'openai',
    apiKey: config.apiKey,
    model: config.model,
  });
  const data = res?.data;
  if (!data || !Array.isArray(data.results)) {
    throw new Error('Invalid AI complete response');
  }
  return data.results;
}

export interface FillAICellsResult {
  filled: number;
  errors: string[];
}

/**
 * Find all empty AI cells, batch by batchSize, call AI and patch records.
 * Each AI field uses its own apiKeyId (selected in field setup).
 */
export async function fillEmptyAICells({
  tableId,
  tableFields,
  records,
  batchSize,
}: {
  tableId: string | number;
  tableFields: Field[];
  records: Record<string, unknown>[];
  batchSize: number;
}): Promise<FillAICellsResult> {
  const allFieldNames = tableFields.map((f) => f.name);
  const aiFields = tableFields.filter(
    (f): f is Field & { aiOptions: NonNullable<Field['aiOptions']> } =>
      f.type === 'AI' && f.aiOptions?.prompt != null
  );
  if (aiFields.length === 0) return { filled: 0, errors: [] };

  const tasks: Array<{
    recordId: string | number;
    record: Record<string, unknown>;
    fieldName: string;
    prompt: string;
    outputType: AIFieldOutputType;
    apiKeyId: string;
  }> = [];
  for (const record of records) {
    const recordId = record.id;
    if (recordId == null) continue;
    for (const field of aiFields) {
      const val = record[field.name];
      if (val != null && String(val).trim() !== '') continue;
      const prompt = buildPromptWithContext(
        field.aiOptions.prompt,
        record,
        allFieldNames
      );
      tasks.push({
        recordId,
        record,
        fieldName: field.name,
        prompt,
        outputType: field.aiOptions.outputType ?? 'TEXT',
        apiKeyId: field.aiOptions.apiKeyId ?? '',
      });
    }
  }
  if (tasks.length === 0) return { filled: 0, errors: [] };

  const errors: string[] = [];
  let filled = 0;
  // Group tasks by apiKeyId so we use the correct key per batch
  const byKey = new Map<string, typeof tasks>();
  for (const t of tasks) {
    const k = t.apiKeyId || '__none__';
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(t);
  }
  for (const [, keyTasks] of byKey) {
    const first = keyTasks[0];
    const keyEntry = first?.apiKeyId ? getAIApiKeyById(first.apiKeyId) : undefined;
    if (!keyEntry?.key) {
      errors.push('No API key set for this field. Select a key in the AI field setup.');
      continue;
    }
    for (let i = 0; i < keyTasks.length; i += batchSize) {
      const batch = keyTasks.slice(i, i + batchSize);
      try {
        const results = await completeBatch(
          batch.map((t) => ({ prompt: t.prompt, outputType: t.outputType })),
          {
            provider: keyEntry.provider || 'openai',
            apiKey: keyEntry.key,
            model: keyEntry.model,
          }
        );
        for (let j = 0; j < batch.length; j++) {
          const task = batch[j];
          const value = results[j] ?? '';
          await recordControllers.patchRecord({
            tableId,
            recordId: task.recordId,
            updatedRecordData: { [task.fieldName]: value },
            silence: false,
          });
          filled++;
        }
      } catch (err) {
        errors.push(getApiErrorMessage(err));
      }
    }
  }
  return { filled, errors };
}
