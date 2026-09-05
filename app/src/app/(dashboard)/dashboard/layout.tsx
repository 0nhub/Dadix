'use client';

import { SidebarProvider } from '@/components/ui/sidebar';
import { CurrentProjectContextProvider } from '@/context/CurrentProjectContext';
import { DashboardContextProvider } from '@/context/DashboardContext';
import { DashboardSectionsProvider } from '@/context/DashboardSectionsContext';
import { TableStyleProvider } from '@/context/TableStyleContext';
import { Suspense } from 'react';
import { UserSettingsDialog } from '@/components/settings-dialog/SettingsDialog';
import { EditProjectPanel } from '@/components/projects-editor/EditProjectPanel';
import { TableContextProvider } from '@/context/TableContext';
import { TableViewsContextProvider } from '@/context/TableViewsContext';
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider
      resizable
      style={
        {
          '--header-height': 'calc(var(--spacing) * 12)',
        } as React.CSSProperties
      }
      className='h-full'
    >
      <Suspense>
        <TableStyleProvider>
          <DashboardContextProvider>
            <DashboardSectionsProvider>
              <CurrentProjectContextProvider>
                {children}
                <UserSettingsDialog />
                <EditProjectPanel />
              </CurrentProjectContextProvider>
            </DashboardSectionsProvider>
          </DashboardContextProvider>
        </TableStyleProvider>
      </Suspense>
    </SidebarProvider>
  );
}
