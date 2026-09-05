import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { IFilter } from '@/types';
import { useEffect, useRef, useState } from 'react';

export function BooleanFilter({
  fieldName,
  filter,
  onUpdateFilter,
}: {
  fieldName: string;
  filter: IFilter;
  onUpdateFilter: (_newFilterValue: IFilter) => void;
}) {
  const [value, setValue] = useState<string>(filter?.value || '');
  const filterRef = useRef<IFilter>(filter);

  useEffect(() => {
    filterRef.current = { ...filter };
    setValue(filter?.value || '');
  }, [filter]);

  function updateFilter(newValue: string) {
    if (!filterRef.current) return;
    onUpdateFilter({
      ...filterRef.current,
      value: newValue,
      relation: 'and',
      operation: 'eq',
    });
  }

  return (
    <div className='flex flex-col gap-2 mb-6'>
      <Label
        htmlFor={`${fieldName.replaceAll(' ', '_')}`}
        className='block capitalize'
      >
        {fieldName}
      </Label>
      <Tabs
        value={value || 'All'}
        onValueChange={(value) => {
          const newValue = value === 'All' ? '' : value;
          setValue(newValue);
          updateFilter(newValue);
        }}
      >
        <TabsList className='w-full'>
          <TabsTrigger value='All'>All</TabsTrigger>
          <TabsTrigger value='true'>True</TabsTrigger>
          <TabsTrigger value='false'>False</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
