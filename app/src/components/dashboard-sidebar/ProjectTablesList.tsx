'use client';

import React, { useState, useEffect, useRef, Fragment, useMemo } from 'react';
import { useRouter } from 'next/navigation';

import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  pointerWithin,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import {
  LucideEdit3,
  LucideLayers3,
  LucideMoreVertical,
  LucideTrash2,
  LucidePencil,
  FolderOpen,
  Table2,
  EyeOff,
  Eye,
  Trash2,
  GripVertical,
  Braces,
  Webhook as LucideWebhook,
  LucideKey,
} from 'lucide-react';
import DeleteTableDialog from '@/components/delete-table-dialog';
import { TableIcon } from '@/components/table-icon/TableIcon';

import { toast } from 'sonner';
import { useCurrentProjectContext } from '@/context/CurrentProjectContext';
import { useSidebarStateOptional } from '@/context/SidebarStateContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { dadixEvents } from '@/constants/events';
import tableService from '@/lib/table';
import { cn } from '@/lib/utils';
import { UserLocalStorage } from '@/lib/userLocalStorage';
import { openUpdateTableDialog } from '../table-editor/UpdateTableDialog';
import { useLanguage } from '@/context/LanguageContext';
import {
  DEFAULT_GROUP_ID,
  type SidebarGroup as SidebarGroupType,
  type SidebarLink,
} from '@/lib/sidebarState';
import { SidebarRenameGroupDialog } from './SidebarRenameGroupDialog';
import { SidebarEditLinkDialog } from './SidebarLinksList';
import { openCreateNewTableDialog } from '@/components/create-table-dialog';

import type { Table } from '@/types';
import { openTableEditorDialog } from '../table-editor/TableEditorDialog';
import { useTableContext } from '@/context/TableContext';
import { openAPIConfigDialog } from '@/components/api-config-dialog/APIConfigDialog';
import { openApiKeysDialog } from '@/components/table-editor/ApiKeysDialog';
import { openTableWebhookDialog } from '@/components/table-webhook-dialog/TableWebhookDialog';
import { openViewsEditorDialog } from '@/components/views-editor/ViewsEditor';
import { projectTableHref } from '@/lib/projectHref';
import { isDadixDesktopShell, openExternalUrl } from '@/lib/desktopShell';

const DROP_GROUP_PREFIX = 'drop-group-';

function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const copy = [...arr];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

/** Returns [start, end) indices of the block (group header + all its tables/links) in orderedIds. */
function getGroupBlockRange(
  orderedIds: string[],
  groupId: string,
  allGroupIds: string[]
): { start: number; end: number } {
  const start = orderedIds.indexOf(groupId);
  if (start === -1) return { start: 0, end: 0 };
  let end = start + 1;
  for (let i = start + 1; i < orderedIds.length; i++) {
    if (allGroupIds.includes(orderedIds[i])) {
      end = i;
      break;
    }
    end = i + 1;
  }
  return { start, end };
}

/** Index of the group header that "contains" overId (the group under the cursor). */
function getTargetGroupHeaderIndex(
  orderedIds: string[],
  overId: string,
  allGroupIds: string[],
  itemsById: Record<string, { type: string; groupId?: string }>
): number {
  const overIndex = orderedIds.indexOf(overId);
  if (overIndex === -1) return 0;
  if (allGroupIds.includes(overId)) return overIndex;
  const item = itemsById[overId];
  if (!item || item.type === 'group' || item.groupId == null) return overIndex;
  const targetGroupId = item.groupId;
  let headerIndex = 0;
  for (let i = 0; i <= overIndex; i++) {
    if (orderedIds[i] === targetGroupId) headerIndex = i;
  }
  return headerIndex;
}

function sidebarCollisionDetection(allGroupIds: string[]) {
  return (args: Parameters<typeof pointerWithin>[0]) => {
    const collisions = pointerWithin(args);
    if (collisions.length <= 1) return collisions;
    const activeId = String(args.active?.id ?? '');
    const activeIsGroup = allGroupIds.includes(activeId);
    const sorted = [...collisions].sort((a, b) => {
      const aIsDrop = String(a.id).startsWith(DROP_GROUP_PREFIX) ? 1 : 0;
      const bIsDrop = String(b.id).startsWith(DROP_GROUP_PREFIX) ? 1 : 0;
      if (activeIsGroup) return bIsDrop - aIsDrop;
      return aIsDrop - bIsDrop;
    });
    return sorted;
  };
}

interface ProjectTablesListProps {
  canEditTables: boolean;
  searchQuery?: string;
}

function filterTablesBySearch(tables: Table[], query: string): Table[] {
  if (!query.trim()) return tables;
  const q = query.trim().toLowerCase();
  return tables.filter((t) => t.name.toLowerCase().includes(q));
}

