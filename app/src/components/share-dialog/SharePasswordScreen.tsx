'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SharePasswordScreenProps {
  title?: string;
  onConfirm: (password: string) => void | Promise<void>;
  error?: string;
}

export function SharePasswordScreen({
  title,
  onConfirm,
  error,
}: SharePasswordScreenProps) {
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = password.trim();
    if (!p) return;
    setSubmitting(true);
    try {
      await onConfirm(p);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className='min-h-screen flex items-center justify-center bg-[#f9f9f9] p-4'>
      <form
        onSubmit={handleSubmit}
        className='w-full max-w-sm flex flex-col items-center gap-4'
      >
        {title ? (
          <h1 className='text-lg font-medium text-muted-foreground'>{title}</h1>
        ) : null}
        <div className='w-full space-y-2'>
          <Label htmlFor='share-password' className='text-muted-foreground'>
            Password
          </Label>
          <Input
            id='share-password'
            type='password'
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder='Password'
            className='w-full bg-background rounded-md'
            autoFocus
            disabled={submitting}
          />
        </div>
        {error ? (
          <p className='text-sm text-destructive' role='alert'>
            {error}
          </p>
        ) : null}
        <Button
          type='submit'
          className='w-full bg-foreground text-background hover:bg-foreground/90 rounded-md'
          disabled={!password.trim() || submitting}
        >
          Confirm
        </Button>
      </form>
    </div>
  );
}
