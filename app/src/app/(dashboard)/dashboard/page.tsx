'use client';

import { LucideFrown } from 'lucide-react';
import { useDashboardContext } from '@/context/DashboardContext';
import { Button } from '@/components/ui/button';
import { LoadingIndicator } from '@/components/loading-indicator/LoadingIndicator';
import { DashboardHome } from '@/components/dashboard/DashboardHome';

/** Dashboard home — always stays here; start-target redirect lives on `/` only. */
export default function Page() {
  const dashboardCtx = useDashboardContext();

  if (!dashboardCtx.initialized && !dashboardCtx.isLoading) {
    return (
      <div className='flex flex-col items-center justify-center gap-6 w-full h-full'>
        <LucideFrown className='size-18 opacity-10' />
        <h3 className='text-xl font-normal'>Something went wrong!</h3>
        <Button
          onClick={() => {
            document.location.reload();
          }}
        >
          Refresh page
        </Button>
      </div>
    );
  }

  if (!dashboardCtx.initialized || dashboardCtx.isLoading) {
    return (
      <div className='fixed inset-0 bg-background flex items-center justify-center z-50'>
        <div className='flex flex-col items-center justify-center gap-4'>
          <LoadingIndicator className='size-7' />
        </div>
      </div>
    );
  }

  return <DashboardHome />;
}
