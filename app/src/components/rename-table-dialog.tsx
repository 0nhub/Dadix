'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  initialName?: string;
  onClose: () => void;
  onSave: (_arg0: string) => Promise<void>;
}
export default function RenameTableDialog({
  open,
  initialName = '',
  onClose,
  onSave,
}: Props) {
  const [name, setName] = useState(initialName);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setName(initialName);
  }, [initialName]);

  const handleSave = async () => {
    if (!name || name.trim() === '') {
      toast.error('Name cannot be empty');
      return;
    }
    setLoading(true);
    try {
      await onSave(name.trim());
      onClose();
    } catch (err) {
      console.error('Rename failed', err);
      toast.error('Failed to rename table');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent>
        <DialogHeader className='flex items-start'>
          <DialogTitle>Rename table</DialogTitle>
          <DialogDescription>
            Enter a new name for this table.
          </DialogDescription>
        </DialogHeader>

        <div className='mt-2'>
          <Input
            value={name}
            onChange={(e) => setName((e.target as HTMLInputElement).value)}
            placeholder='Table name'
            aria-label='Table name'
          />
        </div>

        <DialogFooter className='flex flex-row justify-end'>
          <Button variant='ghost' onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
