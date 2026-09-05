'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LucideX, LucideCopy, LucideUnlink, LucideExternalLink } from 'lucide-react';
import { shareService } from '@/lib/share';
import type { ShareType, ShareSnapshot } from '@/lib/share';
import { toast } from 'sonner';
import { useCurrentProjectContext } from '@/context/CurrentProjectContext';
import { useTableContext } from '@/context/TableContext';
import { useTableViewsContext } from '@/context/TableViewsContext';
import { useLanguage } from '@/context/LanguageContext';
import { useSearchParams } from 'next/navigation';
import { getAllRecordsForExport } from '@/lib/record';

const OPEN_SHARE_DIALOG_EVENT = 'dadix-open-share-dialog';

export interface ShareDialogInput {
  projectId: string;
  tableId: string;
  viewId?: string;
  tableName: string;
  tableIcon?: string;
  tableFields: { id: number; name: string; type: string; order: number }[];
  viewName?: string;
  viewType?: string;
  getRecords: () => Promise<Record<string, unknown>[]>;
}

export function openShareDialog() {
  window.dispatchEvent(new CustomEvent(OPEN_SHARE_DIALOG_EVENT));
}

interface ShareDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  input?: ShareDialogInput | null;
}

type ShareDialogView = 'list' | 'create' | 'created';

