'use client';

import { type Icon } from '@tabler/icons-react';
import { LucideEdit3, LucideTrash2 } from 'lucide-react';
import { memo } from 'react';
import type React from 'react';
import { Button } from '@/components/ui/button';
import { IconDotsVertical } from '@tabler/icons-react';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import RenameTableDialog from '@/components/rename-table-dialog';
import DeleteTableDialog from '@/components/delete-table-dialog';
import { useIsMobile } from '@/hooks/use-mobile';

import { useCurrentProjectContext } from '@/context/CurrentProjectContext';
import { TableIcon } from '@/components/table-icon/TableIcon';
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
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
import type { Table } from '@/types';
import { CSS } from '@dnd-kit/utilities';
import { dadixEvents } from '@/constants/events';
import tableService from '@/lib/table';
import { useTableContext } from '@/context/TableContext';

function NavMainComponent({
  items,
  tables,
  selectedTable,
}: {
  items: {
    title: string;
    url: string;
    icon?: Icon;
  }[];
  tables?: Table[] | null;
  selectedTable: Table | null;
  onSelectTable: (_table: Table) => void;
}) {
  const currentTableCtx = useTableContext();
  const currentProjectCtx = useCurrentProjectContext();
  const router = useRouter();
  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {})
  );
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTable, setRenameTable] = useState<Table | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTableState, setDeleteTableState] = useState<Table | null>(null);

  const closeRename = () => {
    setRenameOpen(false);
    setRenameTable(null);
  };

  const closeDelete = () => {
    setDeleteOpen(false);
    setDeleteTableState(null);
  };

  const handleRenameSave = async (newName: string) => {
    if (!renameTable) return;
    await tableService.patchTable({
      tableId: `${currentTableCtx.id}`,
      projectId: `${currentProjectCtx.id}`,
      data: {
        name: newName,
        icon: renameTable.icon,
      },
    });
    toast.success('Table renamed');
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTableState) return;
    try {
      await tableService.deleteTable({
        projectId: `${currentProjectCtx.id}`,
        tableId: `${deleteTableState.id}`,
      });
      toast.success('Table removed');
      if (selectedTable?.id !== deleteTableState.id) {
        return;
      }
      if (tables && tables.length > 0) {
        router.push(
          `/dashboard/${currentProjectCtx.id}?tableId=${tables[0].id}`
        );
      } else {
        router.push(`/dashboard/${currentProjectCtx.id}`);
      }
    } catch (err) {
      console.error('Failed to remove table', err);
      toast.error('Failed to remove table');
    } finally {
      closeDelete();
    }
  };

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (active?.data?.current?.order === over?.data?.current?.order) return;
    const newOrder = over?.data?.current?.order;
    window.dispatchEvent(
      new CustomEvent(dadixEvents.tableEvents.onPatch, {
        detail: {
          projectId: currentProjectCtx.id,
          tableId: active.data.current?.id,
          data: {
            order: newOrder,
          },
        },
      })
    );
    tableService.patchTable({
      projectId: `${currentProjectCtx.id}`,
      tableId: active.data.current?.id,
      data: {
        order: newOrder,
      },
    });
  }

  return (
    <DndContext
      id='projects-editor--projects-list'
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={handleDragEnd}
      sensors={sensors}
    >
      <SidebarGroup>
        <SidebarGroupContent className='flex flex-col gap-2'>
          <SidebarMenu>
            <SidebarMenuItem className='flex flex-col items-center gap-2'>
              <SortableContext
                items={currentProjectCtx.tables}
                strategy={verticalListSortingStrategy}
              >
                {currentProjectCtx.tables &&
                  currentProjectCtx.tables.map((table: Table) => (
                    <DraggableTablesListItem key={table.id} table={table} />
                  ))}
              </SortableContext>
            </SidebarMenuItem>
          </SidebarMenu>
          <SidebarMenu>
            {items.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton tooltip={item.title}>
                  {item.icon && <item.icon />}
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
        <RenameTableDialog
          open={renameOpen}
          initialName={renameTable?.name}
          onClose={closeRename}
          onSave={handleRenameSave}
        />
        <DeleteTableDialog
          open={deleteOpen}
          tableName={deleteTableState?.name}
          onClose={closeDelete}
          onConfirm={handleDeleteConfirm}
        />
      </SidebarGroup>
    </DndContext>
  );
}

const DraggableTablesListItem = ({ table }: { table: Table }) => {
  const router = useRouter();
  const isMobile = useIsMobile();
  const currentTableCtx = useTableContext();
  const {
    transform,
    transition,
    setNodeRef,
    isDragging,
    attributes,
    listeners,
  } = useSortable({
    id: table.id as string,
    data: {
      id: table.id,
      order: table.order,
    },
  });

  const selectTable = () => {
    router.replace(`?tableId=${table.id}`);
  };

  return (
    <div
      {...attributes}
      {...listeners}
      ref={setNodeRef}
      data-dragging={isDragging}
      className='relative w-full group/table data-[dragging=true]:z-1'
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <SidebarMenuButton
        // tooltip={table.name}
        className={`min-w-8 duration-200 ease-linear ${
          currentTableCtx.id === table.id
            ? 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'
            : ''
          // : 'hover:bg-neutral-100'
        }`}
        onClick={selectTable}
      >
        <div className='flex items-center justify-between w-full'>
          <div className='flex items-center gap-2'>
            <TableIcon name={table.icon} width={20} height={20} />
            <span>{table.name}</span>
          </div>

          {/* Modal behavior only on mobile to prevent underlying interactions */}
          <DropdownMenu modal={isMobile}>
            <DropdownMenuTrigger asChild>
              <Button
                variant='ghost'
                className='text-muted-foreground flex size-6 md:opacity-0 md:pointer-events-none md:group-hover/table:opacity-100 md:transform-gpu md:transition-all md:duration-200 md:ease-out md:motion-reduce:transition-none md:group-hover:pointer-events-auto md:group-focus-within:pointer-events-auto'
                size='icon'
                onClick={(e) => e.stopPropagation()}
              >
                <IconDotsVertical
                  color={
                    currentTableCtx.id === table.id
                      ? 'var(--primary-foreground)'
                      : undefined
                  }
                />

                <span className='sr-only'>Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align='end'
              className='w-40 z-9999'
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  // openRename(table);
                }}
              >
                <LucideEdit3 className='size-4' />
                <span>Rename</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                variant='destructive'
                onClick={(e) => {
                  e.stopPropagation();
                  // openDelete(table);
                }}
              >
                <LucideTrash2 className='size-4' />
                <span>Remove</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SidebarMenuButton>
    </div>
  );
};

export const NavMain = memo(NavMainComponent);
