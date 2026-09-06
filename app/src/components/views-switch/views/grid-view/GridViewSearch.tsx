import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import type { IDadixGridViewField, IFilter } from '@/types';
import { formatDate } from 'date-fns';
import { LucideX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface GridViewSearchProps {
  field: IDadixGridViewField;
  searchFilters: IFilter[];
  setSearchFilters: (_searxhFilters: IFilter[]) => void;
}

function GridViewSearch({
  field,
  searchFilters,
  setSearchFilters,
}: GridViewSearchProps) {
  const searchFiltersRef = useRef<IFilter[]>([]);

  useEffect(() => {
    searchFiltersRef.current = [...searchFilters];
  }, [searchFilters]);

  let SearchUI = <></>;
  const searchUIAttributes = {
    placeHolder: field.fieldName,
    filter: searchFilters.find(
      (filter) => filter.fieldId === field.fieldId
    ) || {
      id: `${field.fieldId}`,
      fieldId: field.fieldId,
      operation: field.type === 'TEXT' ? 'like' : 'eq',
      relation: 'and',
      value: '',
    },
    updateFilter: (newValue: string) => {
      let isFilterExist = false;
      const updatedSearchFilters =
        searchFiltersRef.current.map((searchFilter) => {
          if (field.fieldId === searchFilter.fieldId) {
            isFilterExist = true;
            return {
              ...searchFilter,
              value: newValue,
            };
          }
          return { ...searchFilter };
        }) || [];
      if (!isFilterExist) {
        updatedSearchFilters.push({
          id: `${field.fieldId}`,
          fieldId: field.fieldId,
          operation: field.type === 'TEXT' ? 'like' : 'eq',
          relation: 'and',
          value: newValue,
        });
      }
      setSearchFilters([...updatedSearchFilters]);
    },
  };
  switch (field.type) {
    case 'SERIAL':
    case 'INTEGER':
      SearchUI = <NumberSearch {...searchUIAttributes} />;
      break;
    case 'BOOLEAN':
      SearchUI = <BooleanSearch {...searchUIAttributes} />;
      break;
    case 'DATE':
      SearchUI = <DateSearch {...searchUIAttributes} />;
      break;
    case 'CHOICE':
      SearchUI = (
        <ChoiceSearch
          {...searchUIAttributes}
          choiceOptions={(field.options || []).map((option) => option.value)}
        />
      );
      break;
    case 'TEXT':
      SearchUI = <TextSearch {...searchUIAttributes} />;
      break;
    case 'FILE':
      SearchUI = <></>;
      break;
    default:
      SearchUI = <TextSearch {...searchUIAttributes} />;
  }

  return (
    <div className='w-full min-w-0 flex-1 flex flex-col py-1 box-border'>
      {SearchUI}
    </div>
  );
}

function TextSearch({
  filter,
  updateFilter,
  placeHolder,
}: {
  filter: IFilter;
  updateFilter: (_newValue: string) => void;
  placeHolder: string;
}) {
  const lastUpdateFilterTimeoutRef = useRef<NodeJS.Timeout>(undefined);
  const [value, setValue] = useState<string>(filter.value || '');

  useEffect(() => {
    setValue(filter.value || '');
  }, [filter.value]);

  const handleClear = () => {
    setValue('');
    updateFilter('');
  };

  return (
    <div className='relative w-full min-w-0'>
      <Input
        placeholder={placeHolder}
        value={value}
        onChange={(evnt) => {
          const newValue = evnt.target.value || '';
          setValue(newValue);
          clearTimeout(lastUpdateFilterTimeoutRef.current);
          lastUpdateFilterTimeoutRef.current = setTimeout(() => {
            updateFilter(newValue);
          }, 150);
        }}
        type='text'
        className='px-2.5 pr-8 w-full min-w-0 bg-background text-foreground'
      />
      {value ? (
        <button
          type='button'
          onClick={handleClear}
          className='absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground'
          aria-label='Clear'
        >
          <LucideX className='size-3.5' />
        </button>
      ) : null}
    </div>
  );
}

function NumberSearch({
  filter,
  updateFilter,
  placeHolder,
}: {
  filter: IFilter;
  updateFilter: (_newValue: string) => void;
  placeHolder: string;
}) {
  const [value, setValue] = useState<string>(filter.value || '');

  return (
    <Input
      className='px-2.5 w-full min-w-0 bg-background text-foreground'
      type='number'
      placeholder={placeHolder}
      value={value}
      onChange={(evnt) => {
        const newValue = evnt.target.value || '';
        setValue(newValue);
      }}
      onBlur={(evnt) => {
        const newValue = evnt.target.value || '';
        updateFilter(newValue);
      }}
    />
  );
}

function DateSearch({
  filter,
  updateFilter,
  placeHolder,
}: {
  filter: IFilter;
  updateFilter: (_newValue: string) => void;
  placeHolder: string;
}) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [value, setValue] = useState<string>(filter.value || '');

  return (
    <Select open={isOpen} onOpenChange={setIsOpen}>
      <SelectTrigger className='px-2.5 w-full min-w-0 max-w-full bg-background text-foreground overflow-hidden'>
        {value ? (
          <span className='text-foreground overflow-hidden'>
            {formatDate(new Date(value), 'dd.MM.yyyy')}
          </span>
        ) : (
          <span className='text-foreground opacity-50 overflow-hidden'>
            {placeHolder}
          </span>
        )}
      </SelectTrigger>
      <SelectContent>
        <Calendar
          mode='single'
          selected={new Date(value)}
          captionLayout='dropdown'
          onSelect={(date) => {
            const newValue = date?.toISOString() || '';
            setValue(newValue);
            updateFilter(newValue);
            setIsOpen(false);
          }}
        />
      </SelectContent>
    </Select>
  );
}

