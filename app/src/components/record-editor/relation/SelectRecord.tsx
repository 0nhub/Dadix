import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '@/components/ui/button';
import { LucideFilter, LucideSearch, LucideX } from 'lucide-react';
// import { LoadingIndicator } from '@/components/loading-indicator/LoadingIndicator';
import { TableContextProvider } from '@/context/TableContext';
import { TableViewsContextProvider } from '@/context/TableViewsContext';
import { ViewsSwitch } from '@/components/views-switch/ViewsSwitch';
import { GridView } from '@/components/views-switch/views/grid-view/GridView';

import { openGlobalFilter } from '@/components/global-filter/GlobalFilter';
import { useTableContext } from '@/context/TableContext';
import { useTableViewsContext } from '@/context/TableViewsContext';
import { useTableRowsContext } from '@/context/TableRowsContext';

interface SelectRecordProps {
  projectId: string | undefined;
  tableId: string | undefined;
  onSelect?: (_record: Record<string, unknown>) => void;
  onClose: () => void;
}

export function SelectRecord({ ...props }: SelectRecordProps) {
  if (!props.projectId || !props.tableId) return null;

  return (
    <TableContextProvider projectId={props.projectId} tableId={props.tableId}>
      <TableViewsContextProvider tableId={props.tableId}>
        <SelectRecordContent {...props} />
      </TableViewsContextProvider>
    </TableContextProvider>
  );
}

function SelectRecordContent({
  projectId,
  tableId,
  onSelect,
  onClose,
}: SelectRecordProps) {
  const tableCtx = useTableContext();
  const tableRowsCtx = useTableRowsContext();
  const tableViewsCtx = useTableViewsContext();

  const [viewId, setViewId] = useState<number | undefined>(undefined);
  const [isSearchActive, setIsSearchActive] = useState<boolean>(false);

  useEffect(() => {
    if (!tableViewsCtx.initialized) return;
    if (
      viewId &&
      (tableViewsCtx.views || []).find((view) => view.id === viewId)
    )
      return;
    setViewId(tableViewsCtx.views?.[0]?.id);
  }, [tableViewsCtx.views, tableViewsCtx.initialized]);

  return (
    <>
      {createPortal(
        <div className='fixed top-0 left-0 w-full h-full bg-black/20 overflow-hidden z-20'>
          <div className='flex flex-col top-0 left-0 w-full h-full bg-background border-[5px solid #f00] md:m-[10px] md:w-[calc(100%-20px)] md:h-[calc(100%-20px)] md:rounded-md border overflow-hidden '>
            <div className='sticky top-0 lef-0 flex flex-row gap-2 p-4 bg-background'>
              <Button variant='outline' size='icon' onClick={onClose}>
                <LucideX />
              </Button>
              {projectId && (
                <ViewsSwitch
                  projectId={projectId}
                  views={tableViewsCtx.views}
                  selectedViewId={viewId?.toString()}
                  onSwitchView={setViewId}
                  showMenu={true}
                />
              )}
              <div className='grow shrink' />
              {tableCtx.initialized && !tableRowsCtx.isLoading && (
                <>
                  {!isSearchActive && (
                    <Button
                      variant='outline'
                      size='icon'
                      onClick={() => setIsSearchActive(true)}
                    >
                      <LucideSearch />
                    </Button>
                  )}
                  <Button
                    variant='outline'
                    size='icon'
                    onClick={() => {
                      openGlobalFilter({
                        filters: tableCtx.filters,
                        setFilters: tableCtx.methods.setFilters,
                        tableFields: tableCtx.table?.fields || [],
                      });
                    }}
                  >
                    <LucideFilter />
                  </Button>
                </>
              )}
            </div>
            <div className='grow overflow-hidden pb-4'>
              {!tableCtx.initialized && !tableCtx.isLoading ? (
                <div className='text-center'>Error loading table</div>
              ) : (
                <>
                  {/*{tableCtx.isLoading && (
                    <LoadingIndicator className='mx-auto' />
                  )}*/}
                  {tableId && viewId && tableCtx.initialized && (
                    <GridView
                      globalFilter={tableCtx.filters}
                      tableId={tableId}
                      viewId={viewId.toString()}
                      onOpenRecord={(record: Record<string, unknown>) => {
                        onSelect?.(record);
                        onClose();
                      }}
                      isSearchActive={isSearchActive}
                      setIsSearchActive={setIsSearchActive}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
