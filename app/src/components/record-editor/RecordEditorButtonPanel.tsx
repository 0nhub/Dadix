'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { LucideMoreVertical, LucideTrash2, LucideX, LucideMaximize2 } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { useEventHandler } from '@/hooks/useEventHandler';
import type {
  RecordEditorButtonConfig,
  RecordEditorButtonWidthMode,
} from '@/components/table-cell-viewer';
import {
  FIELD_PANEL_LAYOUT_OPENED,
  FIELD_PANEL_LAYOUT_CLOSED,
} from '@/components/table-editor/EditTableFieldPanel';
import {
  openRecordButtonCodeFloatingWindow,
  registerRecordButtonFloatingWindowOnClose,
  RECORD_BUTTON_CODE_APPLY,
} from './RecordButtonCodeFloatingWindow';

const OPEN_RECORD_EDITOR_BUTTON_PANEL_EVENT =
  'dadix--open-record-editor-button-panel-event';

const FIELD_PANEL_DEFAULT_WIDTH = 420;

type SaveCallback = (config: RecordEditorButtonConfig) => void;
type DeleteCallback = () => void;

let pendingSaveCallback: SaveCallback | null = null;
let pendingDeleteCallback: DeleteCallback | null = null;

export function openRecordEditorButtonPanel({
  tableId,
  rowIndex,
  buttonConfig,
  fieldNames,
  onSave,
  onDelete,
}: {
  tableId: string | undefined;
  rowIndex: number;
  buttonConfig: RecordEditorButtonConfig;
  fieldNames?: string[];
  onSave: (config: RecordEditorButtonConfig) => void;
  onDelete: () => void;
}) {
  pendingSaveCallback = onSave;
  pendingDeleteCallback = onDelete;
  window.dispatchEvent(
    new CustomEvent(OPEN_RECORD_EDITOR_BUTTON_PANEL_EVENT, {
      detail: { tableId, rowIndex, buttonConfig, fieldNames: fieldNames ?? [] },
    })
  );
}

function applyConfig(config: RecordEditorButtonConfig) {
  pendingSaveCallback?.(config);
}

const CODE_SUGGESTIONS = ['alert()'];

