'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, usePathname } from 'next/navigation';

import { Button } from '@/components/ui/button';
import Link from 'next/link';
// import { Separator } from "@/components/ui/separator";
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import {
  LucideMoreVertical,
  LucidePlus,
  LucideLifeBuoy,
  LucideLogOut,
  LucideWebhook,
  LucideFan,
  LucideTrash2,
  LucideFilter,
  LucideCog,
  LucideSearch,
  LucideChevronUp,
  LucideChevronDown,
  LucideX,
  LucideArrowLeftRight,
  LucideFileText,
  LucideShare2,
  LucideKey,
  LucideLayoutList,
} from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { CurrentTableViewsSwitch } from '@/components/views-switch/ViewsSwitch';
// import { LoadingIndicator } from '@/components/loading-indicator/LoadingIndicator';

import { useAuthContext } from '@/context/AuthContext';
import { useCurrentProjectContext } from '@/context/CurrentProjectContext';
import { useTableContext } from '@/context/TableContext';
import { useRequireRole } from '@/hooks/useRequireRole';
import { dadixEvents } from '@/constants/events';
import { useEventHandler } from '@/hooks/useEventHandler';
import recordControllers from '@/lib/record';
import { getDefaultRecordData } from '@/lib/utils';
import { toast } from 'sonner';
import { openTableRecord } from '@/components/table-cell-viewer';
import { openAPIConfigDialog } from '@/components/api-config-dialog/APIConfigDialog';
import { openApiKeysDialog } from '@/components/table-editor/ApiKeysDialog';
import { openGlobalFilter } from './global-filter/GlobalFilter';
import { openUserSettingsDialog } from './settings-dialog/SettingsDialog';
import { openDocumentEditorDialog } from '@/components/document-editor/DocumentEditorDialog';
import { openWebformDialog } from '@/components/webform-dialog/WebformDialog';
import { openShareDialog } from '@/components/share-dialog/ShareDialog';
import { openTableUploadDialog } from '@/components/table-upload-dialog/TableUploadDialog';
import { useFindInViewOptional } from '@/context/FindInViewContext';
import { Input } from '@/components/ui/input';

interface SiteHeaderProps {
  selectedTableId?: string | null;
  hideSidebar?: boolean;
  isSearchActive: boolean;
  setIsSearchActive: (_v: boolean) => void;
}

