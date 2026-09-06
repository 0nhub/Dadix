'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  LucideArrowLeft,
  LucideDownload,
  LucideFileJson,
  LucideFileSpreadsheet,
  LucideFileText,
  LucideUpload,
  LucideX,
} from 'lucide-react';
import { parseCsvText, readFileAsText, type CsvParseOptions } from '@/lib/csvParse';
import {
  applyFilterToRecordsBatch,
  filtersToString,
  getDefaultRecordData,
  sortRecordsByRule,
} from '@/lib/utils';
import recordService, { getAllRecordsForExport } from '@/lib/record';
import { exportToCSV, exportToExcel, exportToJSON } from '@/lib/exportTable';
import {
  detectImportKind,
  isAcceptedImportFile,
  parseExcelFile,
  parseJsonImport,
  type ImportKind,
} from '@/lib/importTable';
import { toast } from 'sonner';
import { useTableContext } from '@/context/TableContext';
import { useTableViewsContext } from '@/context/TableViewsContext';
import type { Field, IFilter, ISortingRule, ISortingRules } from '@/types';
import { cn } from '@/lib/utils';

const PREVIEW_ROWS = 20;
const ACCEPT =
  '.csv,.json,.xlsx,.xls,text/csv,text/plain,application/csv,application/json,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const CHARSET_OPTIONS: { value: string; label: string }[] = [
  { value: 'UTF-8', label: 'UTF-8 (Unicode)' },
  { value: 'macintosh', label: 'Mac Roman' },
  { value: 'windows-1252', label: 'Windows Latin 1 CP1252' },
  { value: 'windows-1250', label: 'Windows Latin 2 CP1250' },
  { value: 'windows-1251', label: 'Windows Cyrillic CP1251' },
  { value: 'windows-1253', label: 'Windows Greek CP1253' },
  { value: 'windows-1254', label: 'Windows Turkish CP1254' },
  { value: 'ISO-8859-1', label: 'ISO Latin 1' },
  { value: 'ISO-8859-2', label: 'ISO Latin 2' },
  { value: 'EUC-JP', label: 'Japanese EUC' },
  { value: 'Shift_JIS', label: 'Japanese SHIFT' },
  { value: 'ISO-2022-JP', label: 'Japanese ISO' },
  { value: 'UTF-16', label: 'UTF-16 (Unicode)' },
  { value: 'ASCII', label: 'ASCII' },
];

const DIALOG_SIZE =
  '!fixed !inset-4 !translate-x-0 !translate-y-0 !max-w-none sm:!max-w-none w-[calc(100vw-2rem)] !w-[calc(100vw-2rem)] h-[calc(100vh-2rem)] !h-[calc(100vh-2rem)] flex flex-col overflow-hidden p-6 gap-4';

export const OPEN_TABLE_UPLOAD_DIALOG = 'dadix--open-table-upload-dialog';

export function openTableUploadDialog() {
  window.dispatchEvent(new CustomEvent(OPEN_TABLE_UPLOAD_DIALOG));
}

export const openTableTransferDialog = openTableUploadDialog;

export type ColumnMapping = Record<string, number>;
type Screen = 'hub' | 'import' | 'download';
type DownloadScope = 'view' | 'all';
type ExportFormat = 'csv' | 'json' | 'excel';
type Step = 1 | 2;

