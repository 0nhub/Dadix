import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  LucideCalendar,
  LucideMoreVertical,
  LucideTrash2,
  LucideX,
} from 'lucide-react';
import { format } from 'date-fns';
import { EditTableChoiceFieldOptions } from './EditTableChoiceFieldOptions';
import { EditTableRelationField } from './EditTableRelationField';
import { EditTableFormulaField } from './EditTableFormulaField';
import { openCodeFieldFloatingWindow } from './CodeFieldFloatingWindow';
import { EditTableAIField } from './EditTableAIField';
import { EditTableTextFieldOptions } from './EditTableTextFieldOptions';
import { EditTableNumberFieldOptions } from './EditTableNumberFieldOptions';

// import { useCurrentTableContext } from '@/context/CurrentTableContext';
import { openDeleteTableFieldConfirmDialog } from './DeleteTableFieldDialog';
import tableService from '@/lib/table';
import { dadixEvents } from '@/constants/events';
import type { ITableContext } from '@/context/TableContext';
import { useTableContext } from '@/context/TableContext';
import { useEventHandler } from '@/hooks/useEventHandler';
import { isDevDemoTable, setDevDemoFieldOverride } from '@/lib/dev-demo-data';
import type { ChoiceMode } from '@/types';

const CLOSE_EDIT_TABLE_FIELD_PANEL_EVENT =
  'dadix--close-edit-table-field-panel-event';
const OPEN_EDIT_TABLE_FIELD_PANEL_EVENT =
  'dadix--open-edit-table-field-panel-event';

export const FIELD_PANEL_LAYOUT_OPENED = 'dadix--field-panel-layout-opened';
export const FIELD_PANEL_LAYOUT_CLOSED = 'dadix--field-panel-layout-closed';
const FIELD_PANEL_DEFAULT_WIDTH = 420;