function RecordEditorButtonPanel() {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [widthMode, setWidthMode] = useState<RecordEditorButtonWidthMode>('content');
  const [codeSuggestOpen, setCodeSuggestOpen] = useState(false);
  const [codeSuggestFilter, setCodeSuggestFilter] = useState('');
  const [codeSuggestMode, setCodeSuggestMode] = useState<'keyword' | 'field'>('keyword');
  const applyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const codeTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [fieldNames, setFieldNames] = useState<string[]>([]);

  useEventHandler(
    OPEN_RECORD_EDITOR_BUTTON_PANEL_EVENT,
    (evnt: Event) => {
      const { buttonConfig, fieldNames: names } = (evnt as CustomEvent).detail || {};
      if (buttonConfig == null) return;
      setTitle(buttonConfig.title ?? 'Button');
      setCode(buttonConfig.code ?? '');
      setWidthMode(buttonConfig.widthMode ?? 'content');
      setFieldNames(Array.isArray(names) ? names : []);
      // Same as Field Editor: dispatch layout so record editor shifts and both stay visible
      window.dispatchEvent(
        new CustomEvent(FIELD_PANEL_LAYOUT_OPENED, {
          detail: { width: FIELD_PANEL_DEFAULT_WIDTH },
        })
      );
      window.setTimeout(() => setIsOpen(true), 50);
    },
    []
  );

  useEventHandler(RECORD_BUTTON_CODE_APPLY, (evnt: Event) => {
    const config = (evnt as CustomEvent).detail;
    if (config && typeof config.code === 'string') {
      setCode(config.code);
      if (config.title != null) setTitle(config.title);
      if (config.widthMode != null) setWidthMode(config.widthMode);
      applyConfig(config);
    }
  });

  const applyDebounced = (config: RecordEditorButtonConfig) => {
    if (applyTimeoutRef.current) clearTimeout(applyTimeoutRef.current);
    applyTimeoutRef.current = setTimeout(() => {
      applyConfig(config);
      applyTimeoutRef.current = null;
    }, 300);
  };

  useEffect(() => {
    if (!isOpen) return;
    return () => {
      if (applyTimeoutRef.current) clearTimeout(applyTimeoutRef.current);
    };
  }, [isOpen]);

  const handleClose = () => {
    if (applyTimeoutRef.current) {
      clearTimeout(applyTimeoutRef.current);
      applyTimeoutRef.current = null;
    }
    pendingSaveCallback = null;
    pendingDeleteCallback = null;
    setIsOpen(false);
    window.dispatchEvent(new CustomEvent(FIELD_PANEL_LAYOUT_CLOSED));
  };

  const handleDelete = () => {
    pendingDeleteCallback?.();
    pendingSaveCallback = null;
    pendingDeleteCallback = null;
    setIsOpen(false);
    window.dispatchEvent(new CustomEvent(FIELD_PANEL_LAYOUT_CLOSED));
  };

  const handleTitleChange = (value: string) => {
    setTitle(value);
    applyDebounced({ title: value, code, widthMode });
  };

  const handleCodeChange = (value: string) => {
    setCode(value);
    applyDebounced({ title, code: value, widthMode });
  };

  const updateCodeSuggest = useCallback(() => {
    const ta = codeTextareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const textBefore = code.slice(0, start);
    // Field suggestion: . or .partial (e.g. ".ex" -> suggest ".example")
    const dotFieldMatch = textBefore.match(/\.([a-zA-Z0-9_]*)$/);
    if (dotFieldMatch) {
      const partial = dotFieldMatch[1];
      setCodeSuggestFilter('.' + partial);
      setCodeSuggestMode('field');
      setCodeSuggestOpen(true);
      return;
    }
    // alert() suggestion: a, al, ale, aler, alert
    const wordMatch = textBefore.match(/\b([a-zA-Z_]*)$/);
    const word = wordMatch ? wordMatch[1] : '';
    const couldBeAlert = 'alert'.startsWith(word) || word.startsWith('alert');
    if (couldBeAlert && word.length > 0) {
      setCodeSuggestFilter(word);
      setCodeSuggestMode('keyword');
      setCodeSuggestOpen(true);
    } else {
      setCodeSuggestOpen(false);
    }
  }, [code]);

  const insertCodeSuggestion = useCallback(
    (insert: string) => {
      const ta = codeTextareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const textBefore = code.slice(0, start);
      let replaceStart: number;
      if (codeSuggestMode === 'field') {
        const dotFieldMatch = textBefore.match(/\.([a-zA-Z0-9_]*)$/);
        replaceStart = dotFieldMatch ? start - (dotFieldMatch[0]?.length ?? 0) : start;
      } else {
        const wordMatch = textBefore.match(/\b([a-zA-Z_]*)$/);
        replaceStart = wordMatch ? start - (wordMatch[1]?.length ?? 0) : start;
      }
      const textAfter = code.slice(start);
      const newCode = code.slice(0, replaceStart) + insert + textAfter;
      setCode(newCode);
      applyDebounced({ title, code: newCode, widthMode });
      setCodeSuggestOpen(false);
      const newCursor = replaceStart + insert.length;
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(newCursor, newCursor);
      });
    },
    [code, title, widthMode, codeSuggestMode]
  );

  const codeSuggestionsList =
    codeSuggestMode === 'field'
      ? fieldNames
          .filter((name) => name.startsWith(codeSuggestFilter.slice(1)) || codeSuggestFilter === '.')
          .map((name) => `.${name}`)
      : CODE_SUGGESTIONS.filter((s) => {
          const name = s.replace(/\(\)$/, '');
          return name.startsWith(codeSuggestFilter) || codeSuggestFilter.startsWith(name);
        });

  const handleWidthModeChange = (value: RecordEditorButtonWidthMode) => {
    setWidthMode(value);
    applyDebounced({ title, code, widthMode: value });
  };

  return (
    <Sheet
      modal={false}
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <SheetContent
        side='right'
        disableOutsideClose
        className='!w-[420px] !max-w-[420px]'
        style={{ width: FIELD_PANEL_DEFAULT_WIDTH, maxWidth: FIELD_PANEL_DEFAULT_WIDTH }}
      >
        <SheetHeader className='gap-1'>
          <SheetTitle className='flex justify-start gap-2'>
            <Button
              onClick={handleClose}
              autoFocus
              size='icon'
              variant='outline'
              className='mr-auto'
              aria-label={t('common.cancel', 'Close')}
            >
              <LucideX />
            </Button>
            <DropdownMenu modal={true}>
              <DropdownMenuTrigger asChild>
                <Button size='icon' variant='outline' autoFocus={false} aria-label='Menu'>
                  <LucideMoreVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem variant='destructive' onClick={handleDelete}>
                  <LucideTrash2 />
                  {t('common.delete', 'Delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SheetTitle>
        </SheetHeader>
        <div className='flex flex-col gap-4 overflow-y-auto px-4 pb-4 text-sm'>
          <div className='flex flex-col gap-4'>
            <div className='flex flex-col gap-3'>
              <Label htmlFor='record-editor-button-title'>Title</Label>
              <Input
                id='record-editor-button-title'
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder='Button'
              />
            </div>
            <div className='flex flex-col gap-3'>
              <Label>{t('recordEditor.buttonWidth.label', 'Button width')}</Label>
              <ToggleGroup
                type='single'
                value={widthMode}
                onValueChange={(v) => {
                  if (v) handleWidthModeChange(v as RecordEditorButtonWidthMode);
                }}
                className='w-full'
              >
                <ToggleGroupItem value='content' className='flex-1'>
                  {t('recordEditor.buttonWidth.content', 'Content width')}
                </ToggleGroupItem>
                <ToggleGroupItem value='full' className='flex-1'>
                  {t('recordEditor.buttonWidth.full', 'Full width')}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className='flex flex-col gap-3'>
              <div className='flex items-center justify-between gap-2'>
                <Label htmlFor='record-editor-button-code'>Code</Label>
                <div className='rounded-md border border-input bg-muted/30 p-0.5'>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    className='size-7'
                    aria-label='Open code in window'
                    onClick={() => {
                      registerRecordButtonFloatingWindowOnClose(() => {
                        pendingSaveCallback = null;
                      });
                      openRecordButtonCodeFloatingWindow({
                        initialCode: code,
                        title,
                        widthMode,
                      });
                    }}
                  >
                    <LucideMaximize2 className='size-4' />
                  </Button>
                </div>
              </div>
              <Popover open={codeSuggestOpen} onOpenChange={setCodeSuggestOpen}>
                <PopoverTrigger asChild>
                  <div className='relative'>
                    <Textarea
                      ref={codeTextareaRef}
                      id='record-editor-button-code'
                      value={code}
                      onChange={(e) => handleCodeChange(e.target.value)}
                      onSelect={updateCodeSuggest}
                      onKeyUp={updateCodeSuggest}
                      className='min-h-[120px] resize-y'
                    />
                  </div>
                </PopoverTrigger>
                <PopoverContent
                  className='w-auto p-1'
                  align='start'
                  onOpenAutoFocus={(e) => e.preventDefault()}
                >
                  {codeSuggestionsList.map(
                    (suggestion) => (
                      <button
                        key={suggestion}
                        type='button'
                        className='flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent'
                        onClick={() => insertCodeSuggestion(suggestion)}
                      >
                        {suggestion}
                      </button>
                    )
                  )}
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export { RecordEditorButtonPanel };
