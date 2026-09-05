import { useEffect, useMemo, useRef, useState } from 'react';

import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TableIcon } from '../table-icon/TableIcon';

import { useCurrentProjectContext } from '@/context/CurrentProjectContext';

import type { Field } from '@/types';
import tableService from '@/lib/table';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { RelationTableViewFieldsEditor } from './RelationTableViewFieldsEditor';

function EditTableRelationField({
  editedField,
  tableId,
}: {
  editedField: Field;
  tableId: string;
}) {
  return (
    <>
      <div className='flex flex-row flex-nowrap justify-start items-stretch'>
        <div className='flex flex-col justify-between items-start grow shrink gap-2 text-sm font-medium'>
          <ToggleSingleConnection
            tableId={`${tableId}`}
            columnId={editedField.id}
            value={!editedField.relationOptions?.allowMultipleRelations}
          />
        </div>
        <div className='flex flex-col justify-between items-start grow shrink gap-2 text-sm font-medium'>
          <ToggleAddNewButtonVisibility
            tableId={`${tableId}`}
            columnId={editedField.id}
            value={!!editedField.relationOptions?.showAddNewButton}
          />
        </div>
      </div>
      <div className='flex flex-col gap-2'>
        <SelectRelatedTable
          tableId={`${tableId}`}
          columnId={editedField.id}
          value={editedField.relationOptions?.relatedToTableWithId}
        />
      </div>
      {editedField.relationOptions &&
        editedField.relationOptions?.relatedToTableWithId && (
          <div className='flex flex-col gap-2'>
            <div className='font-medium'>Fields</div>
            <RelationTableViewFieldsEditor
              relationId={editedField.relationOptions?.id}
              relatedToTableWithId={
                editedField.relationOptions?.relatedToTableWithId
              }
            />
          </div>
        )}
    </>
  );
}

function ToggleSingleConnection({
  tableId,
  columnId,
  value,
}: {
  tableId: string;
  columnId: number;
  value: boolean;
}) {
  const columnIdRef = useRef<number>(undefined);
  const [switchValue, setSwitchValue] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    if (columnId === columnIdRef.current) return;
    setSwitchValue(value);
  }, [columnId, tableId]);

  function handleToggleSinfleConnection(newValue: boolean) {
    if (!tableId || !columnId) return;
    setSwitchValue(newValue);
    setIsSaving(true);
    tableService
      .patchTableRelationFieldOptions({
        tableId,
        fieldId: columnId,
        data: {
          allowMultipleRelations: !newValue,
        },
      })
      .then((res) => {
        if (res?.status !== 200) {
          throw new Error(
            res.data?.message || 'Error updating "single connection"'
          );
        }
        return res;
      })
      .finally(() => {
        setIsSaving(false);
      })
      .catch((err) => {
        toast.error(err.toString());
        setSwitchValue(!newValue);
        console.error(err);
      });
  }

  return (
    <>
      <label htmlFor='single-connection'> Single connection</label>
      <Switch
        onCheckedChange={isSaving ? undefined : handleToggleSinfleConnection}
        checked={switchValue}
        id='single-connection'
      />
    </>
  );
}

function ToggleAddNewButtonVisibility({
  tableId,
  columnId,
  value,
}: {
  tableId: string;
  columnId: number;
  value: boolean;
}) {
  const columnIdRef = useRef<number>(undefined);
  const [switchValue, setSwitchValue] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    if (columnId === columnIdRef.current) return;
    setSwitchValue(value);
  }, [columnId, tableId]);

  function handleToggleAddNewButtonVisibility(newValue: boolean) {
    if (!tableId || !columnId) return;
    setSwitchValue(newValue);
    setIsSaving(true);
    tableService
      .patchTableRelationFieldOptions({
        tableId,
        fieldId: columnId,
        data: {
          showAddNewButton: newValue,
        },
      })
      .then((res) => {
        if (res?.status !== 200) {
          throw new Error(
            res.data?.message || 'Error updating "add new button" visibility'
          );
        }
        return res;
      })
      .finally(() => {
        setIsSaving(false);
      })
      .catch((err) => {
        toast.error(err.toString());
        setSwitchValue(!newValue);
        console.error(err);
      });
  }

  return (
    <>
      <label htmlFor='add-new-button'>Add new button</label>
      <Switch
        onCheckedChange={
          isSaving ? undefined : handleToggleAddNewButtonVisibility
        }
        checked={switchValue}
        id='add-new-button'
      />
    </>
  );
}

function SelectRelatedTable({
  tableId,
  columnId,
  value,
}: {
  tableId: string;
  columnId: number;
  value: string | undefined;
}) {
  const currentProjectCtx = useCurrentProjectContext();
  const columnIdRef = useRef<number>(undefined);
  const [selectedTableId, setSelectedTableId] = useState<string | undefined>(
    undefined
  );
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const selectedTable = useMemo(
    () =>
      currentProjectCtx.tables?.find(
        (table) => `${table.id}` === `${selectedTableId}`
      ),
    [selectedTableId, currentProjectCtx.tables]
  );

  useEffect(() => {
    if (columnId === columnIdRef.current) return;
    setSelectedTableId(value);
  }, [columnId, tableId]);

  function handleSelectRelatedTable(newValue: string) {
    if (!tableId || !columnId) return;
    const oldValue = selectedTableId;
    setSelectedTableId(newValue);
    setIsSaving(true);
    tableService
      .patchTableRelationFieldOptions({
        tableId,
        fieldId: columnId,
        data: {
          relatedToTableWithId: newValue,
        },
      })
      .then((res) => {
        if (res?.status !== 200) {
          throw new Error(
            res.data?.message || 'Error make connect to selected table'
          );
        }
        return res;
      })
      .finally(() => {
        setIsSaving(false);
      })
      .catch((err) => {
        toast.error(err.toString());
        setSelectedTableId(oldValue);
        console.error(err);
      });
  }

  return (
    <>
      <label className='text-sm font-medium'>Table</label>
      {selectedTableId ? (
        <Button variant='outline' className='justify-start self-start grow-0'>
          <TableIcon name={selectedTable?.icon || ''} />
          {selectedTable?.name}
        </Button>
      ) : (
        <Select
          value={selectedTableId ?? undefined}
          onValueChange={isSaving ? undefined : handleSelectRelatedTable}
        >
          <SelectTrigger className='w-full'>
            <SelectValue placeholder='Choice table' />
          </SelectTrigger>
          <SelectContent>
            {currentProjectCtx.tables?.map((table) => (
              <SelectItem key={table.id} value={`${table.id}`}>
                <TableIcon name={table.icon} />
                {table.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </>
  );
}

export { EditTableRelationField };
