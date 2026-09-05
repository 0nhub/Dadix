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

type NewSectionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (name: string) => void;
};

export function NewSectionDialog({ open, onOpenChange, onConfirm }: NewSectionDialogProps) {
  const { t } = useLanguage();
  const [name, setName] = useState('');

  useEffect(() => {
    if (!open) setName('');
  }, [open]);

  const handleConfirm = () => {
    const trimmed = name.trim();
    if (trimmed) {
      onConfirm(trimmed);
      onOpenChange(false);
      setName('');
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
    setName('');
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
          <DialogTitle className='sr-only'>{t('dashboard.section.newSection')}</DialogTitle>
        </DialogHeader>
        <div className='mt-6 space-y-4'>
          <div className='flex flex-col gap-2'>
            <label className='text-sm font-medium' htmlFor='section-name'>
              {t('dashboard.section.sectionName')}
            </label>
            <Input
              id='section-name'
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('dashboard.section.newSection')}
              className='w-full'
              onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
            />
          </div>
        </div>
        <DialogFooter className='mt-6 gap-4'>
          <Button type='button' variant='outline' onClick={handleCancel}>
            {t('common.cancel')}
          </Button>
          <Button type='button' onClick={handleConfirm} disabled={!name.trim()}>
            {t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
