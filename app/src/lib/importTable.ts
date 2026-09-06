import * as XLSX from 'xlsx';

export type ImportKind = 'csv' | 'json' | 'excel';

export function detectImportKind(file: File): ImportKind {
  const name = file.name.toLowerCase();
  if (name.endsWith('.json') || file.type === 'application/json') return 'json';
  if (
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    file.type.includes('spreadsheet') ||
    file.type === 'application/vnd.ms-excel'
  ) {
    return 'excel';
  }
  return 'csv';
}

export function isAcceptedImportFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith('.csv') ||
    name.endsWith('.json') ||
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    file.type === 'text/csv' ||
    file.type === 'text/plain' ||
    file.type === 'application/json' ||
    file.type.includes('spreadsheet') ||
    file.type === 'application/vnd.ms-excel'
  );
}

function cellToString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function parseJsonImport(text: string): {
  headers: string[];
  rows: string[][];
} {
  const parsed = JSON.parse(text);
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.records)
      ? parsed.records
      : Array.isArray(parsed?.rows)
        ? parsed.rows
        : Array.isArray(parsed?.data)
          ? parsed.data
          : null;
  if (!list || list.length === 0) {
    throw new Error('JSON must contain an array of objects');
  }
  if (list.some((item) => item == null || typeof item !== 'object' || Array.isArray(item))) {
    throw new Error('JSON array must contain objects');
  }
  const headerSet = new Set<string>();
  for (const item of list as Record<string, unknown>[]) {
    for (const key of Object.keys(item)) {
      if (key === 'id' || key === 'createdAt' || key === 'updatedAt') continue;
      headerSet.add(key);
    }
  }
  const headers = [...headerSet];
  if (headers.length === 0) {
    throw new Error('No importable columns found in JSON');
  }
  const rows = (list as Record<string, unknown>[]).map((item) =>
    headers.map((header) => cellToString(item[header]))
  );
  return { headers, rows };
}

export async function parseExcelFile(file: File): Promise<{
  headers: string[];
  rows: string[][];
}> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Excel file has no sheets');
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | Date | null)[]>(
    sheet,
    { header: 1, raw: false, defval: '' }
  );
  const lines = matrix.filter((row) =>
    row.some((cell) => String(cell ?? '').trim() !== '')
  );
  if (lines.length === 0) throw new Error('Excel sheet is empty');
  const headers = lines[0].map((cell, index) => {
    const label = String(cell ?? '').trim();
    return label || `Column ${index + 1}`;
  });
  const rows = lines.slice(1).map((row) =>
    headers.map((_, index) => cellToString(row[index]))
  );
  return { headers, rows };
}
