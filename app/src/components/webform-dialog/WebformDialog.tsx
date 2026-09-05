'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  LucideX,
  LucidePlus,
  LucideShare2,
  LucideEllipsis,
  LucideGripVertical,
  LucideEye,
  LucideCopy,
  LucideCode,
  LucideEyeOff,
  LucideExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTableContext } from '@/context/TableContext';
import { useCurrentProjectContext } from '@/context/CurrentProjectContext';
import { openEditTableFieldPanel } from '@/components/table-editor/EditTableFieldPanel';
import { TableFieldTypeIcon } from '@/components/table-field-type-icon/TableFieldTypeIcon';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import type { Field } from '@/types';

const OPEN_WEBFORM_DIALOG_EVENT = 'dadix-open-webform-dialog';
const WEBFORM_STORAGE_KEY_PREFIX = 'dadix_webform_';

function getWebformStorageKey(projectId: string, tableId: string): string {
  return `${WEBFORM_STORAGE_KEY_PREFIX}${projectId}_${tableId}`;
}

function loadWebformConfig(projectId: string, tableId: string): {
  items: WebformFieldItem[];
  shareUrl: string;
  shareEnabled: boolean;
} | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(getWebformStorageKey(projectId, tableId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const obj = parsed as { items?: unknown; shareUrl?: string; shareEnabled?: boolean };
    const items = Array.isArray(obj.items) ? (obj.items as WebformFieldItem[]) : [];
    return {
      items: items.filter(
        (i) =>
          typeof i?.fieldId === 'number' &&
          typeof i?.name === 'string' &&
          typeof i?.type === 'string' &&
          typeof i?.visible === 'boolean'
      ),
      shareUrl: typeof obj.shareUrl === 'string' ? obj.shareUrl : '',
      shareEnabled: typeof obj.shareEnabled === 'boolean' ? obj.shareEnabled : true,
    };
  } catch {
    return null;
  }
}

function saveWebformConfig(
  projectId: string,
  tableId: string,
  data: { items: WebformFieldItem[]; shareUrl: string; shareEnabled: boolean }
): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      getWebformStorageKey(projectId, tableId),
      JSON.stringify(data)
    );
  } catch {
    /* ignore */
  }
}

export interface WebformFieldItem {
  fieldId: number;
  name: string;
  type: string;
  order: number;
  visible: boolean;
}

