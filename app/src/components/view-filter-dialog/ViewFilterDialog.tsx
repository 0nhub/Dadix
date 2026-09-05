import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  LucideCalendar,
  LucideEllipsis,
  LucideGripVertical,
  LucidePlus,
  LucideTrash2,
  LucideX,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import type {
  Field,
  FilterOperations,
  FilterRelations,
  IFilter,
} from '@/types';
import { Calendar } from '@/components/ui/calendar';
import { formatDate } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
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

const communFilterOperations = {
  eq: 'is',
  neq: 'is not',
  isnull: 'is empty',
  notnull: 'is not empty',
};

const filterOperationsPerFieldDataType: Record<
  string,
  Record<string, string>
> = {
  TEXT: {
    like: 'contains',
    nlike: 'does not contain',
    ...communFilterOperations,
  },
  CHOICE: {
    ...communFilterOperations,
  },
  INTEGER: {
    lte: 'less then or equal',
    gte: 'greater then or equal',
    ...communFilterOperations,
  },
  SERIAL: {
    lte: 'less then or equal',
    gte: 'greater then or equal',
    ...communFilterOperations,
  },
  BOOLEAN: {
    ...communFilterOperations,
  },
  DATE: {
    lte: 'before or equal',
    gte: 'after or equal',
    ...communFilterOperations,
  },
};

const OPEN_FILTER_DIALOG_EVENT = 'dadix--open-filter-dialog-event';

