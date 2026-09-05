'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useSidebarState } from '@/context/SidebarStateContext';
import {
  TableIcon,
  availableTableIcons,
} from '@/components/table-icon/TableIcon';

interface SidebarNewLinkDialogProps {
  open: boolean;
  onOpenChange: (_open: boolean) => void;
}

export function SidebarNewLinkDialog({
  open,
  onOpenChange,
}: SidebarNewLinkDialogProps) {
  const { addLink } = useSidebarState();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [icon, setIcon] = useState('Globe');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    const u = url.trim();
    if (!t || !u) return;
    let href = u;
    if (!href.startsWith('http://') && !href.startsWith('https://')) {
      href = `https://${href}`;
    }
    addLink(t, href, icon);
    setTitle('');
    setUrl('');
    setIcon('Globe');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>New link</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className='space-y-4 mt-2'>
            <div className='flex flex-col items-center gap-4'>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant='outline' className='w-21 h-21' type='button'>
                    <TableIcon
                      name={icon}
                      color='var(--primary)'
                      className='size-14 opacity-90'
                    />
                  </Button>
                </DialogTrigger>
                <DialogContent
                  showCloseButton={false}
                  className='max-w-[300px]! max-h-[400px]'
                >
                  <DialogHeader>
                    <DialogTitle hidden>Select icon</DialogTitle>
                  </DialogHeader>
                  <div className='grid grid-cols-6 gap-2 justify-center'>
                    {availableTableIcons.map((iconName) => (
                      <DialogClose key={iconName} asChild>
                        <Button
                          type='button'
                          variant='outline'
                          size='icon'
                          aria-pressed={icon === iconName}
                          title={iconName}
                          onClick={() => setIcon(iconName)}
                          className={`shadow-none ${icon === iconName ? 'border' : 'border-none'}`}
                        >
                          <TableIcon name={iconName} className='size-6' />
                        </Button>
                      </DialogClose>
                    ))}
                  </div>
                </DialogContent>
              </Dialog>
              <div className='w-full space-y-2'>
                <Input
                  placeholder='Title'
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  autoFocus
                />
                <Input
                  placeholder='https://example.com'
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  type='url'
                />
              </div>
            </div>
          </div>
          <DialogFooter className='mt-4 gap-4'>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type='submit' disabled={!title.trim() || !url.trim()}>
              Add link
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
