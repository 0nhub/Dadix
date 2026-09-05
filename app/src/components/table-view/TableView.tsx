import { useEffect, useRef, useState } from 'react';
import tablesViewStyles from './table-view.module.scss';
import type { Row, Table } from '@tanstack/react-table';
import { TableHeaderCell } from './TableHeaderCell';
import { TableRowCell } from './TableRowCell';
import { LoadingIndicator } from '../loading-indicator/LoadingIndicator';
import { cn } from '@/lib/utils';
import { LucideGripVertical, LucideTrash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useTableStyle } from '@/context/TableStyleContext';
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { rowNumberBodyStickyClassName } from './tableStickyStyles';

interface TableViewProps {
  table: Table<Record<string, unknown>>;
  tableId: string | undefined;
  viewId: number | undefined;
  openRecord: (_record: Record<string, unknown>) => void;
  activeRecordId: string;
  tableRowsCtx: ITableRowsCtx;
  headerRowClassName?: string;
  headerRowCellClassName?: string;
  bodyRowClassName?: string;
  bodyRowCellClassName?: string;
  onColumnResizeChange: ({
    ..._props
  }: {
    size: number;
    tableFieldId: number;
    gridViewFieldId?: number;
  }) => void;
  onColumnResizeEnd: ({
    ..._props
  }: {
    size: number;
    tableFieldId: number;
    gridViewFieldId?: number;
  }) => void;
  onDeleteRecord?: (_recordId: string) => void;
  /** Row index to scroll into view (browser find). */
  findScrollToRowIndex?: number | null;
  /** Current find match to highlight. */
  findHighlight?: { rowIndex: number; columnId: string } | null;
  /** Enable drag-and-drop row reorder (e.g. when no sorting rule is active). */
  enableRowReorder?: boolean;
  /** Called when a row is dropped at a new index (fromIndex, toIndex). */
  onRowReorder?: (fromIndex: number, toIndex: number) => void;
}

export interface ITableRowsCtx {
  data: Record<string, unknown>[];
  limit: number; // set it to -1 for no limit
  isLoading: boolean;
  isLoadingMore: boolean;
  methods: {
    loadMoreRecords: (_callBack?: () => void) => void;
    setLimit: (_limit: number) => void;
  };
}

const itemHeight = 50;

