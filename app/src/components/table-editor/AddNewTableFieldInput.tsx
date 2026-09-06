import { useState } from 'react';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, LoaderCircle } from 'lucide-react';
import { TableFieldTypeIcon } from '@/components/table-field-type-icon/TableFieldTypeIcon';

import { toast } from 'sonner';
import tableService from '@/lib/table';
import { dadixFieldsDataTypes } from '@/constants';
import { dadixEvents } from '@/constants/events';
import { openEditTableFieldPanel } from '@/components/table-editor/EditTableFieldPanel';

import type { DadixFieldDataTypes } from '@/types';
import { useTableContext } from '@/context/TableContext';

function AddNewTableFieldInput() {
  const currentTableCtx = useTableContext();
  const [newFieldType, setNewFieldType] = useState('1');
  const [newFieldName, setNewFieldName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleAddField = () => {
    if (!currentTableCtx.table) return;
    if (!newFieldName.trim()) {
      toast.error('Please enter a field name');
      return;
    }

    const fieldNameAlreadyExist = (currentTableCtx.table.fields || []).find(
      (field) => field.name === newFieldName.trim()
    );
    if (fieldNameAlreadyExist) {
      toast.error('Field name already exist, please use another name.');
      return;
    }

    // Find the selected field type
    const selectedType = dadixFieldsDataTypes.find(
      (type) => type.id === parseInt(newFieldType)
    );

    if (!selectedType) {
      toast.error('Please select a valid field type');
      return;
    }

    try {
      // Create the field data object
      const currentFields = currentTableCtx.table?.fields ?? [];
      const fieldData = {
        name: newFieldName.trim(),
        type: selectedType.value as DadixFieldDataTypes,
        icon: selectedType.icon,
        order: currentFields.length,
      };

      if (!currentTableCtx.id) {
        throw new Error('no table id is provided');
      }
      setIsSaving(true);
      // Add the field using the context and get the updated fields array
      const tableId = currentTableCtx.id;
      tableService
        .createTableField({
          tableId: `${tableId}`,
          fieldData,
        })
        .then((res) => {
          if (res.status !== 201 || !res.data) {
            throw new Error('Error creating new Field');
          }
          window.dispatchEvent(
            new CustomEvent(dadixEvents.tableEvents.onCreateField, {
              detail: {
                tableId,
                data: { ...res.data },
                addToView: false,
              },
            })
          );
          // Vom Server neu laden, damit Cache/State mit DB übereinstimmen (Felder bleiben nach Schließen erhalten)
          window.dispatchEvent(
            new CustomEvent(dadixEvents.tableEvents.onRefetchTable, {
              detail: { tableId },
            })
          );
          setNewFieldName('');
          setNewFieldType('1');
          setIsSaving(false);
          openEditTableFieldPanel({
            fieldId: (res.data as { id: number }).id,
            tableContext: currentTableCtx,
          });
          return res;
        })
        .catch((err) => {
          setIsSaving(false);
          console.error('Error adding field:', err);
          const msg = err instanceof Error ? err.message : String(err);
          console.error('FIELD_CREATE_FAILED', err);
          toast.error(msg || 'Failed to add field');
        });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('FIELD_CREATE_FAILED', error);
      toast.error(msg || 'Failed to add field');
    }
  };

  return (
    <div className='flex grow gap-2 w-full'>
      <Select value={newFieldType} onValueChange={setNewFieldType}>
        <SelectTrigger className='min-w-17.5 [&_.label]:hidden!'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {dadixFieldsDataTypes.map((dadixFieldType) => (
            <SelectItem key={dadixFieldType.id} value={`${dadixFieldType.id}`}>
              <TableFieldTypeIcon
                name={dadixFieldType.value}
                className='size-5 text-primary'
              />
              <span className='label'>{dadixFieldType.name}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        placeholder={`${dadixFieldsDataTypes[parseInt(newFieldType) - 1].name} field`}
        aria-label='New field name'
        value={newFieldName}
        onChange={(e) => setNewFieldName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            handleAddField();
          }
        }}
        disabled={isSaving}
      />
      <Button
        variant='default'
        size='icon'
        onClick={handleAddField}
        disabled={isSaving}
        aria-label='Add field'
      >
        {isSaving ? <LoaderCircle className='size-4 animate-spin' /> : <Plus />}
      </Button>
    </div>
  );
}

export { AddNewTableFieldInput };
