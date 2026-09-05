import type { Field } from '@/types';
import * as XLSX from 'xlsx';

function escapeCsvValue(val: unknown): string {
  if (val == null) return '';
  const s = String(val);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function getOrderedFieldNames(fields: Field[] | undefined): string[] {
  if (!fields?.length) return [];
  return [...fields]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((f) => f.name);
}

export function exportToCSV(
  records: Record<string, unknown>[],
  fields: Field[] | undefined,
  tableName: string
): void {
  const names = getOrderedFieldNames(fields);
  const header = names.join(',');
  const rows = records.map((r) =>
    names.map((name) => escapeCsvValue(r[name])).join(',')
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, `${slug(tableName)}.csv`);
}

export function exportToJSON(
  records: Record<string, unknown>[],
  tableName: string
): void {
  const json = JSON.stringify(records, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  downloadBlob(blob, `${slug(tableName)}.json`);
}

export function exportToExcel(
  records: Record<string, unknown>[],
  fields: Field[] | undefined,
  tableName: string
): void {
  const names = getOrderedFieldNames(fields);
  const rows = records.map((r) => names.map((name) => r[name] ?? ''));
  const ws = XLSX.utils.aoa_to_sheet([names, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, tableName.slice(0, 31));
  XLSX.writeFile(wb, `${slug(tableName)}.xlsx`);
}

function slug(name: string): string {
  return name.replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-') || 'export';
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
