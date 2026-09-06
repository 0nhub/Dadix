/** Shared name rules for table fields. Never invent "Feld" when a real name exists. */

export function isGenericFieldName(name: unknown): boolean {
  const value = String(name ?? '').trim();
  return !value || value === 'Feld' || value === 'Field';
}

export function preferRealFieldName(incoming: unknown, existing?: unknown): string {
  const next = String(incoming ?? '').trim();
  const prev = String(existing ?? '').trim();
  if (!isGenericFieldName(next)) return next;
  if (!isGenericFieldName(prev)) return prev;
  return next || prev;
}

export function renameRecordFieldKey(
  record: Record<string, unknown>,
  from: string,
  to: string
): Record<string, unknown> {
  if (!from || !to || from === to) return record;
  if (!Object.prototype.hasOwnProperty.call(record, from)) return record;
  const next = { ...record };
  if (next[to] === undefined) next[to] = next[from];
  delete next[from];
  return next;
}
