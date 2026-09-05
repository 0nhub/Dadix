'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { LucideArrowLeft, LucideTrash2, LucideX } from 'lucide-react';
import { toast } from 'sonner';

const OPEN_TABLE_WEBHOOK_EVENT_NAME = 'DADIX-EVENT-OPEN-TABLE-WEBHOOK-DIALOG';
const WEBHOOK_STORAGE_PREFIX = 'dadix-webhooks-';

export type WebhookEvent = 'create' | 'update' | 'delete';

export interface TableWebhookConfig {
  id: string;
  url: string;
  secret?: string;
  events: WebhookEvent[];
}

function getStorageKey(projectId: string, tableId: string): string {
  return `${WEBHOOK_STORAGE_PREFIX}${projectId}-${tableId}`;
}

function getStoredWebhooks(projectId: string, tableId: string): TableWebhookConfig[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getStorageKey(projectId, tableId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as TableWebhookConfig[]) : [];
  } catch {
    return [];
  }
}

function setStoredWebhooks(
  projectId: string,
  tableId: string,
  webhooks: TableWebhookConfig[]
): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(getStorageKey(projectId, tableId), JSON.stringify(webhooks));
  } catch (e) {
    console.warn('Failed to save webhooks', e);
  }
}

export function TableWebhookDialog() {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<{
    tableId: string;
    projectId: string;
    tableName: string;
  } | null>(null);
  const [webhooks, setWebhooks] = useState<TableWebhookConfig[]>([]);
  const [formUrl, setFormUrl] = useState('');
  const [formSecret, setFormSecret] = useState('');
  const [formEvents, setFormEvents] = useState<WebhookEvent[]>(['create', 'update', 'delete']);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    const handler = (evnt: Event) => {
      const detail = (evnt as CustomEvent<{ tableId: string; projectId: string; tableName: string }>).detail;
      if (detail?.tableId && detail?.projectId) {
        setContext({
          tableId: detail.tableId,
          projectId: detail.projectId,
          tableName: detail.tableName ?? 'Table',
        });
        setWebhooks(getStoredWebhooks(detail.projectId, detail.tableId));
        setFormUrl('');
        setFormSecret('');
        setFormEvents(['create', 'update', 'delete']);
        setEditingId(null);
      } else {
        setContext(null);
      }
      setOpen(true);
    };
    window.addEventListener(OPEN_TABLE_WEBHOOK_EVENT_NAME, handler);
    return () => window.removeEventListener(OPEN_TABLE_WEBHOOK_EVENT_NAME, handler);
  }, []);

  useEffect(() => {
    if (!context || !open) return;
    setWebhooks(getStoredWebhooks(context.projectId, context.tableId));
  }, [context, open]);

  const saveWebhook = () => {
    if (!context) return;
    const url = formUrl.trim();
    if (!url) {
      toast.error('URL is required');
      return;
    }
    const next: TableWebhookConfig = {
      id: editingId ?? `wh-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      url,
      secret: formSecret.trim() || undefined,
      events: formEvents.length ? formEvents : ['create', 'update', 'delete'],
    };
    const list = editingId
      ? webhooks.map((w) => (w.id === editingId ? next : w))
      : [...webhooks, next];
    setStoredWebhooks(context.projectId, context.tableId, list);
    setWebhooks(list);
    setFormUrl('');
    setFormSecret('');
    setFormEvents(['create', 'update', 'delete']);
    setEditingId(null);
    toast.success(editingId ? 'Webhook updated' : 'Webhook added');
  };

  const removeWebhook = (id: string) => {
    if (!context) return;
    const list = webhooks.filter((w) => w.id !== id);
    setStoredWebhooks(context.projectId, context.tableId, list);
    setWebhooks(list);
    if (editingId === id) {
      setEditingId(null);
      setFormUrl('');
      setFormSecret('');
      setFormEvents(['create', 'update', 'delete']);
    }
    toast.success('Webhook removed');
  };

  const startEdit = (w: TableWebhookConfig) => {
    setFormUrl(w.url);
    setFormSecret(w.secret ?? '');
    setFormEvents(w.events.length ? w.events : ['create', 'update', 'delete']);
    setEditingId(w.id);
  };

  const toggleEvent = (e: WebhookEvent) => {
    setFormEvents((prev) =>
      prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) {
          setContext(null);
          setEditingId(null);
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className='w-[100vw] !max-w-[720px] max-h-[90vh] overflow-auto z-9999'
      >
        <DialogHeader className='flex flex-row flex-nowrap justify-between items-center'>
          <DialogClose asChild>
            <Button variant='outline' size='default'>
              <LucideArrowLeft />
              Back
            </Button>
          </DialogClose>
          <DialogClose asChild>
            <Button size='icon' variant='outline'>
              <LucideX />
            </Button>
          </DialogClose>
        </DialogHeader>
        <DialogTitle hidden>Webhooks</DialogTitle>
        <div className='p-4 space-y-6'>
          <h2 className='text-lg font-semibold'>
            Webhooks — {context?.tableName ?? 'Table'}
          </h2>
          <p className='text-sm text-muted-foreground'>
            When records in this table are created, updated, or deleted, a POST request
            is sent to each webhook URL with the payload. Optionally set a secret for
            signature verification.
          </p>

          <div className='space-y-4'>
            <Label className='text-sm font-medium'>Endpoint URL</Label>
            <Input
              placeholder='https://your-server.com/webhook'
              value={formUrl}
              onChange={(e) => setFormUrl(e.target.value)}
              type='url'
              className='w-full'
            />
            <Label className='text-sm font-medium'>Secret (optional)</Label>
            <Input
              placeholder='Shared secret for signature header'
              value={formSecret}
              onChange={(e) => setFormSecret(e.target.value)}
              type='password'
              className='w-full'
            />
            <div className='space-y-2'>
              <Label className='text-sm font-medium'>Events</Label>
              <div className='flex flex-wrap gap-4'>
                <label className='flex items-center gap-2 cursor-pointer'>
                  <Checkbox
                    checked={formEvents.includes('create')}
                    onCheckedChange={() => toggleEvent('create')}
                  />
                  <span className='text-sm'>Record created</span>
                </label>
                <label className='flex items-center gap-2 cursor-pointer'>
                  <Checkbox
                    checked={formEvents.includes('update')}
                    onCheckedChange={() => toggleEvent('update')}
                  />
                  <span className='text-sm'>Record updated</span>
                </label>
                <label className='flex items-center gap-2 cursor-pointer'>
                  <Checkbox
                    checked={formEvents.includes('delete')}
                    onCheckedChange={() => toggleEvent('delete')}
                  />
                  <span className='text-sm'>Record deleted</span>
                </label>
              </div>
            </div>
            <Button onClick={saveWebhook} disabled={!formUrl.trim()}>
              {editingId ? 'Update webhook' : 'Add webhook'}
            </Button>
          </div>

          {webhooks.length > 0 && (
            <div className='space-y-2'>
              <Label className='text-sm font-medium'>Configured webhooks</Label>
              <ul className='space-y-2'>
                {webhooks.map((w) => (
                  <li
                    key={w.id}
                    className='flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm'
                  >
                    <div className='min-w-0 flex-1'>
                      <p className='font-medium truncate'>{w.url}</p>
                      <p className='text-muted-foreground text-xs'>
                        Events: {w.events.join(', ')}
                        {w.secret ? ' · Secret set' : ''}
                      </p>
                    </div>
                    <div className='flex items-center gap-1 shrink-0'>
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() => startEdit(w)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant='ghost'
                        size='icon'
                        className='text-destructive hover:text-destructive'
                        onClick={() => removeWebhook(w.id)}
                      >
                        <LucideTrash2 className='size-4' />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function openTableWebhookDialog(params: {
  tableId: string;
  projectId: string;
  tableName: string;
}) {
  window.dispatchEvent(
    new CustomEvent(OPEN_TABLE_WEBHOOK_EVENT_NAME, { detail: params })
  );
}
