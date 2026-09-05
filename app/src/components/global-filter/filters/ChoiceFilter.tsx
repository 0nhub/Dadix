import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { ChoiceFieldOption, IFilter } from '@/types';
import { useEffect, useRef, useState } from 'react';

export function ChoiceFilter({
  fieldName,
  choices,
  filter,
  onUpdateFilter,
}: {
  fieldName: string;
  choices: ChoiceFieldOption[];
  filter: IFilter;
  onUpdateFilter: (_newFilterValue: IFilter) => void;
}) {
  const [value, setValue] = useState<string[]>(
    parseInExpressionValue(filter?.value || '')
  );
  const filterRef = useRef<IFilter>(filter);

  useEffect(() => {
    filterRef.current = { ...filter };
    setValue(parseInExpressionValue(filter?.value || ''));
  }, [filter]);

  function updateFilter(newValue: string) {
    if (!filterRef.current) return;
    onUpdateFilter({
      ...filterRef.current,
      value: newValue,
      relation: 'and',
      operation: 'in',
    });
  }

  return (
    <div className='flex flex-col gap-2 mb-6'>
      <p>{fieldName}</p>
      {choices.map((choice) => {
        return (
          <div
            key={choice.id}
            className='flex flex-row justify-start items-center gap-2 flex-nowrap'
          >
            <Checkbox
              id={`${choice.value.replaceAll(' ', '_')}`}
              checked={value.indexOf(choice.value) >= 0}
              onCheckedChange={(checked) => {
                let newValue;
                if (checked) {
                  setValue((value) => {
                    newValue = [...value, choice.value];
                    return newValue;
                  });
                } else {
                  setValue((value) => {
                    newValue = value.filter((v) => v !== choice.value);
                    return newValue;
                  });
                }
                updateFilter(
                  (newValue || []).map((value) => `"${value}"`).join(',')
                );
              }}
              className='cursor-pointer'
            />
            <Label
              htmlFor={`${choice.value.replaceAll(' ', '_')}`}
              className='inline-block capitalize overflow-hidden cursor-pointer'
              title={choice.value}
            >
              {choice.value}
            </Label>
          </div>
        );
      })}
    </div>
  );
}

function parseInExpressionValue(value: string): string[] {
  const inputs = [''];
  let openedQuats = null;
  for (let i = 0; i < value.length; i++) {
    const lastToken = value.charAt(i - 1);
    const token = value.charAt(i);
    if (lastToken !== '\\') {
      if (!openedQuats) {
        switch (token) {
          case '"':
          case "'":
            openedQuats = token;
            continue;
          default:
            break;
        }
      } else {
        switch (token) {
          case openedQuats:
            openedQuats = null;
            continue;
          default:
            break;
        }
      }
    }
    if (!openedQuats && token === ',') {
      inputs.push('');
      continue;
    }
    if (!openedQuats && token === ' ') {
      // skip white spaces
      continue;
    }
    inputs[inputs.length - 1] += token;
  }

  return inputs.filter((input) => input !== '');
}
