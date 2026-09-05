import { useEffect, useRef, useState } from 'react';

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
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
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  LucideGripVertical,
  LucideMoreVertical,
  LucidePenLine,
  LucideTrash2,
} from 'lucide-react';
import { ProjectIcon } from '@/components/project-icon/ProjectIcon';

import { useDashboardContext } from '@/context/DashboardContext';
import { callApi } from '@/lib/api';
import { dadixEvents } from '@/constants/events';
import {
  CLOSE_EDIT_PROJECT_PANEL_EVENT,
  OPEN_EDIT_PROJECT_PANEL_EVENT,
  openEditProjectPanel,
} from '@/components/projects-editor/EditProjectPanel';
import { openDeleteProjectConfirmDialog } from '@/components/projects-editor/DeleteProjectConfirmDialog';

function ProjectsList() {
  const dashboardCtx = useDashboardContext();
  const [editedProjectId, setEditedProjectId] = useState<string | undefined>(
    undefined
  );
  const updateProjectsOrderTimeout = useRef<NodeJS.Timeout>(undefined);

  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {})
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (active?.data?.current?.order === over?.data?.current?.order) return;
    const newOrder = over?.data?.current?.order;
    clearTimeout(updateProjectsOrderTimeout.current);
    updateProjectsOrderTimeout.current = setTimeout(() => {
      callApi
        .patch(`/project/${active.data.current?.id}`, {
          data: {
            order: newOrder,
          },
        })
        .then((res) => {
          if (res.status !== 200) {
            throw new Error('Error saving projects new order');
          }
          return res;
        })
        .catch((err) => {
          console.error(err);
        });
    }, 1000);
    window.dispatchEvent(
      new CustomEvent(dadixEvents.projectEvents.onPatch, {
        detail: {
          projectId: active.data.current?.id,
          data: {
            order: over?.data?.current?.order,
          },
        },
      })
    );
  }

  useEffect(() => {
    window.addEventListener(
      OPEN_EDIT_PROJECT_PANEL_EVENT,
      handleOpenProjectEditor
    );
    return () => {
      window.removeEventListener(
        OPEN_EDIT_PROJECT_PANEL_EVENT,
        handleOpenProjectEditor
      );
    };
    function handleOpenProjectEditor(evnt: Event) {
      const { projectId } = (evnt as CustomEvent).detail || {};
      if (!projectId) return;
      const project = dashboardCtx.projects.filter(
        (project) => `${project.id}` === `${projectId}`
      )[0];
      if (!project) return;
      setEditedProjectId(projectId);
    }
  }, [dashboardCtx.projects]);

  useEffect(() => {
    window.addEventListener(CLOSE_EDIT_PROJECT_PANEL_EVENT, handleClosePanel);
    return () => {
      window.removeEventListener(
        CLOSE_EDIT_PROJECT_PANEL_EVENT,
        handleClosePanel
      );
    };
    function handleClosePanel(_evnt: Event) {
      setEditedProjectId(undefined);
    }
  }, []);

  return (
    <div className='flex flex-col grow gap-0 w-full rounded-lg border overflow-hidden'>
      <DndContext
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
        sensors={sensors}
        id='projects-editor--projects-list'
      >
        <div className='**:data-[slot=table-cell]:first:w-8'>
          {dashboardCtx.projects?.length ? (
            <>
              <SortableContext
                items={dashboardCtx.projects}
                strategy={verticalListSortingStrategy}
              >
                {dashboardCtx.projects.map((project) => {
                  return (
                    <Project
                      key={project.id}
                      item={project as unknown as Record<string, unknown>}
                      onItemClick={(projectId: string) => {
                        openEditProjectPanel({ projectId });
                      }}
                      isSelected={`${project.id}` === editedProjectId}
                    />
                  );
                })}
              </SortableContext>
            </>
          ) : (
            <div className='h-24 flex justify-center items-center text-center opacity-45'>
              No Projects found!
            </div>
          )}
        </div>
      </DndContext>
    </div>
  );
}

function Project({
  item,
  isSelected,
  onItemClick,
}: {
  item: Record<string, unknown>;
  isSelected: boolean;
  onItemClick: (_id: string) => void;
}) {
  const [isDropdownMenuOpen, setIsDropdownMenuOpen] = useState<boolean>(false);

  const {
    transform,
    transition,
    setNodeRef,
    isDragging,
    attributes,
    listeners,
  } = useSortable({
    id: item.id as string,
    data: {
      id: item.id as string,
      order: item.order as number,
    },
  });

  return (
    <>
      <div
        data-dragging={isDragging}
        data-selected={isSelected}
        ref={setNodeRef}
        className='hover:bg-muted/50 group relative z-0 data-[dragging=true]:z-10 data-[dragging=true]:opacity-80 data-[selected=true]:bg-muted not-last:border-b'
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
        }}
        onClick={() => onItemClick(item.id as string)}
      >
        <div className='flex flex-row flex-nowrap justify-start items-center gap-2 h-12'>
          <div
            className='flex justify-center items-center w-8 h-full shrink-0 grow-0'
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()} // Prevent row click when dragging
          >
            <LucideGripVertical className='size-4 opacity-35' />
          </div>
          <ProjectIcon name={item.icon as string} className='size-5' />
          <span className='text-sm shrink grow ml-3 overflow-hidden'>
            {item.title as string}
          </span>
          <DropdownMenu
            modal={false}
            open={isDropdownMenuOpen}
            onOpenChange={setIsDropdownMenuOpen}
          >
            <DropdownMenuTrigger asChild>
              <Button
                type='button'
                onClick={(evnt) => {
                  evnt.stopPropagation();
                }}
                variant='ghost'
                size='icon'
                className='ml-auto mr-1.5 data-[state=open]:bg-muted'
              >
                <LucideMoreVertical className='opacity-35' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent onClick={(evnt) => evnt.stopPropagation()}>
              <DropdownMenuItem
                onClick={() => {
                  setIsDropdownMenuOpen(false);
                  onItemClick(item.id as string);
                }}
              >
                <LucidePenLine />
                <span>Edit</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  setIsDropdownMenuOpen(false);
                  openDeleteProjectConfirmDialog({
                    projectId: item.id as string,
                  });
                }}
                variant='destructive'
              >
                <LucideTrash2 />
                <span>Delete</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </>
  );
}

export { ProjectsList };