function parseJsonArray(raw: unknown): unknown {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function parseViewFilters(raw: unknown): IFilter[] {
  const parsed = parseJsonArray(raw);
  return Array.isArray(parsed) ? (parsed as IFilter[]) : [];
}

function parseViewSort(raw: unknown): ISortingRules {
  const parsed = parseJsonArray(raw);
  if (Array.isArray(parsed)) {
    return parsed.filter(
      (rule): rule is ISortingRule =>
        !!rule &&
        typeof rule === 'object' &&
        (rule as ISortingRule).fieldId != null &&
        !!(rule as ISortingRule).direction
    );
  }
  return [];
}

function flattenGlobalFilters(filters: Record<number, IFilter[]>): IFilter[] {
  const out: IFilter[] = [];
  for (const group of Object.values(filters)) {
    if (Array.isArray(group)) out.push(...group);
  }
  return out;
}

function buildRecordFromRow(
  row: string[],
  mapping: ColumnMapping,
  fields: Field[]
): Record<string, unknown> {
  const base = getDefaultRecordData(fields);
  for (const field of fields) {
    if (field.type === 'AI' || field.type === 'FORMULA' || field.type === 'CODE' || field.type === 'RELATION' || field.type === 'FILE') continue;
    const colIndex = mapping[field.name];
    if (colIndex == null || colIndex < 0) continue;
    const raw = row[colIndex] ?? '';
    if (raw === '') continue;
    if (field.type === 'INTEGER') {
      const n = Number(raw.replace(/\s/g, '').replace(',', '.'));
      base[field.name] = Number.isNaN(n) ? 0 : n;
    } else if (field.type === 'BOOLEAN') {
      base[field.name] = /^(1|true|yes|ja|j|y)$/i.test(raw.trim());
    } else if (field.type === 'DATE') {
      base[field.name] = raw.trim();
    } else {
      base[field.name] = raw.trim();
    }
  }
  return base;
}

function rowIssue(row: string[], mapping: ColumnMapping, fields: Field[]): string | null {
  for (const field of fields) {
    if (field.type === 'AI' || field.type === 'FORMULA' || field.type === 'CODE' || field.type === 'RELATION' || field.type === 'FILE') continue;
    const colIndex = mapping[field.name];
    if (colIndex == null || colIndex < 0) continue;
    const raw = (row[colIndex] ?? '').trim();
    if (field.type === 'INTEGER' && raw !== '') {
      const n = Number(raw.replace(/\s/g, '').replace(',', '.'));
      if (Number.isNaN(n)) return `"${field.name}" not a number`;
    }
  }
  return null;
}

interface TableUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableId: string;
  projectId: string;
  tableFields: Field[];
}

