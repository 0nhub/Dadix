import type { Field } from '@/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { validateDadixCode } from '@/lib/dadixCodeEval';
import { Button } from '@/components/ui/button';
import { LucideMaximize2 } from 'lucide-react';
import { CODE_FIELD_FLOATING_WINDOW_UPDATED } from './CodeFieldFloatingWindow';
import tableService from '@/lib/table';
import { EditorState } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  lineNumbers,
  MatchDecorator,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import {
  autocompletion,
  closeBrackets,
  type CompletionContext,
} from '@codemirror/autocomplete';
import {
  defaultHighlightStyle,
  syntaxHighlighting,
  bracketMatching,
} from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';

export function EditTableFormulaField({
  fieldId,
  fieldType = 'FORMULA',
  tableFields,
  tableId,
  onOpenFloatingWindow,
}: {
  fieldId: number;
  fieldType?: 'FORMULA' | 'CODE';
  tableFields: Field[];
  tableId: number | string | undefined;
  onOpenFloatingWindow?: (initialCode: string) => void;
}) {
  const currentFieldIdRef = useRef<number>(undefined);
  const updateFormulaTimeoutRef = useRef<NodeJS.Timeout>(undefined);
  const codeEditorContainerRef = useRef<HTMLDivElement>(null);
  const codeEditorRef = useRef<EditorView>(null);
  /** Immer aktueller Inhalt – für Save-on-close, falls Editor beim Unmount schon zerstört ist */
  const latestFormulaRef = useRef<string>(
    tableFields.find((field) => `${field.id}` === `${fieldId}`)?.formula || ''
  );

  const [_formula, setFormula] = useState<string>(
    tableFields.find((field) => `${field.id}` === `${fieldId}`)?.formula || ''
  );
  const [outputTick, setOutputTick] = useState(0);

  useEffect(() => {
    if (!codeEditorContainerRef.current) return;
    if (currentFieldIdRef.current === fieldId) return;
    currentFieldIdRef.current = fieldId;
    const formula =
      tableFields.find((field) => `${field.id}` === `${fieldId}`)?.formula ||
      '';
    setFormula(formula);

    const sortedTableFields = tableFields
      .filter((field) => `${fieldId}` !== `${field.id}`)
      .sort((field1, field2) => field2.name.length - field1.name.length);

    latestFormulaRef.current = formula;
    try {
      const editorState = initCodMirrorState({
        formula,
        fieldType,
        onFormulaUpdate: (newFormula: string) => {
          latestFormulaRef.current = newFormula;
          setFormula(newFormula);
          setOutputTick((t) => t + 1);
          updateFormulaOnServer(newFormula);
        },
        tableFields: sortedTableFields,
      });
      if (codeEditorRef.current) {
        try {
          codeEditorRef.current.destroy();
        } catch (err) {
          console.warn(err);
        }
      }
      codeEditorRef.current = new EditorView({
        state: editorState,
        parent: codeEditorContainerRef.current,
        doc: formula,
      });
    } catch (err) {
      console.error('Code editor init failed', err);
      codeEditorRef.current = null;
    }
  }, [fieldId, fieldType, tableFields]);

  function updateFormulaOnServer(value: string) {
    clearTimeout(updateFormulaTimeoutRef.current);
    updateFormulaTimeoutRef.current = setTimeout(() => {
      tableService.patchTableFieldFormula({
        tableId: `${tableId}`,
        fieldId: fieldId || '',
        newValue: value,
      });
    }, 1000);
  }

  // Beim Schließen des Panels sofort speichern (Ref, da Editor beim Unmount ggf. schon zerstört ist)
  useEffect(() => {
    return () => {
      clearTimeout(updateFormulaTimeoutRef.current);
      updateFormulaTimeoutRef.current = undefined;
      if (tableId == null || fieldId == null) return;
      const valueToSave = latestFormulaRef.current ?? '';
      tableService.patchTableFieldFormula({
        tableId: `${tableId}`,
        fieldId,
        newValue: valueToSave,
        silent: false,
      });
    };
  }, [tableId, fieldId]);

  const codeOutput = useMemo(() => {
    if (fieldType !== 'CODE') return null;
    const code = latestFormulaRef.current ?? _formula ?? '';
    if (!code.trim()) return '';
    try {
      const out = validateDadixCode({
        code,
        record: {},
        fields: tableFields,
      });
      return out.valid ? String(out.result ?? '') : (out.error ?? '');
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }, [fieldType, _formula, outputTick, tableFields]);

  const handleMaximize = useCallback(() => {
    const initialCode = latestFormulaRef.current ?? _formula ?? '';
    onOpenFloatingWindow?.(initialCode);
  }, [_formula, onOpenFloatingWindow]);

  useEffect(() => {
    if (fieldType !== 'CODE') return;
    const handler = (e: Event) => {
      const { fieldId: updatedFieldId, code } = (e as CustomEvent).detail || {};
      if (updatedFieldId != null && `${updatedFieldId}` === `${fieldId}` && typeof code === 'string') {
        latestFormulaRef.current = code;
        setFormula(code);
        const view = codeEditorRef.current;
        if (view && view.state.doc.toString() !== code) {
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: code },
          });
        }
      }
    };
    window.addEventListener(CODE_FIELD_FLOATING_WINDOW_UPDATED, handler);
    return () => window.removeEventListener(CODE_FIELD_FLOATING_WINDOW_UPDATED, handler);
  }, [fieldId, fieldType]);

  if (!tableId || !fieldId) return null;

  return (
    <>
      <div className='flex flex-col gap-3'>
        <div className='flex items-center justify-between gap-2'>
          <div className='text-sm font-medium'>{fieldType === 'CODE' ? 'Code' : 'JavaScript'}</div>
          {fieldType === 'CODE' && onOpenFloatingWindow && (
            <div className='rounded-md border border-input bg-muted/30 p-0.5'>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='size-7'
                onClick={handleMaximize}
                aria-label='Open code in window'
              >
                <LucideMaximize2 className='size-4' />
              </Button>
            </div>
          )}
        </div>
        <div className='relative'>
          <div ref={codeEditorContainerRef} />
        </div>
        {fieldType === 'CODE' && (
          <div className='flex flex-col gap-1.5'>
            <div className='text-xs font-medium text-muted-foreground'>Ausgabe</div>
            <div
              className='min-h-[2.5rem] w-full rounded-md border border-input bg-zinc-950 px-3 py-2 font-mono text-sm text-green-400 caret-transparent'
              style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)' }}
            >
              {codeOutput === '' ? (
                <span className='text-muted-foreground'>—</span>
              ) : (
                <span className='whitespace-pre-wrap break-words'>{codeOutput}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function tableFieldsNamesAutocomplete(tableFields: Field[]) {
  return function tableFieldsAutoCompletion(context: CompletionContext) {
    const maxMatchLength = (tableFields[0]?.name || '').length + 1;
    let word = '';
    let i = 0;
    let prefix = '';
    while (i < context.pos && i < maxMatchLength) {
      const pos = context.pos - ++i;
      const char = context.view?.state?.sliceDoc(pos, pos + 1);
      if (char === '\n') break;
      word = `${char}${word}`;
      if (char === '.' || char === '#') {
        prefix = char;
        break;
      }
    }
    if ((prefix !== '.' && prefix !== '#') || word.length <= 1) return null;
    const rest = word.slice(1).toLowerCase();
    return {
      from: context.pos - word.length,
      options: tableFields
        .filter(
          (field) =>
            rest === '' || `${field.name}`.toLowerCase().indexOf(rest) === 0
        )
        .map((field) => ({
          displayLabel: field.name,
          label: `.${field.name}`,
          type: 'variable',
        })),
    };
  };
}

function highlightTableFieldsNamesPlugin(tableFields: Field[]) {
  const highlightDeco = Decoration.mark({
    class: 'cm-highlight-table-fields',
  });
  const escapedNames = tableFields.map((field) =>
    field.name.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll(' ', '\\s')
  );
  const regexp = new RegExp(
    `[.#](${escapedNames.join('|')})(?![a-zA-Z0-9_])`,
    'g'
  );
  const fieldNameMatcher = new MatchDecorator({
    regexp,
    decoration: (_match) => highlightDeco, // Apply the defined decoration
  });

  return ViewPlugin.define(
    (view) => ({
      decorations: fieldNameMatcher.createDeco(view),
      update(update) {
        this.decorations = fieldNameMatcher.updateDeco(
          update,
          this.decorations
        );
      },
    }),
    {
      decorations: (v) => v.decorations,
    }
  );
}

function initCodMirrorState({
  formula,
  fieldType,
  tableFields,
  onFormulaUpdate,
}: {
  formula: string;
  fieldType?: 'FORMULA' | 'CODE';
  tableFields: Field[];
  onFormulaUpdate: (_newFormula: string) => void;
}) {
  const tableFieldsNamesAutocompletes =
    tableFieldsNamesAutocomplete(tableFields);
  /** CODE = eigene Dadix-Sprache: nur #Feld-Autocomplete, keine JavaScript-Syntax/Keywords */
  const isDadixCode = fieldType === 'CODE';
  const editorState = EditorState.create({
    doc: formula,
    extensions: [
      EditorView.lineWrapping,
      lineNumbers(),
      closeBrackets(),
      bracketMatching(),
      ...(isDadixCode ? [] : [javascript()]),
      autocompletion(),
      EditorState.languageData.of(() => [
        { autocomplete: tableFieldsNamesAutocompletes },
      ]),
      syntaxHighlighting(defaultHighlightStyle),
      highlightTableFieldsNamesPlugin(tableFields),
      EditorView.updateListener.of((update: ViewUpdate) => {
        if (!update.docChanged) return;
        const newFormula = update.state.doc.toString();
        onFormulaUpdate(newFormula);
      }),
      EditorView.baseTheme({
        '&.cm-editor, & .cm-scroller, & .cm-content, & .cm-gutters': {
          minHeight: '130px!important',
        },
        '&.cm-editor, & .cm-scroller': {
          maxHeight: '220px!important',
        },
        '& .cm-gutters': {
          borderTopLeftRadius: '8px',
          borderBottomLeftRadius: '8px',
        },
        '&.cm-editor, &.cm-editor.cm-focused': {
          outline: 'none!important',
          border: '1px solid var(--input)',
          borderRadius: '8px',
        },
        '& .cm-highlight-table-fields, & .cm-highlight-table-fields *': {
          color: '#4fb9ff',
        },
        '.cm-tooltip-autocomplete': {
          borderRadius: '6px',
          padding: '2px',
          border: '1px solid var(--input)!important',
          background: 'var(--background)!important',
        },
        '.cm-tooltip-autocomplete li': {
          borderRadius: '6px',
          padding: '.45em .3em!important',
          margin: '0',
          background: 'var(--background)',
          color: 'var(--foreground)',
        },
        '.cm-tooltip-autocomplete li[aria-selected=true]': {
          background: 'var(--accent)!important',
          color: 'var(--accent-foreground)!important',
        },
      }),
    ],
  });

  return editorState;
}
