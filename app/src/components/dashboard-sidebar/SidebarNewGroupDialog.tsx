'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useSidebarState } from '@/context/SidebarStateContext';

interface SidebarNewGroupDialogProps {
  open: boolean;
  onOpenChange: (_open: boolean) => void;
}

export function SidebarNewGroupDialog({
  open,
  onOpenChange,
}: SidebarNewGroupDialogProps) {
  const { addGroup } = useSidebarState();
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    addGroup(trimmed);
    setName('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>New group</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <Input
            placeholder='Group name'
            value={name}
            onChange={(e) => setName(e.target.value)}
            className='mt-2'
            autoFocus
          />
          <DialogFooter className='mt-4 gap-4'>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type='submit' disabled={!name.trim()}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
