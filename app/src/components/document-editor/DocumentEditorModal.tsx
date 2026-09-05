'use client';

import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle, FontFamily, FontSize } from '@tiptap/extension-text-style';
import Mention from '@tiptap/extension-mention';
import type {
  SuggestionKeyDownProps,
  SuggestionProps,
} from '@tiptap/suggestion';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  LucideX,
  LucideBold,
  LucideItalic,
  LucideUnderline,
  LucideAlignLeft,
  LucideAlignCenter,
  LucideAlignRight,
  LucideTrash2,
  LucideMoreVertical,
} from 'lucide-react';
import { TableIcon, availableTableIcons } from '@/components/table-icon/TableIcon';
import { cn } from '@/lib/utils';
import { UserLocalStorage } from '@/lib/userLocalStorage';
import type { Field } from '@/types';
import type { DocumentTemplate } from '@/types';
import {
  getDocumentTemplates,
  getDocumentTemplate,
  saveDocumentTemplate,
  deleteDocumentTemplate,
  generateTemplateId,
} from '@/lib/documentTemplates';
import {
  injectRecordIntoDocumentContent,
  renderDocumentToHtml,
} from './documentPlaceholders';

/** Limited to 5 fonts per spec. */
const FONT_OPTIONS = [
  { value: 'Arial', label: 'Arial' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'Courier New', label: 'Courier New' },
];

const FONT_SIZE_OPTIONS = [
  { value: '12px', label: '12' },
  { value: '14px', label: '14' },
  { value: '16px', label: '16' },
  { value: '18px', label: '18' },
  { value: '24px', label: '24' },
];

const DEFAULT_CONTENT = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

export interface DocumentEditorModalProps {
  open: boolean;
  onOpenChange: (_open: boolean) => void;
  tableId: string | number;
  tableFields: Field[];
  record: Record<string, unknown> | null;
}

export interface DocumentEditorScreenProps {
  tableId: string | number;
  tableFields: Field[];
  record: Record<string, unknown> | null;
  onClose?: () => void;
}

function SuggestionList({
  items,
  command,
  selectedIndex,
  onKeyDown,
}: {
  items: string[];
  command: (item: { id: string; label: string }) => void;
  selectedIndex: number;
  onKeyDown: (_props: SuggestionKeyDownProps) => boolean;
}) {
  const ref = React.useRef<{
    onKeyDown: (p: SuggestionKeyDownProps) => boolean;
  }>({ onKeyDown });
  ref.current.onKeyDown = onKeyDown;
  if (items.length === 0) return null;
  return (
    <ul className='list-none p-0 m-0'>
      {items.map((name, i) => (
        <li key={name}>
          <button
            type='button'
            className={cn(
              'w-full text-left px-2 py-1.5 text-sm rounded cursor-pointer',
              i === selectedIndex
                ? 'bg-accent text-accent-foreground'
                : 'hover:bg-muted'
            )}
            onMouseDown={(e) => {
              e.preventDefault();
              command({ id: name, label: name });
            }}
          >
            #{name}
          </button>
        </li>
      ))}
    </ul>
  );
}