function BooleanSearch({
  filter,
  updateFilter,
  placeHolder,
}: {
  filter: IFilter;
  updateFilter: (_newValue: string) => void;
  placeHolder: string;
}) {
  return (
    <Select
      value={filter.value}
      onValueChange={(newValue) => {
        updateFilter(newValue.trim());
      }}
    >
      <SelectTrigger
        type='button'
        className='px-2.5 w-full min-w-0 max-w-full bg-background text-foreground overflow-hidden'
      >
        {filter.value ? (
          <span className='text-foreground overflow-hidden'>
            {filter.value}
          </span>
        ) : (
          <span className='text-foreground opacity-50 overflow-hidden'>
            {placeHolder}
          </span>
        )}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value=' '>
          <span className='opacity-50 pointer-events-none select-none'>
            All
          </span>
        </SelectItem>
        <SelectItem value='True'>True</SelectItem>
        <SelectItem value='False'>False</SelectItem>
      </SelectContent>
    </Select>
  );
}

function ChoiceSearch({
  choiceOptions,
  filter,
  updateFilter,
  placeHolder,
}: {
  choiceOptions: string[];
  filter: IFilter;
  updateFilter: (_newValue: string) => void;
  placeHolder: string;
}) {
  return (
    <Select
      value={filter.value}
      onValueChange={(newValue) => {
        updateFilter(newValue.trim());
      }}
    >
      <SelectTrigger
        type='button'
        className='px-2.5 w-full min-w-0 max-w-full bg-background text-foreground overflow-hidden'
      >
        {filter.value ? (
          <span className='text-foreground overflow-hidden'>
            {filter.value}
          </span>
        ) : (
          <span className='text-foreground opacity-50 overflow-hidden'>
            {placeHolder}
          </span>
        )}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={' '}>
          <span className='opacity-50 pointer-events-none select-none'>
            All
          </span>
        </SelectItem>
        {choiceOptions.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export { GridViewSearch };