export function TableUploadDialog({
  open,
  onOpenChange,
  tableId,
  projectId,
  tableFields,
}: TableUploadDialogProps) {
  const searchParams = useSearchParams();
  const tableCtx = useTableContext();
  const viewsCtx = useTableViewsContext();
  const selectedViewId = searchParams.get('viewId');

  const [screen, setScreen] = useState<Screen>('hub');
  const [downloadScope, setDownloadScope] = useState<DownloadScope>('view');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');
  const [exporting, setExporting] = useState(false);

  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [fileKind, setFileKind] = useState<ImportKind>('csv');
  const [rawText, setRawText] = useState<string>('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [importing, setImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const [charset, setCharset] = useState<string>('UTF-8');
  const [sourceOptions, setSourceOptions] = useState<CsvParseOptions>({
    delimiter: ';',
    firstLineIsHeader: true,
    quoteChar: '"',
  });

  const editableFields = useMemo(
    () =>
      tableFields.filter(
        (f) => !['AI', 'FORMULA', 'CODE', 'RELATION', 'FILE', 'SERIAL'].includes(f.type)
      ),
    [tableFields]
  );

  const currentView = useMemo(
    () => viewsCtx.views.find((view) => `${view.id}` === `${selectedViewId}`),
    [viewsCtx.views, selectedViewId]
  );

  const defaultMapping = useCallback((h: string[]): ColumnMapping => {
    const out: ColumnMapping = {};
    for (const field of editableFields) {
      const name = field.name.toLowerCase();
      const idx = h.findIndex(
        (header) => header.toLowerCase().trim() === name || header.toLowerCase().trim().replace(/\s+/g, ' ') === name
      );
      out[field.name] = idx >= 0 ? idx : -1;
    }
    return out;
  }, [editableFields]);

  const applyParsedTable = useCallback(
    (h: string[], r: string[][]) => {
      setHeaders(h);
      setRows(r);
      setMapping(defaultMapping(h));
      setParseError(null);
    },
    [defaultMapping]
  );

  const handleFile = useCallback(
    async (f: File, encoding: string = charset) => {
      const kind = detectImportKind(f);
      setFile(f);
      setFileKind(kind);
      setParseError(null);
      try {
        if (kind === 'excel') {
          const parsed = await parseExcelFile(f);
          setRawText('');
          applyParsedTable(parsed.headers, parsed.rows);
          setStep(2);
          return;
        }
        const text = await readFileAsText(f, encoding);
        setRawText(text);
        if (kind === 'json') {
          const parsed = parseJsonImport(text);
          applyParsedTable(parsed.headers, parsed.rows);
          setStep(2);
          return;
        }
        const { headers: h, rows: r } = parseCsvText(text, sourceOptions);
        applyParsedTable(h, r);
        setStep(2);
      } catch (e) {
        setParseError(e instanceof Error ? e.message : 'Failed to parse file');
        setRawText('');
        setHeaders([]);
        setRows([]);
        setMapping({});
      }
    },
    [charset, sourceOptions, applyParsedTable]
  );

  const onSourceOptionsChange = useCallback(
    (patch: Partial<CsvParseOptions>) => {
      setSourceOptions((prev) => ({ ...prev, ...patch }));
      if (rawText && fileKind === 'csv') {
        try {
          const opts = { ...sourceOptions, ...patch };
          const { headers: h, rows: r } = parseCsvText(rawText, opts);
          applyParsedTable(h, r);
        } catch {
          setParseError('Invalid options');
        }
      }
    },
    [rawText, sourceOptions, fileKind, applyParsedTable]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const f = e.dataTransfer.files[0];
      if (f && isAcceptedImportFile(f)) {
        handleFile(f);
      } else {
        setParseError('Please drop a CSV, JSON or Excel file.');
      }
    },
    [handleFile]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback(() => setIsDragging(false), []);

  const onSelectFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) handleFile(f);
      e.target.value = '';
    },
    [handleFile]
  );

  const previewData = useMemo(() => {
    return rows.slice(0, PREVIEW_ROWS).map((row, i) => ({
      rowIndex: i + 2,
      row,
      issue: rowIssue(row, mapping, tableFields),
      record: buildRecordFromRow(row, mapping, tableFields),
    }));
  }, [rows, mapping, tableFields]);

  const handleImport = useCallback(async () => {
    if (!file || rows.length === 0) return;
    setImporting(true);
    let created = 0;
    let failed = 0;
    try {
      for (let i = 0; i < rows.length; i++) {
        const recordData = buildRecordFromRow(rows[i], mapping, tableFields);
        try {
          await recordService.createRecord({
            tableId,
            projectId,
            recordData,
          });
          created++;
        } catch {
          failed++;
        }
      }
      toast.success(`${created} record(s) imported.${failed > 0 ? ` ${failed} failed.` : ''}`);
      onOpenChange(false);
      reset();
    } catch (e) {
      console.error(e);
      toast.error('Import failed');
    } finally {
      setImporting(false);
    }
  }, [file, rows, mapping, tableId, projectId, tableFields, onOpenChange]);

  const onCharsetChange = useCallback(
    (encoding: string) => {
      setCharset(encoding);
      if (file && fileKind === 'csv') {
        readFileAsText(file, encoding)
          .then((text) => {
            setRawText(text);
            try {
              const { headers: h, rows: r } = parseCsvText(text, sourceOptions);
              applyParsedTable(h, r);
            } catch {
              setParseError('Invalid options');
            }
          })
          .catch(() => setParseError('Failed to read file with this encoding'));
      }
    },
    [file, fileKind, sourceOptions, applyParsedTable]
  );

  const reset = useCallback(() => {
    setScreen('hub');
    setDownloadScope('view');
    setExportFormat('csv');
    setStep(1);
    setFile(null);
    setFileKind('csv');
    setRawText('');
    setParseError(null);
    setHeaders([]);
    setRows([]);
    setMapping({});
    setCharset('UTF-8');
    setSourceOptions({ delimiter: ';', firstLineIsHeader: true, quoteChar: '"' });
  }, []);

  const handleDownload = useCallback(async () => {
    if (!tableId) return;
    setExporting(true);
    try {
      let records = await getAllRecordsForExport(tableId);
      if (downloadScope === 'view') {
        const viewFilters = parseViewFilters(currentView?.filter);
        const globalFilters = flattenGlobalFilters(tableCtx.filters);
        const viewFilterStr = filtersToString(viewFilters, tableFields);
        const globalFilterStr = filtersToString(globalFilters, tableFields);
        const combined =
          viewFilterStr.trim() && globalFilterStr.trim()
            ? `and(${globalFilterStr},${viewFilterStr})`
            : viewFilterStr.trim() || globalFilterStr.trim();
        if (combined) {
          const mask = await applyFilterToRecordsBatch({
            filter: combined,
            records,
            fields: tableFields,
          });
          records = records.filter((_, index) => mask[index]);
        }
        const sort = parseViewSort(currentView?.sort);
        const sortFields =
          currentView?.fields?.map((field) => ({
            fieldId: field.fieldId,
            fieldName: field.fieldName,
            name: field.name,
            type: field.type,
          })) ?? tableFields.map((field) => ({
            fieldId: Number(field.id),
            fieldName: field.name,
            name: field.name,
            type: field.type,
          }));
        records = sortRecordsByRule(records, sort, sortFields);
      }
      const tableName = tableCtx.table?.name ?? 'Table';
      if (exportFormat === 'json') exportToJSON(records, tableName);
      else if (exportFormat === 'excel') exportToExcel(records, tableFields, tableName);
      else exportToCSV(records, tableFields, tableName);
      toast.success('Download started');
    } catch (e) {
      console.error(e);
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  }, [
    tableId,
    downloadScope,
    currentView,
    tableCtx.filters,
    tableCtx.table?.name,
    tableFields,
    exportFormat,
  ]);

  const canImport = Boolean(tableId && projectId);
  const isWide = screen === 'import' && step === 2;
  const title =
    screen === 'hub'
      ? 'Exchange'
      : screen === 'download'
        ? 'Download'
        : step === 2
          ? 'Preview'
          : 'Import';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent
        className={isWide ? DIALOG_SIZE : 'sm:max-w-lg'}
        showCloseButton={false}
      >
        <DialogHeader className="grid grid-cols-[2.5rem_1fr_auto] items-center w-full gap-2">
          <div className="flex justify-start">
            {screen !== 'hub' ? (
              <Button
                variant="outline"
                size="icon"
                aria-label="Back"
                onClick={() => {
                  if (screen === 'import' && step === 2) {
                    setStep(1);
                    setFile(null);
                    setRawText('');
                    setHeaders([]);
                    setRows([]);
                    setMapping({});
                    setParseError(null);
                    return;
                  }
                  setScreen('hub');
                }}
              >
                <LucideArrowLeft className="size-4" />
              </Button>
            ) : (
              <DialogClose asChild>
                <Button variant="outline" size="icon" aria-label="Close">
                  <LucideX className="size-4" />
                </Button>
              </DialogClose>
            )}
          </div>
          <DialogTitle
            className={
              screen === 'hub'
                ? 'sr-only'
                : 'text-center w-full min-w-0'
            }
          >
            {title}
          </DialogTitle>
          {screen === 'import' && step === 2 ? (
            <Button
              onClick={handleImport}
              disabled={importing || rows.length === 0}
              size="sm"
            >
              {importing ? 'Importing…' : `Import ${rows.length} row(s)`}
            </Button>
          ) : (
            <div aria-hidden />
          )}
        </DialogHeader>

        {!canImport && (
          <p className="text-sm text-muted-foreground text-center py-4">No table selected.</p>
        )}

        {canImport && screen === 'hub' && (
          <div className="flex flex-col">
            <ChoiceCard
              icon={<LucideUpload className="size-4" />}
              label="Import"
              onClick={() => setScreen('import')}
            />
            <div className="mt-8 flex flex-col gap-3">
              <ChoiceCard
                icon={<LucideDownload className="size-4" />}
                label="Download current view"
                onClick={() => {
                  setDownloadScope('view');
                  setScreen('download');
                }}
              />
              <ChoiceCard
                icon={<LucideDownload className="size-4" />}
                label="Download entire table"
                onClick={() => {
                  setDownloadScope('all');
                  setScreen('download');
                }}
              />
            </div>
          </div>
        )}

        {canImport && screen === 'download' && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label>Format</Label>
              <div className="grid grid-cols-3 gap-2">
                <FormatChip
                  active={exportFormat === 'csv'}
                  onClick={() => setExportFormat('csv')}
                >
                  <LucideFileText className="size-4" />
                  CSV
                </FormatChip>
                <FormatChip
                  active={exportFormat === 'json'}
                  onClick={() => setExportFormat('json')}
                >
                  <LucideFileJson className="size-4" />
                  JSON
                </FormatChip>
                <FormatChip
                  active={exportFormat === 'excel'}
                  onClick={() => setExportFormat('excel')}
                >
                  <LucideFileSpreadsheet className="size-4" />
                  Excel
                </FormatChip>
              </div>
            </div>
            <Button
              variant="outline"
              className="h-10 hover:bg-muted/70"
              onClick={handleDownload}
              disabled={exporting}
            >
              {exporting ? 'Preparing…' : 'Download'}
            </Button>
          </div>
        )}

        {canImport && screen === 'import' && step === 1 && (
          <div className="flex flex-col flex-1 min-h-0 w-full gap-4">
            <div
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              className={cn(
                'min-h-40 border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center gap-3 transition-colors w-full',
                isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-muted-foreground/50'
              )}
            >
              <input
                type="file"
                accept={ACCEPT}
                onChange={onSelectFile}
                className="hidden"
                id="csv-upload-input"
              />
              <LucideUpload className="size-10 text-muted-foreground shrink-0" />
              <p className="text-sm text-muted-foreground text-center">
                Drag and drop a CSV, JSON or Excel file here, or click to choose.
              </p>
              <Button variant="secondary" asChild>
                <label htmlFor="csv-upload-input" className="cursor-pointer">
                  Select file
                </label>
              </Button>
              {parseError && <p className="text-sm text-destructive">{parseError}</p>}
            </div>

            {fileKind === 'csv' && (
              <CsvOptions
                charset={charset}
                sourceOptions={sourceOptions}
                onCharsetChange={onCharsetChange}
                onSourceOptionsChange={onSourceOptionsChange}
              />
            )}
          </div>
        )}

        {canImport && screen === 'import' && step === 2 && (
          <div className="flex flex-col w-full min-w-0 flex-1 overflow-hidden min-h-0">
              <ScrollArea className="flex-1 border rounded-md min-h-0">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 bg-muted z-10">
                    <tr>
                      <th className="text-left p-2 border-b font-medium w-10 shrink-0">#</th>
                      {headers.map((headerLabel, colIdx) => {
                        const assignedField = editableFields.find((f) => mapping[f.name] === colIdx);
                        const value = assignedField ? assignedField.name : '__none__';
                        return (
                          <th key={colIdx} className="text-left p-2 border-b font-medium min-w-[120px] max-w-[200px] align-top">
                            <Select
                              value={value}
                              onValueChange={(v) => {
                                const prevField = editableFields.find((f) => mapping[f.name] === colIdx);
                                setMapping((prev) => {
                                  const next = { ...prev };
                                  if (prevField) next[prevField.name] = -1;
                                  if (v !== '__none__') {
                                    const field = editableFields.find((f) => f.name === v);
                                    if (field) next[field.name] = colIdx;
                                  }
                                  return next;
                                });
                              }}
                            >
                              <SelectTrigger className="h-7 w-full text-xs bg-muted/80 border border-border/50">
                                <span className="truncate">{assignedField ? assignedField.name : headerLabel || '—'}</span>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">—</SelectItem>
                                {editableFields.map((f) => (
                                  <SelectItem key={f.id} value={f.name}>
                                    {f.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.map(({ rowIndex, row, issue }) => (
                      <tr
                        key={rowIndex}
                        className={cn(
                          'border-b border-border/50',
                          issue && 'bg-destructive/10'
                        )}
                      >
                        <td className="p-2 text-muted-foreground shrink-0">{rowIndex}</td>
                        {headers.map((_, colIdx) => (
                          <td key={colIdx} className="p-2 truncate max-w-[220px]" title={row[colIdx] ?? ''}>
                            {row[colIdx] ?? ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            {fileKind === 'csv' && (
              <CsvOptions
                charset={charset}
                sourceOptions={sourceOptions}
                onCharsetChange={onCharsetChange}
                onSourceOptionsChange={onSourceOptionsChange}
              />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CsvOptions({
  charset,
  sourceOptions,
  onCharsetChange,
  onSourceOptionsChange,
}: {
  charset: string;
  sourceOptions: CsvParseOptions;
  onCharsetChange: (encoding: string) => void;
  onSourceOptionsChange: (patch: Partial<CsvParseOptions>) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full shrink-0 pt-2">
      <div className="flex flex-col gap-2">
        <Label>Character set</Label>
        <Select value={charset} onValueChange={onCharsetChange}>
          <SelectTrigger className="w-full"><SelectValue /> </SelectTrigger>
          <SelectContent>
            {CHARSET_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label>Separator</Label>
        <Select
          value={sourceOptions.delimiter ?? ';'}
          onValueChange={(v: ',' | ';' | '\t') => onSourceOptionsChange({ delimiter: v })}
        >
          <SelectTrigger className="w-full"><SelectValue /> </SelectTrigger>
          <SelectContent>
            <SelectItem value=",">,</SelectItem>
            <SelectItem value=";">;</SelectItem>
            <SelectItem value="\t">Tab</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label>Text quotation</Label>
        <Select
          value={sourceOptions.quoteChar ?? '"'}
          onValueChange={(v: '"' | "'") => onSourceOptionsChange({ quoteChar: v })}
        >
          <SelectTrigger className="w-full"><SelectValue /> </SelectTrigger>
          <SelectContent>
            <SelectItem value='"'>"</SelectItem>
            <SelectItem value="'">'</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label>First line is header</Label>
        <Select
          value={sourceOptions.firstLineIsHeader ? 'yes' : 'no'}
          onValueChange={(v) => onSourceOptionsChange({ firstLineIsHeader: v === 'yes' })}
        >
          <SelectTrigger className="w-full"><SelectValue /> </SelectTrigger>
          <SelectContent>
            <SelectItem value="yes">Yes</SelectItem>
            <SelectItem value="no">No</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function ChoiceCard({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg border border-border/70 bg-background px-4 py-3.5 text-left text-sm font-medium text-foreground transition-colors hover:border-border hover:bg-muted/40"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
        {icon}
      </span>
      {label}
    </button>
  );
}

function FormatChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-9 items-center justify-center gap-1.5 rounded-md border text-sm font-medium transition-colors',
        active
          ? 'border-border bg-muted text-foreground'
          : 'border-border/70 bg-background text-foreground hover:bg-muted/50'
      )}
    >
      {children}
    </button>
  );
}