function GroupHeaderRow({
  group,
  canEditTables,
  isHidden,
  onToggleCollapsed,
  onRename,
  onNewTable,
  onHide,
  onUnhide,
  onDelete,
  groupDragHandleProps,
}: {
  group: { id: string; name: string };
  canEditTables: boolean;
  isHidden?: boolean;
  onToggleCollapsed: () => void;
  onRename: () => void;
  onNewTable: () => void;
  onHide: () => void;
  onUnhide: () => void;
  onDelete: () => void;
  groupDragHandleProps?: {
    attributes: Record<string, unknown>;
    listeners: Record<string, unknown>;
  };
}) {
  const canDeleteGroup = group.id !== DEFAULT_GROUP_ID;
  const stopRowPointer = (event: React.SyntheticEvent) => {
    event.stopPropagation();
  };
  return (
    <div
      role='button'
      tabIndex={0}
      onClick={onToggleCollapsed}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggleCollapsed();
        }
      }}
      className='group/label flex cursor-pointer items-center justify-between gap-1 px-1 py-0 mt-[5px] mb-0 rounded-md transition-colors hover:bg-accent/50 group-data-[collapsible=icon]:hidden'
      {...(groupDragHandleProps?.attributes as object)}
      {...(groupDragHandleProps?.listeners as object)}
    >
      <SidebarGroupLabel
        data-sidebar-fit-label={group.name}
        data-group-hidden={isHidden ? 'true' : 'false'}
        className={cn(
          'text-muted-foreground text-xs font-semibold min-w-0 flex-1 !h-6 !min-h-6',
          isHidden && 'opacity-60'
        )}
      >
        {group.name}
      </SidebarGroupLabel>
      {canEditTables && (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant='ghost'
              size='icon'
              className='size-5 shrink-0 md:opacity-0 md:group-hover/label:opacity-100 transition-opacity'
              onPointerDown={stopRowPointer}
              onClick={stopRowPointer}
              aria-label='Group options'
              data-group-name={group.name}
            >
              <LucideMoreVertical className='size-3' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align='end'
            onPointerDown={stopRowPointer}
            onClick={stopRowPointer}
          >
            <DropdownMenuItem onSelect={() => onNewTable()}>
              <Table2 className='size-4' />
              New Table
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onRename()}>
              <LucidePencil className='size-4' />
              Rename
            </DropdownMenuItem>
            {isHidden ? (
              <DropdownMenuItem onSelect={() => onUnhide()}>
                <Eye className='size-4' />
                Unhide
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => onHide()}>
                <EyeOff className='size-4' />
                Hide
              </DropdownMenuItem>
            )}
            {canDeleteGroup && (
              <DropdownMenuItem
                variant='destructive'
                onSelect={() => {
                  window.setTimeout(onDelete, 0);
                }}
              >
                <Trash2 className='size-4' />
                Delete group
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function GroupDropZone({
  groupId,
  children,
  className,
}: {
  groupId: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: DROP_GROUP_PREFIX + groupId,
  });
  return (
    <div
      ref={setNodeRef}
      className={cn('min-h-0 py-0 rounded-md transition-colors', isOver && 'bg-accent/30', className)}
    >
      {children}
    </div>
  );
}

function SortableGroupWrapper({
  groupId,
  children,
}: {
  groupId: string;
  children: (_dragHandleProps: {
    attributes: Record<string, unknown>;
    listeners: Record<string, unknown>;
  }) => React.ReactNode;
}) {
  const {
    setNodeRef,
    transform,
    transition,
    attributes,
    listeners,
  } = useSortable({ id: groupId, data: { type: 'group', id: groupId } });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      {children({
        attributes: attributes as unknown as Record<string, unknown>,
        listeners: listeners as unknown as Record<string, unknown>,
      })}
    </div>
  );
}

