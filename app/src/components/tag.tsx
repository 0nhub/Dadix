import { useState, useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

interface TagProps {
  size?: 'sm' | 'default';
  value?: string;
  options?: {
    id: string | number;
    value: string;
    order: number;
    color: string;
  }[];
  className?: string;
  placeholder?: string;
  onValueChange?: (_value: string) => void;
  disabled?: boolean;
  /** When true, multiple options can be selected. Value is JSON array string e.g. '["v1","v2"]'. */
  multi?: boolean;
}

function parseMultiValue(value: string | undefined): string[] {
  if (value == null || value === '') return [];
  try {
    const arr = JSON.parse(value);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

/** For display only: never show raw JSON array. Return comma‑joined labels or single value. */
function toDisplayText(
  value: string | undefined,
  options: { id: string | number; value: string; order: number; color: string }[]
): string {
  if (value == null || value === '') return '';
  const parsed = parseMultiValue(value);
  if (parsed.length === 0) {
    if (typeof value === 'string' && value.trim().startsWith('[')) return '';
    return value;
  }
  return parsed
    .map((v) => options.find((o) => o.value === v)?.value ?? v)
    .join(', ');
}

/** When value is a JSON array string, use first element for single-choice Select so it shows the option label. */
function valueForSingle(value: string | undefined): string | undefined {
  if (value == null || value === '') return value;
  const parsed = parseMultiValue(value);
  return parsed.length > 0 ? parsed[0] : value;
}

export default function Tag({
  value,
  size,
  options = [],
  className = '',
  placeholder,
  onValueChange,
  disabled = false,
  multi = false,
}: TagProps) {
  const [localValue, setLocalValue] = useState<string | undefined>(value);
  const [multiOpen, setMultiOpen] = useState(false);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleValueChange = (newValue: string) => {
    setLocalValue(newValue);
    onValueChange?.(newValue);
  };

  if (multi) {
    const selected = parseMultiValue(localValue);
    const displayText =
      selected.length === 0 ? (placeholder ?? '') : toDisplayText(localValue, options);

    const toggleOption = (optionValue: string) => {
      const next = selected.includes(optionValue)
        ? selected.filter((s) => s !== optionValue)
        : [...selected, optionValue];
      handleValueChange(JSON.stringify(next));
    };

    return (
      <Popover open={multiOpen} onOpenChange={setMultiOpen}>
        <PopoverTrigger asChild>
          <button
            type='button'
            disabled={disabled}
            className={cn(
              'flex min-w-25 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-disabled:opacity-100 data-disabled:cursor-auto data-disabled:pointer-events-none',
              size === 'sm' && 'py-1.5 text-xs',
              className
            )}
          >
            <span className={!displayText ? 'text-muted-foreground' : ''}>
              {displayText || placeholder || 'Select…'}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent className='w-56 p-2' align='start'>
          <div className='flex flex-col gap-1'>
            {options.map((option) => (
              <label
                key={option.id}
                className='flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent'
              >
                <Checkbox
                  checked={selected.includes(option.value)}
                  onCheckedChange={() => toggleOption(option.value)}
                />
                <span>{option.value}</span>
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  const singleValue = valueForSingle(localValue);
  return (
    <Select
      disabled={disabled}
      value={singleValue !== undefined && singleValue !== '' ? singleValue : undefined}
      onValueChange={handleValueChange}
    >
      <SelectTrigger
        size={size}
        className={`min-w-25 data-disabled:opacity-100 data-disabled:cursor-auto data-disabled:pointer-events-none ${className}`}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className='z-9999'>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.value}>
            {option.value}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
