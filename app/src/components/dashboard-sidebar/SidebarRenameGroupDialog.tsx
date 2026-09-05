'use client';

import { useState, useEffect } from 'react';
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
import type { SidebarGroup } from '@/lib/sidebarState';

interface SidebarRenameGroupDialogProps {
  open: boolean;
  onOpenChange: (_open: boolean) => void;
  group: SidebarGroup | null;
}

export function SidebarRenameGroupDialog({
  open,
  onOpenChange,
  group,
}: SidebarRenameGroupDialogProps) {
  const { renameGroup } = useSidebarState();
  const [name, setName] = useState('');

  useEffect(() => {
    if (group) setName(group.name);
  }, [group, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!group) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    renameGroup(group.id, trimmed);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Rename group</DialogTitle>
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
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
