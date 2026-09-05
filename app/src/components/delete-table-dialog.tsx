'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  tableName?: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export default function DeleteTableDialog({
  open,
  tableName = '',
  onClose,
  onConfirm,
}: Props) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      console.error('Delete failed', err);
      toast.error('Failed to delete table');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent>
        <DialogHeader className='items-start'>
          <DialogTitle>Delete table</DialogTitle>
          <DialogDescription className='text-left text-pretty'>
            Are you sure you want to delete &quot;{tableName}&quot;? This action
            cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className='flex-row justify-end'>
          <Button variant='ghost' onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant='destructive'
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