export function SiteHeader({
  selectedTableId,
  hideSidebar,
  isSearchActive,
  setIsSearchActive,
}: SiteHeaderProps) {
  const currentTableCtx = useTableContext();
  const { open, state } = useSidebar();
  const pathname = usePathname();
  const { projectId } = useParams();
  const isNoTablesRoute = pathname?.includes('/dashboard/no-tables');
  const [selectedRecords, setSelectedRecords] = useState<{
    tableId: string | number | undefined;
    recordsIds: (string | number)[];
  }>({ tableId: undefined, recordsIds: [] });
  const [isDeletingRecords, setIsDeletingRecords] = useState<boolean>(false);

  // Get the current table name from the selected table or context
  const authCtx = useAuthContext();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isDesktopShell, setIsDesktopShell] = useState(false);
  const dropdownTriggerRef = useRef<HTMLButtonElement>(null);

  const { canEditRecords, canEditTables } = useRequireRole();
  const findCtx = useFindInViewOptional();
  const [findInputValue, setFindInputValue] = useState('');

  useEffect(() => {
    setIsDesktopShell(Boolean(document.documentElement.dataset.dadixOs));
  }, []);

  useEffect(() => {
    if (findCtx && findCtx.findQuery === '') setFindInputValue('');
  }, [findCtx?.findQuery]);

  useEffect(() => {
    if (!isSearchActive && findCtx) setFindInputValue('');
  }, [isSearchActive, findCtx]);

  useEventHandler(
    dadixEvents.gridViewEvents.openFindInView,
    () => {
      setIsSearchActive(true);
    },
    [setIsSearchActive]
  );

  useEffect(() => {
    window.addEventListener(
      dadixEvents.recordEvents.onSelectionChange,
      handleRecordsSelectionChange
    );
    return () => {
      window.removeEventListener(
        dadixEvents.recordEvents.onSelectionChange,
        handleRecordsSelectionChange
      );
    };

    function handleRecordsSelectionChange(evnt: Event) {
      const { tableId, selectedRecordsIds } =
        (evnt as CustomEvent).detail || {};
      if (tableId == null) return;
      setSelectedRecords({
        tableId,
        recordsIds: Array.isArray(selectedRecordsIds) ? [...selectedRecordsIds] : [],
      });
    }
  }, []);

  const clearRecordsSelection = () => {
    const tableId = selectedRecords.tableId;
    setSelectedRecords({ tableId: undefined, recordsIds: [] });
    window.dispatchEvent(
      new CustomEvent(dadixEvents.recordEvents.onSelectionChange, {
        detail: { tableId, selectedRecordsIds: [] },
      })
    );
  };

  const chromeCell =
    'size-auto h-full min-h-11 w-11 shrink-0 rounded-none border-0 border-l border-border bg-transparent shadow-none hover:bg-foreground/6';
  const searchNavBtn =
    'size-auto h-full w-8 shrink-0 rounded-none border-0 bg-transparent shadow-none hover:bg-foreground/6';

  return (
    <header
      className='dadix-app-titlebar group/header z-50 flex h-11 min-h-11 w-full items-stretch border-b bg-background'
      data-sidebar-state={state}
      data-sidebar-open={open}
      data-tauri-drag-region
    >
      <div className='dadix-titlebar-drag flex h-full w-full min-w-0 items-stretch'>
        {!hideSidebar && (
          <>
            <span className='dadix-traffic-close' aria-hidden />
            <SidebarTrigger className={`${chromeCell} border-l-0 border-r`} />
          </>
        )}

        <div className='flex h-full min-w-0 items-center overflow-x-auto overflow-y-hidden scrollbar-thin'>
            {selectedRecords.recordsIds.length > 0 ? (
              <div className='flex h-full items-stretch'>
                <Button variant='ghost' size='sm' className='h-full rounded-none border-r' onClick={clearRecordsSelection}>
                  <LucideFan />
                  Clear selection
                </Button>
                {canEditRecords && (
                  <Button
                    variant='ghost'
                    size='sm'
                    className='h-full rounded-none border-r text-destructive hover:bg-destructive/10'
                    onClick={() => {
                      setIsDeletingRecords(true);
                      recordControllers
                        .deleteRecords({
                          ids: selectedRecords.recordsIds,
                          tableId: selectedRecords.tableId,
                        })
                        .then((res) => {
                          if (res?.status !== 200) {
                            throw new Error('Error deletingRecords');
                          }
                          setIsDeletingRecords(false);
                          clearRecordsSelection();
                          return res;
                        })
                        .catch((err) => {
                          toast.error('Error delete records!');
                          console.error(err);
                          setIsDeletingRecords(false);
                          return null;
                        });
                    }}
                  >
                    <LucideTrash2 />
                    Delete
                  </Button>
                )}
              </div>
            ) : (
              currentTableCtx.initialized &&
              currentTableCtx.id &&
              !isNoTablesRoute && <CurrentTableViewsSwitch />
            )}
        </div>
        <div className='dadix-titlebar-drag h-full min-w-8 flex-1' data-tauri-drag-region />
        <div className='flex h-full items-stretch'>
            {currentTableCtx.initialized &&
              currentTableCtx.id &&
              !isNoTablesRoute && (
                <>
                  {isSearchActive && findCtx ? (
                    <div className='flex h-full items-stretch border-l border-border bg-background'>
                      <Input
                        type='text'
                        placeholder='Search'
                        value={findInputValue}
                        onChange={(e) => {
                          const v = e.target.value;
                          setFindInputValue(v);
                          findCtx.setFindQuery(v);
                        }}
                        className='h-full w-32 min-w-[7rem] max-w-[8rem] rounded-none border-0 bg-transparent px-2.5 text-sm shadow-none focus-visible:ring-0'
                        aria-label='Search in table'
                      />
                      <span className='text-muted-foreground flex h-full w-10 shrink-0 items-center justify-end pr-1 text-xs tabular-nums'>
                        {findCtx.matchCount === 0 && findCtx.findQuery
                          ? '0'
                          : findCtx.matchCount > 0
                            ? `${findCtx.currentMatchIndex + 1}/${findCtx.matchCount}`
                            : ''}
                      </span>
                      <div className='ml-auto flex h-full items-stretch'>
                        <Button
                          variant='ghost'
                          size='icon'
                          className={searchNavBtn}
                          onClick={() => findCtx.onPrevRef.current?.()}
                          disabled={findCtx.matchCount === 0}
                          aria-label='Previous match'
                        >
                          <LucideChevronUp className='size-4' />
                        </Button>
                        <Button
                          variant='ghost'
                          size='icon'
                          className={searchNavBtn}
                          onClick={() => findCtx.onNextRef.current?.()}
                          disabled={findCtx.matchCount === 0}
                          aria-label='Next match'
                        >
                          <LucideChevronDown className='size-4' />
                        </Button>
                        <Button
                          variant='ghost'
                          size='icon'
                          className={chromeCell}
                          onClick={() => {
                            findCtx.setFindQuery('');
                            setIsSearchActive(false);
                            window.dispatchEvent(new CustomEvent(dadixEvents.gridViewEvents.closeSearch));
                          }}
                          aria-label='Close search'
                        >
                          <LucideX className='size-4' />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant='ghost'
                      size='icon'
                      className={chromeCell}
                      onClick={() => setIsSearchActive(true)}
                      title='Search'
                      aria-label='Search'
                    >
                      <LucideSearch />
                    </Button>
                  )}
                  <Button
                    size='icon'
                    variant='ghost'
                    className={chromeCell}
                    aria-label='Filter'
                    onClick={() => {
                      openGlobalFilter({
                        filters: currentTableCtx.filters,
                        setFilters: currentTableCtx.methods.setFilters,
                        tableFields: currentTableCtx.table?.fields || [],
                      });
                    }}
                  >
                    <LucideFilter />
                  </Button>
                </>
              )}
            <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
              <DropdownMenuTrigger asChild ref={dropdownTriggerRef}>
                <Button
                  variant='ghost'
                  className={`${chromeCell} data-[state=open]:bg-foreground/6`}
                  size='icon'
                  aria-label='Menu'
                >
                  <LucideMoreVertical />
                  <span className='sr-only'>Menu</span>
                </Button>
              </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='w-48 z-999'>
            {/* {currentTable && (
                <Link href={`/edit-table/${getTableSlug(currentTable)}`}>
                  <DropdownMenuItem>
                    <Archive className='size-4' />
                    <span>Edit Schema</span>
                  </DropdownMenuItem>
                </Link>
              )} */}
            <DropdownMenuItem
              className='flex items-center'
              onClick={() => {
                setIsDropdownOpen(false);
                openUserSettingsDialog();
              }}
            >
              <LucideCog />
              <span>Settings</span>
            </DropdownMenuItem>
            {currentTableCtx.initialized && currentTableCtx.id && (
              <DropdownMenuItem
                onClick={() => {
                  setIsDropdownOpen(false);
                  openTableUploadDialog();
                }}
              >
                <LucideArrowLeftRight className='size-4' />
                <span>Exchange</span>
              </DropdownMenuItem>
            )}
            {currentTableCtx.initialized && currentTableCtx.id && projectId && (
              <DropdownMenuItem
                onClick={() => {
                  setIsDropdownOpen(false);
                  openDocumentEditorDialog({
                    projectId: String(projectId),
                    tableId: currentTableCtx.id!,
                    tableFields: currentTableCtx.table?.fields ?? [],
                    record: null,
                  });
                }}
              >
                <LucideFileText />
                <span>Documents</span>
              </DropdownMenuItem>
            )}
            {!isDesktopShell && currentTableCtx.initialized && currentTableCtx.id && (
              <DropdownMenuItem
                onClick={() => {
                  setIsDropdownOpen(false);
                  openWebformDialog();
                }}
              >
                <LucideLayoutList />
                <span>Webform</span>
              </DropdownMenuItem>
            )}
            {!isDesktopShell && currentTableCtx.initialized && currentTableCtx.id && (
              <DropdownMenuItem
                onClick={() => {
                  setIsDropdownOpen(false);
                  openShareDialog();
                }}
              >
                <LucideShare2 />
                <span>Share</span>
              </DropdownMenuItem>
            )}
            {!isDesktopShell && canEditTables && selectedTableId && (
              <DropdownMenuItem
                onClick={() => {
                  setIsDropdownOpen(false);
                  openAPIConfigDialog();
                }}
              >
                <LucideWebhook />
                API
              </DropdownMenuItem>
            )}
            {!isDesktopShell && canEditTables && selectedTableId && (
              <DropdownMenuItem
                onClick={() => {
                  setIsDropdownOpen(false);
                  openApiKeysDialog();
                }}
              >
                <LucideKey />
                AI Keys
              </DropdownMenuItem>
            )}
            <Link href='https://www.fillfields.com/IFemv9' target='_blank'>
              <DropdownMenuItem>
                <LucideLifeBuoy />
                Support
              </DropdownMenuItem>
            </Link>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => authCtx.methods.logout()}>
              <LucideLogOut />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
            <div id='dadix-window-controls-slot' className='flex h-full items-stretch' />
          </div>
      </div>
    </header>
  );
}

