'use client';

import type { Field } from '@/types';
import type { AIFieldOutputType } from '@/types';
import { useEffect, useRef, useState } from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EditorState } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  WidgetType,
} from '@codemirror/view';
import {
  autocompletion,
  closeBrackets,
  type CompletionContext,
} from '@codemirror/autocomplete';
import {
  defaultHighlightStyle,
  syntaxHighlighting,
} from '@codemirror/language';
import tableService from '@/lib/table';
import { getAIBatchSize, setAIBatchSize, fillEmptyAICells } from '@/lib/aiComplete';
import { getAIApiKeys, AI_PROVIDER_LABELS } from '@/lib/aiApiKeys';
import { dadixEvents } from '@/constants/events';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getAllRecordsForExport } from '@/lib/record';
import { toast } from 'sonner';
import { LucidePlay } from 'lucide-react';

const PROMPT_PLACEHOLDER = 'Use # to reference other fields';

class PlaceholderWidget extends WidgetType {
  constructor(private text: string) {
    super();
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-placeholder';
    span.style.cssText =
      'color: var(--muted-foreground); pointer-events: none;';
    span.textContent = this.text;
    return span;
  }
}

function promptPlaceholderPlugin(placeholder: string) {
  return ViewPlugin.fromClass(
    class {
      decorations: Decoration.Set;
      constructor(view: EditorView) {
        this.decorations =
          view.state.doc.length === 0
            ? Decoration.set([
                Decoration.widget({
                  widget: new PlaceholderWidget(placeholder),
                  side: 1,
                }).range(0),
              ])
            : Decoration.none;
      }
      update(update: { docChanged: boolean; state: EditorState }) {
        if (update.docChanged) {
          this.decorations =
            update.state.doc.length === 0
              ? Decoration.set([
                  Decoration.widget({
                    widget: new PlaceholderWidget(placeholder),
                    side: 1,
                  }).range(0),
                ])
              : Decoration.none;
        }
      }
    },
    { decorations: (v) => v.decorations }
  );
}

const OUTPUT_TYPES: { value: AIFieldOutputType; label: string }[] = [
  { value: 'TEXT', label: 'Text' },
  { value: 'INTEGER', label: 'Number' },
  { value: 'DATE', label: 'Date' },
  { value: 'BOOLEAN', label: 'Boolean' },
];

