import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { IFilter } from '@/types';
import { formatDate } from 'date-fns';
import { LucideCalendar } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export function DateFilter({
  fieldName,
  filter,
  onUpdateFilter,
}: {
  fieldName: string;
  filter: IFilter[];
  onUpdateFilter: (_newFilterValue: IFilter[]) => void;
}) {
  const [from, setFrom] = useState<string>(filter[0]?.value);
  const [to, setTo] = useState<string>(filter[1]?.value);
  const filterRef = useRef<IFilter[]>(filter);

  useEffect(() => {
    filterRef.current = [...filter];
    setFrom(filter[0]?.value || '');
    setTo(filter[1]?.value || '');
  }, [filter]);

  function updateFilterFrom(newValue: string) {
    if (!filterRef.current) return;
    onUpdateFilter([
      {
        ...filterRef.current[0],
        value: newValue,
        relation: 'and',
        operation: 'gte',
      },
      { ...filterRef.current[1] },
    ]);
  }

  function updateFilterTo(newValue: string) {
    if (!filterRef.current) return;
    onUpdateFilter([
      { ...filterRef.current[0] },
      {
        ...filterRef.current[1],
        value: newValue,
        relation: 'and',
        operation: 'lte',
      },
    ]);
  }

  return (
    <div className='flex flex-col gap-2 mb-6'>
      <Label className='block capitalize'>{fieldName}</Label>
      <div className='flex flex-row flex-nowrap items-center justify-between gap-3'>
        <SelectDate
          value={from}
          placeholder='From'
          onChange={(newValue: string) => {
            setFrom(newValue);
            updateFilterFrom(newValue);
          }}
        />
        <SelectDate
          value={to}
          placeholder='To'
          onChange={(newValue: string) => {
            setTo(newValue);
            updateFilterTo(newValue);
          }}
        />
      </div>
    </div>
  );
}

function SelectDate({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (_newValue: string) => void;
}) {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant='outline'
          className='flex flex-row flex-nowrap justify-start items-center shrink w-full'
        >
          {value ? (
            formatDate(new Date(value), 'dd.MM.yyyy')
          ) : (
            <span className='opacity-50'>{placeholder}</span>
          )}
          <LucideCalendar className='ml-auto size-4 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <Calendar
          mode='single'
          selected={new Date(value)}
          captionLayout='dropdown'
          onSelect={(date) => {
            onChange(date?.toISOString() || '');
            setIsOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