export function ProjectTablesList({
  canEditTables,
  searchQuery = '',
}: ProjectTablesListProps) {
  const currentTableCtx = useTableContext();
  const currentProjectCtx = useCurrentProjectContext();
  const sidebarState = useSidebarStateOptional();
  const router = useRouter();
  const [renameGroup, setRenameGroup] = useState<SidebarGroupType | null>(null);
  const [editingLink, setEditingLink] = useState<SidebarLink | null>(null);
  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [pendingGroupIdForNewTable, setPendingGroupIdForNewTable] = useState<
    string | null
  >(null);
  const justDraggedRef = useRef(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [liveOrderIds, setLiveOrderIds] = useState<string[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTableState, setDeleteTableState] = useState<Table | null>(null);

  const openDelete = (table: Table) => {
    if (UserLocalStorage.getSkipDeleteConfirmation()) {
      void handleDeleteConfirm(table);
      return;
    }
    setDeleteTableState(table);
    setDeleteOpen(true);
  };

  const closeDelete = () => {
    setDeleteOpen(false);
    setDeleteTableState(null);
  };

  const handleDeleteConfirm = async (tableOverride?: Table) => {
    const table = tableOverride ?? deleteTableState;
    if (!table) return;
    try {
      await tableService.deleteTable({
        projectId: `${currentProjectCtx.id}`,
        tableId: `${table.id}`,
      });
      toast.success('Table removed');
      const remaining = currentProjectCtx.tables.filter(
        (item) => `${item.id}` !== `${table.id}`
      );
      if (`${currentTableCtx.id}` !== `${table.id}`) {
        return;
      }
      if (remaining[0]) {
        const viewQuery = remaining[0].defaultViewId
          ? `&viewId=${remaining[0].defaultViewId}`
          : '';
        router.push(
          `/dashboard/${currentProjectCtx.id}?tableId=${remaining[0].id}${viewQuery}`
        );
      } else {
        router.push(`/dashboard/${currentProjectCtx.id}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('TABLE_DELETE_FAILED', err);
      toast.error(msg || 'Failed to remove table');
    } finally {
      closeDelete();
    }
  };

  const filteredTables = filterTablesBySearch(
    currentProjectCtx.tables,
    searchQuery
  );

  const { groupsWithTables, hiddenGroupsWithTables } = (() => {
    interface GroupWithTables {
      id: string;
      name: string;
      order: number;
      hidden?: boolean;
      collapsed?: boolean;
      tables: Table[];
    }
    if (!sidebarState) {
      return {
        groupsWithTables: [
          {
            id: DEFAULT_GROUP_ID,
            name: 'Tables',
            order: 0,
            tables: filteredTables,
          },
        ] as GroupWithTables[],
        hiddenGroupsWithTables: [] as GroupWithTables[],
      };
    }
    const { groups, tableToGroup, showHiddenGroups } = sidebarState;
    const sortedVisible = [...groups]
      .sort((a, b) => a.order - b.order)
      .filter((g) => !g.hidden);
    const sortedHidden =
      showHiddenGroups && sidebarState
        ? [...groups].sort((a, b) => a.order - b.order).filter((g) => g.hidden)
        : [];
    const knownGroupIds = new Set(groups.map((g) => g.id));
    const getGroupId = (t: Table) => {
      const assigned = tableToGroup[String(t.id)];
      if (assigned && knownGroupIds.has(assigned)) return assigned;
      return knownGroupIds.has(DEFAULT_GROUP_ID)
        ? DEFAULT_GROUP_ID
        : (sortedVisible[0]?.id ?? DEFAULT_GROUP_ID);
    };
    const byGroup = new Map<string, Table[]>();
    for (const t of filteredTables) {
      const gid = getGroupId(t);
      if (!byGroup.has(gid)) byGroup.set(gid, []);
      byGroup.get(gid)!.push(t);
    }
    for (const [, arr] of byGroup) arr.sort((a, b) => a.order - b.order);
    const groupsWithTables: GroupWithTables[] = [];
    for (const g of sortedVisible) {
      const tables = byGroup.get(g.id) ?? [];
      groupsWithTables.push({ ...g, tables });
    }
    const hiddenGroupsWithTables: GroupWithTables[] = [];
    for (const g of sortedHidden) {
      const tables = byGroup.get(g.id) ?? [];
      hiddenGroupsWithTables.push({ ...g, tables });
    }
    const assigned = new Set(
      [...groupsWithTables, ...hiddenGroupsWithTables].flatMap((g) =>
        g.tables.map((t) => String(t.id))
      )
    );
    const hiddenGroupIds = new Set(
      groups.filter((g) => g.hidden).map((g) => g.id)
    );
    const orphans = filteredTables.filter((t) => {
      if (assigned.has(String(t.id))) return false;
      return !hiddenGroupIds.has(getGroupId(t));
    });
    if (orphans.length > 0) {
      if (groupsWithTables.length === 0) {
        groupsWithTables.push({
          id: DEFAULT_GROUP_ID,
          name: 'Tables',
          order: 0,
          tables: orphans,
        });
      } else {
        groupsWithTables[0].tables.push(...orphans);
      }
    }
    return { groupsWithTables, hiddenGroupsWithTables };
  })();

  useEffect(() => {
    const handler = (e: Event) => {
      const { projectId, createdTable } = (e as CustomEvent).detail || {};
      if (
        !pendingGroupIdForNewTable ||
        !createdTable ||
        `${currentProjectCtx.id}` !== `${projectId}`
      )
        return;
      sidebarState?.assignTableToGroup(
        String((createdTable as Table).id),
        pendingGroupIdForNewTable
      );
      setPendingGroupIdForNewTable(null);
    };
    window.addEventListener(dadixEvents.tableEvents.onCreate, handler);
    return () =>
      window.removeEventListener(dadixEvents.tableEvents.onCreate, handler);
  }, [
    pendingGroupIdForNewTable,
    currentProjectCtx.id,
    sidebarState?.assignTableToGroup,
  ]);

  const groupIds = groupsWithTables.map((g) => g.id);
  const allGroupIds = [...groupIds];
  hiddenGroupsWithTables.forEach((g) => allGroupIds.push(g.id));

  function getOrderedItemIdsForGroup(g: { id: string; tables: Table[] }): string[] {
    const tableIds = g.tables.map((t) => String(t.id));
    const groupLinks = (sidebarState?.links ?? []).filter(
      (l) => (sidebarState?.linkToGroup[l.id] ?? DEFAULT_GROUP_ID) === g.id
    );
    const linkIds = groupLinks.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((l) => l.id);
    const savedOrder = sidebarState?.groupItemOrder?.[g.id];
    if (!savedOrder?.length) return [...tableIds, ...linkIds];
    const validInGroup = new Set([...tableIds, ...linkIds]);
    const ordered = savedOrder.filter((id) => validInGroup.has(id));
    const missing = [...tableIds, ...linkIds].filter((id) => !ordered.includes(id));
    return [...ordered, ...missing];
  }

  const flatIds = [
    ...groupsWithTables.flatMap((g) => [g.id, ...getOrderedItemIdsForGroup(g)]),
    ...hiddenGroupsWithTables.flatMap((g) => [g.id, ...getOrderedItemIdsForGroup(g)]),
  ];
  const orderedIds = activeDragId ? liveOrderIds : flatIds;

  const isSearchMode = searchQuery.trim().length > 0;
  const searchResultIds = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return null;
    const lower = q.toLowerCase();
    const tables = (currentProjectCtx.tables ?? []).filter((t) =>
      t.name.toLowerCase().includes(lower)
    );
    const links = (sidebarState?.links ?? []).filter((l) =>
      l.title.toLowerCase().includes(lower)
    );
    return [...tables.map((t) => String(t.id)), ...links.map((l) => l.id)];
  }, [searchQuery, currentProjectCtx.tables, sidebarState?.links]);
  const displayIds = isSearchMode ? (searchResultIds ?? []) : orderedIds;
  type GroupItem =
    | (typeof groupsWithTables)[0]
    | (typeof hiddenGroupsWithTables)[0];
  const itemsById = useMemo(() => {
    const m: Record<
      string,
      | { type: 'group'; group: GroupItem }
      | { type: 'table'; table: Table; groupId: string }
      | { type: 'link'; link: SidebarLink; groupId: string }
    > = {};
    const allGroups = [...groupsWithTables, ...hiddenGroupsWithTables];
    for (const g of allGroups) {
      m[g.id] = { type: 'group', group: g };
      for (const t of g.tables) m[String(t.id)] = { type: 'table', table: t, groupId: g.id };
      const groupLinks = (sidebarState?.links ?? [])
        .filter((l) => (sidebarState?.linkToGroup[l.id] ?? DEFAULT_GROUP_ID) === g.id)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      for (const l of groupLinks) m[String(l.id)] = { type: 'link', link: l, groupId: g.id };
    }
    return m;
  }, [groupsWithTables, hiddenGroupsWithTables, sidebarState?.links, sidebarState?.linkToGroup]);
  const collapsedGroupIds = useMemo(
    () =>
      new Set(
        [...groupsWithTables, ...hiddenGroupsWithTables]
          .filter((g) => g.collapsed)
          .map((g) => g.id)
      ),
    [groupsWithTables, hiddenGroupsWithTables]
  );
  const sensors = useSensors(
    useSensor(MouseSensor, {
      // Higher distance so a normal click never becomes a drag (esp. Safari)
      activationConstraint: { distance: 10 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, distance: 10 },
    }),
    useSensor(KeyboardSensor, {})
  );

  function handleDragStart(event: DragStartEvent) {
    // Do NOT set justDraggedRef here — Safari often starts a tiny drag on click,
    // which would block navigation for 220ms after pointerup.
    setLiveOrderIds([...flatIds]);
    setActiveDragId(String(event.active.id));
  }
  function handleDragOver(event: { active: { id: unknown }; over: { id: unknown } | null }) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    setLiveOrderIds((prev) => {
      const oldIndex = prev.indexOf(activeId);
      if (oldIndex === -1) return prev;

      if (allGroupIds.includes(activeId)) {
        // Gruppe = Ordner: ganzen Block (Header + alle Tables/Links) verschieben, nur an Gruppengrenzen einfügen
        const { start, end } = getGroupBlockRange(prev, activeId, allGroupIds);
        const targetHeaderIndex = getTargetGroupHeaderIndex(prev, overId, allGroupIds, itemsById);
        if (targetHeaderIndex >= start && targetHeaderIndex < end) return prev;
        const block = prev.slice(start, end);
        const withoutBlock = [...prev.slice(0, start), ...prev.slice(end)];
        let insertAt: number;
        if (targetHeaderIndex > start) {
          insertAt = Math.max(0, targetHeaderIndex - (end - start));
        } else {
          insertAt = targetHeaderIndex;
        }
        withoutBlock.splice(insertAt, 0, ...block);
        return withoutBlock;
      }

      let newIndex = prev.indexOf(overId);
      if (newIndex === -1 || oldIndex === newIndex) return prev;
      // Table/Link auf Gruppentitel gedroppt → nach dem Header einfügen (erste Position in der Gruppe)
      if (allGroupIds.includes(overId)) newIndex = newIndex + 1;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  function applyLiveOrderToContext() {
    if (!sidebarState || liveOrderIds.length === 0) return;
    const ids = [...liveOrderIds];
    sidebarState.setGroups((prev) =>
      prev.map((g) => ({ ...g, order: ids.indexOf(g.id) >= 0 ? ids.indexOf(g.id) : g.order }))
    );
    const linkOrder: Record<string, number> = {};
    const linkIndexInGroup: Record<string, number> = {};
    let currentGroupId: string | null = null;
    for (const id of ids) {
      const item = itemsById[id];
      if (!item) continue;
      if (item.type === 'group') {
        currentGroupId = id;
        linkIndexInGroup[id] = 0;
      }
      if (item.type === 'table' && currentGroupId) {
        sidebarState.assignTableToGroup(id, currentGroupId);
        const order = ids.indexOf(id);
        window.dispatchEvent(
          new CustomEvent(dadixEvents.tableEvents.onPatch, {
            detail: {
              projectId: currentProjectCtx.id,
              tableId: id,
              data: { order },
            },
          })
        );
        tableService.patchTable({
          projectId: `${currentProjectCtx.id}`,
          tableId: id,
          data: { order },
        });
      }
      if (item.type === 'link' && currentGroupId) {
        sidebarState.assignLinkToGroup(id, currentGroupId);
        const idx = linkIndexInGroup[currentGroupId] ?? 0;
        linkOrder[id] = idx;
        linkIndexInGroup[currentGroupId] = idx + 1;
      }
    }
    if (Object.keys(linkOrder).length > 0) {
      sidebarState.setLinks((prev) =>
        prev.map((l) => ({ ...l, order: linkOrder[l.id] ?? l.order }))
      );
    }
    const newGroupItemOrder: Record<string, string[]> = {};
    let currentGroup: string | null = null;
    for (const id of ids) {
      const item = itemsById[id];
      if (!item) continue;
      if (item.type === 'group') {
        currentGroup = id;
        newGroupItemOrder[id] = [];
      }
      if ((item.type === 'table' || item.type === 'link') && currentGroup) {
        newGroupItemOrder[currentGroup].push(id);
      }
    }
    sidebarState.setGroupItemOrder((prev) => ({ ...prev, ...newGroupItemOrder }));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    const { active, over, delta } = event;
    const moved =
      Math.abs(delta?.x ?? 0) > 4 || Math.abs(delta?.y ?? 0) > 4;
    if (moved) {
      justDraggedRef.current = true;
      setTimeout(() => {
        justDraggedRef.current = false;
      }, 220);
    }

    if (!over) {
      return;
    }
    const overId = String(over.id);
    const activeId = String(active.id);

    if (overId.startsWith(DROP_GROUP_PREFIX)) {
      const groupId = overId.slice(DROP_GROUP_PREFIX.length);
      if (allGroupIds.includes(activeId)) {
        const fromIndex = allGroupIds.indexOf(activeId);
        const toIndex = allGroupIds.indexOf(groupId);
        if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
          sidebarState?.setGroups((prev) => {
            const inDisplayOrder = allGroupIds
              .map((id) => prev.find((g) => g.id === id))
              .filter((g): g is NonNullable<typeof g> => !!g);
            const reordered = [...inDisplayOrder];
            const [removed] = reordered.splice(fromIndex, 1);
            reordered.splice(toIndex, 0, removed);
            return prev.map((g) => {
              const newIdx = reordered.findIndex((r) => r.id === g.id);
              if (newIdx === -1) return g;
              return { ...g, order: newIdx };
            });
          });
        }
      } else {
        const isLink = sidebarState?.links.some((l) => String(l.id) === activeId);
        if (isLink) {
          sidebarState?.assignLinkToGroup(activeId, groupId);
          sidebarState?.setLinks((prev) =>
            prev.map((l) => {
              if (l.id === activeId) return { ...l, order: 0 };
              const inTargetGroup = (sidebarState?.linkToGroup[l.id] ?? DEFAULT_GROUP_ID) === groupId;
              if (inTargetGroup) return { ...l, order: (l.order ?? 0) + 1 };
              return l;
            })
          );
        } else {
          sidebarState?.assignTableToGroup(activeId, groupId);
        }
      }
      return;
    }

    applyLiveOrderToContext();
  }

  return (
    <>
      <div className={cn('w-full min-w-0', activeDragId && 'select-none', 'group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center')}>
      <DndContext
        id='projects-editor--projects-list'
        modifiers={[restrictToVerticalAxis]}
        collisionDetection={sidebarCollisionDetection(allGroupIds)}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        sensors={sensors}
      >
        <SortableContext
          items={displayIds}
          strategy={verticalListSortingStrategy}
          disabled={isSearchMode}
        >
          {displayIds.map((id) => {
            const item = itemsById[id];
            if (!item) return null;
            const minimizeAllForGroupDrag = Boolean(activeDragId && allGroupIds.includes(activeDragId));
            if (item.type === 'group') {
              const groupItem = item.group;
              const isHiddenGroup = hiddenGroupsWithTables.some((g) => g.id === id);
              const groupHeader = (
                <GroupDropZone groupId={id} className='group-data-[collapsible=icon]:w-auto'>
                  <SidebarGroup className='p-0 group-data-[collapsible=icon]:w-auto group-data-[collapsible=icon]:p-0'>
                    <GroupHeaderRow
                      group={groupItem}
                      canEditTables={canEditTables}
                      isHidden={isHiddenGroup}
                      onToggleCollapsed={() => {
                        if (justDraggedRef.current) return;
                        sidebarState?.setGroupCollapsed?.(groupItem.id, !groupItem.collapsed);
                      }}
                      onRename={() => setRenameGroup(groupItem)}
                      onNewTable={() => {
                        setPendingGroupIdForNewTable(groupItem.id);
                        openCreateNewTableDialog();
                      }}
                      onHide={() => sidebarState?.setGroupHidden?.(groupItem.id, true)}
                      onUnhide={() => sidebarState?.setGroupHidden?.(groupItem.id, false)}
                      onDelete={() => {
                        if (UserLocalStorage.getSkipDeleteConfirmation()) {
                          sidebarState?.removeGroup(groupItem.id);
                          return;
                        }
                        setDeleteGroupConfirm({ id: groupItem.id, name: groupItem.name });
                      }}
                      groupDragHandleProps={undefined}
                    />
                  </SidebarGroup>
                </GroupDropZone>
              );
              if (sidebarState && canEditTables) {
                return (
                  <SortableGroupWrapper key={id} groupId={id}>
                    {(handleProps) => (
                      <GroupDropZone groupId={id} className='group-data-[collapsible=icon]:w-auto'>
                        <SidebarGroup className='p-0 group-data-[collapsible=icon]:w-auto group-data-[collapsible=icon]:p-0'>
                          <GroupHeaderRow
                            group={groupItem}
                            canEditTables={canEditTables}
                            isHidden={isHiddenGroup}
                            onToggleCollapsed={() => {
                              if (justDraggedRef.current) return;
                              sidebarState?.setGroupCollapsed?.(groupItem.id, !groupItem.collapsed);
                            }}
                            onRename={() => setRenameGroup(groupItem)}
                            onNewTable={() => {
                              setPendingGroupIdForNewTable(groupItem.id);
                              openCreateNewTableDialog();
                            }}
                            onHide={() => sidebarState?.setGroupHidden?.(groupItem.id, true)}
                            onUnhide={() => sidebarState?.setGroupHidden?.(groupItem.id, false)}
                            onDelete={() => {
                              if (UserLocalStorage.getSkipDeleteConfirmation()) {
                                sidebarState?.removeGroup(groupItem.id);
                                return;
                              }
                              setDeleteGroupConfirm({ id: groupItem.id, name: groupItem.name });
                            }}
                            groupDragHandleProps={handleProps}
                          />
                        </SidebarGroup>
                      </GroupDropZone>
                    )}
                  </SortableGroupWrapper>
                );
              }
              return <Fragment key={id}>{groupHeader}</Fragment>;
            }
            if (item.type === 'table') {
              if (collapsedGroupIds.has(item.groupId) || minimizeAllForGroupDrag) return null;
              return (
                <DraggableTablesListItem
                  key={id}
                  table={item.table}
                  canEditTables={canEditTables}
                  projectId={currentProjectCtx.id}
                  openDelete={openDelete}
                  groups={sidebarState?.groups ?? []}
                  assignTableToGroup={sidebarState?.assignTableToGroup}
                  justDraggedRef={justDraggedRef}
                />
              );
            }
            if (item.type === 'link') {
              if (collapsedGroupIds.has(item.groupId) || minimizeAllForGroupDrag) return null;
              return (
                <DraggableLinkItem
                  key={id}
                  link={item.link}
                  onEdit={() => setEditingLink(item.link)}
                  onRemove={() => sidebarState?.removeLink(item.link.id)}
                  justDraggedRef={justDraggedRef}
                />
              );
            }
            return null;
          })}
        </SortableContext>
        <DragOverlay dropAnimation={null}>
          {activeDragId ? (
            allGroupIds.includes(activeDragId) ? (
              <div className='rounded-md border border-border bg-background px-2 py-1 shadow-lg select-none'>
                <span className='text-muted-foreground text-xs font-semibold'>
                  {[...groupsWithTables, ...hiddenGroupsWithTables].find(
                    (g) => g.id === activeDragId
                  )?.name ?? ''}
                </span>
              </div>
            ) : sidebarState?.links.find((l) => String(l.id) === activeDragId) ? (
              (() => {
                const link = sidebarState.links.find((l) => String(l.id) === activeDragId)!;
                return (
                  <div className='rounded-md border border-border bg-background px-2 py-1.5 shadow-lg flex items-center gap-2 select-none min-w-[8rem]'>
                    <TableIcon name={link.icon ?? 'Globe'} width={18} height={18} className='shrink-0 text-muted-foreground' />
                    <span className='text-sm truncate'>{link.title}</span>
                  </div>
                );
              })()
            ) : (
              (() => {
                const table = currentProjectCtx.tables?.find((t) => String(t.id) === activeDragId);
                if (!table) return null;
                return (
                  <div className='rounded-md border border-border bg-background px-2 py-1.5 shadow-lg flex items-center gap-2 select-none min-w-[8rem]'>
                    <TableIcon name={table.icon} width={18} height={18} className='shrink-0' />
                    <span className='text-sm truncate'>{table.name}</span>
                  </div>
                );
              })()
            )
          ) : null}
        </DragOverlay>
      </DndContext>
      </div>
      <DeleteTableDialog
        open={deleteOpen}
        tableName={deleteTableState?.name}
        onClose={closeDelete}
        onConfirm={handleDeleteConfirm}
      />
      <SidebarRenameGroupDialog
        open={!!renameGroup}
        onOpenChange={(open) => !open && setRenameGroup(null)}
        group={renameGroup}
      />
      {editingLink && (
        <SidebarEditLinkDialog
          link={editingLink}
          open
          onOpenChange={(_open) => !_open && setEditingLink(null)}
          onSave={(title, url, icon) => {
            sidebarState?.updateLink(
              editingLink.id,
              title,
              url,
              icon
            );
            setEditingLink(null);
          }}
        />
      )}
      <Dialog
        open={!!deleteGroupConfirm}
        onOpenChange={(open) => !open && setDeleteGroupConfirm(null)}
      >
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>Delete group</DialogTitle>
          </DialogHeader>
          <p className='text-sm text-muted-foreground'>
            Delete &quot;{deleteGroupConfirm?.name}&quot;? Tables in this group
            will be moved to Tables.
          </p>
          <DialogFooter className='gap-4'>
            <Button
              type='button'
              variant='outline'
              onClick={() => setDeleteGroupConfirm(null)}
            >
              Cancel
            </Button>
            <Button
              type='button'
              variant='destructive'
              data-confirm-delete-group=''
              onClick={() => {
                if (!deleteGroupConfirm) return;
                sidebarState?.removeGroup(deleteGroupConfirm.id);
                toast.success('Group deleted');
                setDeleteGroupConfirm(null);
              }}
            >
              Delete group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DraggableLinkItem({
  link,
  onEdit,
  onRemove,
  justDraggedRef,
}: {
  link: SidebarLink;
  onEdit: () => void;
  onRemove: () => void;
  justDraggedRef: React.MutableRefObject<boolean>;
}) {
  const isMobile = useIsMobile();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: String(link.id), data: { type: 'link', id: link.id } });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className='relative w-full group/link select-none cursor-grab active:cursor-grabbing touch-none my-0.5'
    >
      <SidebarMenuItem
        className='min-h-8 h-8 min-w-8 py-0 px-1 hover:bg-secondary hover:text-secondary-foreground rounded-md cursor-pointer flex items-center group-data-[collapsible=icon]:!size-8 group-data-[collapsible=icon]:!min-w-8 group-data-[collapsible=icon]:!max-w-8 group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:items-center'
        onClick={(e) => {
          if (justDraggedRef.current) return;
          e.preventDefault();
          e.stopPropagation();
          openExternalUrl(link.url);
        }}
      >
        <div className='flex items-center justify-between w-full min-w-0 h-8 group-data-[collapsible=icon]:justify-center'>
          <div className='flex items-center gap-2 min-w-0 overflow-hidden group-data-[collapsible=icon]:justify-center'>
            <TableIcon
              name={link.icon ?? 'Globe'}
              width={18}
              height={18}
              className='size-[18px] shrink-0'
            />
            <span className='truncate text-sm leading-5 group-data-[collapsible=icon]:hidden'>
              {link.title}
            </span>
          </div>
          <DropdownMenu modal={isMobile}>
            <DropdownMenuTrigger asChild>
              <Button
                variant='ghost'
                className='flex text-muted-foreground size-6 md:opacity-0 md:pointer-events-none md:group-hover/link:opacity-100 md:transform-gpu md:transition-all md:duration-200 md:ease-out md:motion-reduce:transition-none md:group-hover/link:pointer-events-auto md:group-focus-within/link:pointer-events-auto group-data-[collapsible=icon]:hidden'
                size='icon'
                onClick={(e) => e.stopPropagation()}
              >
                <LucideMoreVertical />
                <span className='sr-only'>Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-40 z-9999'>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                <LucidePencil className='size-4' />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                variant='destructive'
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
              >
                <LucideTrash2 className='size-4' />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SidebarMenuItem>
    </div>
  );
}

const DraggableTablesListItem = ({
  projectId,
  table,
  openDelete,
  canEditTables,
  groups = [],
  assignTableToGroup,
  justDraggedRef,
}: {
  projectId: string | number | undefined;
  table: Table;
  openDelete: (_table: Table) => void;
  canEditTables: boolean;
  groups?: SidebarGroupType[];
  assignTableToGroup?: (_tableId: string, _groupId: string) => void;
  justDraggedRef: React.MutableRefObject<boolean>;
}) => {
  const router = useRouter();
  const isMobile = useIsMobile();
  const { t } = useLanguage();
  const { setOpenMobile } = useSidebar();
  const currentTableCtx = useTableContext();
  const {
    transform,
    transition,
    setNodeRef,
    isDragging,
    attributes,
    listeners,
  } = useSortable({
    id: String(table.id),
    data: {
      id: table.id,
      order: table.order,
    },
  });

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuArmed, setMenuArmed] = useState(true);
  const armMenuTimeoutRef = useRef<number | null>(null);
  const isDesktopShell = isDadixDesktopShell();

  const armMenuAfterPointerUp = () => {
    const arm = () => {
      setMenuArmed(true);
      window.removeEventListener('pointerup', arm);
      window.removeEventListener('pointercancel', arm);
      if (armMenuTimeoutRef.current != null) {
        window.clearTimeout(armMenuTimeoutRef.current);
        armMenuTimeoutRef.current = null;
      }
    };
    window.addEventListener('pointerup', arm);
    window.addEventListener('pointercancel', arm);
    armMenuTimeoutRef.current = window.setTimeout(arm, 400);
  };

  const openTableMenu = (event: React.MouseEvent) => {
    if (!canEditTables) return;
    event.preventDefault();
    event.stopPropagation();
    setMenuArmed(false);
    setMenuOpen(true);
    armMenuAfterPointerUp();
  };

  const selectTable = () => {
    if (justDraggedRef.current || isDragging) return;
    router.push(projectTableHref(projectId, table.id, table.defaultViewId));
    if (isMobile) setOpenMobile(false);
  };

  if (!table || !projectId) return null;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onPointerDown={(event) => {
        if (event.button === 2) {
          event.stopPropagation();
          return;
        }
        listeners?.onPointerDown?.(event);
      }}
      onContextMenu={openTableMenu}
      data-dragging={isDragging}
      data-selected={currentTableCtx.id === table.id}
      data-menu-open={menuOpen}
      className='relative w-full group/table select-none cursor-grab active:cursor-grabbing touch-none my-0.5'
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <SidebarMenuItem
        className='min-h-8 h-8 min-w-8 py-0 px-1 hover:bg-secondary hover:text-secondary-foreground rounded-md cursor-pointer flex items-center group-data-[selected=true]/table:bg-[#EAEAEA] group-data-[selected=true]/table:hover:bg-[#EAEAEA] group-data-[menu-open=true]/table:bg-[#EAEAEA] group-data-[menu-open=true]/table:hover:bg-[#EAEAEA] group-data-[collapsible=icon]:!size-8 group-data-[collapsible=icon]:!min-w-8 group-data-[collapsible=icon]:!max-w-8 group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:items-center'
        onClick={selectTable}
      >
        <div className='flex items-center justify-between w-full min-w-0 h-8 group-data-[collapsible=icon]:justify-center'>
          <div className='flex items-center gap-2 min-w-0 overflow-hidden group-data-[collapsible=icon]:justify-center'>
            <TableIcon name={table.icon} width={18} height={18} className='shrink-0 group-data-[selected=true]/table:text-foreground group-data-[menu-open=true]/table:text-foreground' />
            <span
              data-table-name={table.name}
              data-table-id={String(table.id)}
              data-table-source={table.sourceKind ?? 'local'}
              className='truncate text-sm leading-5 group-data-[collapsible=icon]:hidden group-data-[selected=true]/table:text-foreground group-data-[menu-open=true]/table:text-foreground'
            >
              {table.name}
            </span>
            {table.sourceKind === 'linked_file' ? (
              <span className='ml-1 shrink-0 text-[10px] text-muted-foreground group-data-[collapsible=icon]:hidden' title={t('table.source.linkedFile')}>
                {t('table.source.file')}
              </span>
            ) : table.sourceKind === 'external_database' ? (
              <span className='ml-1 shrink-0 text-[10px] text-muted-foreground group-data-[collapsible=icon]:hidden' title={t('table.source.external')}>
                {t('table.source.db')}
              </span>
            ) : null}
          </div>

          {/* Modal behavior only on mobile to prevent underlying interactions */}
          {canEditTables && (
            <DropdownMenu
              modal={isMobile}
              open={menuOpen}
              onOpenChange={(open) => {
                setMenuOpen(open);
                if (!open) setMenuArmed(true);
              }}
            >
              <DropdownMenuTrigger asChild>
                <Button
                  variant='ghost'
                  className='flex text-muted-foreground size-6 md:opacity-0 md:pointer-events-none group-data-[selected=true]/table:text-foreground group-data-[menu-open=true]/table:text-foreground md:group-hover/table:opacity-100 md:group-data-[menu-open=true]/table:opacity-100 md:transform-gpu md:transition-all md:duration-200 md:ease-out md:motion-reduce:transition-none md:group-hover:pointer-events-auto md:group-data-[menu-open=true]/table:pointer-events-auto md:group-focus-within:pointer-events-auto group-data-[collapsible=icon]:hidden'
                  size='icon'
                  onClick={(e) => e.stopPropagation()}
                >
                  <LucideMoreVertical />

                  <span className='sr-only'>Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align='end'
                className='relative w-40 z-9999'
                onClick={(e) => e.stopPropagation()}
                onOpenAutoFocus={(event) => event.preventDefault()}
                onCloseAutoFocus={(event) => event.preventDefault()}
                onPointerDownOutside={(event) => {
                  if (!menuArmed) event.preventDefault();
                }}
                onInteractOutside={(event) => {
                  if (!menuArmed) event.preventDefault();
                }}
              >
                {!menuArmed && (
                  <div className='absolute inset-0 z-10' aria-hidden />
                )}
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    openUpdateTableDialog({
                      projectId: `${projectId}`,
                      tableId: `${table.id}`,
                    });
                  }}
                >
                  <LucideEdit3 className='size-4' />
                  <span>Edit</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    openTableEditorDialog({
                      tableId: table.id as string,
                      projectId: projectId as string,
                    });
                  }}
                >
                  <Table2 className='size-4' />
                  <span>Table</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    if (`${currentTableCtx.id}` !== `${table.id}`) {
                      router.push(`/dashboard/${projectId}?tableId=${table.id}`);
                    }
                    window.setTimeout(() => openViewsEditorDialog(), 80);
                  }}
                >
                  <LucideLayers3 className='size-4' />
                  <span>All views</span>
                </DropdownMenuItem>
                {assignTableToGroup && groups.length > 1 && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <FolderOpen className='size-4' />
                      <span>Move to group</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {groups.map((g) => (
                        <DropdownMenuItem
                          key={g.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            assignTableToGroup(String(table.id), g.id);
                          }}
                        >
                          {g.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                {!isDesktopShell && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        openAPIConfigDialog({ tableId: String(table.id), projectId: String(projectId) });
                      }}
                    >
                      <Braces className='size-4' />
                      <span>API</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        openApiKeysDialog();
                      }}
                    >
                      <LucideKey className='size-4' />
                      <span>AI Keys</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        openTableWebhookDialog({ tableId: String(table.id), projectId: String(projectId), tableName: table.name });
                      }}
                    >
                      <LucideWebhook className='size-4' />
                      <span>Webhook</span>
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant='destructive'
                  onClick={(e) => {
                    e.stopPropagation();
                    openDelete(table);
                  }}
                >
                  <LucideTrash2 className='size-4' />
                  <span>Delete</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </SidebarMenuItem>
    </div>
  );
};
