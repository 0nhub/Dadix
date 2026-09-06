import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useEventHandler } from '@/hooks/useEventHandler';

import { Switch } from '@/components/ui/switch';
import { GridViewSearch } from '@/components/views-switch/views/grid-view/GridViewSearch';
import Tag from '@/components/tag';

import { FormulaEval } from '@/components/formula-eval/FormulaEval';

import type { ColumnDef } from '@tanstack/react-table';
import type {
  DadixFieldDataTypes,
  Field,
  FieldActions,
  FieldContentAlign,
  IDadixGridViewField,
  IDadixView,
  IDadixViewButton,
  IFilter,
  ISortingRule,
  TextFieldOptions,
} from '@/types';
import { cn, copyText, evalFormula, viewFieldToTableField } from '@/lib/utils';
import { formatNumber } from '@/lib/numberFormat';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  LucideAlignCenter,
  LucideAlignLeft,
  LucideAlignRight,
  LucideArrowRight,
  LucideCheck,
  LucideCopy,
  LucideEyeOff,
  LucidePencilLine,
  LucidePin,
  LucidePointer,
  LucideRectangleEllipsis,
  LucideArrowDownUp,
  LucidePanelRightOpen,
  LucideSortDesc,
  LucideSquareArrowOutUpRight,
} from 'lucide-react';
import { patchGridViewColumn } from '@/lib/views/gridView';
import { dadixEvents } from '@/constants/events';
import { patchView } from '@/lib/view';
import tableService from '@/lib/table';
import { toast } from 'sonner';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { TextFieldInput } from '@/components/table-cell-viewer';
import { FileFieldControl } from '@/components/file-field/FileFieldControl';
import { fileFieldDisplayName } from '@/lib/fileField';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/context/LanguageContext';
import { openExternalUrl } from '@/lib/desktopShell';

function isCellEditable(action: FieldActions | null | undefined) {
  return action === 'edit';
}

function cellEditEventMatches(
  evnt: Event,
  recordId: number,
  fieldId: number,
  fieldName: string
) {
  const detail = (evnt as CustomEvent<{
    recordId?: string | number;
    fieldId?: string | number;
    fieldName?: string;
  }>).detail;
  if (!detail || String(detail.recordId) !== String(recordId)) return false;
  if (detail.fieldId != null && Number(detail.fieldId) === Number(fieldId)) return true;
  return detail.fieldName != null && String(detail.fieldName) === fieldName;
}

