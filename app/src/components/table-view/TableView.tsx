import { useEffect, useRef, useState } from 'react';
import tablesViewStyles from './table-view.module.scss';
import type { Row, Table } from '@tanstack/react-table';
import { SortableTableHeaderCell, TableHeaderCell } from './TableHeaderCell';
import { TableRowCell } from './TableRowCell';
import { LoadingIndicator } from '../loading-indicator/LoadingIndicator';
import { cn } from '@/lib/utils';
import { LucideGripVertical, LucidePencil, LucideTrash2 } from 'lucide-react';
import { dadixEvents } from '@/constants/events';
import { Checkbox } from '@/components/ui/checkbox';
import { useTableStyle } from '@/context/TableStyleContext';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToHorizontalAxis, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { isRowNumberColumn } from './tableStickyStyles';
import { CSS } from '@dnd-kit/utilities';
import { rowNumberBodyStickyClassName } from './tableStickyStyles';
import { openExternalUrl } from '@/lib/desktopShell';

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
    columnId?: string;
  }) => void;
  onColumnResizeEnd: ({
    ..._props
  }: {
    size: number;
    tableFieldId: number;
    gridViewFieldId?: number;
    columnId?: string;
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
  enableColumnReorder?: boolean;
  onColumnReorder?: (fromHeaderId: string, toHeaderId: string) => void;
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

const EDITABLE_CELL_TYPES = new Set([
  'TEXT',
  'INTEGER',
  'DATE',
  'CHOICE',
  'BOOLEAN',
  'FILE',
]);

type CellContextMenu = {
  x: number;
  y: number;
  record: Record<string, unknown>;
  columnId: string;
  fieldId?: number;
  fieldName?: string;
  canEditCell: boolean;
};

function cellContextFromEvent(
  e: React.MouseEvent,
  record: Record<string, unknown>
): CellContextMenu {
  const cell = (e.target as HTMLElement).closest('[data-column-id]');
  const columnId = cell?.getAttribute('data-column-id') ?? '';
  const fieldIdRaw = cell?.getAttribute('data-field-id');
  const fieldName = cell?.getAttribute('data-field-name') || undefined;
  const fieldType = cell?.getAttribute('data-field-type') ?? '';
  const fieldAction = cell?.getAttribute('data-field-action') ?? 'edit';
  const fieldId = fieldIdRaw ? Number(fieldIdRaw) : undefined;
  const canEditCell =
    !isRowNumberColumn(columnId, -1) &&
    !columnId.startsWith('view-button-') &&
    EDITABLE_CELL_TYPES.has(fieldType) &&
    fieldAction === 'edit';
  return {
    x: e.clientX,
    y: e.clientY,
    record,
    columnId,
    fieldId: Number.isFinite(fieldId) ? fieldId : undefined,
    fieldName,
    canEditCell,
  };
}

function handleGridRowClick(
  e: React.MouseEvent,
  row: Row<Record<string, unknown>>,
  openRecord: (_record: Record<string, unknown>) => void
) {
  e.stopPropagation();
  const cell = (e.target as HTMLElement).closest('[data-field-action]');
  if (cell?.getAttribute('data-field-action') === 'openUrl') {
    openExternalUrl(cell.getAttribute('data-cell-value') ?? '');
    return;
  }
  openRecord(row.original);
}

const cellMenuItemClassName =
  "relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm leading-5 outline-none hover:bg-accent hover:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground hover:[&_svg:not([class*='text-'])]:text-current [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0";

const cellMenuDeleteClassName =
  "data-[variant=destructive]:hover:bg-destructive/10 data-[variant=destructive]:hover:text-destructive data-[variant=destructive]:hover:[&_svg]:!text-destructive";

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
  enableColumnReorder = false,
  onColumnReorder,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & TableViewProps) {
  const { theme: tableStyleTheme } = useTableStyle();
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const numberOfHiddenRowsRef = useRef<number>(10);
  const numberOfVisibleRowsRef = useRef<number>(20);
  const firstVisibleRowIndexRef = useRef<number>(0);

  const [firstVisibleRowIndex, setFirstVisibleRowIndex] = useState<number>(0);
  const [isHorizontallyScrolled, setIsHorizontallyScrolled] = useState(false);
  const [activeColumnHeaderId, setActiveColumnHeaderId] = useState<string | null>(
    null
  );
  const [liveColumnSizes, setLiveColumnSizes] = useState<Record<string, number>>(
    {}
  );

  const handleLiveResizeChange = (props: {
    size: number;
    tableFieldId: number;
    gridViewFieldId?: number;
    columnId?: string;
  }) => {
    const key = props.columnId ?? String(props.gridViewFieldId ?? props.tableFieldId);
    setLiveColumnSizes((prev) =>
      prev[key] === props.size ? prev : { ...prev, [key]: props.size }
    );
  };

  const handleLiveResizeEnd = (props: {
    size: number;
    tableFieldId: number;
    gridViewFieldId?: number;
    columnId?: string;
  }) => {
    handleLiveResizeChange(props);
    onColumnResizeEnd(props);
  };
  const [contextMenu, setContextMenu] = useState<CellContextMenu | null>(null);

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
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 5 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !onRowReorder || active.id === over.id) return;
    const fromIndex = allRows.findIndex((r) => String(r.id) === String(active.id));
    const toIndex = allRows.findIndex((r) => String(r.id) === String(over.id));
    if (fromIndex >= 0 && toIndex >= 0) onRowReorder(fromIndex, toIndex);
  };

  const headerGroup = table.getHeaderGroups()[0];
  const sortableColumnIds = (headerGroup?.headers ?? [])
    .filter((header, idx) => {
      const meta = header.column.columnDef.meta as Record<string, unknown> | undefined;
      return !isRowNumberColumn(header.column.id, idx) && !meta?.isViewButton;
    })
    .map((header) => `col-${header.id}`);

  const handleColumnDragStart = (event: DragStartEvent) => {
    setActiveColumnHeaderId(String(event.active.id).replace(/^col-/, ''));
    window.dispatchEvent(new Event('dadix-column-drag-start'));
  };

  const handleColumnDragEnd = (event: DragEndEvent) => {
    setActiveColumnHeaderId(null);
    const { active, over } = event;
    if (!over || !onColumnReorder || active.id === over.id) return;
    const fromHeaderId = String(active.id).replace(/^col-/, '');
    const toHeaderId = String(over.id).replace(/^col-/, '');
    onColumnReorder(fromHeaderId, toHeaderId);
  };

  const columnSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } })
  );

  const activeColumnHeader = (headerGroup?.headers ?? []).find(
    (header) =>
      header.id === activeColumnHeaderId ||
      header.column.id === activeColumnHeaderId
  );
  const activeColumnMeta = activeColumnHeader?.column.columnDef.meta as
    | Record<string, unknown>
    | undefined;
  const activeColumnWidth = activeColumnHeader?.column.columnDef.size ?? 140;
  const activeColumnName = String(
    activeColumnMeta?.fieldName ?? activeColumnMeta?.name ?? ''
  );

  return (
    <div {...props} data-table-style={tableStyleTheme}>
      <div
        ref={scrollContainerRef}
        aria-description='Table'
        data-h-scrolled={isHorizontallyScrolled ? 'true' : undefined}
        className={`${tablesViewStyles.scrollContainer} group/hscroll relative isolate w-full max-w-full h-full max-h-full overflow-auto [overflow-anchor:none]`}
        onScroll={(evnt) => {
          const scrolled = evnt.currentTarget.scrollLeft > 0;
          setIsHorizontallyScrolled((prev) => (prev === scrolled ? prev : scrolled));
        }}
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
              tableStyleTheme !== 'lineless' && 'bg-muted border-t-0 border-b border-r border-border',
              'rounded-none',
              headerRowClassName || '',
            ])}
          >
            {enableColumnReorder && onColumnReorder ? (
              <DndContext
                collisionDetection={closestCenter}
                modifiers={[restrictToHorizontalAxis]}
                onDragStart={handleColumnDragStart}
                onDragCancel={() => setActiveColumnHeaderId(null)}
                onDragEnd={handleColumnDragEnd}
                sensors={columnSensors}
              >
                <SortableContext
                  items={sortableColumnIds}
                  strategy={horizontalListSortingStrategy}
                >
                  {table.getHeaderGroups()[0].headers.map((header, idx) => (
                    <SortableTableHeaderCell
                      key={header.id}
                      table={table}
                      tableId={tableId}
                      header={header}
                      idx={idx}
                      viewId={viewId}
                      liveWidth={liveColumnSizes[header.column.id]}
                      onColumnResizeChange={handleLiveResizeChange}
                      onColumnResizeEnd={handleLiveResizeEnd}
                      className={headerRowCellClassName}
                      tableStyleTheme={tableStyleTheme}
                    />
                  ))}
                </SortableContext>
                <DragOverlay dropAnimation={null}>
                  {activeColumnHeader ? (
                    <div
                      className='flex h-[45px] items-center rounded-md border bg-muted px-2.5 text-sm font-medium shadow-md'
                      style={{
                        width: activeColumnWidth,
                        minWidth: activeColumnWidth,
                        maxWidth: activeColumnWidth,
                      }}
                    >
                      <span className='truncate'>{activeColumnName}</span>
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            ) : (
              table.getHeaderGroups()[0].headers.map((header, idx) => (
                <TableHeaderCell
                  key={header.id}
                  table={table}
                  tableId={tableId}
                  header={header}
                  idx={idx}
                  viewId={viewId}
                  liveWidth={liveColumnSizes[header.column.id]}
                  onColumnResizeChange={handleLiveResizeChange}
                  onColumnResizeEnd={handleLiveResizeEnd}
                  className={headerRowCellClassName}
                  tableStyleTheme={tableStyleTheme}
                />
              ))
            )}
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
            zIndex: 0,
            // marginTop, not transform — transform breaks position:sticky
            marginTop: `${
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
            }px`,
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
                        liveColumnSizes={liveColumnSizes}
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
                        `${activeRecordId}` === `${row.id}`
                          ? 'var(--muted)'
                          : undefined,
                      height: `${itemHeight}px`,
                    }}
                    onClick={(e) => handleGridRowClick(e, row, openRecord)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      const next = cellContextFromEvent(e, row.original);
                      if (next.canEditCell || onDeleteRecord) {
                        setContextMenu(next);
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
                        liveWidth={liveColumnSizes[cell.column.id]}
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
      {contextMenu && (contextMenu.canEditCell || onDeleteRecord) && (
        <div
          className='fixed z-[100] min-w-32 rounded-md border bg-popover p-1 text-popover-foreground shadow-md'
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.canEditCell && (
            <button
              type='button'
              data-slot='dropdown-menu-item'
              data-cell-menu-item='edit'
              className={cellMenuItemClassName}
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent(dadixEvents.recordEvents.onEditCell, {
                    detail: {
                      recordId: contextMenu.record.id,
                      fieldId: contextMenu.fieldId,
                      fieldName: contextMenu.fieldName,
                      columnId: contextMenu.columnId,
                    },
                  })
                );
                setContextMenu(null);
              }}
            >
              <LucidePencil />
              Edit
            </button>
          )}
          {onDeleteRecord && (
            <button
              type='button'
              data-slot='dropdown-menu-item'
              data-variant='destructive'
              data-cell-menu-item='delete'
              className={`${cellMenuItemClassName} ${cellMenuDeleteClassName}`}
              onClick={() => {
                onDeleteRecord(String(contextMenu.record.id));
                setContextMenu(null);
              }}
            >
              <LucideTrash2 />
              Delete
            </button>
          )}
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
  liveColumnSizes,
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
  setContextMenu: (_m: CellContextMenu | null) => void;
  bodyRowCellClassName?: string;
  findHighlight?: { rowIndex: number; columnId: string } | null;
  liveColumnSizes: Record<string, number>;
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
          `${activeRecordId}` === `${row.id}`
            ? 'var(--muted)'
            : undefined,
        height: `${itemHeight}px`,
        ...(isDragging && transform
          ? { transform: CSS.Transform.toString(transform), transition }
          : {}),
      }}
      onClick={(e) => handleGridRowClick(e, row, openRecord)}
      onContextMenu={(e) => {
        e.preventDefault();
        const next = cellContextFromEvent(e, row.original);
        if (next.canEditCell || onDeleteRecord) {
          setContextMenu(next);
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
                'relative box-border h-[50px] min-h-[50px] self-stretch inline-flex flex-row justify-center items-center overflow-hidden group/rowcheckboxgroup rounded-none border-0 bg-background',
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
            liveWidth={liveColumnSizes[cell.column.id]}
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
