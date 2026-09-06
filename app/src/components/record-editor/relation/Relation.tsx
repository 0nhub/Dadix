import { useEffect, useMemo, useRef, useState } from 'react';

import {
  TableRowsContextProvider,
  useTableRowsContext,
} from '@/context/TableRowsContext';
import tableService from '@/lib/table';
import { TableView } from '@/components/table-view/TableView';

import {
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from '@tanstack/react-table';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
// import { Checkbox } from '@/components/ui/checkbox';
import {
  LucideColumns2,
  LucideMoreVertical,
  LucidePlus,
  LucideSearch,
} from 'lucide-react';
import { EditRalationTableViewFieldsPanel } from './EditRelationTableViewFieldsPanel';
import { SelectRecord } from './SelectRecord';
// import { LoadingIndicator } from '@/components/loading-indicator/LoadingIndicator';

import { useCurrentProjectContext } from '@/context/CurrentProjectContext';
import { useTableColumnsRenderer } from '@/hooks/useTableColumnsRenderer';
// import { useRequireRole } from '@/hooks/useRequireRole';
import { useEventHandler } from '@/hooks/useEventHandler';
import { toast } from 'sonner';
import recordService from '@/lib/record';
import { encodeRelationData, viewFieldToTableField } from '@/lib/utils';
import { openTableRecord } from '@/components/table-cell-viewer';
import { dadixEvents } from '@/constants/events';

import type { ColumnDef, RowSelectionState } from '@tanstack/react-table';
import type {
  RelationFieldOptions,
  IFilter,
  IDadixGridViewField,
} from '@/types';

interface RelationProps {
  tableId: string | undefined;
  relation: RelationFieldOptions | undefined;
  recordId: number | undefined;
  makeRecordEditorHidden: (_v: boolean) => void;
}

function Relation({ ...props }: RelationProps) {
  const lastTableRequest = useRef<{
    tableId: string | undefined;
    id: number;
  }>({ tableId: undefined, id: 0 });
  const currentTableIdRef = useRef<string>(undefined);

  const [tableFields, setTableFields] = useState<IDadixGridViewField[]>([]);
  const [parsedTableFilters, setTableParsedFilters] = useState<string>('');
  const [tableStatus, setTableStatus] = useState<
    'loading' | 'initialized' | 'error'
  >('loading');

  useEffect(() => {
    if (
      !props.relation?.relatedToTableWithId ||
      props.relation?.relatedToTableWithId === currentTableIdRef.current
    )
      return;
    setTableStatus('loading');
    currentTableIdRef.current = props.relation?.relatedToTableWithId;
    lastTableRequest.current.id++;
    const tableRequestId = lastTableRequest.current.id;
    lastTableRequest.current.tableId = props.relation?.relatedToTableWithId;
    const requestedTableId = props.relation?.relatedToTableWithId;
    // get current table structure (columns, name, etc..)
    tableService
      .getRelationTableViewFields({
        relatedToTableWithId: `${props.relation?.relatedToTableWithId}`,
        relationId: props.relation?.id,
      })
      .then((res) => {
        if (
          currentTableIdRef.current !== requestedTableId ||
          tableRequestId !== lastTableRequest.current?.id
        ) {
          return;
        }
        setTableFields(
          ((res.data?.fields || []) as IDadixGridViewField[])
            ?.sort((field1, field2) => field1.order - field2.order)
            .map((field, index) =>
              field.id > 0 ? { ...field, order: index } : field
            )
        );
        setTableStatus('initialized');
        return;
      })
      .catch((err) => {
        if (
          currentTableIdRef.current !== requestedTableId ||
          tableRequestId !== lastTableRequest.current?.id
        ) {
          return;
        }
        console.error('fetch error:', err);
        setTableStatus('error');
        return;
      });
  }, [props.relation?.relatedToTableWithId]);

  useEventHandler(
    dadixEvents.tableEvents.onPatchRelationTableViewField,
    (evnt: Event) => {
      const { relationId, relatedToTableWithId, id, data } =
        (evnt as CustomEvent).detail || {};
      if (!relationId || !relatedToTableWithId || !id || !data) return;
      if (
        relationId !== props.relation?.id ||
        relatedToTableWithId !== props.relation?.relatedToTableWithId
      )
        return;
      const updatedField = tableFields.find(
        (field) => `${field.id}` === `${id}`
      );
      if (!updatedField) return;

      const fieldsAttributesToBeUpdated = Object.keys(data);

      if (id < 0) {
        data.order = tableFields.filter((field) => field.id > 0).length;
      }
      setTableFields((fields) => {
        if (!fields) return [];
        const fieldsToBeUpdated = {
          [`${id}`]: { ...data },
        };
        if (fieldsAttributesToBeUpdated.indexOf('order') >= 0) {
          const reorderFrom = updatedField?.order ?? 0;
          const reorderTo = data.order ?? 0;
          if (reorderFrom === reorderTo) return fields;
          const reorderDirection = Math.sign(reorderFrom - reorderTo);
          const minOrder = Math.min(reorderFrom, reorderTo);
          const maxOrder = Math.max(reorderFrom, reorderTo);
          fields?.map((field) => {
            if (`${field.id}` === `${id}`) return null;
            if (
              field.id < 0 ||
              field.order < minOrder ||
              field.order > maxOrder
            )
              return null;
            fieldsToBeUpdated[`${field.id}`] = {
              ...(fieldsToBeUpdated[`${field.id}`] || {}),
              order: field.order + reorderDirection,
            };
            return null;
          });
        }
        return fields
          ?.map((field) => {
            if (fieldsToBeUpdated[`${field.id}`]) {
              return { ...field, ...fieldsToBeUpdated[`${field.id}`] };
            }
            return field;
          })
          .sort((field1, field2) => {
            if (field1.id < 0) return 1;
            if (field2.id < 0) return -1;
            return field1.order - field2.order;
          });
      });
    },
    [props.relation?.relatedToTableWithId, props.relation?.id, tableFields]
  );

  if (
    !props.recordId ||
    !props.tableId ||
    !props.relation?.id ||
    !props.relation?.relatedToTableWithId
  )
    return null;

  if (tableStatus === 'error') return <div>Error loading related records</div>;

  if (tableStatus === 'loading') return null;
  // return <LoadingIndicator className='mx-auto' />;

  const encodedRelationData = encodeRelationData({
    recordId: props.recordId,
    tableId: props.tableId,
    relationId: props.relation?.id,
    relatedToTableWithId: props.relation?.relatedToTableWithId,
  });

  return (
    <TableRowsContextProvider
      tableId={encodedRelationData}
      tableFields={(tableFields || []).map((field) =>
        viewFieldToTableField(field)
      )}
      parsedTableFilters={parsedTableFilters}
    >
      <RelationContent {...props} tableColumns={tableFields || []} />
    </TableRowsContextProvider>
  );
}
function RelationContent({
  tableId,
  tableColumns,
  relation,
  recordId,
  makeRecordEditorHidden,
}: RelationProps & {
  tableColumns: IDadixGridViewField[];
  makeRecordEditorHidden: (_v: boolean) => void;
}) {
  const currentProjectCtx = useCurrentProjectContext();
  const tableRowsCtx = useTableRowsContext();
  const [
    isEditRelationTableViewFieldsOpen,
    setIsEditRelationTableViewFieldsOpen,
  ] = useState<boolean>(false);
  const [isSelectRecordOpen, setIsSelectRecordOpen] = useState<boolean>(false);
  const [isAddingNewRelatedRecord, setIsAddingNewRelatedRecord] =
    useState<boolean>(false);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [activeRecordId, setActiveRecordId] = useState<string | undefined>(
    undefined
  );
  // const { canEditTables } = useRequireRole();

  const tableColumnsDef = useTableColumnsRenderer({
    tableId: encodeRelationData({
      tableId: tableId || '',
      recordId: recordId || -1,
      relatedToTableWithId: relation?.relatedToTableWithId || '',
      relationId: relation?.id || -1,
    }),
    tableColumns: (tableColumns || []).map((field) =>
      viewFieldToTableField(field)
    ),
    isSearchActive: false,
    searchFilters: [],
    setSearchFilters: (_v: IFilter[]) => null,
    handleRecordChange: ({ ..._args }) => null,
    editField: (_fieldId: number) => null,
    sortingRule: undefined,
    setSortingRule: (_v: unknown) => null,
    canEditTables: false,
  });

  /*
  const tableSelectColumnDef = useMemo((): ColumnDef<
    Record<string, unknown>
  > => {
    return {
      id: 'select',
      header: ({ table }) => (
        <div className='flex w-full items-center justify-center py-1'>
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
        </div>
      ),
      enableHiding: false,
      enableResizing: false,
      size: 4 * 12,
      meta: { isVisible: true },
    };
  }, [recordId, relation, tableId]);
  */

  const tableActionsColumnDef = useMemo((): ColumnDef<
    Record<string, unknown>
  > => {
    return {
      id: 'actions',
      header: () => (
        <div className='flex ml-auto '>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant='ghost'
                className='data-[state=open]:bg-muted text-muted-foreground flex size-8 mr-4'
                size='icon'
                onClick={(e) => e.stopPropagation()}
              >
                <LucideMoreVertical />
                <span className='sr-only'>Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  makeRecordEditorHidden(true);
                  setIsEditRelationTableViewFieldsOpen(true);
                }}
              >
                <LucideColumns2 />
                Fields
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
                <LucideMoreVertical />
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
                  if (tableId && relation && relation.relatedToTableWithId)
                    openTableRecord({
                      record: row.original,
                      tableFields: tableColumns,
                      tableId: encodeRelationData({
                        tableId,
                        recordId: recordId as number,
                        relationId: relation.id,
                        relatedToTableWithId: relation.relatedToTableWithId,
                      }),
                    });
                }}
              >
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant='destructive'
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteRelatedRecord(
                    row.original.id as number,
                    row.original._relation_record_id as number
                  );
                }}
              >
                Disconnect
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
      size: 55,
      enableResizing: false,
      meta: { isVisible: true },
    };
  }, [recordId, relation, tableId]);

  const columns = useMemo((): ColumnDef<Record<string, unknown>>[] => {
    return [...tableColumnsDef, tableActionsColumnDef];
  }, [tableColumnsDef, tableActionsColumnDef]);

  const tableDef = useReactTable({
    data: tableRowsCtx.data,
    columns,
    state: {
      rowSelection,
      // pagination,
    },
    getRowId: (row) => (row.id as number | string).toString(),
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    //onSortingChange: setSorting,
    //onColumnFiltersChange: setColumnFilters,
    //onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    //getSortedRowModel: getSortedRowModel(),
    //getFacetedRowModel: getFacetedRowModel(),
    //getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  // handle open record editor event
  useEventHandler(
    dadixEvents.recordEvents.onOpen,
    (evnt: Event) => {
      if (
        !recordId ||
        !tableId ||
        !relation?.id ||
        !relation?.relatedToTableWithId
      )
        return;
      const encodedRelationData = encodeRelationData({
        relationId: relation.id,
        tableId,
        relatedToTableWithId: relation?.relatedToTableWithId,
        recordId,
      });
      if (!encodedRelationData) return;
      const details = (evnt as CustomEvent).detail || {};
      if (
        !details ||
        details.tableId !== encodedRelationData ||
        !details.record
      ) {
        return;
      }
      setActiveRecordId(details.record.id);
    },
    [tableId, relation, recordId]
  );
  // handle close record editor event
  useEventHandler(
    dadixEvents.recordEvents.onClose,
    (evnt: Event) => {
      if (
        !recordId ||
        !tableId ||
        !relation?.id ||
        !relation?.relatedToTableWithId
      )
        return;
      const encodedRelationData = encodeRelationData({
        relationId: relation.id,
        tableId,
        relatedToTableWithId: relation?.relatedToTableWithId,
        recordId,
      });
      if (!encodedRelationData) return;
      const details = (evnt as CustomEvent).detail || {};
      if (!details?.tableId) return;
      if (String(details.tableId) !== String(encodedRelationData)) return;
      setActiveRecordId(undefined);
    },
    [tableId, relation, recordId]
  );

  function handleSelectRecord(record: Record<string, unknown>) {
    if (
      !tableId ||
      !recordId ||
      !record.id ||
      !relation?.relatedToTableWithId ||
      !relation?.id
    )
      return;
    setIsAddingNewRelatedRecord(true);
    recordService
      .createRelatedRecord({
        tableId,
        recordId,
        relatedToTableWithId: relation?.relatedToTableWithId,
        relateToRecordWithId: record.id as number,
        relationId: relation?.id,
      })
      .then((res) => {
        return res;
      })
      .finally(() => setIsAddingNewRelatedRecord(false))
      .catch((err) => {
        toast.error('Error creating relation');
        console.error(err);
      });
  }

  function handleDeleteRelatedRecord(
    relatedRecordId: number,
    relationRecordId: number
  ) {
    if (
      !tableId ||
      !recordId ||
      !relatedRecordId ||
      !relationRecordId ||
      !relation?.id ||
      !relation?.relatedToTableWithId
    )
      return;
    recordService
      .deleteRelatedRecord({
        tableId,
        recordId,
        relationId: relation?.id,
        relationRecordId,
        relatedToRecordWithId: relatedRecordId,
        relatedToTableWithId: relation?.relatedToTableWithId,
      })
      .catch((err) => {
        toast.error(err.toString);
      });
  }

  function onColumnResizeChange({
    size,
    tableFieldId,
    gridViewFieldId,
  }: {
    size: number;
    tableFieldId: number;
    gridViewFieldId?: number;
  }) {
    const updatedField = tableColumns.find(
      (column) => column.fieldId === tableFieldId
    );
    if (!relation || !relation.relatedToTableWithId || !updatedField) return;
    window.dispatchEvent(
      new CustomEvent(dadixEvents.tableEvents.onPatchRelationTableViewField, {
        detail: {
          relatedToTableWithId: relation.relatedToTableWithId,
          relationId: relation.id,
          id: updatedField.id,
          data: { size },
        },
      })
    );
  }

  function onColumnResizeEnd({
    size,
    tableFieldId,
    gridViewFieldId,
  }: {
    size: number;
    tableFieldId: number;
    gridViewFieldId?: number;
  }) {
    const updatedField = tableColumns.find(
      (column) => column.fieldId === tableFieldId
    );
    if (!relation || !relation.relatedToTableWithId || !updatedField) return;
    tableService.patchRelationTableViewField({
      relationId: relation.id,
      relatedToTableWithId: relation.relatedToTableWithId,
      id: updatedField.id,
      tableFieldId: updatedField.fieldId,
      data: { size },
    });
  }

  function openRecord(record: Record<string, unknown>) {
    if (!tableId || !relation || !relation.relatedToTableWithId) return;
    openTableRecord({
      record,
      tableFields: tableColumns,
      tableId: encodeRelationData({
        tableId,
        recordId: recordId as number,
        relationId: relation.id,
        relatedToTableWithId: relation.relatedToTableWithId,
      }),
    });
  }

  function createNewRecordAndCreateRelation() {
    if (
      !currentProjectCtx.id ||
      !tableId ||
      !recordId ||
      !relation ||
      !relation.relatedToTableWithId
    )
      return;
    const { id: relationId, relatedToTableWithId } = relation;
    setIsAddingNewRelatedRecord(true);
    recordService
      .createRecord({
        projectId: currentProjectCtx.id as string,
        tableId: relation.relatedToTableWithId,
      })
      .then(async (res) => {
        if (!res) throw new Error('Error create new relation');
        const createdRecord = res as Record<string, unknown>;
        const createRelatedRecordResult =
          await recordService.createRelatedRecord({
            tableId,
            recordId,
            relationId,
            relateToRecordWithId: createdRecord.id as number,
            relatedToTableWithId,
          });
        openRecord(createRelatedRecordResult);
        setIsAddingNewRelatedRecord(false);
        return;
      })
      .catch((err) => {
        toast.error(err.toString);
        setIsAddingNewRelatedRecord(false);
      });
  }

  if (!relation?.relatedToTableWithId) return <></>;

  return (
    <>
      <div className='flex flex-col gap-2'>
        {!tableRowsCtx.isLoading && tableRowsCtx.data?.length > 0 && (
          <TableView
            table={tableDef}
            tableId={tableId}
            activeRecordId={activeRecordId || ''}
            openRecord={openRecord}
            tableRowsCtx={tableRowsCtx}
            viewId={0}
            onColumnResizeChange={onColumnResizeChange}
            onColumnResizeEnd={onColumnResizeEnd}
            className='h-full max-h-75 px-0 scrollbar-thin overflow-hidden rounded-md border'
            headerRowClassName='w-full border-0 border-b-1'
            headerRowCellClassName='last-of-type:grow first-of-type:border-0 rounded-none!'
            bodyRowClassName='w-full border-r-0 last-of-type:border-b-0 rounded-none!'
            bodyRowCellClassName='last-of-type:grow last-of-type:justify-end first-of-type:border-l-0 rounded-none!'
          />
        )}
        {!tableRowsCtx.isLoading &&
          (relation?.allowMultipleRelations ||
            tableRowsCtx.data?.length === 0) && (
            <div className='flex flex-row gap-2'>
              <Button
                variant='outline'
                onClick={() => {
                  makeRecordEditorHidden(true);
                  setIsSelectRecordOpen(true);
                }}
                disabled={isAddingNewRelatedRecord}
              >
                {/*{isAddingNewRelatedRecord ? (
                  <LoadingIndicator visibilityDelay={false} />
                ) : (
                  <LucideSearch />
                )}*/}
                <LucideSearch />
                Choice
              </Button>

              {relation?.showAddNewButton && (
                <Button
                  variant='outline'
                  disabled={isAddingNewRelatedRecord}
                  onClick={createNewRecordAndCreateRelation}
                >
                  {/*{isAddingNewRelatedRecord ? (
                    <LoadingIndicator visibilityDelay={false} />
                  ) : (
                    <LucidePlus />
                  )}*/}
                  <LucidePlus />
                  New
                </Button>
              )}
            </div>
          )}
      </div>
      {isSelectRecordOpen && (
        <SelectRecord
          onClose={() => {
            setIsSelectRecordOpen(false);
            makeRecordEditorHidden(false);
          }}
          onSelect={handleSelectRecord}
          projectId={`${currentProjectCtx.id}`}
          tableId={relation?.relatedToTableWithId}
        />
      )}
      {isEditRelationTableViewFieldsOpen && (
        <EditRalationTableViewFieldsPanel
          relationId={relation?.id}
          relatedToTableWithId={relation?.relatedToTableWithId}
          onClose={() => {
            makeRecordEditorHidden(false);
            setIsEditRelationTableViewFieldsOpen(false);
          }}
        />
      )}
    </>
  );
}

export { Relation };
