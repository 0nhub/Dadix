'use client';

import { useState } from 'react';
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
import { availableProjectIcons, ProjectIcon } from '@/components/project-icon/ProjectIcon';
import { callApi } from '@/lib/api';
import { createLocalProject } from '@/lib/dev-demo-data';
import { dadixEvents } from '@/constants/events';
import { toast } from 'sonner';
import { useLanguage } from '@/context/LanguageContext';
import { LucideX } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When creating from a section's "New Project", assign the new project to this section. */
  initialSectionId?: string;
  /** Called after project is created with its id and optional section to assign to. */
  onCreated?: (projectId: string, sectionId?: string) => void;
}

export function NewProjectDialog({ open, onOpenChange, initialSectionId, onCreated }: NewProjectDialogProps) {
  const { t } = useLanguage();
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState('FolderClosed');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = (title || '').trim();
    if (!trimmed) return;
    setIsSubmitting(true);
    if (process.env.NODE_ENV === 'development') {
      const created = createLocalProject(trimmed, icon);
      window.dispatchEvent(
        new CustomEvent(dadixEvents.projectEvents.onCreate, {
          detail: { createdProject: created },
        })
      );
      onCreated?.(created.id, initialSectionId);
      setTitle('');
      setIcon('FolderClosed');
      onOpenChange(false);
      setIsSubmitting(false);
      return;
    }
    callApi
      .post('/project', { title: trimmed, icon })
      .then((res) => {
        if (res.status !== 201 || !res.data) throw new Error('Error creating project');
        const createdId = (res.data as { id?: string })?.id ?? String((res.data as { id?: unknown })?.id ?? '');
        window.dispatchEvent(
          new CustomEvent(dadixEvents.projectEvents.onCreate, {
            detail: { createdProject: { ...res.data } },
          })
        );
        onCreated?.(createdId, initialSectionId);
        setTitle('');
        setIcon('FolderClosed');
        onOpenChange(false);
        setIsSubmitting(false);
        return res;
      })
      .catch((err) => {
        if (process.env.NODE_ENV === 'development') {
          const mockId = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
          window.dispatchEvent(
            new CustomEvent(dadixEvents.projectEvents.onCreate, {
              detail: {
                createdProject: {
                  id: mockId,
                  title: trimmed,
                  icon,
                  order: 0,
                },
              },
            })
          );
          onCreated?.(mockId, initialSectionId);
          setTitle('');
          setIcon('FolderClosed');
          onOpenChange(false);
          toast.success('Projekt angelegt (nur lokal, Dev-Modus)');
        } else {
          toast.error('Error creating a new project!');
        }
        setIsSubmitting(false);
        console.error(err);
      });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md' showCloseButton={false}>
        <DialogHeader className='flex flex-row flex-nowrap justify-start items-center'>
          <DialogClose asChild>
            <Button size='icon' variant='outline' className='shrink-0'>
              <LucideX />
            </Button>
          </DialogClose>
          <DialogTitle className='shrink grow' hidden>
            {t('dashboard.newProject')}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className='space-y-4 mt-2'>
            <div className='flex flex-col items-center gap-4'>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant='outline' className='w-21 h-21' type='button' disabled={isSubmitting}>
                    <ProjectIcon name={icon} color='var(--primary)' className='size-14' />
                  </Button>
                </DialogTrigger>
                <DialogContent showCloseButton={false} className='max-w-[300px]! max-h-[400px]'>
                  <DialogHeader>
                    <DialogTitle hidden>Icon</DialogTitle>
                  </DialogHeader>
                  <div className='grid grid-cols-6 gap-2 justify-center'>
                    {availableProjectIcons.map((iconName) => (
                      <DialogClose key={iconName} asChild>
                        <Button
                          type='button'
                          variant='outline'
                          size='icon'
                          aria-pressed={icon === iconName}
                          title={iconName}
                          onClick={() => setIcon(iconName)}
                          className={cn('shadow-none', icon === iconName && 'border-2 border-primary')}
                        >
                          <ProjectIcon name={iconName} className='size-6' />
                        </Button>
                      </DialogClose>
                    ))}
                  </div>
                </DialogContent>
              </Dialog>
              <Input
                placeholder={t('dashboard.projectName')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isSubmitting}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit(e as React.FormEvent)}
                className='w-full'
              />
            </div>
          </div>
          <DialogFooter className='mt-4 gap-4'>
            <Button type='button' variant='outline' onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              {t('common.cancel')}
            </Button>
            <Button type='submit' disabled={isSubmitting || !(title || '').trim()}>
              {t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
