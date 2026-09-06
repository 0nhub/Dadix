import { useRef, type DragEvent, type MouseEvent } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  fileToFieldValue,
  isFileFieldImage,
  parseFileFieldValue,
  serializeFileFieldValue,
  type FileFieldValue,
} from '@/lib/fileField';

const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml';

export function FileFieldControl({
  value,
  disabled,
  placeholder,
  compact,
  onChange,
}: {
  value: unknown;
  disabled?: boolean;
  placeholder?: string;
  compact?: boolean;
  onChange: (next: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const parsed = parseFileFieldValue(value);
  const showImage = isFileFieldImage(parsed);

  const pick = (event?: MouseEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    if (disabled) return;
    inputRef.current?.click();
  };

  const applyFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const next = await fileToFieldValue(file);
      onChange(serializeFileFieldValue(next));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add image');
    }
  };

  const clear = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    onChange('');
  };

  const handleDragOver = (event: DragEvent) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDrop = (event: DragEvent) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    void applyFile(event.dataTransfer.files?.[0]);
  };

  return (
    <div
      className={cn(
        'group/file flex min-w-0 items-center gap-2',
        compact ? 'h-full w-full' : 'w-full'
      )}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type='file'
        accept={ACCEPT}
        className='sr-only'
        disabled={disabled}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          void applyFile(file);
        }}
      />
      {parsed && showImage ? (
        <button
          type='button'
          disabled={disabled}
          onClick={pick}
          className={cn(
            'relative shrink-0 overflow-hidden rounded border border-border bg-muted',
            compact ? 'size-7' : 'size-20',
            disabled ? 'pointer-events-none cursor-default' : 'cursor-pointer'
          )}
          aria-label={parsed.name}
        >
          <img
            src={parsed.dataUrl}
            alt={parsed.name}
            className='size-full object-cover'
          />
        </button>
      ) : (
        <button
          type='button'
          disabled={disabled}
          onClick={pick}
          className={cn(
            'inline-flex shrink-0 items-center justify-center rounded border border-dashed border-border text-muted-foreground',
            compact ? 'size-7' : 'h-20 w-full max-w-xs gap-2 px-3',
            disabled ? 'pointer-events-none cursor-default' : 'hover:bg-foreground/5'
          )}
        >
          <ImagePlus className={compact ? 'size-3.5' : 'size-4'} />
          {!compact && (
            <span className='text-sm'>
              {placeholder?.trim() || 'Add image'}
            </span>
          )}
        </button>
      )}
      {parsed && (
        <div className='min-w-0 flex-1'>
          <div className='truncate text-sm' title={parsed.name}>
            {parsed.name}
          </div>
          {!compact && (
            <div className='text-xs text-muted-foreground'>
              {formatFileSize(parsed)}
            </div>
          )}
        </div>
      )}
      {parsed && !disabled && (
        <button
          type='button'
          aria-label='Remove file'
          className={cn(
            'inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-foreground/8 hover:text-foreground',
            compact && 'opacity-0 group-hover/file:opacity-100'
          )}
          onClick={clear}
        >
          <X className='size-3.5' />
        </button>
      )}
    </div>
  );
}

function formatFileSize(value: FileFieldValue) {
  if (!value.size) return 'Image';
  if (value.size < 1024) return `${value.size} B`;
  if (value.size < 1024 * 1024) return `${Math.round(value.size / 1024)} KB`;
  return `${(value.size / (1024 * 1024)).toFixed(1)} MB`;
}
