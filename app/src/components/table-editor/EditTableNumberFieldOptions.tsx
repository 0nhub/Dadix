'use client';

import { useEffect, useRef, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import tableService from '@/lib/table';
import type { Field, NumberFieldOptions } from '@/types';

interface EditTableNumberFieldOptionsProps {
  numberField: Field;
  tableId: number | string | undefined;
}

const THOUSANDS_OPTIONS: { value: NumberFieldOptions['thousandsSeparator']; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'point', label: 'Point (.)' },
  { value: 'comma', label: 'Comma (,)' },
  { value: 'space', label: 'Space' },
];

const DECIMAL_SEP_OPTIONS: { value: NumberFieldOptions['decimalSeparator']; label: string }[] = [
  { value: 'point', label: 'Point (.)' },
  { value: 'comma', label: 'Comma (,)' },
];

export function EditTableNumberFieldOptions({
  numberField,
  tableId,
}: EditTableNumberFieldOptionsProps) {
  const opts = numberField.numberOptions ?? {};
  const [thousandsSeparator, setThousandsSeparator] = useState<NumberFieldOptions['thousandsSeparator']>(opts.thousandsSeparator ?? 'none');
  const [decimalPlaces, setDecimalPlaces] = useState<number>(opts.decimalPlaces ?? 0);
  const [decimalSeparator, setDecimalSeparator] = useState<NumberFieldOptions['decimalSeparator']>(opts.decimalSeparator ?? 'point');
  const [prefix, setPrefix] = useState<string>(opts.prefix ?? '');
  const [suffix, setSuffix] = useState<string>(opts.suffix ?? '');
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setThousandsSeparator((opts.thousandsSeparator ?? 'none') as NumberFieldOptions['thousandsSeparator']);
    setDecimalPlaces(opts.decimalPlaces ?? 0);
    setDecimalSeparator((opts.decimalSeparator ?? 'point') as NumberFieldOptions['decimalSeparator']);
    setPrefix(opts.prefix ?? '');
    setSuffix(opts.suffix ?? '');
  }, [numberField.id, opts.thousandsSeparator, opts.decimalPlaces, opts.decimalSeparator, opts.prefix, opts.suffix]);

  const save = (data: Partial<NumberFieldOptions>) => {
    if (!tableId || !numberField?.id) return;
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      tableService.patchTableFieldNumberOptions({
        tableId: String(tableId),
        fieldId: numberField.id,
        data: { ...opts, ...data },
        silent: false,
      });
    }, 400);
  };

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex flex-col gap-2'>
        <Label className='font-medium'>Thousands separator</Label>
        <Select
          value={thousandsSeparator}
          onValueChange={(v: NumberFieldOptions['thousandsSeparator']) => {
            setThousandsSeparator(v);
            save({ ...opts, thousandsSeparator: v });
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {THOUSANDS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className='flex flex-col gap-2'>
        <Label className='font-medium'>Decimal places</Label>
        <Input
          type='number'
          min={0}
          max={20}
          value={decimalPlaces}
          onChange={(e) => {
            const v = Math.max(0, Math.min(20, parseInt(e.target.value, 10) || 0));
            setDecimalPlaces(v);
            save({ ...opts, decimalPlaces: v });
          }}
        />
      </div>
      {decimalPlaces > 0 && (
        <div className='flex flex-col gap-2'>
          <Label className='font-medium'>Decimal separator</Label>
          <Select
            value={decimalSeparator}
            onValueChange={(v: NumberFieldOptions['decimalSeparator']) => {
              setDecimalSeparator(v);
              save({ ...opts, decimalSeparator: v });
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DECIMAL_SEP_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className='flex flex-col gap-2'>
        <Label className='font-medium'>Prefix</Label>
        <Input
          value={prefix}
          placeholder='e.g. EUR or $'
          onChange={(e) => {
            const v = e.target.value;
            setPrefix(v);
            save({ ...opts, prefix: v });
          }}
        />
      </div>
      <div className='flex flex-col gap-2'>
        <Label className='font-medium'>Suffix</Label>
        <Input
          value={suffix}
          placeholder='e.g. € or USD'
          onChange={(e) => {
            const v = e.target.value;
            setSuffix(v);
            save({ ...opts, suffix: v });
          }}
        />
      </div>
    </div>
  );
}
