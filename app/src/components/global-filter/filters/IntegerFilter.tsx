import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { IFilter } from '@/types';
import { useEffect, useRef, useState } from 'react';

export function IntegerFilter({
  fieldName,
  filter,
  onUpdateFilter,
}: {
  fieldName: string;
  filter: IFilter[];
  onUpdateFilter: (_newFilterValue: IFilter[]) => void;
}) {
  const [from, setFrom] = useState<number | undefined>(
    parseInt(filter[0]?.value) ?? undefined
  );
  const [to, setTo] = useState<number | undefined>(
    parseInt(filter[1]?.value) ?? undefined
  );
  const filterRef = useRef<IFilter[]>(filter);

  useEffect(() => {
    filterRef.current = [...filter];
    setFrom(parseInt(filter[0]?.value) ?? undefined);
    setTo(parseInt(filter[1]?.value) ?? undefined);
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
        <Input
          placeholder='From'
          type='number'
          value={from}
          onChange={(evnt) => {
            const newValue = parseInt(evnt.target.value);
            setFrom(newValue);
          }}
          onBlur={(evnt) => {
            const newValue = parseInt(evnt.target.value);
            updateFilterFrom(
              `${newValue}` !== `${evnt.target.value}` ? '' : evnt.target.value
            );
          }}
        />
        <Input
          placeholder='To'
          type='number'
          value={to}
          onChange={(evnt) => {
            const newValue = parseInt(evnt.target.value);
            setTo(newValue);
          }}
          onBlur={(evnt) => {
            const newValue = parseInt(evnt.target.value);
            updateFilterTo(
              `${newValue}` !== `${evnt.target.value}` ? '' : evnt.target.value
            );
          }}
        />
      </div>
    </div>
  );
}
