'use client';

import { useState, useCallback, memo, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LucideX } from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useCurrentProjectContext } from '@/context/CurrentProjectContext';
import {
  availableTableIcons,
  TableIcon,
} from '@/components/table-icon/TableIcon';
import { LoadingIndicator } from '@/components/loading-indicator/LoadingIndicator';
import tableService from '@/lib/table';
import { callApi } from '@/lib/api';
import { openTableEditorDialog } from '@/components/table-editor/TableEditorDialog';
import { projectTableHref } from '@/lib/projectHref';
import { useLanguage } from '@/context/LanguageContext';

import type { Table, TableSourceKind } from '@/types';

function isDesktopApp() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

const OPEN_CREATE_NEW_TABLE_DIALOG_EVENT =
  'dadix-events-open-create-new-table-dialog';

function CreateTableDialogComponent() {
  const currentProjectCtx = useCurrentProjectContext();
  const { t } = useLanguage();
  const selectedIconRef = useRef<string>(
    availableTableIcons[Math.floor(Math.random() * availableTableIcons.length)]
  );
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tableName, setTableName] = useState('');
  const [error, setError] = useState('');
  const [selectedIcon, setSelectedIcon] = useState<string>(
    selectedIconRef.current
  );
  const [sourceKind, setSourceKind] = useState<TableSourceKind>('local');
  const [dbSources, setDbSources] = useState<Array<{ id: number; name: string }>>(
    []
  );
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  const [newDb, setNewDb] = useState({
    engine: 'postgres',
    host: '',
    port: '',
    database: '',
    username: '',
    password: '',
  });
  const [remoteSchemas, setRemoteSchemas] = useState<string[]>([]);
  const [remoteTables, setRemoteTables] = useState<
    Array<{ schema: string | null; name: string }>
  >([]);
  const [selectedSchema, setSelectedSchema] = useState('');
  const [selectedRemoteTable, setSelectedRemoteTable] = useState('');
  const [linkedFilePath, setLinkedFilePath] = useState('');
  const [jsonUrl, setJsonUrl] = useState('');
  const router = useRouter();

  const isJsonEngine = newDb.engine === 'json' || newDb.engine === 'ndjson';

  const pickSourceFile = useCallback(async (extensions?: string[]) => {
    try {
      const res = await callApi.post('/source/pick-file', { extensions });
      const path = String((res.data as { path?: string } | undefined)?.path ?? '');
      if (path) {
        setLinkedFilePath(path);
        setError('');
      }
    } catch (pickError: unknown) {
      setError(
        pickError instanceof Error ? pickError.message : t('table.source.pickFailed')
      );
    }
  }, [t]);

  useEffect(() => {
    selectedIconRef.current = selectedIcon;
  }, [selectedIcon]);

  const handleSubmit = useCallback(async () => {
    if (!tableName.trim()) {
      setError(t('table.nameRequired'));
      return;
    }
    const usingJsonSource = sourceKind === 'external_database' && isJsonEngine;
    const resolvedFilePath = linkedFilePath.trim() || jsonUrl.trim();
    if (usingJsonSource && !resolvedFilePath) {
      setError(t('table.source.jsonRequired'));
      return;
    }
    if (sourceKind === 'external_database' && !usingJsonSource && !selectedRemoteTable && !selectedSourceId) {
      setError(t('table.source.dbRequired'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      const createdTable = (await tableService.createTable({
        projectId: `${currentProjectCtx.id}`,
        name: tableName.trim(),
        icon: selectedIconRef.current,
        sourceKind: usingJsonSource ? 'linked_file' : sourceKind,
        filePath: usingJsonSource || sourceKind === 'linked_file' ? resolvedFilePath || undefined : undefined,
        fileFormat: usingJsonSource ? newDb.engine : undefined,
        connection:
          sourceKind === 'external_database' && !usingJsonSource
            ? {
                sourceId: selectedSourceId ? Number(selectedSourceId) : undefined,
                engine: newDb.engine,
                host: newDb.host,
                port: newDb.port ? Number(newDb.port) : undefined,
                database: newDb.database,
                username: newDb.username,
                password: newDb.password,
                schema: selectedSchema || undefined,
                table: selectedRemoteTable || undefined,
                name: tableName.trim(),
              }
            : undefined,
      })) as Table;

      toast.success('Table created successfully!');

      setTableName('');
      setError('');
      setSourceKind('local');
      setLinkedFilePath('');
      setJsonUrl('');
      setIsOpen(false);

      const tableId = createdTable?.id ?? '';
      const viewId = createdTable?.defaultViewId;
      router.push(projectTableHref(currentProjectCtx.id, tableId, viewId));
      window.setTimeout(() => {
        openTableEditorDialog({
          projectId: String(currentProjectCtx.id ?? ''),
          tableId: String(tableId),
        });
      }, 80);
    } catch (error: unknown) {
      console.error('Error creating table:', error);
      toast.error(
        error instanceof Error ? error.message : t('table.source.createFailed')
      );
    } finally {
      setLoading(false);
    }
  }, [
    tableName,
    router,
    currentProjectCtx.id,
    sourceKind,
    selectedSourceId,
    selectedRemoteTable,
    selectedSchema,
    newDb,
    isJsonEngine,
    linkedFilePath,
    jsonUrl,
    t,
  ]);

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setTableName('');
      setError('');
      setSourceKind('local');
      setSelectedSourceId('');
      setSelectedSchema('');
      setSelectedRemoteTable('');
      setLinkedFilePath('');
      setJsonUrl('');
    }
  }, []);

  useEffect(() => {
    if (!isOpen || sourceKind !== 'external_database' || !isDesktopApp()) return;
    void callApi
      .get('/source')
      .then((res) => {
        const rows = Array.isArray(res.data) ? res.data : [];
        setDbSources(
          rows
            .filter((row: { kind?: string }) => row.kind === 'external_database')
            .map((row: { id: number; name: string }) => ({ id: row.id, name: row.name }))
        );
      })
      .catch(() => setDbSources([]));
  }, [isOpen, sourceKind]);

  useEffect(() => {
    if (!selectedSourceId) {
      setRemoteSchemas([]);
      setRemoteTables([]);
      return;
    }
    void callApi
      .get(`/source/${selectedSourceId}/schemas`)
      .then((res) => setRemoteSchemas(Array.isArray(res.data) ? res.data : []))
      .catch(() => setRemoteSchemas([]));
    void callApi
      .get(`/source/${selectedSourceId}/tables`)
      .then((res) => setRemoteTables(Array.isArray(res.data) ? res.data : []))
      .catch(() => setRemoteTables([]));
  }, [selectedSourceId]);

  useEffect(() => {
    window.addEventListener(
      OPEN_CREATE_NEW_TABLE_DIALOG_EVENT,
      handleOpenDialogEvent
    );
    return () => {
      window.removeEventListener(
        OPEN_CREATE_NEW_TABLE_DIALOG_EVENT,
        handleOpenDialogEvent
      );
    };
    function handleOpenDialogEvent(_evnt: Event) {
      if (isOpen) {
        return;
      }
      setSelectedIcon(
        availableTableIcons[
          Math.floor(Math.random() * availableTableIcons.length)
        ]
      );
      handleOpenChange(true);
    }
  }, [isOpen]);

  return (
    <Dialog modal={true} open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className='sm:max-w-lg' showCloseButton={false}>
        <DialogHeader className='flex flex-row flex-nowrap justify-start items-center gap-4'>
          <DialogClose asChild>
            <Button size='icon' variant='outline' className='shrink-0 grow-0'>
              <LucideX />
            </Button>
          </DialogClose>
          <DialogTitle className='shrink grow text-left' hidden>
            create Table
          </DialogTitle>
        </DialogHeader>
        <div className='space-y-4'>
          <div className='flex flex-col items-center gap-4'>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant='outline' className='w-21 h-21'>
                  <TableIcon
                    name={selectedIcon}
                    color='var(--primary)'
                    className='size-14 opacity-90'
                  />
                </Button>
              </DialogTrigger>
              <DialogContent
                showCloseButton={false}
                className='max-w-[300px]! max-h-[400px]'
              >
                <DialogHeader>
                  <DialogTitle hidden>select table icon</DialogTitle>
                </DialogHeader>
                {/* Icon selection */}
                <div className='grid grid-cols-6 max-[420px]:grid-cols-6 gap-2 justify-center'>
                  {availableTableIcons.map((iconName) => (
                    <DialogClose key={iconName} asChild>
                      <Button
                        type='button'
                        variant='outline'
                        size='icon'
                        aria-pressed={selectedIcon === iconName}
                        title={iconName}
                        onClick={() => setSelectedIcon(iconName)}
                        className={`shadow-none ${selectedIcon === iconName ? 'border' : 'border-none'}`}
                      >
                        <TableIcon name={iconName} className='size-6' />
                      </Button>
                    </DialogClose>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
            <div className='w-full'>
              <Input
                id='tablename'
                placeholder='Enter table name'
                value={tableName}
                onChange={(e) => {
                  setTableName(e.target.value);
                  if (error) setError('');
                }}
                disabled={loading}
                autoFocus
                className='leading-5'
              />
              {error && (
                <p className='text-sm font-medium text-destructive mt-1 leading-5'>
                  {error}
                </p>
              )}
            </div>
            {isDesktopApp() && (
              <div className='w-full space-y-2'>
                <p className='text-sm font-medium leading-5'>{t('table.source.label')}</p>
                <div className='grid grid-cols-1 gap-2'>
                  {(
                    [
                      ['local', t('table.source.local')],
                      ['linked_file', t('table.source.linkedFile')],
                      ['external_database', t('table.source.external')],
                    ] as const
                  ).map(([value, label]) => (
                    <label
                      key={value}
                      aria-label={label}
                      className='flex items-center gap-2 rounded-md border px-3 py-2 text-sm leading-5'
                    >
                      <input
                        type='radio'
                        name='table-source-kind'
                        value={value}
                        checked={sourceKind === value}
                        onChange={() => setSourceKind(value)}
                        disabled={loading}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                {sourceKind === 'linked_file' && (
                  <div className='space-y-2'>
                    <p className='text-xs text-muted-foreground'>
                      {t('table.source.linkedFileHint')}
                    </p>
                    <div className='flex items-center gap-2'>
                      <Button
                        type='button'
                        variant='outline'
                        disabled={loading}
                        onClick={() =>
                          void pickSourceFile(['csv', 'tsv', 'parquet', 'json', 'jsonl', 'ndjson'])
                        }
                      >
                        {t('table.source.chooseFile')}
                      </Button>
                      {linkedFilePath ? (
                        <span className='truncate text-xs text-muted-foreground'>
                          {linkedFilePath}
                        </span>
                      ) : null}
                    </div>
                  </div>
                )}
                {sourceKind === 'external_database' && (
                  <div className='space-y-2'>
                    {!isJsonEngine && (
                    <select
                      className='w-full rounded-md border bg-background px-3 py-2 text-sm'
                      value={selectedSourceId}
                      onChange={(e) => setSelectedSourceId(e.target.value)}
                      disabled={loading}
                    >
                      <option value=''>{t('table.source.newConnection')}</option>
                      {dbSources.map((source) => (
                        <option key={source.id} value={String(source.id)}>
                          {source.name}
                        </option>
                      ))}
                    </select>
                    )}
                    {(!selectedSourceId || isJsonEngine) && (
                      <div className='space-y-2'>
                        <div className='grid grid-cols-2 gap-2'>
                          {(
                            [
                              ['postgres', 'PostgreSQL'],
                              ['mysql', 'MySQL'],
                              ['sql_server', 'SQL Server'],
                              ['sqlite', 'SQLite'],
                              ['json', t('table.source.jsonFile')],
                              ['ndjson', 'NDJSON / JSONL'],
                            ] as const
                          ).map(([value, label]) => (
                            <label
                              key={value}
                              aria-label={label}
                              className='flex items-center gap-2 rounded-md border px-3 py-2 text-sm leading-5'
                            >
                              <input
                                type='radio'
                                name='table-source-engine'
                                value={value}
                                checked={newDb.engine === value}
                                onChange={() => {
                                  setNewDb((prev) => ({ ...prev, engine: value }));
                                  if (value === 'json' || value === 'ndjson') {
                                    setSelectedSourceId('');
                                  }
                                }}
                                disabled={loading}
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                        {isJsonEngine ? (
                          <div className='space-y-2'>
                            <p className='text-xs text-muted-foreground'>
                              {t('table.source.jsonHint')}
                            </p>
                            <div className='flex items-center gap-2'>
                              <Button
                                type='button'
                                variant='outline'
                                disabled={loading}
                                onClick={() =>
                                  void pickSourceFile(['json', 'jsonl', 'ndjson'])
                                }
                              >
                                {t('table.source.chooseFile')}
                              </Button>
                              {linkedFilePath ? (
                                <span className='truncate text-xs text-muted-foreground'>
                                  {linkedFilePath}
                                </span>
                              ) : null}
                            </div>
                            <Input
                              placeholder={t('table.source.jsonUrlPlaceholder')}
                              value={jsonUrl}
                              onChange={(e) => {
                                setJsonUrl(e.target.value);
                                if (error) setError('');
                              }}
                              disabled={loading}
                            />
                          </div>
                        ) : (
                          <div className='grid grid-cols-2 gap-2'>
                            <Input
                              placeholder='Host'
                              value={newDb.host}
                              onChange={(e) =>
                                setNewDb((prev) => ({ ...prev, host: e.target.value }))
                              }
                            />
                            <Input
                              placeholder='Port'
                              value={newDb.port}
                              onChange={(e) =>
                                setNewDb((prev) => ({ ...prev, port: e.target.value }))
                              }
                            />
                            <Input
                              placeholder={t('table.source.database')}
                              value={newDb.database}
                              onChange={(e) =>
                                setNewDb((prev) => ({ ...prev, database: e.target.value }))
                              }
                            />
                            <Input
                              placeholder={t('table.source.username')}
                              value={newDb.username}
                              onChange={(e) =>
                                setNewDb((prev) => ({ ...prev, username: e.target.value }))
                              }
                            />
                            <Input
                              type='password'
                              placeholder={t('table.source.password')}
                              value={newDb.password}
                              onChange={(e) =>
                                setNewDb((prev) => ({ ...prev, password: e.target.value }))
                              }
                            />
                          </div>
                        )}
                      </div>
                    )}
                    {!isJsonEngine && selectedSourceId && remoteSchemas.length > 0 && (
                      <select
                        className='w-full rounded-md border bg-background px-3 py-2 text-sm'
                        value={selectedSchema}
                        onChange={(e) => setSelectedSchema(e.target.value)}
                      >
                        <option value=''>{t('table.source.chooseSchema')}</option>
                        {remoteSchemas.map((schema) => (
                          <option key={schema} value={schema}>
                            {schema}
                          </option>
                        ))}
                      </select>
                    )}
                    {!isJsonEngine && selectedSourceId && (
                      <select
                        className='w-full rounded-md border bg-background px-3 py-2 text-sm'
                        value={selectedRemoteTable}
                        onChange={(e) => setSelectedRemoteTable(e.target.value)}
                      >
                        <option value=''>{t('table.source.chooseTable')}</option>
                        {remoteTables
                          .filter((table) => !selectedSchema || table.schema === selectedSchema)
                          .map((table) => (
                            <option
                              key={`${table.schema ?? ''}.${table.name}`}
                              value={table.name}
                            >
                              {table.schema ? `${table.schema}.` : ''}
                              {table.name}
                            </option>
                          ))}
                      </select>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter className='flex-row justify-end'>
            <DialogClose asChild>
              <Button type='button' variant='outline' disabled={loading}>
                {t('table.discard')}
              </Button>
            </DialogClose>
            <Button type='button' aria-label={t('common.create')} onClick={handleSubmit} disabled={loading}>
              {/*{loading ? <LoadingIndicator visibilityDelay={false} /> : <></>}*/}
              {t('common.create')}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function openCreateNewTableDialog() {
  window.dispatchEvent(new CustomEvent(OPEN_CREATE_NEW_TABLE_DIALOG_EVENT));
}

export const CreateTableDialog = memo(CreateTableDialogComponent);