export function TableView({
  table,
  tableId,
  viewId,
  openRecord,
  activeRecordId,
  tableRowsCtx,
  onColumnResizeChange,
  onColumnResizeEnd,
  onDeleteRecord,
  findScrollToRowIndex,
  findHighlight,
  headerRowClassName,
  headerRowCellClassName,
  bodyRowClassName,
  bodyRowCellClassName,
  enableRowReorder = false,
  onRowReorder,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & TableViewProps) {
  const { theme: tableStyleTheme } = useTableStyle();
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const numberOfHiddenRowsRef = useRef<number>(10);
  const numberOfVisibleRowsRef = useRef<number>(20);
  const firstVisibleRowIndexRef = useRef<number>(0);

  const [firstVisibleRowIndex, setFirstVisibleRowIndex] = useState<number>(0);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    record: Record<string, unknown>;
  } | null>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const t = setTimeout(() => {
      document.addEventListener('click', close);
      document.addEventListener('scroll', close, true);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', close);
      document.removeEventListener('scroll', close);
    };
  }, [contextMenu]);

  const firstRenderedRowIndex = Math.max(
    0,
    firstVisibleRowIndex - numberOfHiddenRowsRef.current
  );
  const lastRenderedRowIndex = Math.min(
    table.getPrePaginationRowModel().rows.length,
    firstVisibleRowIndex +
      numberOfVisibleRowsRef.current +
      numberOfHiddenRowsRef.current
  );

  useEffect(() => {
    handleWindowResize();
    window.addEventListener('resize', handleWindowResize);
    return () => {
      window.removeEventListener('resize', handleWindowResize);
    };
    function handleWindowResize() {
      if (!scrollContainerRef.current) {
        return;
      }
      numberOfVisibleRowsRef.current = Math.ceil(
        scrollContainerRef.current.getBoundingClientRect().height / itemHeight
      );
      numberOfHiddenRowsRef.current = 4;
      if (numberOfVisibleRowsRef.current < 40) {
        numberOfHiddenRowsRef.current =
          Math.round((40 - numberOfVisibleRowsRef.current) / 2) + 4;
      } else {
        numberOfHiddenRowsRef.current = 4;
      }
    }
  }, []);

  useEffect(() => {
    // handle virtual table scrolling

    let requestAnimationFrameHandle =
      window.requestAnimationFrame(updateScrollPosition);

    let lastTimeStamp = 0;
    function updateScrollPosition(timeStamp: number) {
      if (timeStamp - lastTimeStamp > 20) {
        lastTimeStamp = timeStamp;
        const container = scrollContainerRef.current;
        if (container) {
          let firstVisibleRowPos = Math.max(
            container.scrollTop / itemHeight,
            0
          );
          firstVisibleRowPos |= firstVisibleRowPos;
          if (
            Math.abs(firstVisibleRowPos - firstVisibleRowIndexRef.current) >=
            numberOfHiddenRowsRef.current >> 1
          ) {
            firstVisibleRowIndexRef.current = firstVisibleRowPos;
            setFirstVisibleRowIndex(firstVisibleRowPos);
          }
        }
      }
      requestAnimationFrameHandle =
        window.requestAnimationFrame(updateScrollPosition);
    }

    return () => {
      window.cancelAnimationFrame(requestAnimationFrameHandle);
    };
  }, []);

  useEffect(() => {
    // handele load more on scroll to the end of table content on screentouch devices

    if (!scrollContainerRef.current) {
      return;
    }
    const conatiner = scrollContainerRef.current;
    conatiner.addEventListener('touchstart', handleTouchStart);
    conatiner.addEventListener('touchend', handleTouchEnd);

    let lastXPos = 0,
      lastYPos = 0;
    function handleTouchStart(evnt: TouchEvent) {
      if (!evnt.touches[0]) {
        return;
      }
      lastXPos = evnt.touches[0].clientX;
      lastYPos = evnt.touches[0].clientY;
    }
    function handleTouchEnd(evnt: TouchEvent) {
      if (!evnt.changedTouches[0]) {
        return;
      }
      if (!scrollContainerRef.current) {
        return;
      }
      const scrollContainer = scrollContainerRef.current as HTMLElement;
      if (
        scrollContainer.scrollHeight -
          scrollContainer.scrollTop -
          scrollContainer.offsetHeight >
        0
      ) {
        return;
      }
      const dx = evnt.changedTouches[0].clientX - lastXPos;
      const dy = evnt.changedTouches[0].clientY - lastYPos;
      if (Math.abs(dy) > Math.abs(dx) && dy < 0) {
        tableRowsCtx.methods.loadMoreRecords();
      }
    }

    return () => {
      conatiner.removeEventListener('touchstart', handleTouchStart);
      conatiner.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  useEffect(() => {
    if (findScrollToRowIndex != null && scrollContainerRef.current) {
      const top = findScrollToRowIndex * itemHeight;
      scrollContainerRef.current.scrollTop = Math.max(0, top - 50);
    }
  }, [findScrollToRowIndex]);

  const visibleRows =
    !table ||
    table
      .getHeaderGroups()[0]
      .headers.filter((header) => ['select', 'actions'].indexOf(header.id) >= 0)
      .length === 0
      ? []
      : table
          .getPrePaginationRowModel()
          .rows.slice(firstRenderedRowIndex, lastRenderedRowIndex);

  const allRows = table?.getPrePaginationRowModel().rows ?? [];
  const dndSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 5 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !onRowReorder || active.id === over.id) return;
    const fromIndex = allRows.findIndex((r) => String(r.id) === String(active.id));
    const toIndex = allRows.findIndex((r) => String(r.id) === String(over.id));
    if (fromIndex >= 0 && toIndex >= 0) onRowReorder(fromIndex, toIndex);
  };

  return (
    <div {...props} data-table-style={tableStyleTheme}>
      <div
        ref={scrollContainerRef}
        aria-description='Table'
        className={`${tablesViewStyles.scrollContainer} relative w-full max-w-full h-full max-h-full overflow-auto`}
        onWheelCapture={(evnt) => {
          if (evnt.deltaY <= 0) {
            return;
          }
          if (!scrollContainerRef.current) {
            return;
          }
          const scrollContainer = scrollContainerRef.current as HTMLElement;
          if (
            scrollContainer.scrollHeight -
              scrollContainer.scrollTop -
              scrollContainer.offsetHeight <=
            0
          ) {
            tableRowsCtx.methods.loadMoreRecords();
          }
        }}
      >
        <div
          aria-description='TableHeader'
          className='inline-flex sticky top-0 min-w-full z-2'
        >
          <div
            aria-description='TableRow'
            className={cn([
              'inline-flex flex-row flex-nowrap items-stretch justify-start h-[45px]',
              tableStyleTheme === 'lineless' && 'bg-muted/50 border-b border-border',
              tableStyleTheme !== 'lineless' && 'bg-muted border border-l-0',
              'first-of-type:rounded-tl-md group-[*]/no-left-radius:rounded-tl-none! last-of-type:rounded-tr-md',
              headerRowClassName || '',
            ])}
          >
            {table.getHeaderGroups()[0].headers.map((header, idx) => (
              <TableHeaderCell
                key={header.id}
                table={table}
                tableId={tableId}
                header={header}
                idx={idx}
                viewId={viewId}
                onColumnResizeChange={onColumnResizeChange}
                onColumnResizeEnd={onColumnResizeEnd}
                className={headerRowCellClassName}
                tableStyleTheme={tableStyleTheme}
              />
            ))}
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            left: '0px',
            width: '10px',
            height: '1px',
            top: `${(table.getPrePaginationRowModel().rows.length + 2) * itemHeight + 20}px`,
            visibility: 'hidden',
            overflow: 'hidden',
          }}
        />
        <div
          aria-description='TableBody'
          className='tableViewBody flex flex-col justify-start items-start'
          style={{
            position: 'relative',
            top: '0',
            left: '0',
            zIndex: '0',
            transform: `translate3d(0px, ${
              itemHeight *
              Math.max(
                0,
                firstVisibleRowIndex -
                  Math.max(
                    0,
                    firstVisibleRowIndex -
                      (firstVisibleRowIndex - numberOfHiddenRowsRef.current)
                  )
              )
            }px, 0px)`,
          }}
        >
          {table && (
            <>
              {visibleRows.length === 0 ? (
                <div
                  style={{
                    width: `${table
                      .getHeaderGroups()[0]
                      .headers.map((header) => header.column.columnDef.size)
                      .reduce(
                        (accSize, size) => (accSize || 0) + (size || 0)
                      )}px`,
                  }}
                  className='flex flex-col justify-center items-center p-2 opacity-25'
                >
                  {tableRowsCtx.isLoading ? (
                    <>{/*<LoadingIndicator />*/}</>
                  ) : (
                    'No records!'
                  )}
                </div>
              ) : enableRowReorder && onRowReorder ? (
                <DndContext
                  collisionDetection={closestCenter}
                  modifiers={[restrictToVerticalAxis]}
                  onDragEnd={handleDragEnd}
                  sensors={dndSensors}
                >
                  <SortableContext
                    items={visibleRows.map((r) => String(r.id))}
                    strategy={verticalListSortingStrategy}
                  >
                    {visibleRows.map((row) => (
                      <SortableTableViewRow
                        key={row.id}
                        row={row}
                        table={table}
                        itemHeight={itemHeight}
                        tableStyleTheme={tableStyleTheme}
                        bodyRowClassName={bodyRowClassName}
                        activeRecordId={activeRecordId}
                        openRecord={openRecord}
                        onDeleteRecord={onDeleteRecord}
                        setContextMenu={setContextMenu}
                        bodyRowCellClassName={bodyRowCellClassName}
                        findHighlight={findHighlight}
                        showDragHandle
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              ) : (
                visibleRows.map((row) => (
                  <div
                    aria-description='TableRow'
                    key={`${row.id}`}
                    className={cn([
                      'group/row',
                      'inline-flex flex-row flex-nowrap items-center justify-start',
                      tableStyleTheme === 'classic' && 'border-b border-r',
                      tableStyleTheme === 'lineless' && 'border-none',
                      tableStyleTheme === 'lineless' && row.index % 2 === 1 && 'bg-muted/30',
                      tableStyleTheme === 'panel' && 'border-b border-r border-border/50',
                      tableStyleTheme === 'panel' && row.index % 2 === 0 && 'bg-background',
                      tableStyleTheme === 'panel' && row.index % 2 === 1 && 'bg-muted',
                      'last-of-type:rounded-b-md group-[*]/no-left-radius:last-of-type:rounded-bl-none!',
                      'hover:!bg-muted/50',
                      bodyRowClassName,
                    ])}
                    style={{
                      background:
                        `${activeRecordId}` === `${row.id}` ? 'var(--muted)' : undefined,
                      height: `${itemHeight}px`,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      openRecord(row.original);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (onDeleteRecord) {
                        setContextMenu({
                          x: e.clientX,
                          y: e.clientY,
                          record: row.original,
                        });
                      }
                    }}
                  >
                    {row.getVisibleCells().map((cell, cellIdx) => (
                      <TableRowCell
                        key={cell.id}
                        table={table}
                        cell={cell}
                        cellIdx={cellIdx}
                        activeRecordId={activeRecordId}
                        row={row}
                        className={bodyRowCellClassName}
                        tableStyleTheme={tableStyleTheme}
                        isFindHighlight={
                          !!findHighlight &&
                          findHighlight.rowIndex === row.index &&
                          findHighlight.columnId === cell.column.id
                        }
                      />
                    ))}
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </div>
      {contextMenu && onDeleteRecord && (
        <div
          className='fixed z-[100] min-w-32 rounded-md border bg-popover p-1 text-popover-foreground shadow-md'
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            variant='ghost'
            className='w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive'
            size='sm'
            onClick={() => {
              onDeleteRecord(String(contextMenu.record.id));
              setContextMenu(null);
            }}
          >
            <LucideTrash2 className='mr-2 size-4' />
            Delete
          </Button>
        </div>
      )}
    </div>
  );
}

function SortableTableViewRow({
  row,
  table,
  itemHeight,
  tableStyleTheme,
  bodyRowClassName,
  activeRecordId,
  openRecord,
  onDeleteRecord,
  setContextMenu,
  bodyRowCellClassName,
  findHighlight,
  showDragHandle,
}: {
  row: Row<Record<string, unknown>>;
  table: Table<Record<string, unknown>>;
  itemHeight: number;
  tableStyleTheme: string;
  bodyRowClassName?: string;
  activeRecordId: string;
  openRecord: (_r: Record<string, unknown>) => void;
  onDeleteRecord?: (_id: string) => void;
  setContextMenu: (_m: { x: number; y: number; record: Record<string, unknown> } | null) => void;
  bodyRowCellClassName?: string;
  findHighlight?: { rowIndex: number; columnId: string } | null;
  showDragHandle: boolean;
}) {
  const {
    transform,
    transition,
    setNodeRef,
    isDragging,
    attributes,
    listeners,
  } = useSortable({ id: String(row.id) });
  const cells = row.getVisibleCells();
  return (
    <div
      ref={setNodeRef}
      aria-description='TableRow'
      className={cn([
        'group/row',
        'inline-flex flex-row flex-nowrap items-center justify-start',
        tableStyleTheme === 'classic' && 'border-b border-r',
        tableStyleTheme === 'lineless' && 'border-none',
        tableStyleTheme === 'lineless' && row.index % 2 === 1 && 'bg-muted/30',
        tableStyleTheme === 'panel' && 'border-b border-r border-border/50',
        tableStyleTheme === 'panel' && row.index % 2 === 0 && 'bg-background',
        tableStyleTheme === 'panel' && row.index % 2 === 1 && 'bg-muted',
        'last-of-type:rounded-b-md group-[*]/no-left-radius:last-of-type:rounded-bl-none!',
        'hover:!bg-muted/50',
        bodyRowClassName,
        isDragging && 'opacity-80 z-10',
      ])}
      style={{
        background:
          `${activeRecordId}` === `${row.id}` ? 'var(--muted)' : undefined,
        height: `${itemHeight}px`,
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      onClick={(e) => {
        e.stopPropagation();
        openRecord(row.original);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        if (onDeleteRecord) {
          setContextMenu({
            x: e.clientX,
            y: e.clientY,
            record: row.original,
          });
        }
      }}
    >
      {cells.map((cell, cellIdx) => {
        if (cellIdx === 0 && showDragHandle) {
          const isSelected = row.getIsSelected();
          const isActiveRow = `${activeRecordId}` === `${row.id}`;
          return (
            <div
              key={cell.id}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                'relative h-[40px] inline-flex flex-row justify-center items-center overflow-hidden group/rowcheckboxgroup border-l first-of-type:rounded-bl-md',
                rowNumberBodyStickyClassName(
                  tableStyleTheme as 'classic' | 'lineless' | 'panel',
                  row.index,
                  isActiveRow
                )
              )}
              style={{
                width: `${cell.column.getSize()}px`,
                minWidth: `${cell.column.getSize()}px`,
              }}
            >
              <span
                className={`absolute inset-0 flex items-center justify-center text-sm text-muted-foreground transition-opacity ${isSelected ? 'opacity-0' : ''} group-hover/rowcheckboxgroup:opacity-0`}
              >
                {(row.index + 1).toLocaleString('fullwide', { useGrouping: false })}
              </span>
              <span
                className={`absolute inset-0 items-center justify-center gap-2 text-muted-foreground ${isSelected ? 'flex' : 'hidden group-hover/rowcheckboxgroup:flex'}`}
              >
                <span
                  className='cursor-grab active:cursor-grabbing flex items-center justify-center'
                  {...attributes}
                  {...listeners}
                  onClick={(e) => e.stopPropagation()}
                >
                  <LucideGripVertical className='size-4' />
                </span>
                <span onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(value) => row.toggleSelected(!!value)}
                    aria-label='Select row'
                  />
                </span>
              </span>
            </div>
          );
        }
        return (
          <TableRowCell
            key={cell.id}
            table={table}
            cell={cell}
            cellIdx={cellIdx}
            activeRecordId={activeRecordId}
            row={row}
            className={bodyRowCellClassName}
            tableStyleTheme={tableStyleTheme}
            isFindHighlight={
              !!findHighlight &&
              findHighlight.rowIndex === row.index &&
              findHighlight.columnId === cell.column.id
            }
          />
        );
      })}
    </div>
  );
}