function OpenOnCellEditRequest({
  recordId,
  fieldId,
  fieldName,
  children,
}: {
  recordId: number;
  fieldId: number;
  fieldName: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEventHandler(dadixEvents.recordEvents.onEditCell, (evnt) => {
    if (!cellEditEventMatches(evnt, recordId, fieldId, fieldName)) return;
    const root = ref.current;
    const target =
      root?.querySelector<HTMLElement>(
        'button, [role="combobox"], input, [data-slot="switch"]'
      ) ?? root;
    target?.click();
  });
  return (
    <span ref={ref} className='contents'>
      {children}
    </span>
  );
}

function ColumnHeaderDropdown({
  label,
  onRightClickEdit,
  children,
}: {
  label: string;
  onRightClickEdit?: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const didDragRef = useRef(false);
  const rightClickRef = useRef(false);

  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener('dadix-column-drag-start', close);
    return () => window.removeEventListener('dadix-column-drag-start', close);
  }, []);

  return (
    <DropdownMenu
      modal={false}
      open={open}
      onOpenChange={(next) => {
        if (next && (didDragRef.current || rightClickRef.current)) {
          rightClickRef.current = false;
          return;
        }
        setOpen(next);
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type='button'
          className='group/colhead relative z-10 inline-flex max-w-full min-w-0 cursor-default select-none items-center rounded-none border-0 bg-transparent p-0 text-left text-sm font-medium outline-none hover:z-20 focus:bg-transparent focus-visible:z-20 focus-visible:outline-none active:bg-transparent data-[state=open]:z-20 [-webkit-touch-callout:none] [-webkit-user-select:none]'
          onPointerDown={(event) => {
            if (event.button === 2) {
              rightClickRef.current = true;
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              event.currentTarget.blur();
              onRightClickEdit?.();
              return;
            }
            if (event.button === 0) {
              pointerStartRef.current = { x: event.clientX, y: event.clientY };
              didDragRef.current = false;
            }
          }}
          onPointerMove={(event) => {
            if (!pointerStartRef.current || event.buttons !== 1) return;
            const dx = event.clientX - pointerStartRef.current.x;
            const dy = event.clientY - pointerStartRef.current.y;
            if (Math.hypot(dx, dy) > 8) didDragRef.current = true;
          }}
          onClick={(event) => {
            if (didDragRef.current) {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              return;
            }
            setOpen(true);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            event.currentTarget.blur();
          }}
        >
          <span
            aria-hidden
            className='absolute -inset-y-1 -left-2.5 -right-2 rounded-md bg-transparent group-hover/colhead:bg-foreground/10 group-focus-visible/colhead:bg-foreground/10 group-data-[state=open]/colhead:bg-foreground/10'
          />
          <span className='relative min-w-0 truncate leading-5 select-none'>{label}</span>
        </button>
      </DropdownMenuTrigger>
      {children}
    </DropdownMenu>
  );
}

interface useTableColumnsRendererProps {
  tableId: string | undefined;
  tableColumns?: Field[];
  gridViewId?: number;
  gridViewColumns?: IDadixGridViewField[];
  /** View-only buttons (shown only in this grid view, not in table/record editor or other views) */
  viewButtons?: IDadixViewButton[];
  isSearchActive: boolean;
  searchFilters: IFilter[];
  setSearchFilters: (_searchFilters: IFilter[]) => void;
  sortingRule: import('@/types').ISortingRules;
  setSortingRule: (_rules: import('@/types').ISortingRules) => void;
  /** Persist a column-header sort on the current view. */
  onOneTimeSort?: (_fieldId: number, _direction: 'ASC' | 'DESC') => void;
  onOpenSortingRule?: () => void;
  handleRecordChange: ({
    ..._args
  }: {
    recordId: number;
    recordFieldName: string;
    value: unknown;
  }) => void;
  editField: (_fieldId: number) => void;
  canEditTables?: boolean;
  canEditRecords?: boolean;
}

export function useTableColumnsRenderer({
  tableId,
  tableColumns,
  gridViewId,
  gridViewColumns,
  viewButtons = [],
  isSearchActive,
  searchFilters,
  setSearchFilters,
  sortingRule,
  setSortingRule,
  onOneTimeSort,
  onOpenSortingRule,
  handleRecordChange,
  editField,
  canEditTables = false,
  canEditRecords = false,
}: useTableColumnsRendererProps) {
  const { t } = useLanguage();
  function handleUpdateGridViewColumn({
    tableId,
    gridViewId,
    id,
    tableColumnId,
    data,
  }: {
    tableId: string;
    gridViewId: number;
    id: number;
    tableColumnId: number;
    data: Partial<IDadixGridViewField>;
  }) {
    patchGridViewColumn({
      data,
      gridViewId,
      id,
      tableColumnId,
      tableId,
      silent: true,
    });
    window.dispatchEvent(
      new CustomEvent(dadixEvents.gridViewEvents.onPatchField, {
        detail: {
          viewId: gridViewId,
          id,
          data,
        },
      })
    );
  }

  function handleUpdateView({
    tableId,
    id,
    data,
  }: {
    tableId: string;
    id: number;
    data: Partial<IDadixView>;
  }) {
    const updatedAttributes = Object.keys(data);
    if (updatedAttributes.indexOf('sort') >= 0) {
      try {
        const parsed = JSON.parse(data.sort || '[]');
        const rules = Array.isArray(parsed)
          ? parsed.filter(
              (r: unknown) =>
                r && typeof r === 'object' && 'fieldId' in r && 'direction' in r
            )
          : parsed && typeof parsed === 'object' && parsed.fieldId != null && parsed.direction
            ? [parsed]
            : [];
        setSortingRule(rules as import('@/types').ISortingRules);
      } catch (err) {
        console.warn(err);
      }
    }
    patchView({
      data,
      id,
      tableId,
      silent: true,
    });
    window.dispatchEvent(
      new CustomEvent(dadixEvents.viewEvents.onPatch, {
        detail: {
          tableId,
          id,
          updates: { ...data },
        },
      })
    );
  }

  return useMemo(() => {
    const baseColumns: ColumnDef<Record<string, unknown>>[] = [];
    if (!tableId) return [];
    if (!gridViewColumns?.length && !tableColumns?.length) return [];
    const isGridView = (gridViewColumns?.length ?? 0) > 0;
    const tableFieldsForLookup = tableColumns;
    const resolvedColumns = isGridView
      ? gridViewColumns?.map((field) => viewFieldToTableField(field)) ?? []
      : tableColumns ?? [];

    let stickyLeftAccum = 0;
    (isGridView ? gridViewColumns : tableColumns)?.forEach((field) => {
      const tableField = tableFieldsForLookup?.find(
        (item) => String(item.id) === String(isGridView ? (field as IDadixGridViewField).fieldId : field.id)
      );
      const displayedName =
        tableField?.name ||
        (isGridView ? (field as IDadixGridViewField).fieldName : field.name) ||
        field.name ||
        '';
      const id = isGridView ? field.id : -field.id;
      const fieldId = isGridView
        ? (field as IDadixGridViewField).fieldId
        : field.id;
      const fieldName =
        tableField?.name ||
        (isGridView ? (field as IDadixGridViewField).fieldName : field.name) ||
        field.name;
      const fieldOrder = isGridView
        ? (field as IDadixGridViewField).fieldOrder
        : field.order;
      const colSize = Math.max(field.size || 0, 140);
      const isFixed = isGridView && (field as IDadixGridViewField).fixed === true;
      const columnStickyLeft = stickyLeftAccum;
      if (isFixed) stickyLeftAccum += colSize;

      const column: ColumnDef<Record<string, unknown>> = {
        accessorKey: fieldName as keyof Record<string, unknown>,
        header: () => {
          if (isSearchActive) {
            return (
              <GridViewSearch
                field={{
                  ...field,
                  id,
                  fieldId,
                  fieldName,
                  fieldOrder,
                }}
                searchFilters={searchFilters}
                setSearchFilters={setSearchFilters}
              />
            );
          }
          return (
            <>
              {canEditTables ? (
                <ColumnHeaderDropdown
                  label={displayedName}
                  onRightClickEdit={
                    fieldName === 'id' ? undefined : () => editField(fieldId)
                  }
                >
                  <DropdownMenuPortal>
                    <DropdownMenuContent
                      align='start'
                      className='min-w-46 **:**:text-inherit! z-[100]'
                    >
                    {gridViewId && tableId && (
                      <SortByColumnDropdownMenuItem
                        t={t}
                        fieldId={fieldId}
                        fieldType={field.type}
                        onOneTimeSort={onOneTimeSort}
                        onOpenSortingRule={onOpenSortingRule}
                      />
                    )}
                    {gridViewId && tableId && (
                      <DropdownMenuItem
                        className='flex items-center justify-between gap-2'
                        onClick={() => {
                          handleUpdateGridViewColumn({
                            data: { fixed: !isFixed },
                            gridViewId,
                            id,
                            tableColumnId: fieldId,
                            tableId,
                          });
                        }}
                      >
                        <span className='flex items-center gap-2'>
                          <LucidePin className='size-4 shrink-0' />
                          {t('table.fixColumn')}
                        </span>
                        {isFixed && <LucideCheck className='size-4 shrink-0' />}
                      </DropdownMenuItem>
                    )}
                    <ColumnAlignContentItem
                      t={t}
                      gridViewId={gridViewId}
                      tableId={tableId}
                      id={id}
                      fieldId={fieldId}
                      fieldContentAlign={field.contentAlign}
                      handleUpdateGridViewColumn={handleUpdateGridViewColumn}
                    />
                    {fieldName !== 'id' && (
                      <DropdownMenuItem
                        onClick={() => {
                          editField(fieldId);
                        }}
                      >
                        <LucideRectangleEllipsis />
                        {t('table.editField')}
                      </DropdownMenuItem>
                    )}
                    {fieldName !== 'id' && (
                      <ColumnActions
                        t={t}
                        tableId={tableId}
                        fieldId={fieldId}
                        fieldType={field.type}
                        fieldAction={field.action}
                      />
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={
                        gridViewId
                          ? () => {
                              handleUpdateGridViewColumn({
                                data: {
                                  isVisible: false,
                                },
                                gridViewId,
                                id,
                                tableColumnId: fieldId,
                                tableId,
                              });
                            }
                          : () => null
                      }
                    >
                      <LucideEyeOff />
                      {t('table.hideField')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                  </DropdownMenuPortal>
                </ColumnHeaderDropdown>
              ) : (
                <span className='relative inline-flex max-w-full min-w-0 items-center p-0 text-sm font-medium'>
                  <span className='relative min-w-0 truncate leading-5'>{displayedName}</span>
                </span>
              )}
            </>
          );
        },
        id: `${id}`,
        cell: ({ row }) => {
          const value = row.getValue(`${id}`);
          const directValue =
            row.original[fieldName as keyof typeof row.original];
          const finalValue = value !== undefined ? value : directValue;
          function copyAction(evnt: Event, value?: string | undefined) {
            evnt.preventDefault();
            evnt.stopPropagation();
            copyText(String(value ?? finalValue ?? ''))
              .then(() => {
                toast.success(t('table.copyToClipboard'), {
                  icon: <LucideCopy className='size-3.5 shrink-0' />,
                  duration: 1800,
                  className:
                    'copy-toast-pill rounded-full! px-3.5! py-1.5! shadow-md! gap-2! whitespace-nowrap! flex-nowrap!',
                  style: {
                    width: 'max-content',
                    minWidth: 'max-content',
                    maxWidth: '90vw',
                    whiteSpace: 'nowrap',
                    borderRadius: 9999,
                  },
                });
              })
              .catch(() => {
                toast.error(t('table.copyToClipboard'));
              });
          }

          switch (field.type) {
            case 'TEXT':
              return (
                <TextCell
                  recordId={row.original.id as number}
                  recordFieldName={fieldName}
                  fieldId={fieldId}
                  textOptions={field.textOptions}
                  fieldAction={field.action}
                  value={finalValue as string}
                  fieldSize={field.size}
                  contentAlign={field.contentAlign}
                  placeholder={field.placeholder}
                  copyAction={copyAction}
                  handleRecordChange={handleRecordChange}
                />
              );
            case 'CHOICE': {
              const showDropdown =
                isCellEditable(field.action) && canEditRecords;
              const isMulti = field.choiceMode === 'multi';
              const choiceValue = finalValue != null ? String(finalValue) : undefined;
              if (showDropdown) {
                return (
                  <OpenOnCellEditRequest
                    recordId={row.original.id as number}
                    fieldId={fieldId}
                    fieldName={fieldName}
                  >
                    <span
                      onClick={
                        field.action === 'copy'
                          ? (evnt) => {
                              copyAction(evnt as unknown as Event);
                            }
                          : undefined
                      }
                    >
                      <Tag
                        value={choiceValue}
                        size='default'
                        options={field.options}
                        className='w-fit'
                        disabled={false}
                        multi={isMulti}
                        onValueChange={(newValue: string) => {
                          const recordId = row.original.id;
                          try {
                            handleRecordChange({
                              recordId: recordId as number,
                              recordFieldName: fieldName,
                              value: newValue,
                            });
                          } catch (err: unknown) {
                            console.error('Update error:', err);
                          }
                        }}
                      />
                    </span>
                  </OpenOnCellEditRequest>
                );
              }
              const displayValue = (() => {
                if (!choiceValue) return choiceValue;
                try {
                  const arr = JSON.parse(choiceValue);
                  if (!Array.isArray(arr)) return choiceValue;
                  return arr
                    .map((v: string) => field.options?.find((o) => o.value === v)?.value ?? v)
                    .join(', ');
                } catch {
                  return choiceValue;
                }
              })();
              return (
                <span
                  onClick={
                    field.action === 'copy'
                      ? (evnt) => {
                          copyAction(evnt as unknown as Event);
                        }
                      : undefined
                  }
                  className={cn('text-sm', !displayValue && field.placeholder && 'text-muted-foreground')}
                >
                  {displayValue ?? (field.placeholder || '—')}
                </span>
              );
            }
            case 'BOOLEAN':
              return (
                <OpenOnCellEditRequest
                  recordId={row.original.id as number}
                  fieldId={fieldId}
                  fieldName={fieldName}
                >
                  <Switch
                    checked={Boolean(finalValue)}
                    disabled={!isCellEditable(field.action) || !canEditRecords}
                    className='data-disabled:opacity-100 data-disabled:pointer-events-none'
                    onCheckedChange={(checked) => {
                      const recordId = row.original.id;
                      try {
                        handleRecordChange({
                          recordId: recordId as number,
                          recordFieldName: fieldName,
                          value: checked,
                        });
                      } catch (err) {
                        console.error('Update error:', err);
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                </OpenOnCellEditRequest>
              );
            case 'INTEGER':
              return (
                <NumberCell
                  recordId={row.original.id as number}
                  recordFieldName={fieldName}
                  fieldId={fieldId}
                  fieldAction={field.action}
                  value={finalValue as number}
                  placeholder={field.placeholder}
                  numberOptions={field.numberOptions}
                  copyAction={copyAction}
                  handleRecordChange={handleRecordChange}
                />
              );
            case 'FORMULA':
            case 'CODE': {
              return (
                <span
                  className='whitespace-nowrap text-sm'
                  onClick={
                    field.action
                      ? async (evnt) => {
                          evnt.stopPropagation();
                          evnt.preventDefault();
                          let value: string;
                          try {
                            if (field.type === 'CODE') {
                              const codeField = isGridView
                                ? (tableFieldsForLookup?.find((f) => f.id === fieldId) ?? field)
                                : field;
                              const { valid, result } = (await import('@/lib/dadixCodeEval')).validateDadixCode({
                                code: codeField.formula || '',
                                record: row.original,
                                fields: resolvedColumns,
                              });
                              value = valid ? result : '';
                            } else {
                              value = await evalFormula({
                                fieldId,
                                fields: resolvedColumns,
                                formula: field.formula || '',
                                record: row.original,
                              });
                            }
                          } catch {
                            value = '';
                          }
                          switch (field.action) {
                            case 'copy':
                              copyAction(evnt as unknown as Event, value);
                              break;
                            case 'openUrl': {
                              openExternalUrl(value);
                              break;
                            }
                          }
                        }
                      : undefined
                  }
                >
                  <FormulaEval
                    forceCode={field.type === 'CODE'}
                    field={
                      isGridView
                        ? (() => {
                            const tableField = tableFieldsForLookup?.find(
                              (f) => f.id === fieldId
                            );
                            const vf = field as IDadixGridViewField;
                            // CODE/FORMULA: prefer table column so formula is never missing
                            const formula =
                              tableField?.formula ?? vf.formula ?? '';
                            return {
                              ...viewFieldToTableField(vf),
                              formula,
                            };
                          })()
                        : field
                    }
                    record={row.original}
                    fields={resolvedColumns}
                  />
                </span>
              );
            }
            case 'AI':
              return (
                <span className='text-sm whitespace-nowrap'>
                  {finalValue != null && finalValue !== '' ? String(finalValue) : (field.placeholder ?? t('table.formulaPlaceholder'))}
                </span>
              );
            case 'FILE':
              return (
                <OpenOnCellEditRequest
                  recordId={row.original.id as number}
                  fieldId={fieldId}
                  fieldName={fieldName}
                >
                  <span
                    className='flex h-full min-w-0 items-center px-0.5'
                    onClick={
                      field.action === 'copy'
                        ? (evnt) => {
                            copyAction(
                              evnt as unknown as Event,
                              fileFieldDisplayName(finalValue)
                            );
                          }
                        : undefined
                    }
                  >
                    <FileFieldControl
                      compact
                      value={finalValue}
                      disabled={!isCellEditable(field.action) || !canEditRecords}
                      placeholder={field.placeholder}
                      onChange={(next) => {
                        handleRecordChange({
                          recordId: row.original.id as number,
                          recordFieldName: fieldName,
                          value: next,
                        });
                      }}
                    />
                  </span>
                </OpenOnCellEditRequest>
              );
            case 'DATE':
              return (
                <DateCell
                  recordId={row.original.id as number}
                  recordFieldName={fieldName}
                  fieldId={fieldId}
                  fieldAction={field.action}
                  value={finalValue as string}
                  placeholder={field.placeholder}
                  copyAction={copyAction}
                  handleRecordChange={handleRecordChange}
                />
              );
            default:
              return (
                <span
                  className='whitespace-nowrap text-sm'
                  onClick={
                    field.action === 'copy'
                      ? (evnt) => {
                          copyAction(evnt as unknown as Event);
                        }
                      : undefined
                  }
                >
                  {String(finalValue || '')}
                </span>
              );
          }
        },
        size: typeof field.size === 'number' && field.size > 0 ? field.size : 140,
        enableResizing: canEditTables,
        meta: {
          ...field,
          fieldName: displayedName,
          name: displayedName,
          fixed: isGridView ? isFixed : false,
          stickyLeft: isGridView ? columnStickyLeft : 0,
        },
      };
      if (field.isVisible !== false) baseColumns.push(column);
    });

    // View-only buttons: one column per button (only in grid view, not table/record editor)
    if (isGridView && viewButtons?.length) {
      viewButtons
        .slice()
        .sort((a, b) => a.order - b.order)
        .forEach((btn) => {
          baseColumns.push({
            id: `view-button-${btn.id}`,
            header: () => (
              <span className='flex h-full w-full items-center px-2.5 text-sm font-medium text-foreground'>
                {btn.label}
              </span>
            ),
            cell: () => (
              <Button variant='outline' size='sm' className='shrink-0'>
                {btn.label}
              </Button>
            ),
            size: 120,
            enableResizing: false,
            meta: { isViewButton: true, viewButtonId: btn.id },
          });
        });
    }

    return baseColumns;
  }, [
    t,
    tableColumns,
    gridViewColumns,
    viewButtons,
    isSearchActive,
    searchFilters,
    canEditTables,
    sortingRule,
  ]);
}

const ALIGN_KEYS: Record<string, string> = { left: 'table.alignLeft', center: 'table.alignCenter', right: 'table.alignRight' };
interface ColumnAlignContentItemProps {
  t: (key: string) => string;
  tableId: string;
  gridViewId: number | undefined;
  id: number;
  fieldId: number;
  fieldContentAlign: FieldContentAlign;
  handleUpdateGridViewColumn: ({
    ..._args
  }: {
    data: Partial<IDadixGridViewField>;
    gridViewId: number;
    id: number;
    tableColumnId: number;
    tableId: string;
  }) => void;
}
function ColumnAlignContentItem({
  t,
  tableId,
  gridViewId,
  id,
  fieldId,
  fieldContentAlign,
  handleUpdateGridViewColumn,
}: ColumnAlignContentItemProps) {
  const alignLabel = (align: string) => t(ALIGN_KEYS[align] ?? align);
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className='text-inherit! gap-2'>
        {fieldContentAlign === 'right' && (
          <LucideAlignRight className='size-4' />
        )}
        {fieldContentAlign === 'center' && (
          <LucideAlignCenter className='size-4' />
        )}
        {(!fieldContentAlign || fieldContentAlign === 'left') && (
          <LucideAlignLeft className='size-4' />
        )}
        {alignLabel(fieldContentAlign || 'left')}
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className='**:**:text-inherit!'>
          {['left', 'center', 'right'].map((align) => (
            <DropdownMenuItem
              key={align}
              onClick={
                gridViewId
                  ? () => {
                      handleUpdateGridViewColumn({
                        data: {
                          contentAlign: align as FieldContentAlign,
                        },
                        gridViewId,
                        id,
                        tableColumnId: fieldId,
                        tableId,
                      });
                    }
                  : () => null
              }
            >
              {align === 'right' && <LucideAlignRight />}
              {align === 'center' && <LucideAlignCenter />}
              {align === 'left' && <LucideAlignLeft />}
              {alignLabel(align)}
              {(fieldContentAlign ?? 'left') === align && (
                <LucideCheck className='ml-auto size-3.5' />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}

interface SortByColumnDropdownMenuItemProps {
  t: (key: string) => string;
  fieldId: number;
  fieldType: DadixFieldDataTypes;
  onOneTimeSort?: (_fieldId: number, _direction: 'ASC' | 'DESC') => void;
  onOpenSortingRule?: () => void;
}
function SortByColumnDropdownMenuItem({
  t,
  fieldId,
  fieldType,
  onOneTimeSort,
  onOpenSortingRule,
}: SortByColumnDropdownMenuItemProps) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className='text-inherit! gap-2'>
        <LucideSortDesc className='size-4' />
        {t('table.sort')}
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className='**:**:text-inherit!'>
          {(['ASC', 'DESC'] as const).map((direction) => (
            <DropdownMenuItem
              key={direction}
              onClick={() => onOneTimeSort?.(fieldId, direction)}
            >
              {getSortingRuleRanges(fieldType)[direction === 'ASC' ? 0 : 1]}
              <LucideArrowRight className='-mx-1.5 size-3.5' />
              {getSortingRuleRanges(fieldType)[direction === 'ASC' ? 1 : 0]}
            </DropdownMenuItem>
          ))}
          {onOpenSortingRule && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  window.setTimeout(() => onOpenSortingRule(), 80);
                }}
              >
                <LucideArrowDownUp className='size-4' />
                Sorting rule
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}

interface ColumnActionsProps {
  t: (key: string) => string;
  tableId: string | undefined;
  fieldId: number;
  fieldType: DadixFieldDataTypes;
  fieldAction: FieldActions;
}
function ColumnActions({
  t,
  tableId,
  fieldId,
  fieldType,
  fieldAction,
}: ColumnActionsProps) {
  const columnActions = useMemo(() => {
    const actionPerType: Record<
      Exclude<FieldActions, null>,
      DadixFieldDataTypes[]
    > = {
      copy: ['AI', 'CHOICE', 'CODE', 'DATE', 'FILE', 'FORMULA', 'INTEGER', 'SERIAL', 'TEXT', 'UUID'],
      edit: ['BOOLEAN', 'CHOICE', 'DATE', 'FILE', 'INTEGER', 'TEXT'],
      openUrl: ['CODE', 'FORMULA', 'TEXT'],
    };
    const actions: { action: FieldActions; labelKey: string; icon: ReactNode }[] =
      [
        {
          action: null,
          labelKey: 'table.actionOpen',
          icon: <LucidePanelRightOpen />,
        },
      ];
    if (actionPerType.copy.indexOf(fieldType) >= 0) {
      actions.push({
        action: 'copy',
        labelKey: 'table.copyToClipboard',
        icon: <LucideCopy />,
      });
    }
    if (actionPerType.edit.indexOf(fieldType) >= 0) {
      actions.push({
        action: 'edit',
        labelKey: 'common.edit',
        icon: <LucidePencilLine />,
      });
    }
    if (actionPerType.openUrl.indexOf(fieldType) >= 0) {
      actions.push({
        action: 'openUrl',
        labelKey: 'table.openUrl',
        icon: <LucideSquareArrowOutUpRight />,
      });
    }
    return actions;
  }, [fieldType]);

  function handleUpdate(newValue: FieldActions) {
    if (!tableId || !fieldId) return;
    tableService.patchTableField({
      tableId,
      id: fieldId,
      field: {
        action: newValue,
      },
      optimistic: true,
    });
  }

  return (
    <>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className='text-inherit! gap-2'>
          <LucidePointer className='size-4' />
          {t('table.action')}
        </DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent className='**:**:text-inherit!'>
            {columnActions.map((columnAction) => (
              <DropdownMenuItem
                key={columnAction.action ?? 'open'}
                onClick={() => {
                  handleUpdate(columnAction.action);
                }}
              >
                {columnAction.icon}
                {t(columnAction.labelKey)}
                {(fieldAction ?? null) === columnAction.action && (
                  <LucideCheck className='ml-auto' />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>
    </>
  );
}

interface TextCellProps {
  recordId: number;
  recordFieldName: string;
  fieldId: number;
  contentAlign: FieldContentAlign;
  textOptions: TextFieldOptions | undefined;
  value: string;
  fieldSize: number;
  fieldAction: FieldActions;
  placeholder?: string;
  copyAction: (_evnt: Event, _v?: string) => void;
  handleRecordChange: ({
    ..._args
  }: {
    recordId: number;
    recordFieldName: string;
    value: unknown;
  }) => void;
}
function TextCell({
  recordId,
  recordFieldName,
  fieldId,
  contentAlign,
  textOptions,
  value,
  fieldSize,
  fieldAction,
  placeholder,
  copyAction,
  handleRecordChange,
}: TextCellProps) {
  const lastSavedValueRef = useRef<string>('');
  const [isEditActive, setIsEditActive] = useState<boolean>(false);
  const [inputValue, setInputValue] = useState<string>('');

  useEffect(() => {
    setInputValue(value);
    lastSavedValueRef.current = value;
  }, [recordId]);

  useEventHandler(dadixEvents.recordEvents.onEditCell, (evnt) => {
    if (!isCellEditable(fieldAction)) return;
    if (cellEditEventMatches(evnt, recordId, fieldId, recordFieldName)) {
      setIsEditActive(true);
    }
  });

  if (!isCellEditable(fieldAction))
    return (
      <span
        className={cn(
          'flex flex-row justify-start items-center text-sm h-full min-w-0 overflow-hidden whitespace-nowrap text-ellipsis',
          !value && placeholder && 'text-muted-foreground'
        )}
        onClick={(evnt) => {
          switch (fieldAction) {
            case 'copy':
              copyAction(evnt as unknown as Event);
              break;
            case 'openUrl': {
              evnt.stopPropagation();
              evnt.preventDefault();
              openExternalUrl(value);
              break;
            }
          }
        }}
      >
        {value ?? (placeholder || '')}
      </span>
    );

  return (
    <Popover
      modal={false}
      open={isEditActive}
      onOpenChange={(open) => {
        if (open) return;
        setIsEditActive(false);
        if (inputValue === lastSavedValueRef.current) return;
        lastSavedValueRef.current = inputValue;
        handleRecordChange({
          recordId,
          recordFieldName,
          value: inputValue,
        });
      }}
    >
      <PopoverTrigger asChild>
        <span
          className={cn([
            'flex flex-row justify-start items-center text-sm w-full h-full whitespace-nowrap overflow-hidden text-ellipsis',
            (!contentAlign || contentAlign === 'left') && 'justify-start',
            contentAlign === 'right' && 'justify-end',
            contentAlign === 'center' && 'justify-center',
            !value && placeholder && 'text-muted-foreground',
          ])}
          onClick={(evnt) => {
            setIsEditActive(true);
            evnt.stopPropagation();
          }}
        >
          {value ?? (placeholder || '')}
        </span>
      </PopoverTrigger>
      <PopoverContent
        side='left'
        sideOffset={-fieldSize}
        align='start'
        alignOffset={6}
        style={{ width: `${fieldSize}px` }}
        className='relative p-0!'
        onClick={(evnt) => evnt.stopPropagation()}
        onKeyDown={(evnt) => {
          if (evnt.key !== 'Enter' || evnt.shiftKey) return;
          evnt.preventDefault();
          setIsEditActive(false);
        }}
      >
        <TextFieldInput
          recordId={recordId}
          fieldId={fieldId}
          fieldName={recordFieldName}
          fieldValue={inputValue}
          handleItemChange={(args) => {
            setInputValue(args.value);
          }}
          textOptions={textOptions}
          placeholder={placeholder}
        />
      </PopoverContent>
    </Popover>
  );
}

interface NumberCellProps {
  recordId: number;
  recordFieldName: string;
  fieldId: number;
  value: number;
  fieldAction: FieldActions;
  placeholder?: string;
  numberOptions?: import('@/types').NumberFieldOptions | null;
  copyAction: (_evnt: Event, _v?: string) => void;
  handleRecordChange: ({
    ..._args
  }: {
    recordId: number;
    recordFieldName: string;
    value: unknown;
  }) => void;
}
function NumberCell({
  recordId,
  recordFieldName,
  fieldId,
  value,
  fieldAction,
  placeholder,
  numberOptions,
  copyAction,
  handleRecordChange,
}: NumberCellProps) {
  const lastSavedValueRef = useRef<number>(0);
  const [isEditActive, setIsEditActive] = useState<boolean>(false);
  const [inputValue, setInputValue] = useState<number>(0);

  useEffect(() => {
    setInputValue(value);
    lastSavedValueRef.current = value;
  }, [recordId]);

  useEventHandler(dadixEvents.recordEvents.onEditCell, (evnt) => {
    if (!isCellEditable(fieldAction)) return;
    if (cellEditEventMatches(evnt, recordId, fieldId, recordFieldName)) {
      setIsEditActive(true);
    }
  });

  if (isEditActive)
    return (
      <Input
        type='text'
        value={inputValue}
        placeholder={placeholder}
        className='w-full'
        onClick={(evnt) => evnt.stopPropagation()}
        onChange={(evnt) => {
          const newValue = evnt.target.value;
          setInputValue(parseInt(newValue) || 0);
        }}
        onKeyDown={(evnt) => {
          if (evnt.key !== 'Enter') return;
          evnt.preventDefault();
          evnt.currentTarget.blur();
        }}
        onBlur={() => {
          setIsEditActive(false);
          if (inputValue === lastSavedValueRef.current) return;
          lastSavedValueRef.current = inputValue;
          handleRecordChange({
            recordId,
            recordFieldName,
            value: inputValue,
          });
        }}
        autoFocus
      />
    );

  const isEmpty = value === undefined || value === null;
  const displayValue = !isEmpty ? formatNumber(value, numberOptions) : (placeholder || '0');
  return (
    <span
      className={cn(
        'flex flex-row justify-start items-center text-sm h-full whitespace-nowrap',
        isEmpty && placeholder && 'text-muted-foreground'
      )}
      onClick={(evnt) => {
        if (fieldAction === 'copy') {
          copyAction(evnt as unknown as Event, !isEmpty ? formatNumber(value, numberOptions) : undefined);
          return;
        }
        if (isCellEditable(fieldAction)) {
          evnt.stopPropagation();
          setIsEditActive(true);
        }
      }}
    >
      {displayValue}
    </span>
  );
}

interface DateCellProps {
  recordId: number;
  recordFieldName: string;
  fieldId: number;
  value: string;
  fieldAction: FieldActions;
  placeholder?: string;
  copyAction: (_evnt: Event, _v?: string) => void;
  handleRecordChange: ({
    ..._args
  }: {
    recordId: number;
    recordFieldName: string;
    value: unknown;
  }) => void;
}
function DateCell({
  recordId,
  recordFieldName,
  fieldId,
  value,
  fieldAction,
  placeholder,
  copyAction,
  handleRecordChange,
}: DateCellProps) {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  useEventHandler(dadixEvents.recordEvents.onEditCell, (evnt) => {
    if (!isCellEditable(fieldAction)) return;
    if (cellEditEventMatches(evnt, recordId, fieldId, recordFieldName)) {
      setIsOpen(true);
    }
  });

  const dateValue = useMemo(
    () =>
      new Date(String(value || ''))
        .toLocaleDateString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })
        .replace(/\//g, '.'),
    [value]
  );
  const date = useMemo(() => {
    try {
      return new Date(value);
    } catch (err) {
      console.warn(err);
      return undefined;
    }
  }, [value]);

  function handleUpdateDate(value: Date) {
    try {
      handleRecordChange({
        recordId,
        recordFieldName,
        value,
      });
    } catch (err) {
      console.error('Update error:', err);
    }
  }

  if (!isCellEditable(fieldAction))
    return (
      <span
        className={cn('whitespace-nowrap text-sm', !value && placeholder && 'text-muted-foreground')}
        onClick={
          fieldAction === 'copy'
            ? (evnt) => {
                copyAction(evnt as unknown as Event, dateValue);
              }
            : undefined
        }
      >
        {dateValue || (placeholder ?? '')}
      </span>
    );

  return (
    <div
      className='inline'
      onClick={(evnt) => {
        evnt.stopPropagation();
      }}
    >
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <span className={cn('whitespace-nowrap text-sm', !value && placeholder && 'text-muted-foreground')}>
            {dateValue || (placeholder ?? '')}
          </span>
        </PopoverTrigger>
        <PopoverContent asChild>
          <div className='p-0! inline-block'>
            <Calendar
              mode='single'
              captionLayout='label'
              selected={date}
              onSelect={(newDate: Date) => {
                setIsOpen(false);
                handleUpdateDate(newDate);
              }}
              className='w-full'
              required
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function getSortingRuleRanges(type: DadixFieldDataTypes) {
  switch (type) {
    case 'INTEGER':
    case 'SERIAL':
      return [1, 9];
    case 'DATE':
      return [1, 31];
    default:
      return ['A', 'Z'];
  }
}
