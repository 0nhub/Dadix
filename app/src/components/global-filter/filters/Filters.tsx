import type { Field, IFilter } from '@/types';
import { IntegerFilter } from './IntegerFilter';
import { TextFilter } from './TextFilter';
import { BooleanFilter } from './BooleanFilter';
import { DateFilter } from './DateFilter';
import { ChoiceFilter } from './ChoiceFilter';
import { useEffect, useState } from 'react';

interface FiltersProps {
  filters: Record<number, IFilter[]>;
  setFilters: (_filters: Record<number, IFilter[]>) => void;
  tableFields: Field[];
}

export function Filters({
  filters: globalFilters,
  setFilters: setGlobalFilters,
  tableFields,
}: FiltersProps) {
  const [filters, setLocaleFilters] = useState<typeof globalFilters>({});

  useEffect(() => {
    setFilters(globalFilters);
  }, [globalFilters]);

  function setFilters(newFilters: typeof globalFilters) {
    setGlobalFilters(newFilters);
    setLocaleFilters(newFilters);
  }

  return (
    <>
      {tableFields?.map((field, i) => {
        switch (field.type) {
          case 'TEXT':
            return (
              <TextFilter
                key={i}
                fieldName={field.name}
                filter={
                  (filters[field.id] || [])[0] || {
                    fieldId: field.id,
                    id: `filter_${i}`,
                    operation: 'like',
                    relation: 'and',
                    value: '',
                  }
                }
                onUpdateFilter={(newFilterValue: IFilter) => {
                  const newFilters = { ...filters };
                  newFilters[field.id] = [{ ...newFilterValue }];
                  setFilters({ ...newFilters });
                }}
              />
            );
          case 'BOOLEAN':
            return (
              <BooleanFilter
                key={i}
                fieldName={field.name}
                filter={
                  (filters[field.id] || [])[0] || {
                    fieldId: field.id,
                    id: `filter_${i}`,
                    operation: 'eq',
                    relation: 'and',
                    value: '',
                  }
                }
                onUpdateFilter={(newFilterValue: IFilter) => {
                  const newFilters = { ...filters };
                  newFilters[field.id] = [{ ...newFilterValue }];
                  setFilters({ ...newFilters });
                }}
              />
            );
          case 'DATE':
            return (
              <DateFilter
                key={i}
                fieldName={field.name}
                filter={
                  filters[field.id] || [
                    {
                      fieldId: field.id,
                      id: `filter_${i}`,
                      operation: 'gte',
                      relation: 'and',
                      value: '',
                    },
                    {
                      fieldId: field.id,
                      id: `filter_${i}`,
                      operation: 'lte',
                      relation: 'and',
                      value: '',
                    },
                  ]
                }
                onUpdateFilter={(newFilterValue: IFilter[]) => {
                  const newFilters = { ...filters };
                  newFilters[field.id] = [...newFilterValue];
                  setFilters({ ...newFilters });
                }}
              />
            );
          case 'SERIAL':
          case 'INTEGER':
            return (
              <IntegerFilter
                key={i}
                fieldName={field.name}
                filter={
                  filters[field.id] || [
                    {
                      fieldId: field.id,
                      id: `filter_${i}`,
                      operation: 'gte',
                      relation: 'and',
                      value: '',
                    },
                    {
                      fieldId: field.id,
                      id: `filter_${i}`,
                      operation: 'lte',
                      relation: 'and',
                      value: '',
                    },
                  ]
                }
                onUpdateFilter={(newFilterValue: IFilter[]) => {
                  const newFilters = { ...filters };
                  newFilters[field.id] = [...newFilterValue];
                  setFilters({ ...newFilters });
                }}
              />
            );
          case 'CHOICE':
            return (
              <ChoiceFilter
                key={i}
                fieldName={field.name}
                filter={
                  (filters[field.id] || [])[0] || {
                    fieldId: field.id,
                    id: `filter_${i}`,
                    operation: 'in',
                    relation: 'and',
                    value: '',
                  }
                }
                choices={field.options || []}
                onUpdateFilter={(newFilterValue: IFilter) => {
                  const newFilters = { ...filters };
                  newFilters[field.id] = [{ ...newFilterValue }];
                  setFilters({ ...newFilters });
                }}
              />
            );
          default:
            return null;
        }
      })}
    </>
  );
}
