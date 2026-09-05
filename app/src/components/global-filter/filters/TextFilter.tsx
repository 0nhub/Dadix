import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { IFilter } from '@/types';
import { useEffect, useRef, useState } from 'react';

export function TextFilter({
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
      operation: 'like',
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
      <Input
        id={`${fieldName.replaceAll(' ', '_')}`}
        placeholder={`${fieldName} value`}
        type='text'
        value={value}
        onChange={(evnt) => {
          setValue(evnt.target.value);
        }}
        onBlur={(evnt) => {
          updateFilter(evnt.target.value);
        }}
      />
    </div>
  );
}
