'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { LoadingIndicator } from '@/components/loading-indicator/LoadingIndicator';
import { useAuthContext } from '@/context/AuthContext';
import { toast } from 'sonner';
import { inviteService } from '@/lib/invite';

interface InviteResponseData {
  id: string | number;
  projectId: string | number;
  email?: string | null;
  role: 'VIEWER' | 'EDITOR' | 'ADMIN' | 'OWNER';
  status: 'pending' | 'accepted';
  expiresAt?: string | null;
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { state } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InviteResponseData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  const inviteUrl = useMemo(() => `/invite/${token}`, [token]);

  // 1) Fetch invite (public)
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    inviteService
      .getInvite(token)
      .then((res) => {
        if (res.status === 200 && res.data?.invite) {
          setInvite(res.data.invite as InviteResponseData);
          setError(null);
          return;
        }
        setError('Invite not found.');
        return res;
      })
      .finally(() => setLoading(false))
      .catch((err) => {
        if (err?.response?.status === 404) {
          setError('Invite not found.');
        } else if (err?.response?.status === 400) {
          setError('Invite expired or already used.');
        } else {
          setError('Something went wrong. Try again.');
        }
      });
  }, [token]);

  // 2) Redirect unauthenticated users to login preserving next
  useEffect(() => {
    if (loading) return;
    if (error) return; // don't redirect if token invalid; show error page
    if (!state.initialized) return;
    if (!state.authenticated) {
      router.replace(`/login?next=${encodeURIComponent(inviteUrl)}`);
    }
  }, [
    loading,
    error,
    state.initialized,
    state.authenticated,
    inviteUrl,
    router,
  ]);

  const accept = () => {
    if (!token) return;
    setAccepting(true);
    inviteService
      .acceptInvite(token)
      .then((res) => {
        if (res.status === 200) {
          const projectId = res.data?.projectId || invite?.projectId;
          const role = res.data?.role || invite?.role;
          toast.success(`Invite accepted. Role: ${role}`);
          if (projectId) {
            router.replace(`/dashboard/${projectId}`);
          } else {
            router.replace('/dashboard');
          }
          return;
        }
        throw new Error('Failed to accept invite');
      })
      .finally(() => setAccepting(false))
      .catch((err) => {
        const status = err?.response?.status;
        if (status === 401) {
          router.replace(`/login?next=${encodeURIComponent(inviteUrl)}`);
          return;
        }
        if (status === 403) {
          const inviteEmail = invite?.email
            ? ` Please login with ${invite?.email}.`
            : '';
          toast.error(`Invite email mismatch.${inviteEmail}`);
          return;
        }
        toast.error('Something went wrong. Try again.');
      });
  };

  if (loading) {
    return (
      <div className='fixed inset-0 flex items-center justify-center'>
        {/*<LoadingIndicator />*/}
      </div>
    );
  }

  if (error) {
    return (
      <div className='min-h-screen flex flex-col items-center justify-center gap-4'>
        <h2 className='text-xl font-semibold'>Invitation</h2>
        <p className='text-sm opacity-80'>{error}</p>
        <Button onClick={() => router.replace('/dashboard')}>
          Back to projects
        </Button>
      </div>
    );
  }

  if (!invite) {
    return null;
  }

  // Authenticated path: show accept UI (one-click experience)
  return (
    <div className='min-h-screen flex flex-col items-center justify-center gap-4 p-4'>
      <div className='border rounded-lg p-6 max-w-md w-full'>
        <h2 className='text-xl font-semibold mb-2'>You are invited</h2>
        <p className='text-sm opacity-80 mb-4'>
          Role: <b>{invite.role}</b>
          {invite.email ? (
            <>
              {' '}
              | Email: <b>{invite.email}</b>
            </>
          ) : null}
          {invite.expiresAt ? (
            <> | Expires: {new Date(invite.expiresAt).toLocaleString()}</>
          ) : null}
        </p>
        <div className='flex gap-2'>
          <Button onClick={accept} disabled={accepting}>
            {/*{accepting ? (
              <LoadingIndicator className='size-4' visibilityDelay={false} />
            ) : (
              'Accept invite'
            )}*/}
            Accept invite
          </Button>
          <Button
            variant='outline'
            onClick={() => router.replace('/dashboard')}
          >
            Cancel
          </Button>
        </div>
      </div>
      {/*process.env.NODE_ENV !== 'production' ? (
        <div className='text-xs opacity-60'>
          Token: {String(token).slice(0, 6)}...
        </div>
      ) : null*/}
    </div>
  );
}