function SortableWebformFieldRow({
  item,
  onRemoveFromView,
  onFieldClick,
}: {
  item: WebformFieldItem;
  onRemoveFromView: (fieldId: number) => void;
  onFieldClick: (fieldId: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: String(item.fieldId) });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-3 py-2 border-b bg-background last:border-b-0 ${
        isDragging ? 'opacity-50 z-10' : ''
      }`}
    >
      <button
        type="button"
        className="touch-none cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <LucideGripVertical className="size-4 text-muted-foreground" />
      </button>
      <button
        type="button"
        onClick={() => onFieldClick(item.fieldId)}
        className="flex flex-1 min-w-0 items-center gap-2 rounded text-left"
      >
        <TableFieldTypeIcon name={item.type} className="size-4 shrink-0" />
        <span className="flex-1 min-w-0 truncate text-sm">{item.name}</span>
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0"
        onClick={() => onRemoveFromView(item.fieldId)}
        title="Remove from form (re-add via + to show again)"
      >
        <LucideEye className="size-4 text-muted-foreground" />
      </Button>
    </div>
  );
}

function WebformDialogContent() {
  const currentTableCtx = useTableContext();
  const currentProjectCtx = useCurrentProjectContext();
  const projectId = currentProjectCtx.id != null ? String(currentProjectCtx.id) : '';
  const tableId = currentTableCtx.id != null ? String(currentTableCtx.id) : '';

  const [items, setItems] = useState<WebformFieldItem[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareEnabled, setShareEnabled] = useState(true);
  const [shareUrl, setShareUrl] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (!projectId || !tableId || hasLoaded) return;
    const saved = loadWebformConfig(projectId, tableId);
    if (saved) {
      setItems(saved.items);
      setShareUrl(saved.shareUrl);
      setShareEnabled(saved.shareEnabled);
    }
    setHasLoaded(true);
  }, [projectId, tableId, hasLoaded]);

  useEffect(() => {
    if (!projectId || !tableId || !hasLoaded) return;
    saveWebformConfig(projectId, tableId, {
      items,
      shareUrl,
      shareEnabled,
    });
  }, [projectId, tableId, hasLoaded, items, shareUrl, shareEnabled]);

  const tableFields = useMemo(
    () =>
      (currentTableCtx.table?.fields ?? [])
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [currentTableCtx.table?.fields]
  );

  const visibleItems = useMemo(() => items.filter((i) => i.visible), [items]);

  const availableToAdd = useMemo(
    () =>
      tableFields.filter(
        (f) =>
          !items.some((i) => i.fieldId === f.id && i.visible) // not in list or hidden
      ),
    [tableFields, items]
  );

  const addField = useCallback((field: Field) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.fieldId === field.id);
      if (existing) {
        return prev.map((i) =>
          i.fieldId === field.id ? { ...i, visible: true } : i
        );
      }
      return [
        ...prev,
        {
          fieldId: field.id,
          name: field.name,
          type: field.type,
          order: prev.length,
          visible: true,
        },
      ];
    });
  }, []);

  const hideFieldFromView = useCallback((fieldId: number) => {
    setItems((prev) =>
      prev.map((i) =>
        i.fieldId === fieldId ? { ...i, visible: false } : i
      )
    );
  }, []);

  const setAllVisible = useCallback(
    (visible: boolean) => {
      if (visible) {
        setItems((prev) => {
          const byId = new Map(prev.map((i) => [i.fieldId, i]));
          return tableFields.map((f, idx) => {
            const existing = byId.get(f.id);
            return existing
              ? { ...existing, visible: true, order: idx }
              : {
                  fieldId: f.id,
                  name: f.name,
                  type: f.type,
                  order: idx,
                  visible: true,
                };
          });
        });
      } else {
        setItems((prev) => prev.map((i) => ({ ...i, visible: false })));
      }
    },
    [tableFields]
  );

  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {})
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const visible = prev.filter((i) => i.visible);
      const fromIdx = visible.findIndex((i) => String(i.fieldId) === active.id);
      const toIdx = visible.findIndex((i) => String(i.fieldId) === over.id);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const reordered = [...visible];
      const [removed] = reordered.splice(fromIdx, 1);
      reordered.splice(toIdx, 0, removed);
      const hidden = prev.filter((i) => !i.visible);
      return [
        ...reordered.map((it, idx) => ({ ...it, order: idx })),
        ...hidden.map((it, idx) => ({ ...it, order: reordered.length + idx })),
      ];
    });
  }, []);

  const webformUrl = useMemo(() => {
    if (typeof window === 'undefined' || !currentTableCtx.id) return '';
    const origin = window.location.origin;
    const fieldIds = visibleItems.map((i) => i.fieldId);
    const fieldNames = visibleItems.map((i) => i.name);
    const placeholders = visibleItems.map((i) => {
      const f = tableFields.find((tf) => tf.id === i.fieldId);
      return f?.placeholder ?? '';
    });
    try {
      const params = new URLSearchParams({
        tableId: String(currentTableCtx.id),
        fields: fieldIds.join(','),
        names: btoa(encodeURIComponent(JSON.stringify(fieldNames))),
        placeholders: btoa(encodeURIComponent(JSON.stringify(placeholders))),
      });
      return `${origin}/share/webform?${params.toString()}`;
    } catch {
      const params = new URLSearchParams({
        tableId: String(currentTableCtx.id),
        fields: fieldIds.join(','),
      });
      return `${origin}/share/webform?${params.toString()}`;
    }
  }, [currentTableCtx.id, visibleItems, tableFields]);

  const effectiveShareUrl = (shareUrl?.trim() || webformUrl) ?? '';

  const embedCode = useMemo(() => {
    if (!effectiveShareUrl) return '';
    return `<iframe src="${effectiveShareUrl}" width="100%" height="400" frameborder="0" title="Webform"></iframe>`;
  }, [effectiveShareUrl]);

  const copyUrl = useCallback(() => {
    if (!effectiveShareUrl) return;
    navigator.clipboard.writeText(effectiveShareUrl);
    toast.success('URL copied to clipboard');
    setShareOpen(false);
  }, [effectiveShareUrl]);

  const copyEmbed = useCallback(() => {
    if (!embedCode) return;
    navigator.clipboard.writeText(embedCode);
    toast.success('Embed code copied to clipboard');
    setShareOpen(false);
  }, [embedCode]);

  const openUrlInNewTab = useCallback(() => {
    if (!effectiveShareUrl) return;
    window.open(effectiveShareUrl, '_blank', 'noopener,noreferrer');
  }, [effectiveShareUrl]);

  const handleFieldClick = useCallback(
    (fieldId: number) => {
      openEditTableFieldPanel({
        fieldId,
        tableContext: currentTableCtx,
        allowNavigation: true,
      });
    },
    [currentTableCtx]
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="sticky top-0 left-0 flex flex-row items-center gap-2 p-4 bg-background shrink-0">
        <Button
          variant="outline"
          size="icon"
          onClick={() => window.dispatchEvent(new CustomEvent('dadix-close-webform-dialog'))}
          aria-label="Close"
        >
          <LucideX />
        </Button>
        <div className="flex-1 min-w-0" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Add field">
              <LucidePlus className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {availableToAdd.length === 0 ? (
              <DropdownMenuItem disabled>No more fields</DropdownMenuItem>
            ) : (
              availableToAdd.map((f) => (
                <DropdownMenuItem
                  key={f.id}
                  onClick={() => addField(f)}
                >
                  <span className="flex items-center gap-2">
                    <TableFieldTypeIcon name={f.type} className="size-4" />
                    {f.name}
                  </span>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu open={shareOpen} onOpenChange={setShareOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Share">
              <LucideShare2 className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-96 p-0" onClick={(e) => e.stopPropagation()}>
            <div className="p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="webform-share-enabled" className="text-sm font-medium">
                  Share enabled
                </Label>
                <Switch
                  id="webform-share-enabled"
                  checked={shareEnabled}
                  onCheckedChange={setShareEnabled}
                />
              </div>
              {shareEnabled && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="webform-share-url" className="text-sm">
                      URL
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="webform-share-url"
                        value={shareUrl}
                        onChange={(e) => setShareUrl(e.target.value)}
                        placeholder={webformUrl || 'URL will be generated when you add fields'}
                        className="font-mono text-xs h-8 flex-1 min-w-0"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-8 shrink-0"
                        onClick={copyUrl}
                        disabled={!effectiveShareUrl}
                        title="Copy URL"
                      >
                        <LucideCopy className="size-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-8 shrink-0"
                        onClick={openUrlInNewTab}
                        disabled={!effectiveShareUrl}
                        title="Open in new tab"
                      >
                        <LucideExternalLink className="size-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Embed code</Label>
                    <pre className="rounded-md border bg-muted/50 p-2 text-xs font-mono overflow-auto max-h-24 whitespace-pre-wrap break-all">
                      <code>{embedCode || '—'}</code>
                    </pre>
                    <Button variant="outline" size="sm" className="w-full" onClick={copyEmbed} disabled={!embedCode}>
                      <LucideCode className="size-4" />
                      Copy embed code
                    </Button>
                  </div>
                </>
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="data-[state=open]:bg-muted data-[state=open]:text-muted-foreground size-9" aria-label="Open menu">
              <LucideEllipsis />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setAllVisible(true)}>
              <LucideEye className="size-4" />
              All fields visible
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setAllVisible(false)}>
              <LucideEyeOff className="size-4" />
              Hide all fields
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-4 flex flex-col items-center">
        {visibleItems.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Add fields with the + button. Reorder by dragging. Use the menu to show or hide all.
          </p>
        ) : (
          <div className="rounded-lg border bg-background overflow-hidden max-w-2xl w-full mx-auto">
            <DndContext
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              onDragEnd={handleDragEnd}
              sensors={sensors}
              id="webform-fields-list"
            >
              <SortableContext
                items={visibleItems.map((i) => String(i.fieldId))}
                strategy={verticalListSortingStrategy}
              >
                {visibleItems.map((item) => (
                  <SortableWebformFieldRow
                    key={item.fieldId}
                    item={item}
                    onRemoveFromView={hideFieldFromView}
                    onFieldClick={handleFieldClick}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        )}
      </div>
    </div>
  );
}

function WebformDialog() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setIsOpen(true);
    const onClose = () => setIsOpen(false);
    window.addEventListener(OPEN_WEBFORM_DIALOG_EVENT, onOpen);
    window.addEventListener('dadix-close-webform-dialog', onClose);
    return () => {
      window.removeEventListener(OPEN_WEBFORM_DIALOG_EVENT, onOpen);
      window.removeEventListener('dadix-close-webform-dialog', onClose);
    };
  }, []);

  const handleClose = () => setIsOpen(false);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Webform"
        className="flex flex-col bg-background border rounded-lg shadow-lg w-full h-full md:m-[10px] md:w-[calc(100%-20px)] md:h-[calc(100%-20px)] md:rounded-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <WebformDialogContent />
      </div>
    </div>,
    document.body
  );
}

export function openWebformDialog() {
  window.dispatchEvent(new CustomEvent(OPEN_WEBFORM_DIALOG_EVENT));
}

export { WebformDialog };