function ShareDialogContent({
  shareType,
  setShareType,
  title,
  setTitle,
  password,
  setPassword,
  thumbnailUrl,
  setThumbnailUrl,
  created,
  setCreated,
  isSubmitting,
  setIsSubmitting,
  handleClose,
  input,
  view,
  setView,
  existingShares,
  refreshExistingShares,
}: {
  shareType: ShareType;
  setShareType: (v: ShareType) => void;
  title: string;
  setTitle: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  thumbnailUrl: string;
  setThumbnailUrl: (v: string) => void;
  created: { shareId: string; url: string } | null;
  setCreated: (v: { shareId: string; url: string } | null) => void;
  isSubmitting: boolean;
  setIsSubmitting: (v: boolean) => void;
  handleClose: (open: boolean) => void;
  input: ShareDialogInput | null;
  view: ShareDialogView;
  setView: (v: ShareDialogView) => void;
  existingShares: { shareId: string; url: string; title: string }[];
  refreshExistingShares: () => void;
}) {
  const { t } = useLanguage();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input) return;
    const trimmedTitle = (title || input.tableName || 'Shared view').trim();
    setIsSubmitting(true);
    try {
      const records = await input.getRecords();
      const snapshot: ShareSnapshot = {
        tableName: input.tableName,
        tableIcon: input.tableIcon,
        tableFields: input.tableFields,
        viewName: input.viewName,
        viewType: input.viewType,
        records,
      };
      const result = await shareService.createShare({
        type: shareType,
        projectId: input.projectId,
        tableId: input.tableId,
        viewId: input.viewId,
        title: trimmedTitle,
        thumbnailUrl: thumbnailUrl.trim() || undefined,
        password: password.trim() || undefined,
        snapshot,
      });
      shareService.addMyShare({
        shareId: result.shareId,
        projectId: input.projectId,
        tableId: input.tableId,
        createdAt: new Date().toISOString(),
      });
      setCreated(null);
      setView('list');
      refreshExistingShares();
      toast.success(t('share.created'));
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : 'Failed to create share'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = async (shareIdToDeactivate: string) => {
    try {
      await shareService.deactivateShare(shareIdToDeactivate);
      shareService.removeMyShare(shareIdToDeactivate);
      refreshExistingShares();
      if (created?.shareId === shareIdToDeactivate) {
        setCreated(null);
        setView('list');
      }
      toast.success(t('share.deactivated'));
    } catch {
      toast.error(t('share.deactivateFailed'));
    }
  };

  if (view === 'list') {
    return (
      <div className='space-y-4 pt-2'>
        <p className='text-sm font-medium'>{t('share.title')}</p>
        {existingShares.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('share.noLinks')}
          </p>
        ) : (
          <ul className='space-y-3'>
            {existingShares.map((s) => (
              <li
                key={s.shareId}
                className='flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2'
              >
                <div className='flex-1 min-w-0'>
                  <p className='text-sm font-medium truncate' title={s.title}>
                    {s.title}
                  </p>
                  <code className='text-xs text-muted-foreground truncate block'>
                    {s.url}
                  </code>
                </div>
                <div className='flex items-center gap-1 shrink-0'>
                  <Button
                    variant='outline'
                    size='icon'
                    title={t('share.openInNewTab')}
                    onClick={() =>
                      window.open(s.url, '_blank', 'noopener,noreferrer')
                    }
                  >
                    <LucideExternalLink className='size-4' />
                  </Button>
                  <Button
                    variant='outline'
                    size='icon'
                    title={t('share.copy')}
                    onClick={() => {
                      navigator.clipboard.writeText(s.url);
                      toast.success(t('share.urlCopied'));
                    }}
                  >
                    <LucideCopy className='size-4' />
                  </Button>
                  <Button
                    variant='outline'
                    size='icon'
                    title={t('share.deactivate')}
                    onClick={() => handleDeactivate(s.shareId)}
                  >
                    <LucideUnlink className='size-4' />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className='pt-2'>
          <Button
            variant='default'
            className='w-full'
            onClick={() => setView('create')}
          >
            {t('share.createNew')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleCreate} className='space-y-4 pt-2'>
      <div className='space-y-2'>
        <Label>{t('share.shareType')}</Label>
        <div className='flex gap-4'>
          <label className='flex items-center gap-2 cursor-pointer'>
            <input
              type='radio'
              name='shareType'
              checked={shareType === 'currentView'}
              onChange={() => setShareType('currentView')}
              className='rounded-full'
            />
            <span className='text-sm'>{t('share.currentView')}</span>
          </label>
          <label className='flex items-center gap-2 cursor-pointer'>
            <input
              type='radio'
              name='shareType'
              checked={shareType === 'fullProject'}
              onChange={() => setShareType('fullProject')}
              className='rounded-full'
            />
            <span className='text-sm'>{t('share.fullProject')}</span>
          </label>
        </div>
      </div>

      <div className='space-y-2'>
        <Label htmlFor='share-title'>{t('share.pageTitle')}</Label>
        <Input
          id='share-title'
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={input?.tableName ?? 'Example Name'}
          className='w-full'
        />
      </div>

      <div className='space-y-2'>
        <Label htmlFor='share-password'>{t('share.passwordOptional')}</Label>
        <Input
          id='share-password'
          type='password'
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('share.passwordPlaceholder')}
          className='w-full'
        />
      </div>

      <div className='space-y-2'>
        <Label htmlFor='share-thumbnail'>{t('share.thumbnailUrl')}</Label>
        <Input
          id='share-thumbnail'
          type='url'
          value={thumbnailUrl}
          onChange={(e) => setThumbnailUrl(e.target.value)}
          placeholder='https://…'
          className='w-full'
        />
      </div>

      <DialogFooter className='mt-6 gap-4'>
        <Button
          type='button'
          variant='outline'
          onClick={() => setView('list')}
        >
          {t('common.cancel')}
        </Button>
        <Button type='submit' disabled={isSubmitting || !input}>
          {isSubmitting ? t('share.creating') : t('share.createShare')}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ShareDialog(_props?: ShareDialogProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ShareDialogView>('list');
  const [shareType, setShareType] = useState<ShareType>('currentView');
  const [title, setTitle] = useState('');
  const [password, setPassword] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [created, setCreated] = useState<{
    shareId: string;
    url: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingShares, setExistingShares] = useState<
    { shareId: string; url: string; title: string }[]
  >([]);

  const currentProjectCtx = useCurrentProjectContext();
  const currentTableCtx = useTableContext();
  const tableViewsCtx = useTableViewsContext();
  const searchParams = useSearchParams();
  const viewIdParam = searchParams.get('viewId');

  const input = useMemo((): ShareDialogInput | null => {
    if (!currentProjectCtx.id || !currentTableCtx.id || !currentTableCtx.table)
      return null;
    const table = currentTableCtx.table;
    const view = tableViewsCtx.views.find((v) => `${v.id}` === viewIdParam);
    const fields = (table.fields ?? [])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((f) => ({
        id: f.id,
        name: f.name,
        type: f.type,
        order: f.order ?? 0,
      }));
    return {
      projectId: String(currentProjectCtx.id),
      tableId: String(currentTableCtx.id),
      viewId: viewIdParam ?? undefined,
      tableName: table.name,
      tableIcon: table.icon,
      tableFields: fields,
      viewName: view?.name,
      viewType: view?.type,
      getRecords: () => getAllRecordsForExport(currentTableCtx.id!),
    };
  }, [
    currentProjectCtx.id,
    currentTableCtx.id,
    currentTableCtx.table,
    tableViewsCtx.views,
    viewIdParam,
  ]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_SHARE_DIALOG_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SHARE_DIALOG_EVENT, onOpen);
  }, []);

  const refreshExistingShares = useCallback(async () => {
    const projectId = currentProjectCtx.id ? String(currentProjectCtx.id) : '';
    if (!projectId) {
      setExistingShares([]);
      return;
    }
    const entries = shareService.getMySharesForProject(projectId);
    const results: { shareId: string; url: string; title: string }[] = [];
    const toRemove: string[] = [];
    for (const e of entries) {
      try {
        const info = await shareService.getShare(e.shareId);
        if (info.active && info.title) {
          results.push({
            shareId: e.shareId,
            url: shareService.getShareUrl(e.shareId),
            title: info.title,
          });
        } else {
          toRemove.push(e.shareId);
        }
      } catch {
        toRemove.push(e.shareId);
      }
    }
    toRemove.forEach((id) => shareService.removeMyShare(id));
    setExistingShares(results);
  }, [currentProjectCtx.id]);

  useEffect(() => {
    if (open && currentProjectCtx.id) refreshExistingShares();
  }, [open, currentProjectCtx.id, refreshExistingShares]);

  const resetForm = () => {
    setView('list');
    setShareType('currentView');
    setTitle('');
    setPassword('');
    setThumbnailUrl('');
    setCreated(null);
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    setOpen(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className='sm:max-w-md' showCloseButton={false}>
        <DialogHeader className='flex flex-row flex-nowrap justify-start items-center'>
          <DialogClose asChild>
            <Button size='icon' variant='outline' className='shrink-0'>
              <LucideX />
            </Button>
          </DialogClose>
        </DialogHeader>
        {!input ? (
          <p className='text-sm text-muted-foreground py-4'>
            {t('share.selectTable')}
          </p>
        ) : (
          <ShareDialogContent
            shareType={shareType}
            setShareType={setShareType}
            title={title}
            setTitle={setTitle}
            password={password}
            setPassword={setPassword}
            thumbnailUrl={thumbnailUrl}
            setThumbnailUrl={setThumbnailUrl}
            created={created}
            setCreated={setCreated}
            isSubmitting={isSubmitting}
            setIsSubmitting={setIsSubmitting}
            handleClose={handleClose}
            input={input}
            view={view}
            setView={setView}
            existingShares={existingShares}
            refreshExistingShares={refreshExistingShares}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
