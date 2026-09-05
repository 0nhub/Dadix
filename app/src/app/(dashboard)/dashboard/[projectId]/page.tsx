'use client';

import { useEffect, useState } from 'react';
import { DataTable } from '@/components/data-table';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset } from '@/components/ui/sidebar';
import { useCurrentProjectContext } from '@/context/CurrentProjectContext';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { APIConfigDialog } from '@/components/api-config-dialog/APIConfigDialog';
import { TableWebhookDialog } from '@/components/table-webhook-dialog/TableWebhookDialog';
import { useDashboardContext } from '@/context/DashboardContext';
import { TableRecordEditorsManager } from '@/components/table-cell-viewer';
import {
  CreateTableDialog,
  openCreateNewTableDialog,
} from '@/components/create-table-dialog';
import { LoadingIndicator } from '@/components/loading-indicator/LoadingIndicator';
import { DashboardSidebar } from '@/components/dashboard-sidebar/DashboardSidebar';
import { ViewEditor } from '@/components/view-editor/ViewEditor';
import { CreateViewDialog } from '@/components/view-editor/CreateViewDialog';
import { DeleteViewConfirmDialog } from '@/components/view-editor/DeleteViewConfirmDialog';
import { UpdateViewDialog } from '@/components/view-editor/UpdateViewDialog';
import { ShareDialog } from '@/components/share-dialog/ShareDialog';
import { WebformDialog } from '@/components/webform-dialog/WebformDialog';
import {
  ApiKeysDialog,
  OPEN_API_KEYS_DIALOG_EVENT,
} from '@/components/table-editor/ApiKeysDialog';
import { GridView } from '@/components/views-switch/views/grid-view/GridView';
import { GlobalFilter } from '@/components/global-filter/GlobalFilter';
import { ViewFilterDialog } from '@/components/view-filter-dialog/ViewFilterDialog';
import { ViewSortingDialog } from '@/components/view-sorting-dialog/ViewSortingDialog';
import {
  TableUploadDialog,
  OPEN_TABLE_UPLOAD_DIALOG,
} from '@/components/table-upload-dialog/TableUploadDialog';
import { UserLocalStorage } from '@/lib/userLocalStorage';
import { useTableContext } from '@/context/TableContext';
import { FindInViewProvider } from '@/context/FindInViewContext';
import { useTableViewsContext } from '@/context/TableViewsContext';
import { useTableRowsContext } from '@/context/TableRowsContext';
import {
  FIELD_PANEL_LAYOUT_OPENED,
  FIELD_PANEL_LAYOUT_CLOSED,
} from '@/components/table-editor/EditTableFieldPanel';
import { useEventHandler } from '@/hooks/useEventHandler';

export default function Page() {
  return <TablePageContent />;
}