function createMentionSuggestionProps(tableFields: Field[]) {
  const fieldNames = tableFields.map((f) => f.name);
  let listEl: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;
  const selectedRef = { current: 0 };
  let itemsRef: string[] = [];
  let commandRef: (item: { id: string; label: string }) => void = (_item) => {};
  let keyDownRef: (props: SuggestionKeyDownProps) => boolean = () => false;

  return {
    char: '#',
    allowSpaces: false,
    items: ({ query }: { query: string }) => {
      const q = query.toLowerCase();
      return fieldNames
        .filter((name) => name.toLowerCase().includes(q))
        .slice(0, 10);
    },
    render: () => ({
      onStart: (props: SuggestionProps) => {
        listEl = document.createElement('div');
        listEl.className =
          'min-w-[160px] max-h-[240px] overflow-auto rounded-md border bg-popover p-1 shadow-md z-[100]';
        listEl.style.position = 'absolute';
        document.body.appendChild(listEl);
        root = createRoot(listEl);
        const { bottom, left } = props.clientRect();
        listEl.style.top = `${bottom + 4}px`;
        listEl.style.left = `${left}px`;
        selectedRef.current = 0;
        itemsRef = props.items;
        commandRef = props.command;
        keyDownRef = ({ event }: SuggestionKeyDownProps) => {
          if (event.key === 'ArrowDown') {
            selectedRef.current = Math.min(
              selectedRef.current + 1,
              itemsRef.length - 1
            );
            root?.render(
              React.createElement(SuggestionList, {
                items: itemsRef,
                command: commandRef,
                selectedIndex: selectedRef.current,
                onKeyDown: keyDownRef,
              })
            );
            return true;
          }
          if (event.key === 'ArrowUp') {
            selectedRef.current = Math.max(selectedRef.current - 1, 0);
            root?.render(
              React.createElement(SuggestionList, {
                items: itemsRef,
                command: commandRef,
                selectedIndex: selectedRef.current,
                onKeyDown: keyDownRef,
              })
            );
            return true;
          }
          if (event.key === 'Enter' && itemsRef[selectedRef.current]) {
            commandRef({
              id: itemsRef[selectedRef.current],
              label: itemsRef[selectedRef.current],
            });
            return true;
          }
          return false;
        };
        root.render(
          React.createElement(SuggestionList, {
            items: props.items,
            command: props.command,
            selectedIndex: 0,
            onKeyDown: keyDownRef,
          })
        );
      },
      onUpdate: (props: SuggestionProps) => {
        itemsRef = props.items;
        selectedRef.current = 0;
        if (root && listEl) {
          root.render(
            React.createElement(SuggestionList, {
              items: props.items,
              command: props.command,
              selectedIndex: 0,
              onKeyDown: keyDownRef,
            })
          );
        }
      },
      onKeyDown: (props: SuggestionKeyDownProps) => keyDownRef(props),
      onExit: () => {
        if (listEl?.parentNode) listEl.parentNode.removeChild(listEl);
        listEl = null;
        root = null;
      },
    }),
  };
}

