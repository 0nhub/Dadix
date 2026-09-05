'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import Link from 'next/link';
// import { Separator } from "@/components/ui/separator";
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import {
  LucideEllipsis,
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
  LucideDownload,
  LucideFileJson,
  LucideFileSpreadsheet,
  LucideFileText,
  LucideShare2,
  LucideKey,
  LucideUpload,
  LucideLayoutList,
} from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { TableIcon } from '@/components/table-icon/TableIcon';
import { CurrentTableViewsSwitch } from '@/components/views-switch/ViewsSwitch';
// import { LoadingIndicator } from '@/components/loading-indicator/LoadingIndicator';

import { useAuthContext } from '@/context/AuthContext';
import { useCurrentProjectContext } from '@/context/CurrentProjectContext';
import { useTableContext } from '@/context/TableContext';
import { useRequireRole } from '@/hooks/useRequireRole';
import { dadixEvents } from '@/constants/events';
import recordControllers, { getAllRecordsForExport } from '@/lib/record';
import { getDefaultRecordData } from '@/lib/utils';
import { exportToCSV, exportToJSON, exportToExcel } from '@/lib/exportTable';
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
  const router = useRouter();
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
  const displayTableName = currentTableCtx.table?.name;

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownTriggerRef = useRef<HTMLButtonElement>(null);

  const { canEditRecords, canEditTables } = useRequireRole();
  const findCtx = useFindInViewOptional();
  const [findInputValue, setFindInputValue] = useState('');

  useEffect(() => {
    if (findCtx && findCtx.findQuery === '') setFindInputValue('');
  }, [findCtx?.findQuery]);

  useEffect(() => {
    if (!isSearchActive && findCtx) setFindInputValue('');
  }, [isSearchActive, findCtx]);

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

  return (
    <header
      className='group/header bg-background/95 supports-backdrop-filter:bg-background flex items-center gap-2 backdrop-blur'
      data-sidebar-state={state}
      data-sidebar-open={open}
    >
      <div className='flex w-full justify-between items-center gap-2 px-4 py-1.5 h-12 min-h-12'>
        {!hideSidebar && <SidebarTrigger />}

        <div className='flex items-center gap-2 py-1.5 min-h-10 h-10 min-w-0 flex-1 overflow-auto scrollbar-thin'>
          <div className='flex flex-row flex-nowrap gap-2 min-w-0 shrink'>
            {selectedRecords.recordsIds.length > 0 ? (
              <>
                <Button variant='outline' onClick={clearRecordsSelection}>
                  <LucideFan />
                  Clear selection
                </Button>
                {canEditRecords && (
                  <Button
                    variant='delete'
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
                    {/*{isDeletingRecords ? (
                      <LoadingIndicator
                        visibilityDelay={false}
                        className='size-6'
                      />
                    ) : (
                      <LucideTrash2 />
                    )}*/}
                    <LucideTrash2 />
                    Delete
                  </Button>
                )}
              </>
            ) : (
              <>
                {currentTableCtx.initialized && (
                  <>
                    <h1 className='text-base font-medium group-data-[sidebar-open=true]/header:hidden min-w-0 max-w-full'>
                      {currentTableCtx.table && (
                        <Link
                          href={`/dashboard/${projectId}/edit-table?tableId=${currentTableCtx.id}`}
                          className='inline-block min-w-0 max-w-full'
                        >
                          <Button variant='outline' className='min-w-0 max-w-full overflow-hidden'>
                            <TableIcon
                              name={currentTableCtx.table.icon}
                              width={18}
                              className='shrink-0'
                            />
                            <span className='truncate block min-w-0'>{displayTableName}</span>
                          </Button>
                        </Link>
                      )}
                    </h1>
                    {currentTableCtx.id && !isNoTablesRoute && (
                      <CurrentTableViewsSwitch />
                    )}
                  </>
                )}
              </>
            )}
          </div>
          <div className='flex items-center gap-2 ml-auto shrink-0 flex-shrink-0'>
            {currentTableCtx.initialized &&
              currentTableCtx.id &&
              !isNoTablesRoute && (
                <>
                  {isSearchActive && findCtx ? (
                    <div className='flex items-center gap-2 rounded-md border bg-background pl-2 pr-1.5 py-1 shadow-sm h-9 min-w-0 shrink-0 overflow-visible'>
                      <Input
                        type='text'
                        placeholder='Find'
                        value={findInputValue}
                        onChange={(e) => {
                          const v = e.target.value;
                          setFindInputValue(v);
                          findCtx.setFindQuery(v);
                        }}
                        className='h-7 w-32 min-w-[7rem] max-w-[8rem] border-0 bg-transparent px-1 py-0.5 text-sm shadow-none focus-visible:ring-0 flex-shrink-0'
                        aria-label='Find in table'
                      />
                      <span className='text-muted-foreground text-xs tabular-nums w-12 shrink-0 text-right'>
                        {findCtx.matchCount === 0 && findCtx.findQuery
                          ? '0'
                          : findCtx.matchCount > 0
                            ? `${findCtx.currentMatchIndex + 1}/${findCtx.matchCount}`
                            : ''}
                      </span>
                      <div className='flex items-center shrink-0'>
                        <Button
                          variant='ghost'
                          size='icon'
                          className='size-8 shrink-0'
                          onClick={() => findCtx.onPrevRef.current?.()}
                          disabled={findCtx.matchCount === 0}
                          aria-label='Previous match'
                        >
                          <LucideChevronUp className='size-4' />
                        </Button>
                        <Button
                          variant='ghost'
                          size='icon'
                          className='size-8 shrink-0'
                          onClick={() => findCtx.onNextRef.current?.()}
                          disabled={findCtx.matchCount === 0}
                          aria-label='Next match'
                        >
                          <LucideChevronDown className='size-4' />
                        </Button>
                        <Button
                          variant='ghost'
                          size='icon'
                          className='size-8 shrink-0'
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
                      variant='outline'
                      size='icon'
                      onClick={() => setIsSearchActive(true)}
                      title='Search'
                      aria-label='Search'
                    >
                      <LucideSearch />
                    </Button>
                  )}
                  <Button
                    size='icon'
                    variant='outline'
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
          </div>
        </div>

        <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
          <DropdownMenuTrigger asChild ref={dropdownTriggerRef}>
            <Button
              variant='outline'
              className='data-[state=open]:bg-muted data-[state=open]:text-muted-foreground size-9'
              size='icon'
            >
              <LucideEllipsis />
              <span className='sr-only'>Open menu</span>
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
                <LucideUpload className='size-4' />
                <span>Upload CSV</span>
              </DropdownMenuItem>
            )}
            {currentTableCtx.initialized && currentTableCtx.id && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <LucideDownload className='size-4' />
                  <span>Download</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className='w-48'>
                  <DropdownMenuItem
                    onClick={async () => {
                      try {
                        const records = await getAllRecordsForExport(currentTableCtx.id!);
                        exportToCSV(records, currentTableCtx.table?.fields, currentTableCtx.table?.name ?? 'Table');
                      } catch (e) {
                        console.error(e);
                        toast.error('Export failed');
                      }
                    }}
                  >
                    <LucideFileText className='size-4' />
                    Current view CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={async () => {
                      try {
                        const records = await getAllRecordsForExport(currentTableCtx.id!);
                        exportToJSON(records, currentTableCtx.table?.name ?? 'Table');
                      } catch (e) {
                        console.error(e);
                        toast.error('Export failed');
                      }
                    }}
                  >
                    <LucideFileJson className='size-4' />
                    Current view JSON
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={async () => {
                      try {
                        const records = await getAllRecordsForExport(currentTableCtx.id!);
                        exportToExcel(records, currentTableCtx.table?.fields, currentTableCtx.table?.name ?? 'Table');
                      } catch (e) {
                        console.error(e);
                        toast.error('Export failed');
                      }
                    }}
                  >
                    <LucideFileSpreadsheet className='size-4' />
                    Current view Excel
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={async () => {
                      try {
                        const records = await getAllRecordsForExport(currentTableCtx.id!);
                        exportToCSV(records, currentTableCtx.table?.fields, currentTableCtx.table?.name ?? 'Table');
                      } catch (e) {
                        console.error(e);
                        toast.error('Export failed');
                      }
                    }}
                  >
                    <LucideFileText className='size-4' />
                    All CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={async () => {
                      try {
                        const records = await getAllRecordsForExport(currentTableCtx.id!);
                        exportToJSON(records, currentTableCtx.table?.name ?? 'Table');
                      } catch (e) {
                        console.error(e);
                        toast.error('Export failed');
                      }
                    }}
                  >
                    <LucideFileJson className='size-4' />
                    All JSON
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={async () => {
                      try {
                        const records = await getAllRecordsForExport(currentTableCtx.id!);
                        exportToExcel(records, currentTableCtx.table?.fields, currentTableCtx.table?.name ?? 'Table');
                      } catch (e) {
                        console.error(e);
                        toast.error('Export failed');
                      }
                    }}
                  >
                    <LucideFileSpreadsheet className='size-4' />
                    All Excel
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
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
            {currentTableCtx.initialized && currentTableCtx.id && (
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
            {currentTableCtx.initialized && currentTableCtx.id && (
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
            {canEditTables && selectedTableId && (
              <>
                <DropdownMenuItem
                  onClick={() => {
                    setIsDropdownOpen(false);
                    openAPIConfigDialog();
                  }}
                >
                  <LucideWebhook />
                  API
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setIsDropdownOpen(false);
                    openApiKeysDialog();
                  }}
                >
                  <LucideKey />
                  AI API Keys
                </DropdownMenuItem>
              </>
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
