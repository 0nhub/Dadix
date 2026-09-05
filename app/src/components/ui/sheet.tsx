'use client';

import * as React from 'react';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { XIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot='sheet' {...props} />;
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot='sheet-trigger' {...props} />;
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot='sheet-close' {...props} />;
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot='sheet-portal' {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot='sheet-overlay'
      className={cn(
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-[110] bg-black/50',
        className
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = 'right',
  showCloseButton = false,
  disableOutsideClose = false,
  resizable = false,
  onResizeEnd,
  onResize,
  size,
  minSize,
  maxSize,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: 'top' | 'right' | 'bottom' | 'left';
  showCloseButton?: boolean;
  disableOutsideClose?: boolean;
  resizable?: boolean;
  onResizeEnd?: (_newSize: number) => void;
  onResize?: (_newSize: number) => void;
  size?: number | undefined;
  minSize?: number | undefined;
  maxSize?: number | undefined;
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot='sheet-content'
        className={cn(
          'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out fixed z-[110] flex flex-col gap-4 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500',
          side === 'right' &&
            'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0 h-full w-full max-w-[800px] border-l sm:max-w-sm max-sm:pl-4',
          side === 'left' &&
            'data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm',
          side === 'top' &&
            'data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top inset-x-0 top-0 h-auto border-b',
          side === 'bottom' &&
            'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom inset-x-0 bottom-0 h-auto border-t',
          className
        )}
        /* Prevent the sheet from closing when interacting outside while a Select (radix) dropdown is open */
        onInteractOutside={(e) => {
          if (disableOutsideClose) {
            e.preventDefault();
            return;
          }
          const selectOpen = document.querySelector(
            '[data-slot="select-content"][data-state="open"]'
          );
          // Keep sheet open when a select popover is active
          if (selectOpen) {
            e.preventDefault();
          }
        }}
        style={{
          ...props.style,
          ...((resizable &&
            (side === 'right' || side === 'left') && {
              maxWidth: `${size}px`,
            }) ||
            ((side === 'top' || side === 'bottom') && {
              maxHeight: `${size}px`,
            }) ||
            {}),
        }}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close className='data-[state=open]:bg-secondary rounded-xs focus:outline-none absolute right-4 top-4 opacity-70 transition-opacity hover:opacity-100 disabled:pointer-events-none'>
            <XIcon className='size-4' />
            <span className='sr-only'>Close</span>
          </SheetPrimitive.Close>
        )}
        {resizable && (
          <ResizeHandle
            side={side}
            size={size}
            minSize={minSize}
            maxSize={maxSize}
            onResizeEnd={onResizeEnd}
            onResize={onResize}
          />
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='sheet-header'
      className={cn('flex flex-col gap-1.5 p-4', className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='sheet-footer'
      className={cn('mt-auto flex flex-col gap-2 p-4', className)}
      {...props}
    />
  );
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot='sheet-title'
      className={cn('text-foreground font-semibold', className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot='sheet-description'
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

function ResizeHandle({
  side = 'right',
  size,
  minSize,
  maxSize,
  onResizeEnd,
  onResize,
}: {
  side?: 'top' | 'right' | 'bottom' | 'left';
  size?: number | undefined;
  minSize?: number | undefined;
  maxSize?: number | undefined;
  onResizeEnd?: (_newSize: number) => void;
  onResize?: (_newSize: number) => void;
}) {
  const [isResizing, setIsResizing] = React.useState(false);

  const resizeHanleRef = React.useRef<HTMLDivElement>(null);
  const resizeStartXRef = React.useRef<number>(0);
  const resizeStartYRef = React.useRef<number>(0);
  const resizeStartSizeRef = React.useRef<number>(0);
  const resizeAxisRef = React.useRef<'x' | 'y'>('x');

  React.useEffect(() => {
    resizeAxisRef.current = side === 'right' || side === 'left' ? 'x' : 'y';
  }, [side]);

  React.useEffect(() => {
    if (typeof size !== 'number' && typeof minSize !== 'number') return;
    if (!resizeHanleRef.current) return;
    const contentElement = resizeHanleRef.current
      .parentElement as HTMLDivElement;
    if (!contentElement) return;

    contentElement.style[
      resizeAxisRef.current === 'x' ? 'maxWidth' : 'maxHeight'
    ] = `${Math.max(size ?? 0, minSize ?? 0)}px`;
  }, [size, minSize]);

  React.useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent | TouchEvent) => {
      if (!resizeHanleRef.current) return;
      const contentElement = resizeHanleRef.current
        .parentElement as HTMLDivElement;
      if (!contentElement) return;
      const clientX = 'touches' in e ? e.touches[0]?.clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0]?.clientY : e.clientY;
      const deltaX = clientX - resizeStartXRef.current;
      const deltaY = clientY - resizeStartYRef.current;

      let newSize =
        contentElement.getBoundingClientRect()[
          resizeAxisRef.current === 'x' ? 'width' : 'height'
        ];

      // Calculate width based on side (dragging left vs dragging right)
      if (resizeAxisRef.current === 'x') {
        newSize =
          resizeStartSizeRef.current + (side === 'left' ? deltaX : -deltaX);
      } else {
        newSize =
          resizeStartSizeRef.current + (side === 'bottom' ? deltaY : -deltaY);
      }

      // Apply constraints
      if (typeof minSize === 'number' && newSize < minSize) newSize = minSize;
      if (typeof maxSize === 'number' && newSize > maxSize) newSize = maxSize;

      contentElement.style[
        resizeAxisRef.current === 'x' ? 'maxWidth' : 'maxHeight'
      ] = `${newSize}px`;
      onResize?.(newSize);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      if (!resizeHanleRef.current) return;
      const contentElement = resizeHanleRef.current
        .parentElement as HTMLDivElement;
      if (!contentElement) return;

      onResizeEnd?.(
        contentElement.getBoundingClientRect()[
          resizeAxisRef.current === 'x' ? 'width' : 'height'
        ]
      );
    };

    // Attach global listeners
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleMouseMove);
    window.addEventListener('touchend', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isResizing, side]);

  const handleResizeStart = (e: React.MouseEvent | React.TouchEvent) => {
    if (!resizeHanleRef.current) return;
    const contentElement = resizeHanleRef.current
      .parentElement as HTMLDivElement;
    if (!contentElement) return;

    e.preventDefault();

    resizeStartSizeRef.current =
      contentElement.getBoundingClientRect()[
        resizeAxisRef.current === 'x' ? 'width' : 'height'
      ];
    const clientX = 'touches' in e ? e.touches[0]?.clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0]?.clientY : e.clientY;
    resizeStartXRef.current = clientX;
    resizeStartYRef.current = clientY;

    setIsResizing(true);

    // Add simple visual feedback class to body
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <div
      ref={resizeHanleRef}
      aria-label='resize handle'
      className={cn(
        'absolute bg-(--accent-50) opacity-0 z-2 hover:opacity-100 active:opacity-100 focus-within:opacity-100',
        side === 'right' && 'top-0 left-0 w-2 h-full cursor-ew-resize',
        side === 'left' && 'top-0 right-0 w-2 h-full cursor-ew-resize',
        side === 'top' && 'left-0 bottom-0 w-full h-2 cursor-ns-resize',
        side === 'bottom' && 'left-0 top-0 w-full h-2 cursor-ns-resize'
      )}
      onMouseDown={handleResizeStart}
      onTouchStart={handleResizeStart}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
