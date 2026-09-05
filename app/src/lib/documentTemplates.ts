import type { DocumentTemplate } from '@/types';

const STORAGE_PREFIX = 'dadix-document-templates';

function storageKey(tableId: string | number): string {
  return `${STORAGE_PREFIX}-${tableId}`;
}

export function getDocumentTemplates(tableId: string | number): DocumentTemplate[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey(String(tableId)));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getDocumentTemplate(
  tableId: string | number,
  templateId: string
): DocumentTemplate | null {
  const list = getDocumentTemplates(tableId);
  return list.find((t) => t.id === templateId) ?? null;
}

export function saveDocumentTemplate(
  tableId: string | number,
  template: Omit<DocumentTemplate, 'updatedAt'> & { updatedAt?: string }
): DocumentTemplate[] {
  const list = getDocumentTemplates(tableId);
  const updatedAt = new Date().toISOString();
  const toSave: DocumentTemplate = {
    ...template,
    tableId,
    updatedAt,
  };
  const idx = list.findIndex((t) => t.id === toSave.id);
  const next = idx >= 0 ? [...list] : [...list, toSave];
  if (idx >= 0) next[idx] = toSave;
  try {
    window.localStorage.setItem(storageKey(String(tableId)), JSON.stringify(next));
  } catch {}
  return next;
}

export function deleteDocumentTemplate(
  tableId: string | number,
  templateId: string
): DocumentTemplate[] {
  const list = getDocumentTemplates(tableId).filter((t) => t.id !== templateId);
  try {
    window.localStorage.setItem(storageKey(String(tableId)), JSON.stringify(list));
  } catch {}
  return list;
}

export function generateTemplateId(): string {
  return `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