/** Floating toolbar: font, size, B/I/U, alignment only. Rendered centered in its parent. */
function DocumentToolbar({ editor }: { editor: Editor | null }) {
  const [, setSelectionUpdate] = React.useState(0);
  React.useEffect(() => {
    if (!editor) return;
    const handler = () => setSelectionUpdate((n) => n + 1);
    editor.on('selectionUpdate', handler);
    editor.on('transaction', handler);
    return () => {
      editor.off('selectionUpdate', handler);
      editor.off('transaction', handler);
    };
  }, [editor]);
  if (!editor) return null;
  const fontFamily = editor.getAttributes('textStyle').fontFamily;
  const fontSize = editor.getAttributes('textStyle').fontSize;
  const fontValue = fontFamily && FONT_OPTIONS.some((f) => f.value === fontFamily) ? fontFamily : (FONT_OPTIONS[0]?.value ?? 'Arial');
  const sizeValue = fontSize && FONT_SIZE_OPTIONS.some((f) => f.value === fontSize) ? fontSize : FONT_SIZE_OPTIONS[0]?.value ?? '14px';
  return (
    <div className='flex flex-wrap items-center justify-center gap-1'>
      <Select
        value={fontValue}
        onValueChange={(v) =>
          v
            ? editor.chain().focus().setFontFamily(v).run()
            : editor.chain().focus().unsetFontFamily().run()
        }
      >
        <SelectTrigger className='h-8 w-[130px]'>
          <SelectValue placeholder='Font' />
        </SelectTrigger>
        <SelectContent>
          {FONT_OPTIONS.map((f) => (
            <SelectItem key={f.value} value={f.value}>
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={sizeValue}
        onValueChange={(v) =>
          v
            ? editor.chain().focus().setFontSize(v).run()
            : editor.chain().focus().unsetFontSize().run()
        }
      >
        <SelectTrigger className='h-8 w-[70px]'>
          <SelectValue placeholder='Size' />
        </SelectTrigger>
        <SelectContent>
          {FONT_SIZE_OPTIONS.map((f) => (
            <SelectItem key={f.value} value={f.value}>
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className='h-6 w-px bg-border mx-0.5' />
      <Button
        type='button'
        size='icon'
        variant={editor.isActive('bold') ? 'secondary' : 'ghost'}
        className='h-8 w-8'
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <LucideBold className='size-4' />
      </Button>
      <Button
        type='button'
        size='icon'
        variant={editor.isActive('italic') ? 'secondary' : 'ghost'}
        className='h-8 w-8'
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <LucideItalic className='size-4' />
      </Button>
      <Button
        type='button'
        size='icon'
        variant={editor.isActive('underline') ? 'secondary' : 'ghost'}
        className='h-8 w-8'
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <LucideUnderline className='size-4' />
      </Button>
      <div className='h-6 w-px bg-border mx-0.5' />
      <Button
        type='button'
        size='icon'
        variant={editor.isActive({ textAlign: 'left' }) ? 'secondary' : 'ghost'}
        className='h-8 w-8'
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
      >
        <LucideAlignLeft className='size-4' />
      </Button>
      <Button
        type='button'
        size='icon'
        variant={
          editor.isActive({ textAlign: 'center' }) ? 'secondary' : 'ghost'
        }
        className='h-8 w-8'
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
      >
        <LucideAlignCenter className='size-4' />
      </Button>
      <Button
        type='button'
        size='icon'
        variant={
          editor.isActive({ textAlign: 'right' }) ? 'secondary' : 'ghost'
        }
        className='h-8 w-8'
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
      >
        <LucideAlignRight className='size-4' />
      </Button>
    </div>
  );
}

function DocumentIconByName({ name, className }: { name: string; className?: string }) {
  const iconName = availableTableIcons.includes(name) ? name : availableTableIcons[0];
  return <TableIcon name={iconName} className={className} color='var(--primary)' />;
}

interface CreateDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableId: string | number;
  onCreated: (id: string, name: string, icon: string) => void;
}

function CreateDocumentDialog({
  open,
  onOpenChange,
  tableId,
  onCreated,
}: CreateDocumentDialogProps) {
  const [documentName, setDocumentName] = React.useState('');
  const [selectedIcon, setSelectedIcon] = React.useState(availableTableIcons[0]);
  const [error, setError] = React.useState('');

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!next) {
        setDocumentName('');
        setError('');
      }
      onOpenChange(next);
    },
    [onOpenChange]
  );

  const handleCreate = React.useCallback(() => {
    const name = documentName.trim();
    if (!name) {
      setError('Document name is required');
      return;
    }
    const id = generateTemplateId();
    saveDocumentTemplate(tableId, {
      id,
      name,
      icon: selectedIcon,
      tableId,
      content: DEFAULT_CONTENT,
    });
    onCreated(id, name, selectedIcon);
    setDocumentName('');
    setError('');
    handleOpenChange(false);
  }, [documentName, selectedIcon, tableId, onCreated, handleOpenChange]);

  return (
    <Dialog modal open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='sm:max-w-lg' showCloseButton={false}>
        <DialogHeader className='flex flex-row flex-nowrap justify-start items-center gap-4'>
          <DialogClose asChild>
            <Button size='icon' variant='outline' className='shrink-0 grow-0'>
              <LucideX />
            </Button>
          </DialogClose>
          <DialogTitle className='shrink grow text-left' hidden>
            Create document
          </DialogTitle>
        </DialogHeader>
        <div className='space-y-4'>
          <div className='flex flex-col items-center gap-4'>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant='outline' className='w-21 h-21'>
                  <TableIcon
                    name={selectedIcon}
                    color='var(--primary)'
                    className='size-14 opacity-90'
                  />
                </Button>
              </DialogTrigger>
              <DialogContent
                showCloseButton={false}
                className='max-w-[300px]! max-h-[400px] overflow-y-auto'
              >
                <DialogHeader>
                  <DialogTitle hidden>Select document icon</DialogTitle>
                </DialogHeader>
                <div className='grid grid-cols-6 max-[420px]:grid-cols-6 gap-2 justify-center'>
                  {availableTableIcons.map((iconName) => (
                    <DialogClose key={iconName} asChild>
                      <Button
                        type='button'
                        variant='outline'
                        size='icon'
                        aria-pressed={selectedIcon === iconName}
                        title={iconName}
                        onClick={() => setSelectedIcon(iconName)}
                        className={cn('shadow-none', selectedIcon === iconName ? 'border' : 'border-none')}
                      >
                        <TableIcon name={iconName} className='size-6' />
                      </Button>
                    </DialogClose>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
            <div className='w-full'>
              <Input
                id='documentname'
                placeholder='Enter document name'
                value={documentName}
                onChange={(e) => {
                  setDocumentName(e.target.value);
                  if (error) setError('');
                }}
                autoFocus
                className='mt-2'
              />
              {error && (
                <p className='text-sm font-medium text-destructive mt-1'>
                  {error}
                </p>
              )}
            </div>
          </div>
          <DialogFooter className='flex-row justify-end'>
            <DialogClose asChild>
              <Button type='button' variant='outline'>
                Discard
              </Button>
            </DialogClose>
            <Button type='button' onClick={handleCreate} disabled={!documentName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface EditDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableId: string | number;
  template: DocumentTemplate | null;
  onSaved: () => void;
}

function EditDocumentDialog({
  open,
  onOpenChange,
  tableId,
  template,
  onSaved,
}: EditDocumentDialogProps) {
  const [documentName, setDocumentName] = React.useState('');
  const [selectedIcon, setSelectedIcon] = React.useState(availableTableIcons[0]);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (open && template) {
      setDocumentName(template.name);
      setSelectedIcon(
        template.icon && availableTableIcons.includes(template.icon)
          ? template.icon
          : availableTableIcons[0]
      );
      setError('');
    }
  }, [open, template]);

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!next) setError('');
      onOpenChange(next);
    },
    [onOpenChange]
  );

  const handleSave = React.useCallback(() => {
    if (!template) return;
    const name = documentName.trim();
    if (!name) {
      setError('Document name is required');
      return;
    }
    saveDocumentTemplate(tableId, {
      ...template,
      name,
      icon: selectedIcon,
    });
    onSaved();
    handleOpenChange(false);
  }, [template, documentName, selectedIcon, tableId, onSaved, handleOpenChange]);

  if (!template) return null;

  return (
    <Dialog modal open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='sm:max-w-lg' showCloseButton={false}>
        <DialogHeader className='flex flex-row flex-nowrap justify-start items-center gap-4'>
          <DialogClose asChild>
            <Button size='icon' variant='outline' className='shrink-0 grow-0'>
              <LucideX />
            </Button>
          </DialogClose>
          <DialogTitle className='shrink grow text-left' hidden>
            Edit
          </DialogTitle>
        </DialogHeader>
        <div className='space-y-4'>
          <div className='flex flex-col items-center gap-4'>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant='outline' className='w-21 h-21'>
                  <TableIcon
                    name={selectedIcon}
                    color='var(--primary)'
                    className='size-14 opacity-90'
                  />
                </Button>
              </DialogTrigger>
              <DialogContent
                showCloseButton={false}
                className='max-w-[300px]! max-h-[400px] overflow-y-auto'
              >
                <DialogHeader>
                  <DialogTitle hidden>Select document icon</DialogTitle>
                </DialogHeader>
                <div className='grid grid-cols-6 max-[420px]:grid-cols-6 gap-2 justify-center'>
                  {availableTableIcons.map((iconName) => (
                    <DialogClose key={iconName} asChild>
                      <Button
                        type='button'
                        variant='outline'
                        size='icon'
                        aria-pressed={selectedIcon === iconName}
                        title={iconName}
                        onClick={() => setSelectedIcon(iconName)}
                        className={cn('shadow-none', selectedIcon === iconName ? 'border' : 'border-none')}
                      >
                        <TableIcon name={iconName} className='size-6' />
                      </Button>
                    </DialogClose>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
            <div className='w-full'>
              <Input
                id='edit-documentname'
                placeholder='Enter document name'
                value={documentName}
                onChange={(e) => {
                  setDocumentName(e.target.value);
                  if (error) setError('');
                }}
                autoFocus
                className='mt-2'
              />
              {error && (
                <p className='text-sm font-medium text-destructive mt-1'>
                  {error}
                </p>
              )}
            </div>
          </div>
          <DialogFooter className='flex-row justify-end'>
            <DialogClose asChild>
              <Button type='button' variant='outline'>
                Discard
              </Button>
            </DialogClose>
            <Button type='button' onClick={handleSave} disabled={!documentName.trim()}>
              Save
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DocumentEditorScreen({
  tableId,
  tableFields,
  record,
  onClose,
}: DocumentEditorScreenProps) {
  const [templates, setTemplates] = React.useState<DocumentTemplate[]>([]);
  const [currentTemplateId, setCurrentTemplateId] = React.useState<
    string | null
  >(null);
  const [mode, setMode] = React.useState<'template' | 'record'>('template');
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const [editDialogOpen, setEditDialogOpen] = React.useState(false);

  const suggestionProps = React.useMemo(
    () => createMentionSuggestionProps(tableFields),
    [tableFields]
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({
        placeholder: 'Type # to insert a field placeholder…',
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      FontFamily.configure({ types: ['textStyle'] }),
      FontSize.configure({ types: ['textStyle'] }),
      Mention.configure({
        HTMLAttributes: {
          class: 'rounded bg-muted px-1 font-medium text-primary',
        },
        renderText: ({ node }) => `#${node.attrs.label ?? node.attrs.id}`,
        suggestion: suggestionProps,
      }),
    ],
    content: DEFAULT_CONTENT,
    editorProps: {
      attributes: {
        class: 'min-h-[240mm] outline-none prose prose-sm max-w-none',
      },
    },
  });

  React.useEffect(() => {
    setTemplates(getDocumentTemplates(tableId));
    const list = getDocumentTemplates(tableId);
    if (list.length > 0) {
      setCurrentTemplateId((prev) => prev ?? list[0].id);
    }
  }, [tableId]);

  React.useEffect(() => {
    if (!editor || !currentTemplateId || currentTemplateId === '__new__')
      return;
    const t = getDocumentTemplate(tableId, currentTemplateId);
    if (t?.content) {
      editor.commands.setContent(t.content);
    } else {
      editor.commands.setContent(DEFAULT_CONTENT);
    }
  }, [editor, currentTemplateId, tableId]);

  const autoSaveTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    if (!editor || !currentTemplateId || currentTemplateId === '__new__') return;
    const handler = () => {
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = setTimeout(() => {
        const t = getDocumentTemplate(tableId, currentTemplateId);
        if (!t) return;
        saveDocumentTemplate(tableId, { ...t, content: editor.getJSON() });
        setTemplates(getDocumentTemplates(tableId));
        autoSaveTimeoutRef.current = null;
      }, 600);
    };
    editor.on('update', handler);
    return () => {
      editor.off('update', handler);
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    };
  }, [editor, currentTemplateId, tableId]);

  const showEmptyState = templates.length === 0;
  const handleCreateDocumentCreated = React.useCallback(
    (id: string) => {
      setTemplates(getDocumentTemplates(tableId));
      setCurrentTemplateId(id);
      setCreateDialogOpen(false);
    },
    [tableId]
  );

  const handleDeleteDocument = React.useCallback(() => {
    if (!currentTemplateId || currentTemplateId === '__new__') return;
    if (
      !UserLocalStorage.getSkipDeleteConfirmation() &&
      !window.confirm('Delete this document?')
    )
      return;
    const next = deleteDocumentTemplate(tableId, currentTemplateId);
    setTemplates(next);
    setCurrentTemplateId(next.length > 0 ? next[0].id : '__new__');
  }, [currentTemplateId, tableId]);

  const handleDuplicateDocument = React.useCallback(() => {
    if (!currentTemplateId || currentTemplateId === '__new__') return;
    const source = getDocumentTemplate(tableId, currentTemplateId);
    if (!source) return;
    const newId = generateTemplateId();
    saveDocumentTemplate(tableId, {
      id: newId,
      name: `Copy of ${source.name}`,
      icon: source.icon ?? availableTableIcons[0],
      tableId,
      content: source.content,
    });
    setTemplates(getDocumentTemplates(tableId));
    setCurrentTemplateId(newId);
  }, [currentTemplateId, tableId]);

  const displayContent = React.useMemo(() => {
    if (!editor || mode !== 'record' || !record) return null;
    const json = editor.getJSON();
    return injectRecordIntoDocumentContent(json, record);
  }, [editor, mode, record]);

  const handleCreateDialogOpenChange = React.useCallback(
    (open: boolean) => {
      setCreateDialogOpen(open);
      if (!open && templates.length > 0) {
        setCurrentTemplateId(templates[0].id);
      }
    },
    [templates.length]
  );

  if (showEmptyState) {
    return (
      <div className='relative flex flex-col flex-1 min-h-0 bg-muted/50' style={{ backgroundColor: '#F3F4F6' }}>
        <div className='absolute top-0 left-0 right-0 z-30 flex items-center justify-between p-4'>
          <div className='flex items-center gap-2'>
            {onClose && (
              <Button type='button' size='icon' variant='outline' className='shrink-0' onClick={onClose}>
                <LucideX className='size-4' />
              </Button>
            )}
          </div>
        </div>
        <div className='flex-1 flex flex-col justify-center items-center min-h-0 overflow-y-auto p-6 pt-20'>
          <Button
            type='button'
            variant='outline'
            className='w-21 h-21'
            aria-label='Create document'
            onClick={() => setCreateDialogOpen(true)}
          >
            <TableIcon name={availableTableIcons[0]} color='var(--primary)' className='size-14 opacity-90' />
          </Button>
          <p className='text-sm text-muted-foreground text-center mt-4'>
            Create a new document
          </p>
        </div>
        <CreateDocumentDialog
          open={createDialogOpen}
          onOpenChange={handleCreateDialogOpenChange}
          tableId={tableId}
          onCreated={handleCreateDocumentCreated}
        />
      </div>
    );
  }

  const currentDoc =
    currentTemplateId && currentTemplateId !== '__new__'
      ? getDocumentTemplate(tableId, currentTemplateId)
      : null;
  const canDelete = Boolean(currentDoc);

  return (
    <div className='relative flex flex-col flex-1 min-h-0 bg-muted/50' style={{ backgroundColor: '#F3F4F6' }}>
      {/* One line: X + Dropdown (left) | Pill same height (center) | MoreVertical (right). No bar. */}
      <div className='absolute top-0 left-0 right-0 z-30 flex items-center justify-between p-4'>
        <div className='flex items-center gap-2'>
          {onClose && (
            <Button type='button' size='icon' variant='outline' className='shrink-0' onClick={onClose}>
              <LucideX className='size-4' />
            </Button>
          )}
          <Select
            value={currentTemplateId ?? '__new__'}
            onValueChange={(v) => {
              if (v === '__new__') {
                setCurrentTemplateId('__new__');
                setCreateDialogOpen(true);
              } else {
                setCurrentTemplateId(v);
                setCreateDialogOpen(false);
              }
            }}
          >
            <SelectTrigger className='flex items-center gap-2 w-auto min-w-[160px] bg-white border shadow-sm'>
              <SelectValue placeholder='Select document…' />
            </SelectTrigger>
            <SelectContent>
<SelectItem value='__new__'>
                  <TableIcon name={availableTableIcons[0]} className='size-4 shrink-0' />
                  <span>— New document —</span>
                </SelectItem>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  <DocumentIconByName name={t.icon ?? availableTableIcons[0]} className='size-4 shrink-0' />
                  <span>{t.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className='absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center'>
          <div className='rounded-full border bg-white shadow-xl px-4 py-2 inline-flex items-center gap-1'>
            <DocumentToolbar editor={editor} />
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='outline' size='icon' aria-label='Document options'>
              <LucideMoreVertical className='size-4' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            {currentDoc && (
              <DropdownMenuItem
                onClick={() => {
                  setEditDialogOpen(true);
                }}
              >
                Edit
              </DropdownMenuItem>
            )}
            {currentDoc && (
              <DropdownMenuItem onClick={handleDuplicateDocument}>
                Duplicate
              </DropdownMenuItem>
            )}
            {record && (
              <>
                <DropdownMenuItem onClick={() => setMode('template')}>Edit</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setMode('record')}>Preview</DropdownMenuItem>
              </>
            )}
            {canDelete && (
              <DropdownMenuItem onClick={handleDeleteDocument} className='text-destructive focus:text-destructive'>
                Delete document
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Scrollable gray area; A4 sheet: 210mm × 297mm portrait, shadow-2xl */}
      <div className='flex-1 min-h-0 overflow-y-auto pt-16'>
        <div
          className='document-page mx-auto bg-white my-12 shadow-2xl'
          style={{
            width: '210mm',
            minHeight: '297mm',
            maxWidth: '210mm',
            padding: '20mm',
          }}
        >
          {mode === 'record' && record && displayContent ? (
            <div
              className='min-h-0 prose prose-sm max-w-none'
              dangerouslySetInnerHTML={{ __html: renderDocumentToHtml(displayContent) }}
            />
          ) : (
            <EditorContent editor={editor} />
          )}
        </div>
      </div>
      <CreateDocumentDialog
        open={createDialogOpen}
        onOpenChange={handleCreateDialogOpenChange}
        tableId={tableId}
        onCreated={handleCreateDocumentCreated}
      />
      <EditDocumentDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        tableId={tableId}
        template={currentDoc}
        onSaved={() => setTemplates(getDocumentTemplates(tableId))}
      />
    </div>
  );
}

export function DocumentEditorModal({
  open,
  onOpenChange,
  tableId,
  tableFields,
  record,
}: DocumentEditorModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className='fixed inset-0 z-[9999] w-screen h-screen max-w-none max-h-none rounded-none translate-x-0 translate-y-0 flex flex-col p-0 gap-0 border-0 shadow-none'
        showCloseButton={false}
      >
        <DocumentEditorScreen
          tableId={tableId}
          tableFields={tableFields}
          record={record}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