function promptFieldAutocomplete(tableFields: Field[]) {
  return function complete(context: CompletionContext) {
    const match = context.matchBefore(/#[\w\u00C0-\u024F]*/);
    if (!match) return null;
    const word = match.text.toLowerCase();
    if (!word.startsWith('#')) return null;
    const options = tableFields
      .filter(
        (f) =>
          word === '#' || `#${f.name}`.toLowerCase().startsWith(word)
      )
      .map((f) => ({
        displayLabel: f.name,
        label: `#${f.name}`,
        type: 'variable',
      }));
    if (options.length === 0) return null;
    return {
      from: match.from,
      to: match.to,
      options,
    };
  };
}

function highlightHashFieldsPlugin(tableFields: Field[]) {
  const deco = Decoration.mark({ class: 'cm-highlight-table-fields' });
  const regexp = new RegExp(
    tableFields
      .map(
        (f) =>
          `#${f.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s/g, '\\s')}`
      )
      .join('|'),
    'g'
  );
  const matcher = new MatchDecorator({ regexp, decoration: () => deco });
  return ViewPlugin.define(
    (view) => ({
      decorations: matcher.createDeco(view),
      update(update) {
        this.decorations = matcher.updateDeco(update, this.decorations);
      },
    }),
    { decorations: (v) => v.decorations }
  );
}

export function EditTableAIField({
  fieldId,
  tableFields,
  tableId,
  aiOptions,
}: {
  fieldId: number;
  tableFields: Field[];
  tableId: string | number | undefined;
  aiOptions:
    | { prompt: string; outputType: AIFieldOutputType; apiKeyId: string }
    | undefined;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null!);
  const [outputType, setOutputType] = useState<AIFieldOutputType>(
    aiOptions?.outputType ?? 'TEXT'
  );
  const [apiKeyId, setApiKeyId] = useState(aiOptions?.apiKeyId ?? '');
  const [batchSize, setBatchSize] = useState(() => getAIBatchSize());

  const prompt = aiOptions?.prompt ?? '';
  const otherFields = tableFields
    .filter((f) => `${f.id}` !== `${fieldId}`)
    .sort((a, b) => (b.name?.length ?? 0) - (a.name?.length ?? 0));

  useEffect(() => {
    if (!containerRef.current || !tableId) return;
    const state = EditorState.create({
      doc: prompt,
      extensions: [
        EditorView.lineWrapping,
        promptPlaceholderPlugin(PROMPT_PLACEHOLDER),
        closeBrackets(),
        autocompletion({
          override: [promptFieldAutocomplete(otherFields)],
          activateOnTyping: true,
        }),
        syntaxHighlighting(defaultHighlightStyle),
        highlightHashFieldsPlugin(otherFields),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          const newPrompt = update.state.doc.toString();
          clearTimeout(updateTimeoutRef.current);
          updateTimeoutRef.current = setTimeout(() => {
            patchAiOptions({ prompt: newPrompt });
          }, 600);
        }),
        EditorView.theme({
          '&.cm-editor, & .cm-scroller': {
            minHeight: '120px',
            maxHeight: '200px',
          },
          '&.cm-editor.cm-focused': { outline: 'none' },
          '& .cm-content': {
            padding: '8px 12px',
            cursor: 'text',
            fontFamily: 'inherit',
            fontSize: '0.875rem',
            lineHeight: '1.5',
          },
          '& .cm-scroller': { cursor: 'text' },
          '&.cm-editor': {
            border: '1px solid var(--input)',
            borderRadius: '8px',
            fontFamily: 'inherit',
            fontSize: '0.875rem',
          },
          '& .cm-gutters': {
            borderTopLeftRadius: '8px',
            borderBottomLeftRadius: '8px',
          },
          '& .cm-highlight-table-fields': { color: '#4fb9ff' },
        }),
      ],
    });
    editorRef.current = new EditorView({ state, parent: containerRef.current });
    return () => {
      editorRef.current?.destroy();
      editorRef.current = null;
    };
  }, [fieldId, tableId]);

  useEffect(() => {
    setOutputType(aiOptions?.outputType ?? 'TEXT');
  }, [aiOptions?.outputType]);

  const patchAiOptions = (
    partial: Partial<{
      prompt: string;
      outputType: AIFieldOutputType;
      apiKeyId: string;
    }>
  ) => {
    const current = aiOptions ?? {
      prompt: '',
      outputType: 'TEXT' as const,
      apiKeyId: '',
    };
    const next = { ...current, ...partial };
    tableService.patchTableField({
      tableId: `${tableId}`,
      id: fieldId,
      field: { aiOptions: next },
    });
    window.dispatchEvent(
      new CustomEvent(dadixEvents.tableEvents.onPatchField, {
        detail: { tableId, fieldId, data: { aiOptions: next } },
      })
    );
  };

  const [isRunning, setIsRunning] = useState(false);

  const handleRunForAllEmpty = async () => {
    if (!tableId || !tableFields?.length) return;
    setIsRunning(true);
    try {
      const records = await getAllRecordsForExport(tableId);
      const { filled, errors } = await fillEmptyAICells({
        tableId,
        tableFields,
        records: records ?? [],
        batchSize: getAIBatchSize(),
      });
      if (errors.length > 0) toast.error(errors[0]);
      if (filled > 0) toast.success(`${filled} AI field(s) filled`);
      else if (errors.length === 0) toast.info('No empty AI fields to fill.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    } finally {
      setIsRunning(false);
    }
  };

  if (!tableId || !fieldId) return null;

  const focusEditor = () => editorRef.current?.focus();

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-col gap-2'>
        <Label>Prompt</Label>
        <div
          ref={containerRef}
          className='min-h-[120px] w-full cursor-text rounded-md border border-input bg-transparent text-sm [&_.cm-editor]:min-h-[120px] [&_.cm-scroller]:min-h-[120px]'
          role='textbox'
          tabIndex={-1}
          onClick={focusEditor}
          onKeyDown={(e) => {
            if (e.target !== containerRef.current) return;
            editorRef.current?.focus();
          }}
        />
      </div>
      <div className='flex flex-col gap-2'>
        <Label>Output</Label>
        <Select
          value={outputType}
          onValueChange={(v) => {
            const next = v as AIFieldOutputType;
            setOutputType(next);
            patchAiOptions({ outputType: next });
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OUTPUT_TYPES.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className='flex flex-col gap-2'>
        <Label>API key</Label>
        <Select
          value={apiKeyId || '__none__'}
          onValueChange={(v) => {
            const next = v === '__none__' ? '' : v;
            setApiKeyId(next);
            patchAiOptions({ apiKeyId: next });
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder='Select key…' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='__none__'>— None —</SelectItem>
            {getAIApiKeys().map((k) => (
              <SelectItem key={k.id} value={k.id}>
                {k.name} ({AI_PROVIDER_LABELS[k.provider as keyof typeof AI_PROVIDER_LABELS] ?? k.provider})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className='flex flex-col gap-2'>
        <Label>Fields per request</Label>
        <Input
          type='number'
          min={1}
          max={50}
          value={batchSize}
          onChange={(e) => {
            const raw = e.target.value;
            const v = raw === '' ? 0 : parseInt(raw, 10);
            if (raw === '' || !Number.isNaN(v)) {
              const clamped = raw === '' ? 1 : Math.min(50, Math.max(1, v));
              setBatchSize(clamped);
              setAIBatchSize(clamped);
            }
          }}
        />
      </div>
      <div className='flex flex-col gap-2'>
        <Button
          type='button'
          variant='default'
          className='w-full'
          onClick={handleRunForAllEmpty}
          disabled={isRunning}
        >
          <LucidePlay className='size-4 shrink-0' />
          {isRunning ? 'Running…' : 'Run'}
        </Button>
      </div>
    </div>
  );
}