function EditTableFieldPanel() {
  const liveTableCtx = useTableContext();
  const [currentTableCtx, setCurrentTableCtx] = useState<
    ITableContext | undefined
  >(undefined);

  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [allowNavigation, setAllowNavigation] = useState<boolean>(false);
  const [fieldId, setFieldId] = useState<number | undefined>(undefined);
  const [fieldName, setFieldName] = useState<string | undefined>(undefined);
  const [placeholder, setPlaceholder] = useState<string>('');
  const [defaultValue, setDefaultValue] = useState<string>('');
  const [defaultDateValue, setDefaultDateValue] = useState<Date | undefined>(undefined);
  const [choiceMode, setChoiceMode] = useState<ChoiceMode>('single');

  const fieldNameRef = useRef<string>(undefined);
  const placeholderRef = useRef<string>('');
  const defaultValueRef = useRef<string>('');
  const closeTimeout = useRef<NodeJS.Timeout>(undefined);
  const updateFieldNameTimeout = useRef<NodeJS.Timeout>(undefined);
  const justOpenedRef = useRef<boolean>(false);

  const editedField = useMemo(
    () =>
      (currentTableCtx?.table?.fields || []).find(
        (field) => `${field.id}` === `${fieldId}`
      ),
    [currentTableCtx?.table?.fields, fieldId]
  );

  useEffect(() => {
    if (!isOpen) {
      window.dispatchEvent(new CustomEvent(CLOSE_EDIT_TABLE_FIELD_PANEL_EVENT));
      window.dispatchEvent(new CustomEvent(FIELD_PANEL_LAYOUT_CLOSED));
    } else {
      window.dispatchEvent(
        new CustomEvent(FIELD_PANEL_LAYOUT_OPENED, {
          detail: { width: FIELD_PANEL_DEFAULT_WIDTH },
        })
      );
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !fieldId) return;
    if (liveTableCtx?.id !== currentTableCtx?.id) return;
    if (liveTableCtx?.table && liveTableCtx.table !== currentTableCtx?.table) {
      setCurrentTableCtx(liveTableCtx);
    }
  }, [isOpen, fieldId, liveTableCtx, currentTableCtx?.id, currentTableCtx?.table]);

  useEffect(() => {
    const field = (currentTableCtx?.table?.fields || []).find(
      (f) => `${f.id}` === `${fieldId}`
    );
    if (!field) return;
    if (fieldNameRef.current !== field.name) {
      fieldNameRef.current = field.name;
      setFieldName(field.name);
    }
    const ph = (field.type === 'AI' || field.type === 'CODE') ? '' : (field.placeholder ?? '');
    const dv = (field.type === 'AI' || field.type === 'CODE') ? '' : (field.defaultValue ?? '');
    placeholderRef.current = ph;
    defaultValueRef.current = dv;
    setPlaceholder(ph);
    setDefaultValue(dv);
    if (field.type === 'CHOICE') {
      setChoiceMode((field.choiceMode === 'multi' ? 'multi' : 'single') as ChoiceMode);
    }
    if (field.type === 'DATE' && dv && dv !== 'TODAY') {
      try {
        const d = new Date(dv);
        if (!isNaN(d.getTime())) setDefaultDateValue(d);
        else setDefaultDateValue(undefined);
      } catch {
        setDefaultDateValue(undefined);
      }
    } else {
      setDefaultDateValue(undefined);
    }
  }, [currentTableCtx?.table?.fields, fieldId]);

  // handle open edit table field panel event (defer so dropdown close doesn't trigger sheet close)
  useEventHandler(
    OPEN_EDIT_TABLE_FIELD_PANEL_EVENT,
    (evnt: Event) => {
      const { fieldId, tableContext, allowNavigation } =
        (evnt as CustomEvent).detail || {};
      if (!fieldId || !tableContext) return;
      clearTimeout(closeTimeout.current);
      setCurrentTableCtx(tableContext);
      const field = ((tableContext as ITableContext)?.table?.fields || []).find(
        (f) => `${f.id}` === `${fieldId}`
      );
      if (!field) return;
      setFieldId(fieldId);
      setAllowNavigation(allowNavigation);
      justOpenedRef.current = true;
      window.dispatchEvent(
        new CustomEvent(FIELD_PANEL_LAYOUT_OPENED, {
          detail: { width: FIELD_PANEL_DEFAULT_WIDTH },
        })
      );
      window.setTimeout(() => {
        setIsOpen(true);
        window.setTimeout(() => {
          justOpenedRef.current = false;
        }, 400);
      }, 50);
    },
    []
  );

  // handle create table field event
  useEventHandler(
    dadixEvents.tableEvents.onCreateField,
    (evnt: Event) => {
      const detail = (evnt as CustomEvent).detail;
      if (currentTableCtx?.id === detail.tableId) {
        setCurrentTableCtx((currentTableCtx) => {
          if (!currentTableCtx) {
            return currentTableCtx;
          }
          return {
            ...currentTableCtx,
            table: {
              ...currentTableCtx.table,
              fields: [
                ...(currentTableCtx.table?.fields || []),
                { ...detail.data },
              ],
            },
          } as ITableContext;
        });
      }
    },
    [currentTableCtx?.id, currentTableCtx?.table]
  );

  // handle update table field event
  useEventHandler(
    dadixEvents.tableEvents.onPatchField,
    (evnt: Event) => {
      const detail = (evnt as CustomEvent).detail;
      const currentTable = currentTableCtx?.table;
      if (!currentTable || !currentTableCtx) return;
      if (currentTableCtx.id === detail.tableId) {
        setCurrentTableCtx((currentTableCtx) => {
          const fieldsToBeUpdated = {
            [`${detail.fieldId}`]: { ...detail.data },
          };
          const fieldsAttributesToBeUpdated = Object.keys(detail.data);

          if (fieldsAttributesToBeUpdated.indexOf('order') >= 0) {
            const reorderFrom =
              currentTable?.fields?.filter(
                (field) => `${field.id}` === `${detail.fieldId}`
              )[0]?.order ?? 0;
            const reorderTo = detail.data.order ?? 0;
            if (reorderFrom === reorderTo) return currentTableCtx;
            const reorderDirection = Math.sign(reorderFrom - reorderTo);
            const minOrder = Math.min(reorderFrom, reorderTo);
            const maxOrder = Math.max(reorderFrom, reorderTo);
            currentTable?.fields?.map((field) => {
              if (`${field.id}` === `${detail.fieldId}`) return null;
              if (field.order < minOrder || field.order > maxOrder) return null;
              fieldsToBeUpdated[`${field.id}`] = {
                ...(fieldsToBeUpdated[`${field.id}`] || {}),
                order: field.order + reorderDirection,
              };
              return null;
            });
          }
          return {
            ...currentTableCtx,
            table: {
              ...currentTable,
              fields: currentTable.fields
                ?.map((field) => {
                  if (fieldsToBeUpdated[`${field.id}`]) {
                    return { ...field, ...fieldsToBeUpdated[`${field.id}`] };
                  }
                  return field;
                })
                .sort((field1, field2) => field1.order - field2.order),
            },
          } as ITableContext;
        });
      }
    },
    [currentTableCtx?.id, currentTableCtx?.table]
  );

  // handle delete table field event
  useEventHandler(
    dadixEvents.tableEvents.onDeleteField,
    (evnt: Event) => {
      const detail = (evnt as CustomEvent).detail;
      const currentTable = currentTableCtx?.table;
      if (!currentTable || !currentTableCtx) return;
      if (currentTableCtx?.id !== detail.tableId) return;
      setCurrentTableCtx((currentTableCtx) => {
        const updatedTable = {
          ...currentTable,
          fields: currentTable.fields
            ?.filter((field) => field.id !== detail.fieldId)
            .sort((field1, field2) => field1.order - field2.order)
            .map((field, index) => ({ ...field, order: index })),
        };
        return {
          ...currentTableCtx,
          table: { ...updatedTable },
        } as ITableContext;
      });
    },
    [currentTableCtx?.id, currentTableCtx?.table]
  );

  // handle create table field option event
  useEventHandler(
    dadixEvents.tableEvents.onCreateFieldOption,
    (evnt: Event) => {
      const { tableId, fieldId, data } = (evnt as CustomEvent).detail;
      if (!tableId || !fieldId || !data) return;
      const currentTable = currentTableCtx?.table;
      if (!currentTable || !currentTableCtx) return;
      if (currentTableCtx?.id !== tableId) return;
      setCurrentTableCtx((currentTableCtx) => {
        const updatedTable = {
          ...currentTable,
          fields: currentTable.fields?.map((field) => {
            if (`${field.id}` !== `${fieldId}`) return { ...field };
            return {
              ...field,
              options: [...(field.options || []), { ...data }],
            };
          }),
        };
        return {
          ...currentTableCtx,
          table: { ...updatedTable },
        } as ITableContext;
      });
    },
    [currentTableCtx?.id, currentTableCtx?.table]
  );

  // handle update table field option event
  useEventHandler(
    dadixEvents.tableEvents.onPatchFieldOption,
    (evnt: Event) => {
      const { tableId, fieldId, optionId, data } = (evnt as CustomEvent).detail;
      if (!tableId || !fieldId || !optionId || !data) return;
      const currentTable = currentTableCtx?.table;
      if (!currentTable || !currentTableCtx) return;
      if (currentTableCtx.id !== tableId) return;
      setCurrentTableCtx((currentTableCtx) => {
        const fieldOptionsToBeUpdated = {
          [`${optionId}`]: { ...data },
        };
        const fieldOptionsAttributesToBeUpdated = Object.keys(data);

        if (fieldOptionsAttributesToBeUpdated.indexOf('order') >= 0) {
          const targetField = currentTable.fields?.filter(
            (field) => `${field.id}` === `${fieldId}`
          )[0];
          const reorderFrom =
            targetField?.options?.filter(
              (option) => `${option.id}` === `${optionId}`
            )[0]?.order ?? 0;
          const reorderTo = data.order ?? 0;
          if (reorderFrom === reorderTo) return currentTableCtx;
          const reorderDirection = Math.sign(reorderFrom - reorderTo);
          const minOrder = Math.min(reorderFrom, reorderTo);
          const maxOrder = Math.max(reorderFrom, reorderTo);
          targetField?.options?.map((option) => {
            if (`${option.id}` === `${optionId}`) return null;
            if (option.order < minOrder || option.order > maxOrder) return null;
            fieldOptionsToBeUpdated[`${option.id}`] = {
              ...(fieldOptionsToBeUpdated[`${option.id}`] || {}),
              order: option.order + reorderDirection,
              value: option.value,
            };
            return null;
          });
        }
        const updatedTable = {
          ...currentTable,
          fields: currentTable.fields?.map((field) => {
            if (`${field.id}` !== `${fieldId}`) return { ...field };
            return {
              ...field,
              options: field.options
                ?.map((option) => {
                  if (fieldOptionsToBeUpdated[`${option.id}`]) {
                    return {
                      ...option,
                      ...fieldOptionsToBeUpdated[`${option.id}`],
                    };
                  }
                  return { ...option };
                })
                .sort((option1, option2) => option1.order - option2.order),
            };
          }),
        };
        return {
          ...currentTableCtx,
          table: { ...updatedTable },
        } as ITableContext;
      });
    },
    [currentTableCtx?.id, currentTableCtx?.table]
  );

  // handle delete table field option event
  useEventHandler(
    dadixEvents.tableEvents.onDeleteFieldOption,
    (evnt: Event) => {
      const { tableId, fieldId, optionId } = (evnt as CustomEvent).detail;
      if (!optionId || !fieldId || !tableId) return;
      const currentTable = currentTableCtx?.table;
      if (!currentTable || !currentTableCtx) return;
      if (currentTableCtx.id !== tableId) return;
      setCurrentTableCtx((currentTableCtx) => {
        const updatedTable = {
          ...currentTable,
          fields: (currentTable?.fields || []).map((field) => {
            if (`${field.id}` === `${fieldId}`) {
              return {
                ...field,
                options: [
                  ...(field.options || [])
                    .filter((option) => `${option.id}` !== `${optionId}`)
                    .sort((option1, option2) => option1.order - option2.order)
                    .map((option, i) => ({ ...option, order: i })),
                ],
              };
            }
            return { ...field };
          }),
        };
        return {
          ...currentTableCtx,
          table: { ...updatedTable },
        } as ITableContext;
      });
    },
    [currentTableCtx?.id, currentTableCtx?.table]
  );

  // handle update table formula field event
  useEventHandler(
    dadixEvents.tableEvents.onPatchFieldFormula,
    (evnt: Event) => {
      const { tableId, columnId, value } = (evnt as CustomEvent).detail || {};
      const currentTable = currentTableCtx?.table;
      if (!currentTable || !currentTableCtx) return;
      if (currentTableCtx.id !== tableId) return;
      if (!currentTable) return;

      const updatedTable = {
        ...currentTable,
        fields: currentTable.fields
          ?.map((field) => {
            if (`${field.id}` === `${columnId}`) {
              return { ...field, formula: value };
            }
            return field;
          })
          .sort((field1, field2) => field1.order - field2.order),
      };

      setCurrentTableCtx({
        ...currentTableCtx,
        table: {
          ...updatedTable,
        },
      });
    },
    [currentTableCtx, currentTableCtx?.id, currentTableCtx?.table]
  );

  // handle update table text field options event
  useEventHandler(
    dadixEvents.tableEvents.onPatchTextFieldOptions,
    (evnt: Event) => {
      const { tableId, columnId, data } = (evnt as CustomEvent).detail || {};
      const currentTable = currentTableCtx?.table;
      if (!currentTable || !currentTableCtx) return;
      if (currentTableCtx.id !== tableId) return;

      const updatedTable = {
        ...currentTable,
        fields: currentTable.fields
          ?.map((field) => {
            if (`${field.id}` === `${columnId}`) {
              return {
                ...field,
                textOptions: { ...field.textOptions, ...data },
              };
            }
            return field;
          })
          .sort((field1, field2) => field1.order - field2.order),
      };
      setCurrentTableCtx({ ...currentTableCtx, table: { ...updatedTable } });
    },
    [currentTableCtx?.id, currentTableCtx?.table]
  );

  // handle update table relation field options event
  useEventHandler(
    dadixEvents.tableEvents.onPatchRelationFieldOptions,
    (evnt: Event) => {
      const { tableId, columnId, data } = (evnt as CustomEvent).detail || {};
      const currentTable = currentTableCtx?.table;
      if (!currentTable || !currentTableCtx) return;
      if (currentTableCtx.id !== tableId) return;

      const updatedTable = {
        ...currentTable,
        fields: currentTable.fields
          ?.map((field) => {
            if (`${field.id}` === `${columnId}`) {
              return {
                ...field,
                relationOptions: { ...field.relationOptions, ...data },
              };
            }
            return field;
          })
          .sort((field1, field2) => field1.order - field2.order),
      };
      setCurrentTableCtx({ ...currentTableCtx, table: { ...updatedTable } });
    },
    [currentTableCtx?.id, currentTableCtx?.table]
  );

  const updateFieldName = () => {
    if (!editedField) return;
    clearTimeout(updateFieldNameTimeout.current);
    updateFieldNameTimeout.current = setTimeout(() => {
      tableService
        .patchTableField({
          tableId: currentTableCtx?.id as string,
          id: editedField.id,
          field: { name: fieldNameRef.current },
          silent: true,
        })
        .then((res) => {
          if (res.status !== 200) {
            throw new Error('Error saving project title');
          }
          return res;
        })
        .catch((err) => {
          console.error(err);
        });
    }, 1000);
    window.dispatchEvent(
      new CustomEvent(dadixEvents.tableEvents.onPatchField, {
        detail: {
          tableId: currentTableCtx?.id as string,
          fieldId: editedField.id,
          data: {
            name: fieldNameRef.current,
          },
        },
      })
    );
  };

  const updateFieldPlaceholderAndDefault = (updates: { placeholder?: string; defaultValue?: string }) => {
    if (!editedField) return;
    const tableId = (liveTableCtx?.id ?? currentTableCtx?.id) as string;
    if (!tableId) return;
    const data: { placeholder: string; defaultValue?: string } = {
      placeholder: updates.placeholder !== undefined ? updates.placeholder : placeholderRef.current,
    };
    if (editedField.type !== 'AI') {
      data.defaultValue = updates.defaultValue !== undefined ? updates.defaultValue : defaultValueRef.current;
    }
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development' && isDevDemoTable(tableId)) {
      setDevDemoFieldOverride(tableId, editedField.id, data);
    }
    tableService
      .patchTableField({
        tableId,
        id: editedField.id,
        field: data,
        silent: true,
      })
      .then((res) => {
        if (res.status !== 200) throw new Error('Error saving field options');
        return res;
      })
      .catch((err) => console.error(err));
    window.dispatchEvent(
      new CustomEvent(dadixEvents.tableEvents.onPatchField, {
        detail: { tableId, fieldId: editedField.id, data },
      })
    );
  };

  const deleteField = () => {
    if (!editedField) return;
    openDeleteTableFieldConfirmDialog({
      tableId: currentTableCtx?.id as string,
      fieldId: editedField.id,
    });
  };

  return (
    <Sheet
      modal={false}
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          if (justOpenedRef.current) return;
          closeTimeout.current = setTimeout(() => {
            try {
              setIsOpen(false);
            } catch (err) {
              console.warn(err);
            }
          }, 250);
        } else {
          clearTimeout(closeTimeout.current);
        }
      }}
    >
      {editedField && (
        <SheetContent
          className='!w-[420px] !max-w-[420px]'
          style={{ width: FIELD_PANEL_DEFAULT_WIDTH, maxWidth: FIELD_PANEL_DEFAULT_WIDTH }}
        >
          <SheetHeader className='gap-1'>
            <SheetTitle className='flex justify-start gap-2'>
              <Button
                onClick={() => {
                  setIsOpen(false);
                }}
                autoFocus
                size='icon'
                variant='outline'
                className='mr-auto'
              >
                <LucideX />
              </Button>
              <DropdownMenu modal={true}>
                <DropdownMenuTrigger asChild>
                  <Button size='icon' variant='outline' autoFocus={false}>
                    <LucideMoreVertical />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem variant='destructive' onClick={deleteField}>
                    <LucideTrash2 />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SheetTitle>
          </SheetHeader>
          <div className='flex flex-col gap-4 overflow-y-auto px-4 pb-4 text-sm'>
            <div className='flex flex-col gap-4'>
              <div className='flex flex-col gap-3'>
                <Label htmlFor='string'>Field Name</Label>
                <Input
                  id='string'
                  value={fieldName}
                  onChange={(e) => {
                    const newFieldName = e.target.value;
                    fieldNameRef.current = newFieldName;
                    setFieldName(newFieldName);
                    updateFieldName();
                  }}
                />
              </div>
              {editedField.type === 'CHOICE' && (
                <div className='flex flex-col gap-3'>
                  <Label className='font-medium'>Field type</Label>
                  <Select
                    value={choiceMode}
                    onValueChange={(v: ChoiceMode) => {
                      setChoiceMode(v);
                      if (!currentTableCtx?.id || !editedField) return;
                      tableService.patchTableField({
                        tableId: currentTableCtx.id as string,
                        id: editedField.id,
                        field: { choiceMode: v },
                        silent: false,
                      });
                      window.dispatchEvent(
                        new CustomEvent(dadixEvents.tableEvents.onPatchField, {
                          detail: {
                            tableId: currentTableCtx.id,
                            fieldId: editedField.id,
                            data: { choiceMode: v },
                          },
                        })
                      );
                    }}
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='single'>Single</SelectItem>
                      <SelectItem value='multi'>Multi</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {editedField.type === 'TEXT' && (
                <EditTableTextFieldOptions
                  textField={editedField}
                  tableId={currentTableCtx?.id}
                />
              )}
              {editedField.type === 'INTEGER' && (
                <EditTableNumberFieldOptions
                  numberField={editedField}
                  tableId={currentTableCtx?.id}
                />
              )}
              {(editedField.type === 'FORMULA' || editedField.type === 'CODE') && (
                <EditTableFormulaField
                  fieldId={editedField.id}
                  fieldType={editedField.type}
                  tableId={currentTableCtx?.id}
                  tableFields={currentTableCtx?.table?.fields || []}
                  onOpenFloatingWindow={
                    editedField.type === 'CODE' && currentTableCtx
                      ? (initialCode: string) =>
                          openCodeFieldFloatingWindow({
                            tableId: currentTableCtx.id!,
                            fieldId: editedField.id,
                            fieldName: editedField.name,
                            initialCode,
                            tableFields: currentTableCtx.table?.fields || [],
                            tableContext: currentTableCtx,
                          })
                      : undefined
                  }
                />
              )}
              {editedField.type === 'AI' && (
                <EditTableAIField
                  fieldId={editedField.id}
                  tableId={currentTableCtx?.id}
                  tableFields={currentTableCtx?.table?.fields || []}
                  aiOptions={editedField.aiOptions}
                />
              )}
              {editedField.type === 'RELATION' && (
                <EditTableRelationField
                  editedField={editedField}
                  tableId={`${currentTableCtx?.id}`}
                />
              )}
              {editedField.type === 'CHOICE' && (
                <EditTableChoiceFieldOptions choiceField={editedField} />
              )}

              {editedField.type !== 'CODE' && (
              <div className='flex flex-col gap-3'>
                <Label htmlFor='placeholder'>Placeholder</Label>
                <Input
                  id='placeholder'
                  value={placeholder}
                  placeholder='e.g. Enter text...'
                  onChange={(e) => {
                    const v = e.target.value;
                    placeholderRef.current = v;
                    setPlaceholder(v);
                    updateFieldPlaceholderAndDefault({ placeholder: v });
                  }}
                />
              </div>
              )}

              {editedField.type !== 'AI' && editedField.type !== 'CODE' && (
              <div className='flex flex-col gap-3'>
                <Label>Default value</Label>
                {editedField.type === 'CHOICE' && (
                  <Select
                    value={defaultValue || '__none__'}
                    onValueChange={(v) => {
                      const val = v === '__none__' ? '' : v;
                      defaultValueRef.current = val;
                      setDefaultValue(val);
                      updateFieldPlaceholderAndDefault({ defaultValue: val });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='No default' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='__none__'>No default</SelectItem>
                      {(editedField.options ?? []).map((opt) => (
                        <SelectItem key={String(opt.id)} value={String(opt.value)}>
                          {opt.value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {editedField.type === 'DATE' && (
                  <div className='flex flex-col gap-2'>
                    <Select
                      value={
                        defaultValue === 'TODAY'
                          ? 'TODAY'
                          : defaultDateValue
                            ? 'date'
                            : '__none__'
                      }
                      onValueChange={(v) => {
                        if (v === '__none__') {
                          defaultValueRef.current = '';
                          setDefaultValue('');
                          setDefaultDateValue(undefined);
                          updateFieldPlaceholderAndDefault({ defaultValue: '' });
                        } else if (v === 'TODAY') {
                          defaultValueRef.current = 'TODAY';
                          setDefaultValue('TODAY');
                          setDefaultDateValue(undefined);
                          updateFieldPlaceholderAndDefault({ defaultValue: 'TODAY' });
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder='No default' />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='__none__'>No default</SelectItem>
                        <SelectItem value='TODAY'>Today</SelectItem>
                        {defaultDateValue && (
                          <SelectItem value='date'>
                            {format(defaultDateValue, 'PPP')}
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant='outline' className='w-full justify-start font-normal'>
                          <LucideCalendar className='mr-2 size-4' />
                          {defaultDateValue ? format(defaultDateValue, 'PPP') : 'Pick specific date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className='w-auto p-0' align='start'>
                        <Calendar
                          mode='single'
                          selected={defaultDateValue}
                          onSelect={(d) => {
                            if (!d) return;
                            setDefaultDateValue(d);
                            const iso = d.toISOString().split('T')[0];
                            defaultValueRef.current = iso;
                            setDefaultValue(iso);
                            updateFieldPlaceholderAndDefault({ defaultValue: iso });
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                )}
                {(editedField.type === 'TEXT' || editedField.type === 'INTEGER') && (
                  <Input
                    type={editedField.type === 'INTEGER' ? 'number' : 'text'}
                    value={defaultValue}
                    placeholder={editedField.type === 'INTEGER' ? 'e.g. 0' : 'e.g. Default text'}
                    onChange={(e) => {
                      const v = e.target.value;
                      defaultValueRef.current = v;
                      setDefaultValue(v);
                      updateFieldPlaceholderAndDefault({ defaultValue: v });
                    }}
                  />
                )}
                {editedField.type === 'BOOLEAN' && (
                  <Select
                    value={defaultValue === 'true' ? 'true' : defaultValue === 'false' ? 'false' : '__none__'}
                    onValueChange={(v) => {
                      const val = v === '__none__' ? '' : v;
                      defaultValueRef.current = val;
                      setDefaultValue(val);
                      updateFieldPlaceholderAndDefault({ defaultValue: val });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='No default' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='__none__'>No default</SelectItem>
                      <SelectItem value='true'>Yes</SelectItem>
                      <SelectItem value='false'>No</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {!['CHOICE', 'DATE', 'TEXT', 'INTEGER', 'BOOLEAN'].includes(editedField.type) && (
                  <p className='text-muted-foreground text-xs'>Default value not available for this field type.</p>
                )}
              </div>
              )}
            </div>
          </div>
        </SheetContent>
      )}
    </Sheet>
  );
}

function openEditTableFieldPanel({
  fieldId,
  tableContext,
  allowNavigation = true,
}: {
  fieldId: number;
  tableContext: ITableContext | undefined;
  allowNavigation?: boolean;
}) {
  window.dispatchEvent(
    new CustomEvent(OPEN_EDIT_TABLE_FIELD_PANEL_EVENT, {
      detail: { fieldId, tableContext, allowNavigation },
    })
  );
}

export {
  EditTableFieldPanel,
  openEditTableFieldPanel,
  CLOSE_EDIT_TABLE_FIELD_PANEL_EVENT,
  OPEN_EDIT_TABLE_FIELD_PANEL_EVENT,
};
