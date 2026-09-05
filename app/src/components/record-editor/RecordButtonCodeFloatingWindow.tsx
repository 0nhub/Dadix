'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LucideX, LucideMoreVertical, LucideExternalLink } from 'lucide-react';
import type { RecordEditorButtonWidthMode } from '@/components/table-cell-viewer';

export const OPEN_RECORD_BUTTON_CODE_FLOATING_WINDOW =
  'dadix--open-record-button-code-floating-window';
export const RECORD_BUTTON_CODE_APPLY = 'dadix--record-button-code-apply';

export type RecordButtonCodeFloatingParams = {
  initialCode: string;
  title: string;
  widthMode: RecordEditorButtonWidthMode;
};

let recordButtonFloatingWindowOnClose: (() => void) | null = null;

export function registerRecordButtonFloatingWindowOnClose(fn: (() => void) | null) {
  recordButtonFloatingWindowOnClose = fn;
}

export function getRecordButtonFloatingWindowOnClose() {
  return recordButtonFloatingWindowOnClose;
}

function RecordButtonCodeFloatingWindow({
  params,
  onClose,
}: {
  params: RecordButtonCodeFloatingParams;
  onClose: () => void;
}) {
  const { initialCode, title, widthMode } = params;
  const [code, setCode] = useState(initialCode);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, startLeft: 0, startTop: 0 });

  const saveCode = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent(RECORD_BUTTON_CODE_APPLY, {
        detail: { code, title, widthMode },
      })
    );
  }, [code, title, widthMode]);

  useEffect(() => {
    setCode(initialCode);
  }, [initialCode]);

  useEffect(() => {
    if (code === initialCode) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveCode();
      saveTimeoutRef.current = null;
    }, 800);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [code, initialCode, saveCode]);

  const handleClose = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveCode();
    }
    getRecordButtonFloatingWindowOnClose()?.();
    registerRecordButtonFloatingWindowOnClose(null);
    onClose();
  }, [code, saveCode, onClose]);

  const handleOpenEditor = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveCode();
    }
    getRecordButtonFloatingWindowOnClose()?.();
    registerRecordButtonFloatingWindowOnClose(null);
    onClose();
  }, [code, saveCode, onClose]);

  const onTitleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      dragRef.current = {
        isDragging: true,
        startX: e.clientX,
        startY: e.clientY,
        startLeft: position.x,
        startTop: position.y,
      };
    },
    [position]
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current.isDragging) return;
      setPosition({
        x: dragRef.current.startLeft + e.clientX - dragRef.current.startX,
        y: dragRef.current.startTop + e.clientY - dragRef.current.startY,
      });
    };
    const onUp = () => {
      dragRef.current.isDragging = false;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed z-[10070] flex flex-col w-[480px] max-w-[90vw] min-h-[280px] max-h-[80vh] rounded-lg border bg-background shadow-lg overflow-hidden"
      style={{ left: position.x, top: position.y }}
    >
      <div
        className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center gap-2 px-2 py-1.5 border-b bg-muted/50 cursor-grab active:cursor-grabbing select-none"
        onMouseDown={onTitleMouseDown}
      >
        <div className="flex justify-start">
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="size-8 shrink-0"
            onClick={handleClose}
            aria-label="Close"
          >
            <LucideX className="size-4" />
          </Button>
        </div>
        <span className="text-sm font-medium truncate text-center min-w-0">
          {title || 'Code'}
        </span>
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="icon" variant="outline" className="size-8 shrink-0">
                <LucideMoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleOpenEditor}>
                <LucideExternalLink className="size-4" />
                Open editor
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="flex-1 overflow-hidden p-2 min-h-0">
        <textarea
          className="w-full h-full min-h-[220px] p-3 rounded-md border bg-background font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
        />
      </div>
    </div>,
    document.body
  );
}

export function RecordButtonCodeFloatingWindowHolder() {
  const [state, setState] = useState({
    open: false,
    params: null as RecordButtonCodeFloatingParams | null,
  });

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as RecordButtonCodeFloatingParams;
      if (!detail) return;
      setState({ open: true, params: detail });
    };
    window.addEventListener(OPEN_RECORD_BUTTON_CODE_FLOATING_WINDOW, handler);
    return () => window.removeEventListener(OPEN_RECORD_BUTTON_CODE_FLOATING_WINDOW, handler);
  }, []);

  const onClose = useCallback(() => {
    setState({ open: false, params: null });
  }, []);

  if (!state.open || !state.params) return null;

  return <RecordButtonCodeFloatingWindow params={state.params} onClose={onClose} />;
}

export function openRecordButtonCodeFloatingWindow(params: RecordButtonCodeFloatingParams) {
  window.dispatchEvent(
    new CustomEvent(OPEN_RECORD_BUTTON_CODE_FLOATING_WINDOW, {
      detail: params,
    })
  );
}