function ViewFilterDialog() {
  const [filters, setFilters] = useState<IFilter[]>([]);
  const [tableFields, setTableFields] = useState<Field[]>([]);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const onUpdateFiltersCallbackRef =
    useRef<(_filters: IFilter[]) => void | undefined>(undefined);

  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {})
  );

  useEffect(() => {
    window.addEventListener(OPEN_FILTER_DIALOG_EVENT, handleOpenDialogEvent);
    return () => {
      window.removeEventListener(
        OPEN_FILTER_DIALOG_EVENT,
        handleOpenDialogEvent
      );
    };
    function handleOpenDialogEvent(evnt: Event) {
      if (isOpen) return;
      const { filters, tableFields, onUpdateFiltersCallback } =
        (evnt as CustomEvent).detail || {};
      if (tableFields === undefined || !onUpdateFiltersCallback) return;
      setTableFields(tableFields || []);
      setFilters(filters || []);
      onUpdateFiltersCallbackRef.current = onUpdateFiltersCallback;
      setIsOpen(true);
    }
  }, [isOpen]);

  useEffect(() => {
    if (filters.length > 0 || !isOpen || tableFields.length < 0) return;
    const emptyFilter = generateEmptyFilter('where');
    if (!emptyFilter) return;
    setFilters([{ ...emptyFilter }]);
  }, [filters, isOpen, tableFields]);

  function updateFilter({
    index,
    data,
  }: {
    index: number;
    data: Partial<IFilter>;
  }) {
    setFilters((filters) =>
      filters.map((filter, i) => {
        if (i === index) {
          return { ...filter, ...data };
        }
        return filter;
      })
    );
  }

  function generateEmptyFilter(relation?: FilterRelations): IFilter | null {
    if (tableFields.length === 0) return null;
    const fieldId = tableFields[0].id;
    return {
      id: `${new Date().getTime()}${Math.floor(Math.random() * 999)}`,
      relation: relation || 'and',
      fieldId,
      operation: 'eq',
      value: '',
    };
  }

  function addNewFilter(relation?: FilterRelations) {
    const newFilter = generateEmptyFilter(relation);
    if (!newFilter) return;
    setFilters((filters) => [
      ...filters,
      {
        ...newFilter,
      },
    ]);
  }

  function saveFiltersChanges() {
    const newFilters = filters.filter(
      (filter) =>
        !(
          !filter.value ||
          !filter.fieldId ||
          !filter.operation ||
          !filter.relation
        )
    );
    setFilters([...newFilters]);
    if (onUpdateFiltersCallbackRef.current) {
      onUpdateFiltersCallbackRef.current([...newFilters]);
    }
    if (newFilters.length === 0) {
      addNewFilter('where');
    }
    setIsOpen(false);
  }

  function clearFilters() {
    const emptyFilter = generateEmptyFilter('where');
    if (!emptyFilter) {
      toast.error('Error clearing filter, please refresh page');
      return;
    }
    setFilters([{ ...emptyFilter }]);
    if (onUpdateFiltersCallbackRef.current) {
      onUpdateFiltersCallbackRef.current([]);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const oldOrder = active?.data?.current?.order;
    const newOrder = over?.data?.current?.order;
    const draggedFilter = filters[oldOrder];
    let reorderedCount = 1;
    if (draggedFilter.relation === 'or') {
      for (let i = oldOrder + 1; i < filters.length; i++) {
        const filter = filters[i];
        if (filter.relation === 'or') break;
        reorderedCount++;
      }
    }
    if (newOrder < oldOrder + reorderedCount && newOrder >= oldOrder) return;
    // update filters order
    setFilters((filters) => {
      // split filters list into 2 lists, draged and not draged filters lists
      const dragedFilters: IFilter[] = [];
      const notDraggedFilters: IFilter[] = [];
      filters.map((filter, index) => {
        if (index >= oldOrder + reorderedCount || index < oldOrder) {
          notDraggedFilters.push({ ...filter });
        } else {
          dragedFilters.push({ ...filter });
        }
        return null;
      });
      // find new starting order of draged filters in the not draged filters list
      const order =
        newOrder > oldOrder ? newOrder - (reorderedCount - 1) : newOrder;
      // combine draged and not draged filters lists with correct order
      return [
        ...notDraggedFilters.slice(0, order),
        ...dragedFilters,
        ...notDraggedFilters.slice(order),
      ].map((filter, index) => {
        // update relations based on order changes ('where' relation can be only for first filter)
        if (index === 0)
          return {
            ...filter,
            relation: 'where',
          };
        return {
          ...filter,
          relation: filter.relation === 'where' ? 'and' : filter.relation,
        };
      });
    });
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent showCloseButton={false} className='sm:max-w-[960px]'>
        <DialogHeader className='flex-row flex-nowrap justify-between items-center'>
          <DialogClose asChild>
            <Button variant='outline' size='icon'>
              <LucideX />
            </Button>
          </DialogClose>
          <DialogTitle>Filter</DialogTitle>
          <DropdownMenu modal={true}>
            <DropdownMenuTrigger asChild>
              <Button variant='outline' size='icon'>
                <LucideEllipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={clearFilters}>
                Clear filter
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </DialogHeader>
        <DndContext
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
          sensors={sensors}
          id='filters-editor--filters-list'
        >
          <SortableContext
            items={filters}
            strategy={verticalListSortingStrategy}
          >
            <div className='flex flex-col gap-0 overflow-auto max-h-[calc(100vh-190px)] pt-2 pb-2'>
              {filters.map((filter, filterIndex) => (
                <Filter
                  key={filter.id}
                  order={filterIndex}
                  tableFields={tableFields}
                  filter={filter}
                  updateFilter={(data: Partial<IFilter>) => {
                    updateFilter({ index: filterIndex, data });
                  }}
                  deleteFilter={() => {
                    setFilters((filters) => {
                      const newFiltersList = filters.filter(
                        (_filter, index) => index !== filterIndex
                      );
                      if (newFiltersList.length === 0) {
                        const emptyFilter = generateEmptyFilter('where');
                        if (emptyFilter) {
                          newFiltersList.push(emptyFilter);
                        }
                      }
                      if (filterIndex === 0) {
                        newFiltersList[0].relation = 'where';
                      }
                      return [...newFiltersList];
                    });
                  }}
                  className={`${filter.relation === 'or' && 'mt-3'} ${filter.relation === 'and' && 'rounded-t-none'} ${filters[filterIndex + 1]?.relation === 'and' && 'rounded-b-none border-b-0'}`}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <DialogFooter className='flex-row'>
          <Button
            onClick={() => {
              addNewFilter();
            }}
            variant='outline'
            className='mr-auto'
          >
            <LucidePlus />
            Rule
          </Button>
          <Button onClick={saveFiltersChanges} variant='default'>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Filter({
  filter,
  tableFields,
  order,
  updateFilter,
  className = '',
  deleteFilter,
}: {
  filter: IFilter;
  tableFields: Field[];
  order: number;
  updateFilter: (_data: Partial<IFilter>) => void;
  className?: string;
  deleteFilter: () => void;
}) {
  // const currentTableCtx = useCurrentTableContext();
  const {
    transform,
    transition,
    setNodeRef,
    isDragging,
    attributes,
    listeners,
  } = useSortable({
    id: filter.id,
    data: {
      id: filter.id,
      order,
    },
  });

  const selectedField = tableFields.filter(
    (field) => `${field.id}` === `${filter.fieldId}`
  )[0];

  const novalueNeeded = ['isnull', 'notnull'].indexOf(filter.operation) >= 0;

  return (
    <div
      data-dragging={isDragging}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`relative bg-muted/25 flex flex-row flex-nowrap items-center justify-start gap-1 p-1 h-12 border rounded-md ${className} data-[dragging=true]:z-10 data-[dragging=true]:opacity-80 data-[dragging=true]:border data-[dragging=true]:rounded-md`}
    >
      <div
        {...attributes}
        {...listeners}
        className='flex justify-center items-center w-6 h-full shrink-0 grow-0 cursor-grab active:cursor-grabbing'
      >
        <LucideGripVertical className='text-muted-foreground size-4.5' />
      </div>
      {filter.relation === 'where' ? (
        <div className='bg-background inline-flex border text-muted-foreground text-sm p-1.75 pl-3 pr-3 rounded-md shadow-xs min-w-20'>
          Where
        </div>
      ) : (
        <Select
          value={filter.relation}
          onValueChange={(newValue: string) => {
            updateFilter({
              relation: newValue as FilterRelations,
            });
          }}
        >
          <SelectTrigger className='bg-background grow-0 shrink-0 min-w-20'>
            <SelectValue className='text-ellipsis' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='and'>AND</SelectItem>
            <SelectItem value='or'>OR</SelectItem>
          </SelectContent>
        </Select>
      )}
      <Select
        value={`${filter.fieldId}`}
        onValueChange={(newValue: string) => {
          updateFilter({
            fieldId: parseInt(newValue),
            value: undefined,
            operation: 'eq',
          });
        }}
      >
        <SelectTrigger
          className='bg-background grow-0 shrink-0 w-[22%]'
          title={selectedField?.name}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {tableFields.map((field) => (
            <SelectItem value={`${field.id}`} key={field.id}>
              {field.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filter.operation}
        onValueChange={(newValue: string) => {
          updateFilter({
            operation: newValue as FilterOperations,
          });
        }}
      >
        <SelectTrigger
          className='bg-background grow-0 shrink-0 w-[22%]'
          title={
            filterOperationsPerFieldDataType[selectedField?.type || ''][
              filter.operation
            ]
          }
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {selectedField &&
            Object.keys(
              filterOperationsPerFieldDataType[selectedField.type]
            ).map((operation) => (
              <SelectItem value={`${operation}`} key={operation}>
                {
                  filterOperationsPerFieldDataType[selectedField.type][
                    operation
                  ]
                }
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      {novalueNeeded ? (
        <div className='grow shrink' />
      ) : (
        <FilterValueInput
          field={selectedField}
          value={filter.value}
          updateFilter={updateFilter}
        />
      )}
      <DropdownMenu modal={true}>
        <DropdownMenuTrigger asChild>
          <Button variant='ghost' size='icon'>
            <LucideEllipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem variant='destructive' onClick={deleteFilter}>
            <LucideTrash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function FilterValueInput({
  field,
  value,
  updateFilter,
}: {
  field: Field | undefined;
  value: string;
  updateFilter: (_data: Partial<IFilter>) => void;
}) {
  const [isDatePickerOpen, setIsDatePickerOpen] = useState<boolean>(false);
  const filterFieldType = field?.type;

  if (!field) {
    return <></>;
  }

  if (filterFieldType === 'DATE') {
    return (
      <DropdownMenu open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant='outline'
            data-empty={!value}
            className='data-[empty=true]:text-muted-foreground justify-start text-left font-normal grow shrink'
          >
            <LucideCalendar />
            {value ? (
              formatDate(new Date(value), 'dd.MM.yyyy')
            ) : (
              <span>Value</span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className='w-auto p-0'>
          <Calendar
            mode='single'
            selected={new Date(value)}
            onSelect={(newValue) => {
              updateFilter({
                value: newValue?.toLocaleString(),
              });
              setIsDatePickerOpen(false);
            }}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (filterFieldType === 'BOOLEAN' || filterFieldType === 'CHOICE') {
    const options =
      filterFieldType === 'BOOLEAN'
        ? ['true', 'false']
        : (field.options || []).map((option) => option.value);
    return (
      <Select
        value={value}
        onValueChange={(newValue: string) => {
          updateFilter({
            value: newValue,
          });
        }}
      >
        <SelectTrigger
          className='bg-background grow shrink-0 w-[22%]'
          title={value}
        >
          <SelectValue placeholder='Value' />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem value={`${option}`} key={`${option}`}>
              {`${option}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (filterFieldType === 'INTEGER' || filterFieldType === 'SERIAL') {
    return (
      <Input
        className='bg-background grow shrink'
        value={value}
        type='number'
        placeholder='Value'
        onChange={(evnt) => {
          updateFilter({
            value: `${evnt.target.value}`,
          });
        }}
      />
    );
  }

  return (
    <Input
      className='bg-background grow shrink'
      value={value}
      type='text'
      placeholder='Value'
      onChange={(evnt) => {
        updateFilter({
          value: evnt.target.value,
        });
      }}
    />
  );
}

function openViewFilterDialog({
  filters,
  tableFields,
  onUpdateFiltersCallback,
}: {
  filters: IFilter[];
  tableFields: Field[];
  onUpdateFiltersCallback: (_filters: IFilter[]) => void;
}) {
  window.dispatchEvent(
    new CustomEvent(OPEN_FILTER_DIALOG_EVENT, {
      detail: {
        filters,
        tableFields,
        onUpdateFiltersCallback,
      },
    })
  );
}

export { ViewFilterDialog, openViewFilterDialog };