const CreateNewRecord = () => {
  const currentTableCtx = useTableContext();
  const currentProjectCtx = useCurrentProjectContext();
  const [isAddingNewRecord, setIsAddingNewRecord] = useState<boolean>(false);

  const handleCreateNewRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTableCtx.id) {
      toast.error('No table selected');
      return;
    }

    try {
      setIsAddingNewRecord(true);
      const tableFields = currentTableCtx.table?.fields ?? [];
      const recordData = getDefaultRecordData(tableFields);
      const createdRecord = await recordControllers.createRecord({
        tableId: currentTableCtx.id,
        projectId: currentProjectCtx.id?.toLocaleString() || '',
        recordData,
      });

      if (!createdRecord) {
        throw new Error('Error creating new record');
      }
      // setNewRecordData({ ...createdRecord });
      // setNewRecordDrawerOpen(true);
      openTableRecord({
        tableId: currentTableCtx.id,
        tableFields: [...(currentTableCtx.table?.fields || [])],
        record: { ...createdRecord },
      });
      // toast.success('Record created successfully!');
    } catch (error: unknown) {
      const apiErr = error as { response?: { data?: { error?: string } } };
      console.error('Error creating record:', error);
      toast.error(apiErr.response?.data?.error || 'Failed to create record');
    } finally {
      setIsAddingNewRecord(false);
    }
  };

  return (
    <form
      onSubmit={
        isAddingNewRecord
          ? (evnt) => {
              evnt.preventDefault();
            }
          : handleCreateNewRecord
      }
      className='flex'
    >
      <Button
        variant='outline'
        size='icon'
        className='text-sm font-normal flex items-center gap-1'
      >
        {/*{isAddingNewRecord ? (
          <LoadingIndicator visibilityDelay={false} className='size-3.5' />
        ) : (
          <LucidePlus className='size-4.5' />
        )}*/}
        <LucidePlus className='size-4.5' />
      </Button>
    </form>
  );
};
