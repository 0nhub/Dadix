'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowLeft,
  LucideX,
  LucideMoreVertical,
  LucideKey,
} from 'lucide-react';
import { TableEditor } from '@/components/table-editor/TableEditor';
import { TableIcon } from '@/components/table-icon/TableIcon';
import { ApiKeysDialog } from '@/components/table-editor/ApiKeysDialog';

import { useAuthContext } from '@/context/AuthContext';
import { UserLocalStorage } from '@/lib/userLocalStorage';
import { useCurrentProjectContext } from '@/context/CurrentProjectContext';
import { useDashboardContext } from '@/context/DashboardContext';
import { useTableContext } from '@/context/TableContext';

import type { Field } from '@/types';

export default function EditTablePage() {
  const { projectId } = useParams();
  const tableId = useSearchParams().get('tableId');
  const router = useRouter();
  const authCtx = useAuthContext();
  const dashboardCtx = useDashboardContext();

  const currentTableFieldsRef = useRef<Field[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [apiKeysDialogOpen, setApiKeysDialogOpen] = useState(false);
  const currentProjectCtx = useCurrentProjectContext();
  const currentTableCtx = useTableContext();

  const currentTable = currentTableCtx.table;

  useEffect(() => {
    if (!projectId) return;
    if (!dashboardCtx.initialized) return;

    const currentProject = dashboardCtx.projects.filter(
      (project) => `${project.id}` === projectId
    )[0];

    if (!currentProject) {
      UserLocalStorage.preferDashboardHome();
      router.push('/dashboard');
      return;
    }
  }, [projectId, dashboardCtx.projects, dashboardCtx.initialized, router]);

  useEffect(() => {
    currentTableFieldsRef.current = currentTableCtx.table?.fields || [];
  }, [currentTableCtx.table?.fields]);

  useEffect(() => {
    if (!currentProjectCtx.initialized || currentProjectCtx.isLoading) {
      return;
    }
    if (tableId && currentProjectCtx.tables.length > 0) {
      const table = currentProjectCtx.tables.filter(
        (table) => `${table.id}` === `${tableId}`
      )[0];
      if (table) {
        setIsLoading(false);
        return;
      }
    }
    // Table not found, redirect to dashboard
    UserLocalStorage.preferDashboardHome();
    router.push('/dashboard');
  }, [
    tableId,
    currentProjectCtx.tables,
    currentProjectCtx.initialized,
    currentProjectCtx.isLoading,
    router,
  ]);

  useEffect(() => {
    if (authCtx.state.initialized && !authCtx.state.authenticated) {
      router.replace('/login');
    }
  }, [authCtx.state.initialized, authCtx.state.authenticated, router]);

  const handleBackToTable = () => {
    router.back();
  };

  if (!authCtx.state.initialized || !authCtx.state.authenticated) {
    return null;
  }

  if (isLoading || !currentTable) {
    return (
      <div className='flex flex-col items-center justify-center h-screen w-full'>
        {/*<LoadingIndicator className='text-lg' />*/}
      </div>
    );
  }

  return (
    <div className='flex justify-between gap-2 w-full'>
      <div className='w-full'>
        <header className='flex items-center justify-between gap-2 m-4 mb-0'>
          <div className='max-w-115 flex grow shrink gap-2'>
            <Button variant='outline' onClick={handleBackToTable}>
              <ArrowLeft />
              Back
            </Button>
            <Select
              value={`${tableId}`}
              onValueChange={(newTableId) => {
                router.replace(
                  `/dashboard/${projectId}/edit-table?tableId=${newTableId}`
                );
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currentProjectCtx.tables.map((table) => {
                  return (
                    <SelectItem value={`${table.id}`} key={table.id}>
                      <TableIcon
                        name={table.icon}
                        className='text-foreground'
                      />
                      <span>{table.name}</span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className='flex items-center gap-1 shrink-0'>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='outline' size='icon'>
                  <LucideMoreVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuItem onClick={() => setApiKeysDialogOpen(true)}>
                  <LucideKey className='size-4' />
                  AI API Keys
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              className='shrink-0 grow-0'
              onClick={handleBackToTable}
              variant='outline'
              size='icon'
            >
              <LucideX />
            </Button>
          </div>
        </header>
        <ApiKeysDialog
          open={apiKeysDialogOpen}
          onOpenChange={setApiKeysDialogOpen}
        />
        <main>
          <TableEditor />
        </main>
      </div>
    </div>
  );
}
