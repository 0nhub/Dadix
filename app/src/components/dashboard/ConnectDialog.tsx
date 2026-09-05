'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LucideX } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

type ConnectDialogProps = { open: boolean; onOpenChange: (open: boolean) => void };

export function ConnectDialog({ open, onOpenChange }: ConnectDialogProps) {
  const { t } = useLanguage();
  const [key, setKey] = useState('');

  useEffect(() => {
    if (!open) setKey('');
  }, [open]);

  const handleConfirm = () => {
    // TODO: persist / use key later
    onOpenChange(false);
    setKey('');
  };

  const handleCancel = () => {
    onOpenChange(false);
    setKey('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md' showCloseButton={false}>
        <DialogHeader className='flex flex-row flex-nowrap justify-start items-center'>
          <DialogClose asChild>
            <Button type='button' size='icon' variant='outline' className='shrink-0' aria-label={t('common.cancel')}>
              <LucideX className='size-4' />
            </Button>
          </DialogClose>
          <DialogTitle className='sr-only'>{t('dashboard.connect.title')}</DialogTitle>
        </DialogHeader>
        <div className='mt-6 space-y-4'>
          <div className='flex flex-col gap-2'>
            <label className='text-sm font-medium' htmlFor='connect-key'>
              {t('dashboard.connect.key')}
            </label>
            <Input
              id='connect-key'
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={t('dashboard.connect.keyPlaceholder')}
              className='w-full'
            />
          </div>
        </div>
        <DialogFooter className='mt-6 gap-4'>
          <Button type='button' variant='outline' onClick={handleCancel}>
            {t('common.cancel')}
          </Button>
          <Button type='button' onClick={handleConfirm}>
            {t('common.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
