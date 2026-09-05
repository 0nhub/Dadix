'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { shareService } from '@/lib/share';
import type { SharePublicInfo } from '@/lib/share';
import { SharedViewContent } from '@/components/share-dialog/SharedViewContent';
import { SharePasswordScreen } from '@/components/share-dialog/SharePasswordScreen';

export default function SharePage() {
  const params = useParams<{ shareId: string }>();
  const shareId = params?.shareId;
  const [info, setInfo] = useState<SharePublicInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    if (!shareId) return;
    setLoading(true);
    setError(null);
    shareService
      .getShare(shareId)
      .then((data) => {
        setInfo(data);
        if (!data.passwordProtected) setUnlocked(true);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Share not found');
        setInfo(null);
      })
      .finally(() => setLoading(false));
  }, [shareId]);

  const handleVerify = async (password: string) => {
    if (!shareId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await shareService.verifySharePassword(shareId, password);
      setInfo(data);
      setUnlocked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid password');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !info) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-[#f9f9f9]'>
        <p className='text-sm text-muted-foreground'>Loading…</p>
      </div>
    );
  }

  if (error && !info) {
    return (
      <div className='min-h-screen flex flex-col items-center justify-center gap-4 bg-[#f9f9f9] p-4'>
        <h2 className='text-lg font-semibold'>Share not found</h2>
        <p className='text-sm text-muted-foreground'>{error}</p>
      </div>
    );
  }

  if (info?.passwordProtected && !unlocked) {
    return (
      <SharePasswordScreen
        title={info.title}
        onConfirm={handleVerify}
        error={error ?? undefined}
      />
    );
  }

  if (info?.snapshot) {
    return (
      <SharedViewContent
        title={info.title}
        thumbnailUrl={info.thumbnailUrl}
        snapshot={info.snapshot}
      />
    );
  }

  return (
    <div className='min-h-screen flex items-center justify-center bg-[#f9f9f9]'>
      <p className='text-sm text-muted-foreground'>No content to display.</p>
    </div>
  );
}
