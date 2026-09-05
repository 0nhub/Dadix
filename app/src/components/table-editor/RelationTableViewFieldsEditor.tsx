import { useEffect, useRef, useState } from 'react';

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';

import { Switch } from '@/components/ui/switch';
import { LucideGripVertical } from 'lucide-react';
import { LoadingIndicator } from '@/components/loading-indicator/LoadingIndicator';
import { TableFieldTypeIcon } from '@/components/table-field-type-icon/TableFieldTypeIcon';

import tableService from '@/lib/table';

import type { IDadixGridViewField } from '@/types';
import { toast } from 'sonner';
import { availableDadixFieldsDataTypes } from '@/constants';

export function RelationTableViewFieldsEditor({
  relatedToTableWithId,
  relationId,
}: {
  relatedToTableWithId: string;
  relationId: number;
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {})
  );

  const relatedToTableWithIdRef = useRef<string>(undefined);
  const relationIdRef = useRef<number>(undefined);
  const lastFieldsRequestInfoRef = useRef<{
    tableId: string | undefined;
    relationId: number | undefined;
    id: number;
  }>({
    tableId: undefined,
    relationId: undefined,
    id: 0,
  });

  const [loadingFields, setLoadingFields] = useState<boolean>(false);
  const [savingFields, setSavingFields] = useState<boolean>(false);

  const [fields, setFields] = useState<IDadixGridViewField[]>([]);

  let updatedField: IDadixGridViewField | undefined = undefined;

  useEffect(() => {
    if (
      relatedToTableWithId === relatedToTableWithIdRef.current &&
      relationId === relationIdRef.current
    )
      return;
    relationIdRef.current = relationId;
    relatedToTableWithIdRef.current = relatedToTableWithId;
    setFields([]);
    setLoadingFields(true);
    lastFieldsRequestInfoRef.current = {
      tableId: relatedToTableWithId,
      relationId,
      id: lastFieldsRequestInfoRef.current.id + 1,
    };
    tableService
      .getRelationTableViewFields({
        relatedToTableWithId,
        relationId,
      })
      .then((res) => {
        if (!res || !res.data?.fields) {
          throw new Error('Error loading fields');
        }
        setFields(
          ((res.data.fields as IDadixGridViewField[]) || [])
            .sort((field1, field2) => {
              if (field1.id < 0) return 1;
              if (field2.id < 0) return -1;
              return field1.order - field2.order;
            })
            .map((field, index) =>
              field.id < 0 ? field : { ...field, order: index }
            )
        );
        return res;
      })
      .finally(() => {
        setLoadingFields(false);
      })
      .catch((err) => {
        console.error(err);
      });
  }, [relationId, relatedToTableWithId]);

  function updateViewField({
    id,
    data,
  }: {
    id: number;
    data: Partial<IDadixGridViewField>;
  }) {
    if (!id || !data) return;
    updatedField = fields?.find((field) => `${field.id}` === `${id}`);
    if (!updatedField) return;

    const originalFields = [...fields];
    let updatedFields = [...fields];

    const fieldsAttributesToBeUpdated = Object.keys(data);

    setFields((fields) => {
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
          if (field.id < 0 || field.order < minOrder || field.order > maxOrder)
            return null;
          fieldsToBeUpdated[`${field.id}`] = {
            ...(fieldsToBeUpdated[`${field.id}`] || {}),
            order: field.order + reorderDirection,
          };
          return null;
        });
      }
      updatedFields = fields
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
      return updatedFields;
    });

    setSavingFields(true);
    tableService
      .patchRelationTableViewField({
        relationId,
        relatedToTableWithId,
        tableFieldId: updatedField.fieldId,
        id,
        data,
      })
      .then((res) => {
        if (res.status !== 200 || !res.data) {
          throw new Error('Error saving changes!');
        }
        if ((updatedField?.id ?? 0) >= 0) return;
        setFields(
          updatedFields
            ?.map((field) => {
              if (field.id === updatedField?.id) {
                return {
                  ...field,
                  id: res.data.id as number,
                  order: res.data.order as number,
                };
              }
              return field;
            })
            .sort((field1, field2) => {
              if (field1.id < 0) return 1;
              if (field2.id < 0) return -1;
              return field1.order - field2.order;
            })
        );
        return res;
      })
      .finally(() => {
        setSavingFields(false);
      })
      .catch((err) => {
        setFields([...originalFields]);
        toast.error('Error saving changes');
        console.error(err);
      });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    if (active.data.current?.id < 0 || over.data.current?.id < 0) return;
    const orderFrom = active?.data.current?.order;
    const orderTo = over?.data.current?.order;
    if (orderFrom === orderTo) return;
    updateViewField({ id: active.data.current?.id, data: { order: orderTo } });
  }

  if (!relationId && !relatedToTableWithId) return null;

  if (loadingFields) {
    return (
      <div className='flex justify-center items-center w-full'>
        {/*<LoadingIndicator visibilityDelay={false} />*/}
      </div>
    );
  }

  return (
    <div>
      <DndContext
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
        sensors={sensors}
      >
        <SortableContext
          disabled={savingFields}
          items={fields}
          strategy={verticalListSortingStrategy}
        >
          <div
            data-saving={savingFields}
            className='flex-col border mt-0 mb-4 rounded-md overflow-hidden data-[saving=true]:cursor-wait'
          >
            {fields.map((field) => {
              return (
                <RelationTableViewField
                  key={field.id}
                  field={field}
                  updateField={updateViewField}
                  disabled={savingFields}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function RelationTableViewField({
  field,
  updateField,
  disabled = false,
}: {
  field: IDadixGridViewField;
  updateField: ({
    ..._args
  }: {
    id: number;
    data: Partial<IDadixGridViewField>;
  }) => void;
  disabled?: boolean;
}) {
  const {
    transform,
    transition,
    setNodeRef,
    isDragging,
    attributes,
    listeners,
  } = useSortable({
    id: field.id,
    data: {
      id: field.id,
      order: field.order,
    },
  });
  return (
    <div
      data-dragging={isDragging}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className='relative flex flex-row justify-start items-center h-12 bg-background not-last:border-b gap-3 z-0 data-[dragging=true]:border data-[dragging=true]:z-10 data-[dragging=true]:opacity-80 data-[selected=true]:bg-muted'
    >
      <span
        {...attributes}
        {...listeners}
        className='h-full flex items-center justify-end w-7 shrink-0 grow-0 opacity-20'
      >
        <LucideGripVertical className='size-4.5' />
      </span>
      <span>
        <TableFieldTypeIcon name={field?.type || ''} className='size-4.5' />
      </span>
      <span
        title={field.fieldName}
        className='shrink grow overflow-hidden text-ellipsis whitespace-nowrap text-sm'
      >
        {field.fieldName}
      </span>
      {field.type !== availableDadixFieldsDataTypes.RELATION && (
        <Switch
          checked={field.isVisible}
          onCheckedChange={(value) => {
            updateField({ id: field.id, data: { isVisible: value } });
          }}
          className='shrink-0 grow-0 ml-auto mr-2'
          disabled={disabled}
        />
      )}
    </div>
  );
}
