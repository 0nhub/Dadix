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

type RenameSectionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sectionId: string | null;
  sectionName: string;
  onConfirm: (sectionId: string, newName: string) => void;
};

export function RenameSectionDialog({
  open,
  onOpenChange,
  sectionId,
  sectionName,
  onConfirm,
}: RenameSectionDialogProps) {
  const { t } = useLanguage();
  const [name, setName] = useState('');

  useEffect(() => {
    if (open) {
      setName(sectionName);
    }
  }, [open, sectionName]);

  const handleConfirm = () => {
    const trimmed = name.trim();
    if (trimmed && sectionId) {
      onConfirm(sectionId, trimmed);
      onOpenChange(false);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
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
          <DialogTitle className='sr-only'>{t('dashboard.section.rename')}</DialogTitle>
        </DialogHeader>
        <div className='mt-6 space-y-4'>
          <div className='flex flex-col gap-2'>
            <label className='text-sm font-medium' htmlFor='rename-section-name'>
              {t('dashboard.section.sectionName')}
            </label>
            <Input
              id='rename-section-name'
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('dashboard.section.sectionName')}
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
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