function TablePageContent() {
  const router = useRouter();
  // const { projectId } = useParams();
  // const tableId = useSearchParams().get('tableId');
  const dashboardCtx = useDashboardContext();
  const currentProjectCtx = useCurrentProjectContext();
  const currentTableCtx = useTableContext();

  const [isSearchActive, setIsSearchActive] = useState<boolean>(false);
  const [apiKeysDialogOpen, setApiKeysDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [fieldPanelWidth, setFieldPanelWidth] = useState(0);
  const [isFieldPanelOpen, setIsFieldPanelOpen] = useState(false);

  useEventHandler(FIELD_PANEL_LAYOUT_OPENED, (evnt: Event) => {
    const { width } = (evnt as CustomEvent).detail ?? {};
    setFieldPanelWidth(typeof width === 'number' ? width : 420);
    setIsFieldPanelOpen(true);
  });
  useEventHandler(FIELD_PANEL_LAYOUT_CLOSED, () => {
    setIsFieldPanelOpen(false);
  });

  useEffect(() => {
    const handler = () => setApiKeysDialogOpen(true);
    window.addEventListener(OPEN_API_KEYS_DIALOG_EVENT, handler);
    return () => window.removeEventListener(OPEN_API_KEYS_DIALOG_EVENT, handler);
  }, []);

  useEffect(() => {
    const handler = () => setUploadDialogOpen(true);
    window.addEventListener(OPEN_TABLE_UPLOAD_DIALOG, handler);
    return () => window.removeEventListener(OPEN_TABLE_UPLOAD_DIALOG, handler);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        const el = document.activeElement as HTMLElement | null;
        if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable) return;
        e.preventDefault();
        setIsSearchActive(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    // this useEffect handle case where user have no tables
    if (!dashboardCtx.initialized) return;
    if (!currentProjectCtx.initialized) return;
    if (currentProjectCtx.tables.length > 0) return;
    openCreateNewTableDialog();
  }, [
    dashboardCtx.initialized,
    currentProjectCtx.initialized,
    currentProjectCtx.tables,
  ]);

  useEffect(() => {
    // select a table if no table is selected
    if (!dashboardCtx.initialized) return;
    if (
      !dashboardCtx.projects.find(
        (project) => `${project.id}` === `${currentProjectCtx.id}`
      ) &&
      !dashboardCtx.sharedProjects.find(
        (project) => `${project.id}` === `${currentProjectCtx.id}`
      )
    ) {
      // handle case where opened project no longer exist
      UserLocalStorage.setProjectId('');
      UserLocalStorage.setTableId('');
      UserLocalStorage.setViewId('');
      UserLocalStorage.preferDashboardHome();
      router.push('/dashboard');
      return;
    }
    if (!currentProjectCtx.initialized) return;
    if (currentProjectCtx.tables.length === 0) return;
    if (
      currentTableCtx.id &&
      currentProjectCtx.tables.findIndex(
        (table) => `${table.id}` === `${currentTableCtx.id}`
      ) >= 0
    )
      return;
    const lastOpenedTableId = UserLocalStorage.getTableId();
    let tableId = lastOpenedTableId;
    const isLastOpenedTableExist =
      lastOpenedTableId &&
      currentProjectCtx.tables.find(
        (table) => `${table.id}` === lastOpenedTableId
      );
    if (!isLastOpenedTableExist) {
      tableId = `${currentProjectCtx.tables[0].id}`;
    }

    router.push(`/dashboard/${currentProjectCtx.id}?tableId=${tableId}`);
  }, [
    dashboardCtx.initialized,
    currentProjectCtx.initialized,
    currentProjectCtx.id,
    currentProjectCtx.tables,
    currentTableCtx.id,
  ]);

  return (
    <>
      <DashboardSidebar variant='inset' />
      <SidebarInset className='min-h-full shrink-0 grow overflow-hidden flex flex-col'>
        <FindInViewProvider>
          <SiteHeader
            isSearchActive={isSearchActive}
            setIsSearchActive={setIsSearchActive}
            selectedTableId={(currentTableCtx.id ?? '').toString()}
          />
          <div className='-ml-[1px] w-full flex-1 min-h-0 overflow-hidden'>
          {currentTableCtx.isLoading ? (
            <div className='w-full pt-2.5 pb-2.5 flex align-baseline justify-center'>
              {/*<LoadingIndicator />*/}
            </div>
          ) : (
            currentTableCtx.initialized && (
              <>
                <Views
                  isSearchActive={isSearchActive}
                  setIsSearchActive={setIsSearchActive}
                />
                <TableRecordEditorsManager />
              </>
            )
          )}
          </div>
        </FindInViewProvider>
        <CreateTableDialog />
        <APIConfigDialog />
        <ApiKeysDialog
          open={apiKeysDialogOpen}
          onOpenChange={setApiKeysDialogOpen}
        />
        <TableWebhookDialog />
        <ShareDialog />
        <WebformDialog />
        <GlobalFilter />
        <ViewFilterDialog />
        <ViewSortingDialog />
        <TableUploadDialog
          open={uploadDialogOpen}
          onOpenChange={setUploadDialogOpen}
          tableId={currentTableCtx.id?.toString() ?? ''}
          projectId={currentProjectCtx.id?.toString() ?? ''}
          tableFields={currentTableCtx.table?.fields ?? []}
        />
        <ViewEditor />
        <CreateViewDialog />
        <UpdateViewDialog />
        <DeleteViewConfirmDialog />
      </SidebarInset>
    </>
  );
}

function Views({
  isSearchActive,
  setIsSearchActive,
}: {
  isSearchActive: boolean;
  setIsSearchActive: (_value: boolean) => void;
}) {
  const currentTableCtx = useTableContext();
  const currentTableViewsCtx = useTableViewsContext();

  const router = useRouter();
  const { projectId } = useParams();
  const searchParams = useSearchParams();
  const selectedViewId = searchParams.get('viewId');

  const view = currentTableViewsCtx.views.find(
    (view) => `${view.id}` === `${selectedViewId}`
  );

  useEffect(() => {
    // Select a view only when URL has none / invalid for this table
    if (!currentTableCtx.id) return;
    if (!currentTableViewsCtx.initialized) return;
    if (currentTableViewsCtx.views.length === 0) return;

    const currentViewValid =
      !!selectedViewId &&
      currentTableViewsCtx.views.some(
        (v) => `${v.id}` === `${selectedViewId}`
      );
    if (currentViewValid) {
      UserLocalStorage.setViewId(`${selectedViewId}`);
      return;
    }

    const lastOpenedViewId = UserLocalStorage.getViewId();
    let viewId = lastOpenedViewId;

    const isLastOpenedViewExist =
      !!lastOpenedViewId &&
      currentTableViewsCtx.views.some(
        (view) => `${view.id}` === `${lastOpenedViewId}`
      );
    if (!isLastOpenedViewExist) {
      viewId = `${currentTableViewsCtx.views[0].id}`;
    }

    UserLocalStorage.setViewId(`${viewId}`);
    router.replace(
      `/dashboard/${projectId}?tableId=${currentTableCtx.id}&viewId=${viewId}`
    );
  }, [
    currentTableCtx.id,
    currentTableCtx.initialized,
    currentTableViewsCtx.initialized,
    currentTableViewsCtx.views,
    selectedViewId,
    projectId,
    router,
  ]);

  if (!selectedViewId) {
    return null;
  }

  /*if (!selectedViewId || selectedViewId === '0') {
    return (
      <>
        <CurrentTableRowsContextProvider>
          <DatabaseTableView />
        </CurrentTableRowsContextProvider>
      </>
    );
  }*/

  if (currentTableViewsCtx.isLoading) {
    return (
      <div className='flex flex-col justify-center items-center gap-2 pt-8'>
        {/*<LoadingIndicator visibilityDelay={false} />*/}
      </div>
    );
  }

  if (currentTableViewsCtx.initialized && view) {
    switch (view.type) {
      case 'gridView':
        return (
          currentTableCtx.id && (
            <GridView
              tableId={currentTableCtx.id.toString()}
              viewId={`${view.id}`}
              globalFilter={currentTableCtx.filters}
              isSearchActive={isSearchActive}
              setIsSearchActive={setIsSearchActive}
            />
          )
        );
    }
  }

  return (
    <div className='flex flex-col justify-center items-center gap-2 pt-8'>
      {/*<h3>
        {selectedViewId ? "View doesn't exist!" : 'Something went wrong!'}
      </h3>*/}
      {/*<Button
        onClick={() => {
          document.location.href = `${document.location.pathname}?tableId=${tableId}`;
        }}
      >
        Try again
      </Button>*/}
    </div>
  );
}

function DatabaseTableView() {
  const currentTableRowsCtx = useTableRowsContext();

  return (
    <>
      {currentTableRowsCtx.isLoading ? (
        <div className='w-full pt-2.5 pb-2.5 flex align-baseline justify-center'>
          {/*<LoadingIndicator />*/}
        </div>
      ) : (
        <>
          <DataTable />
        </>
      )}
    </>
  );
}
