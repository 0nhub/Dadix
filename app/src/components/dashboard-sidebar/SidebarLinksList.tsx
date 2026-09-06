'use client';

import { useState, useEffect } from 'react';
import {
  DndContext,
  type DragEndEvent,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { LucideMoreVertical, LucidePencil, LucideTrash2, LucideX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSidebarState } from '@/context/SidebarStateContext';
import { openExternalUrl } from '@/lib/desktopShell';
import {
  TableIcon,
  availableTableIcons,
} from '@/components/table-icon/TableIcon';
import type { SidebarLink } from '@/lib/sidebarState';


function SortableLinkItem({
  link,
  onOpen,
  onEdit,
  onRemove,
}: {
  link: SidebarLink;
  onOpen: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: link.id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={isDragging ? 'opacity-50' : ''}
      {...attributes}
      {...listeners}
    >
      <SidebarMenuItem className='flex h-8 min-h-8 items-center justify-between gap-1 rounded-md py-0 px-1 hover:bg-secondary'>
        <button
          type='button'
          className='flex h-8 min-w-0 flex-1 items-center gap-2 text-left text-sm leading-5'
          onClick={onOpen}
        >
          <TableIcon
            name={link.icon ?? 'Globe'}
            width={18}
            height={18}
            className='size-[18px] shrink-0'
          />
          <span className='truncate text-sm leading-5'>{link.title}</span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant='ghost'
              size='icon'
              className='size-6 shrink-0'
              onClick={(e) => e.stopPropagation()}
            >
              <LucideMoreVertical className='size-4' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuItem onClick={onEdit}>
              <LucidePencil className='size-4' />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem variant='destructive' onClick={onRemove}>
              <LucideTrash2 className='size-4' />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </div>
  );
}

export function SidebarLinksList() {
  const { links, setLinks, removeLink, updateLink } = useSidebarState();
  const [editingLink, setEditingLink] = useState<SidebarLink | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { delay: 0, distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 100, distance: 8 },
    }),
    useSensor(KeyboardSensor, {})
  );

  if (links.length === 0) return null;

  const openLink = (url: string) => {
    openExternalUrl(url);
  };

  function handleLinkDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = links.findIndex((l) => l.id === active.id);
    const newIndex = links.findIndex((l) => l.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = [...links];
    const [removed] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, removed);
    setLinks(reordered);
  }

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel className='text-muted-foreground text-xs font-semibold px-1.5 py-1'>
          Links
        </SidebarGroupLabel>
        <SidebarGroupContent className='flex flex-col gap-1'>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleLinkDragEnd}
          >
            <SortableContext
              items={links.map((l) => l.id)}
              strategy={verticalListSortingStrategy}
            >
              <SidebarMenu>
                {links.map((link) => (
                  <SortableLinkItem
                    key={link.id}
                    link={link}
                    onOpen={() => openLink(link.url)}
                    onEdit={() => setEditingLink(link)}
                    onRemove={() => removeLink(link.id)}
                  />
                ))}
              </SidebarMenu>
            </SortableContext>
          </DndContext>
        </SidebarGroupContent>
      </SidebarGroup>
      {editingLink && (
        <SidebarEditLinkDialog
          link={editingLink}
          open
          onOpenChange={(_open) => !_open && setEditingLink(null)}
          onSave={(title, url, icon) => {
            updateLink(editingLink.id, title, url, icon);
            setEditingLink(null);
          }}
        />
      )}
    </>
  );
}

export function SidebarEditLinkDialog({
  link,
  open,
  onOpenChange,
  onSave,
}: {
  link: SidebarLink;
  open: boolean;
  onOpenChange: (_open: boolean) => void;
  onSave: (_title: string, _url: string, _icon?: string) => void;
}) {
  const [title, setTitle] = useState(link.title);
  const [url, setUrl] = useState(link.url);
  const [icon, setIcon] = useState(link.icon ?? 'Globe');

  useEffect(() => {
    if (open && link) {
      setTitle(link.title);
      setUrl(link.url);
      setIcon(link.icon ?? 'Globe');
    }
  }, [open, link]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    let u = url.trim();
    if (!t || !u) return;
    if (!u.startsWith('http://') && !u.startsWith('https://'))
      u = `https://${u}`;
    onSave(t, u, icon);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md' showCloseButton={false}>
        <DialogHeader className='flex flex-row flex-nowrap justify-start items-center'>
          <DialogClose asChild>
            <Button size='icon' variant='outline' className='shrink-0 grow-0' type='button'>
              <LucideX />
            </Button>
          </DialogClose>
          <DialogTitle className='shrink grow text-left' hidden>
            Edit link
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className='space-y-4 mt-2'>
            <div className='flex flex-col items-center gap-4'>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant='outline' className='w-21 h-21' type='button'>
                    <TableIcon
                      name={icon}
                      color='var(--primary)'
                      className='size-14 opacity-90'
                    />
                  </Button>
                </DialogTrigger>
                <DialogContent
                  showCloseButton={false}
                  className='max-w-[300px]! max-h-[400px]'
                >
                  <DialogHeader>
                    <DialogTitle hidden>Select icon</DialogTitle>
                  </DialogHeader>
                  <div className='grid grid-cols-6 gap-2 justify-center'>
                    {availableTableIcons.map((iconName) => (
                      <DialogClose key={iconName} asChild>
                        <Button
                          type='button'
                          variant='outline'
                          size='icon'
                          aria-pressed={icon === iconName}
                          title={iconName}
                          onClick={() => setIcon(iconName)}
                          className={`shadow-none ${icon === iconName ? 'border' : 'border-none'}`}
                        >
                          <TableIcon name={iconName} className='size-6' />
                        </Button>
                      </DialogClose>
                    ))}
                  </div>
                </DialogContent>
              </Dialog>
              <div className='w-full space-y-2'>
                <Input
                  placeholder='Title'
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  autoFocus
                />
                <Input
                  placeholder='https://example.com'
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  type='url'
                />
              </div>
            </div>
          </div>
          <DialogFooter className='mt-4 gap-4'>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type='submit' disabled={!title.trim() || !url.trim()}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
