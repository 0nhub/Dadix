'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { LucidePlus } from 'lucide-react';
import Tag from '@/components/tag';
import { formatNumber } from '@/lib/numberFormat';
// import DragHandle from '@/components/drag-handle';
import { Switch } from '@/components/ui/switch';
import { IconDotsVertical } from '@tabler/icons-react';
import type {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
} from '@tanstack/react-table';
import {
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { openTableRecord } from '@/components/table-cell-viewer';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TableView } from '@/components/table-view/TableView';
import recordControllers from '@/lib/record';
import { getDefaultRecordData } from '@/lib/utils';
import { fillEmptyAICells, getAIBatchSize } from '@/lib/aiComplete';
import { dadixEvents } from '@/constants/events';
import { useCurrentProjectContext } from '@/context/CurrentProjectContext';
import { LoadingIndicator } from '@/components/loading-indicator/LoadingIndicator';
import { openEditTableFieldPanel } from '@/components/table-editor/EditTableFieldPanel';
import { FormulaEval } from './formula-eval/FormulaEval';
import { useTableContext } from '@/context/TableContext';
import { useTableRowsContext } from '@/context/TableRowsContext';

export function DataTable() {
  const currentTableCtx = useTableContext();
  const currentTableRowsCtx = useTableRowsContext();

  const currentTableIdRef = useRef<string | number | undefined>(undefined);

  const [rowSelection, setRowSelection] = useState({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [activeRecordId, setActiveRecordId] = useState<
    string | number | undefined
  >(undefined);

  const data: Record<string, unknown>[] = currentTableRowsCtx.data || [];

  const openRecordSheet = (record: Record<string, unknown>) => {
    if (!currentTableCtx.id) return;
    openTableRecord({
      tableId: currentTableCtx.id,
      tableFields: [...(currentTableCtx.table?.fields || [])],
      record,
    });
  };

  const handleDelete = useCallback(
    async (recordId: string) => {
      if (!currentTableCtx.id) {
        toast.error('No table selected');
        return;
      }

      try {
        await recordControllers.deleteRecord({
          tableId: currentTableCtx.id,
          id: recordId,
        });
        // toast.success('Record deleted successfully!');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        console.error('Error deleting record:', error);
        toast.error(error.response?.data?.message || 'Failed to delete record');
      }
    },
    [currentTableCtx.id]
  );

  const createColumns = useCallback((): ColumnDef<
    Record<string, unknown>
  >[] => {
    const baseColumns: ColumnDef<Record<string, unknown>>[] = [
      {
        id: 'select',
        header: ({ table }) => (
          <div className='flex w-full items-center justify-center'>
            <Checkbox
              checked={table.getIsAllPageRowsSelected()}
              onCheckedChange={(value) =>
                table.toggleAllPageRowsSelected(!!value)
              }
              aria-label='Select all'
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        ),
        cell: ({ row }) => (
          <div
            onClick={(e) => e.stopPropagation()}
            className='relative w-full h-[40px] inline-flex flex-row justify-center items-center group/rowcheckboxgroup overflow-hidden'
          >
            <span
              className='absolute inline-block w-full text-sm text-center text-muted-foreground group-hover/rowcheckboxgroup:hidden'
              style={{
                display: row.getIsSelected() ? 'none' : undefined,
              }}
            >
              {(row.index + 1).toLocaleString('fullwide', {
                useGrouping: false,
              })}
            </span>
            <div
              className='absolute items-center justify-center hidden group-hover/rowcheckboxgroup:flex'
              style={{
                display: row.getIsSelected() ? 'flex' : undefined,
              }}
            >
              <Checkbox
                checked={row.getIsSelected()}
                onCheckedChange={(value) => row.toggleSelected(!!value)}
                aria-label='Select all'
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            {/*<DragHandle />*/}
          </div>
        ),
        enableHiding: false,
        enableResizing: false,
        size: 4 * 12,
      },
    ];

    currentTableCtx.table?.fields?.forEach((field) => {
      const column: ColumnDef<Record<string, unknown>> = {
        accessorKey: field.name as keyof Record<string, unknown>,
        header: () => (
          <>
            {field.name !== 'id' ? (
              <span
                className='inline-flex p-1.5 rounded-md cursor-pointer hover:bg-foreground/4 overflow-hidden max-w-full'
                onClick={() => {
                  openEditTableFieldPanel({
                    fieldId: field.id,
                    tableContext: currentTableCtx,
                  });
                }}
              >
                {field.name}
              </span>
            ) : (
              field.name
            )}
          </>
        ),
        id: `${field.id}`,
        cell: ({ row }) => {
          const value = row.getValue(`${field.id}`);
          const directValue =
            row.original[field.name as keyof typeof row.original];
          const finalValue = value !== undefined ? value : directValue;

          switch (field.type) {
            case 'TEXT':
              return (
                <span className='whitespace-nowrap text-sm'>
                  {finalValue
                    ? String(finalValue)
                    : (row.original.title as string)}
                </span>
              );
            case 'CHOICE': {
              const isMulti = field.choiceMode === 'multi';
              return (
                <Tag
                  value={finalValue ? String(finalValue) : undefined}
                  size='default'
                  options={field.options}
                  className='w-fit'
                  multi={isMulti}
                  onValueChange={(newValue) => {
                    const recordId = row.original.id;
                    try {
                      handleRecordChange({
                        recordId: recordId as string | number,
                        recordFieldName: field.name,
                        value: newValue,
                      });
                    } catch (err: unknown) {
                      console.error('Update error:', err);
                      toast.error('Failed to update status');
                    }
                  }}
                />
              );
            }
            case 'BOOLEAN':
              return (
                <Switch
                  checked={Boolean(finalValue)}
                  onCheckedChange={(checked) => {
                    const recordId = row.original.id;
                    try {
                      handleRecordChange({
                        recordId: recordId as string | number,
                        recordFieldName: field.name,
                        value: checked,
                      });
                    } catch (err) {
                      console.error('Update error:', err);
                      toast.error('Failed to update field');
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              );
            case 'INTEGER': {
              const displayValue =
                finalValue === undefined ||
                finalValue === null ||
                finalValue === ''
                  ? ''
                  : formatNumber(Number(finalValue), field.numberOptions);
              return (
                <span className='whitespace-nowrap text-sm'>
                  {displayValue}
                </span>
              );
            }
            case 'FORMULA':
            case 'CODE':
              return (
                <span className='whitespace-nowrap text-sm'>
                  <FormulaEval
                    field={field}
                    record={row.original}
                    fields={currentTableCtx.table?.fields || []}
                  />
                </span>
              );
            case 'DATE':
              return finalValue ? (
                <span className='whitespace-nowrap text-sm'>
                  {new Date(String(finalValue || ''))
                    .toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })
                    .replace(/\//g, '.')}
                </span>
              ) : (
                <span className='whitespace-nowrap text-sm'>&nbsp;</span>
              );
            default:
              return (
                <span className='whitespace-nowrap text-sm'>
                  {String(finalValue || '')}
                </span>
              );
          }
        },
        size: field.size,
      };
      baseColumns.push(column);
    });

    baseColumns.push({
      id: 'actions',
      header: () => (
        <div className='flex justify-end'>
          {/*<DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant='ghost'
                className='data-[state=open]:bg-muted text-muted-foreground flex size-8 mr-4'
                size='icon'
                onClick={(e) => e.stopPropagation()}
              >
                <IconDotsVertical />
                <span className='sr-only'>Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  openViewEditor({ viewId: 3 });
                }}
              >
                <LucideColumns2 />
                Fields
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                <LucideFilter />
                Filter
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>*/}
        </div>
      ),
      cell: ({ row }) => (
        <div className='flex justify-end'>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant='ghost'
                className='data-[state=open]:bg-muted text-muted-foreground flex size-8 mr-4'
                size='icon'
                onClick={(e) => e.stopPropagation()}
              >
                <IconDotsVertical />
                <span className='sr-only'>Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align='end'
              className='w-32'
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  // e.preventDefault();
                  openRecordSheet(row.original);
                }}
              >
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant='destructive'
                onClick={async (e) => {
                  e.stopPropagation();
                  await handleDelete(row.original.id as string);
                }}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
      size: 55,
      enableResizing: false,
    });

    return baseColumns;
  }, [currentTableCtx.table?.fields, handleDelete, currentTableCtx]);

  const columns = useMemo(
    () => createColumns(),
    [createColumns, currentTableCtx.table?.fields]
  );

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
      // pagination,
    },
    getRowId: (row) => (row.id as number | string).toString(),
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  const handleRecordChange = useCallback(
    ({
      recordId,
      recordFieldName,
      value,
    }: {
      recordId: string | number;
      recordFieldName: string;
      value: unknown;
    }) => {
      window.dispatchEvent(
        new CustomEvent(dadixEvents.recordEvents.onChange, {
          detail: {
            tableId: currentTableCtx.id,
            recordId,
            updatedRecordData: { [recordFieldName]: value },
          },
        })
      );
    },
    [currentTableCtx.id]
  );

  useEffect(() => {
    // handle open and close record editor events
    window.addEventListener(
      dadixEvents.recordEvents.onOpen,
      handleOpenRecordEvent
    );
    window.addEventListener(
      dadixEvents.recordEvents.onClose,
      handleCloseRecordEvent
    );
    return () => {
      window.removeEventListener(
        dadixEvents.recordEvents.onOpen,
        handleOpenRecordEvent
      );
      window.removeEventListener(
        dadixEvents.recordEvents.onClose,
        handleCloseRecordEvent
      );
    };

    function handleOpenRecordEvent(evnt: Event) {
      const details = (evnt as CustomEvent).detail || {};
      if (
        !details ||
        details.tableId !== currentTableCtx.id ||
        !details.record
      ) {
        return;
      }
      if (activeRecordId !== details.record.id) {
        setActiveRecordId(details.record.id);
      }
    }

    function handleCloseRecordEvent(evnt: Event) {
      const details = (evnt as CustomEvent).detail || {};
      if (
        !details ||
        details.tableId !== currentTableCtx.id ||
        !details.recordId
      ) {
        return;
      }
      if (activeRecordId !== details.recordId) {
        return;
      }
      setActiveRecordId(undefined);
    }
  }, [activeRecordId, currentTableCtx.id]);

  useEffect(() => {
    currentTableIdRef.current = currentTableCtx.id;
  }, [currentTableCtx.id]);

  useEffect(() => {
    // handle row selection changes
    const selectedRowsIds = Object.keys(rowSelection);
    window.dispatchEvent(
      new CustomEvent(dadixEvents.recordEvents.onSelectionChange, {
        detail: {
          tableId: currentTableIdRef.current,
          selectedRecordsIds: selectedRowsIds,
        },
      })
    );

    window.addEventListener(
      dadixEvents.recordEvents.onSelectionChange,
      handleRecordsSelectionChange
    );
    return () => {
      window.removeEventListener(
        dadixEvents.recordEvents.onSelectionChange,
        handleRecordsSelectionChange
      );
    };

    function handleRecordsSelectionChange(evnt: Event) {
      const { tableId, selectedRecordsIds } =
        (evnt as CustomEvent).detail || {};
      if (
        !tableId ||
        tableId !== currentTableIdRef.current ||
        !selectedRecordsIds
      ) {
        return;
      }
      if (
        Object.keys(rowSelection).length === 0 &&
        selectedRecordsIds.length === 0
      ) {
        return;
      }
      const rowsSelection: Record<string, unknown> = {};
      selectedRecordsIds.map((id: string | number) => {
        rowsSelection[id as string] = true;
        return null;
      });
      setRowSelection(rowsSelection);
    }
  }, [rowSelection]);

  if (!currentTableCtx.id) {
    return <></>;
  }

  return (
    <>
      <TableView
        table={table}
        tableId={`${currentTableCtx.id}`}
        viewId={0}
        className='w-full max-w-full flex flex-1 min-h-0 h-full flex-col justify-start gap-6'
        openRecord={openRecordSheet}
        activeRecordId={activeRecordId as string}
        tableRowsCtx={currentTableRowsCtx}
        onColumnResizeChange={({
          ..._props
        }: {
          size: number;
          tableFieldId: number;
          gridViewFieldId?: number;
        }) => null}
        onColumnResizeEnd={({
          ..._props
        }: {
          size: number;
          tableFieldId: number;
          gridViewFieldId?: number;
        }) => null}
      />
      <div className='absolute flex flex-col justify-center items-start w-full h-12 bg-background bottom-0 left-0 z-40 pl-4 pr-4'>
        <div>
          {table.getFilteredSelectedRowModel().rows.length > 0 ? (
            <div className='text-muted-foreground text-sm rounded-md bg-background/80 backdrop-blur px-2 py-1 border'>
              {table.getFilteredSelectedRowModel().rows.length} of{' '}
              {table.getFilteredRowModel().rows.length} row(s) selected.
            </div>
          ) : (
            <div className='flex flex-row gap-2.5 flex-nowrap'>
              <CreateNewRecord />
              <FillAIButton />
              <Select
                defaultValue={currentTableRowsCtx.limit.toString()}
                onValueChange={(value: string) => {
                  currentTableRowsCtx.methods.setLimit(parseInt(value));
                }}
              >
                <SelectTrigger className='text-sm font-normal text-foreground bg-background'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='50'>50</SelectItem>
                  <SelectItem value='100'>100</SelectItem>
                  <SelectItem value='500'>500</SelectItem>
                  <SelectItem value='1000'>1000</SelectItem>
                </SelectContent>
              </Select>
              {currentTableRowsCtx.isLoadingMore && (
                <div className='flex flex-row flex-nowrap items-center justify-center gap-2 text-sm bg-background rounded-md'>
                  Loading more rows
                  {/*<LoadingIndicator visibilityDelay={false} />*/}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const FillAIButton = () => {
  const currentTableCtx = useTableContext();
  const currentTableRowsCtx = useTableRowsContext();
  const [isFilling, setIsFilling] = useState(false);

  const tableFields = currentTableCtx.table?.fields ?? [];
  const hasAIFields = tableFields.some((f) => f.type === 'AI');
  const records = (currentTableRowsCtx.data || []) as Record<string, unknown>[];

  const handleFill = async () => {
    if (!currentTableCtx.id || !hasAIFields) return;
    setIsFilling(true);
    try {
      const { filled, errors } = await fillEmptyAICells({
        tableId: currentTableCtx.id,
        tableFields,
        records,
        batchSize: getAIBatchSize(),
      });
      if (errors.length > 0) {
        toast.error(errors[0] || 'AI error');
      }
      if (filled > 0) {
        toast.success(`${filled} AI field(s) filled`);
      } else if (errors.length === 0) {
        toast.info('No empty AI fields to fill.');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isNetwork =
        msg.includes('Network') ||
        msg.includes('fetch') ||
        msg.includes('ECONNREFUSED') ||
        (e as { response?: { status?: number } })?.response?.status == null;
      const isLocalhost =
        typeof window !== 'undefined' && window.location?.hostname === 'localhost';
      if (isNetwork && isLocalhost) {
        toast.error(
          'Backend unreachable. Start the server (e.g. in server folder) and set .env.local: NEXT_PUBLIC_API_URL=http://localhost:6127',
          { duration: 8000 }
        );
      } else {
        toast.error(msg);
      }
    } finally {
      setIsFilling(false);
    }
  };

  if (!hasAIFields) return null;
  return (
    <Button
      type='button'
      variant='outline'
      className='text-sm font-normal flex items-center gap-1'
      onClick={handleFill}
      disabled={isFilling}
    >
      {isFilling ? '…' : 'Fill AI'}
    </Button>
  );
};

const CreateNewRecord = () => {
  const currentTableCtx = useTableContext();
  const currentProjectCtx = useCurrentProjectContext();
  const [isAddingNewRecord, setIsAddingNewRecord] = useState<boolean>(false);

  const handleCreateNewRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTableCtx.id) {
      toast.error('No table selected');
      return;
    }

    try {
      setIsAddingNewRecord(true);
      const tableFields = currentTableCtx.table?.fields ?? [];
      const recordData = getDefaultRecordData(tableFields);
      const createdRecord = await recordControllers.createRecord({
        tableId: currentTableCtx.id,
        projectId: currentProjectCtx.id?.toLocaleString() || '',
        recordData,
      });

      if (!createdRecord) {
        throw new Error('Error creating new record');
      }
      openTableRecord({
        tableId: currentTableCtx.id,
        tableFields: [...(currentTableCtx.table?.fields || [])],
        record: { ...createdRecord },
      });
      // toast.success('Record created successfully!');
    } catch (error: unknown) {
      const apiErr = error as { response?: { data?: { error?: string } } };
      console.error('Error creating record:', error);
      toast.error(apiErr.response?.data?.error || 'Failed to create record');
    } finally {
      setIsAddingNewRecord(false);
    }
  };

  return (
    <form
      onSubmit={
        isAddingNewRecord
          ? (evnt) => {
              evnt.preventDefault();
            }
          : handleCreateNewRecord
      }
      className='flex'
    >
      <Button
        variant='outline'
        type='submit'
        className='text-sm font-normal flex items-center gap-1'
      >
        {/*{isAddingNewRecord ? (
          <LoadingIndicator visibilityDelay={false} className='size-3.5' />
        ) : (
          <LucidePlus className='size-3.5' />
        )}*/}
        <LucidePlus className='size-3.5' />
        Add
      </Button>
    </form>
  );
};
