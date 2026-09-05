'use client';

import { useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LucideChevronDown, LucideChevronUp, LucideX } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FindMatch {
  rowIndex: number;
  columnId: string;
}

interface GridViewFindBarProps {
  open: boolean;
  onClose: () => void;
  query: string;
  onQueryChange: (_q: string) => void;
  matches: FindMatch[];
  currentIndex: number;
  onPrev: () => void;
  onNext: () => void;
  className?: string;
}

export function GridViewFindBar({
  open,
  onClose,
  query,
  onQueryChange,
  matches,
  currentIndex,
  onPrev,
  onNext,
  className,
}: GridViewFindBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  if (!open) return null;

  const total = matches.length;
  const hasMatches = total > 0;
  const currentOneBased = total > 0 ? currentIndex + 1 : 0;

  return (
    <div
      className={cn(
        'absolute top-2 right-2 z-10 flex items-center gap-1 rounded-md border bg-background px-2 py-1 shadow-sm',
        className
      )}
      role='search'
      aria-label='Find in table'
    >
      <Input
        ref={inputRef}
        type='text'
        placeholder='Find'
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        className='h-8 w-40 border-0 bg-transparent px-2 py-1 text-sm shadow-none focus-visible:ring-0'
        aria-label='Search text'
      />
      <span className='text-muted-foreground text-xs tabular-nums'>
        {total === 0 && query ? 'No matches' : total > 0 ? `${currentOneBased} / ${total}` : ''}
      </span>
      <Button
        variant='ghost'
        size='icon'
        className='size-7 shrink-0'
        onClick={onPrev}
        disabled={total === 0}
        aria-label='Previous match'
      >
        <LucideChevronUp className='size-4' />
      </Button>
      <Button
        variant='ghost'
        size='icon'
        className='size-7 shrink-0'
        onClick={onNext}
        disabled={total === 0}
        aria-label='Next match'
      >
        <LucideChevronDown className='size-4' />
      </Button>
      <Button
        variant='ghost'
        size='icon'
        className='size-7 shrink-0'
        onClick={onClose}
        aria-label='Close find'
      >
        <LucideX className='size-4' />
      </Button>
    </div>
  );
}
