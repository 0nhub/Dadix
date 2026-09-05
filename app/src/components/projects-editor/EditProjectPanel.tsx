import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  LucideArrowDown,
  LucideArrowUp,
  LucideMoreVertical,
  LucideTrash2,
  LucideX,
} from 'lucide-react';
import {
  availableProjectIcons,
  ProjectIcon,
} from '@/components/project-icon/ProjectIcon';
import { ProjectMembersOptions } from '@/components/projects-editor/ProjectMembersOptions';

import { useDashboardContext } from '@/context/DashboardContext';
import { callApi } from '@/lib/api';
import { dadixEvents } from '@/constants/events';
import { openDeleteProjectConfirmDialog } from '@/components/projects-editor/DeleteProjectConfirmDialog';

const OPEN_EDIT_PROJECT_PANEL_EVENT = 'dadix--open-edit-project-panel-event';
const CLOSE_EDIT_PROJECT_PANEL_EVENT = 'dadix--close-edit-project-panel-event';

function EditProjectPanel() {
  const dashboardCtx = useDashboardContext();
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [projectTitle, setProjectTitle] = useState<string | undefined>(
    undefined
  );
  const [lastProjectIcon, setlastProjectIcon] = useState<string | undefined>(
    undefined
  );

  const projectCopyRef = useRef<Record<string, unknown>>({});
  const updateProjectTitleTimeout = useRef<NodeJS.Timeout>(undefined);
  const updateProjectIconTimeout = useRef<NodeJS.Timeout>(undefined);
  const closeTimeout = useRef<NodeJS.Timeout>(undefined);

  const project = useMemo(() => {
    return dashboardCtx.projects.filter(
      (project) => `${project.id}` === `${projectId}`
    )[0];
  }, [projectId]);

  useEffect(() => {
    if (!isOpen) {
      window.dispatchEvent(new CustomEvent(CLOSE_EDIT_PROJECT_PANEL_EVENT));
    }
  }, [isOpen]);

  useEffect(() => {
    window.addEventListener(OPEN_EDIT_PROJECT_PANEL_EVENT, handleOpenPanel);
    return () => {
      window.removeEventListener(
        OPEN_EDIT_PROJECT_PANEL_EVENT,
        handleOpenPanel
      );
    };
    function handleOpenPanel(evnt: Event) {
      const { projectId } = (evnt as CustomEvent).detail || {};
      if (!projectId) return;
      const project = dashboardCtx.projects.filter(
        (project) => `${project.id}` === `${projectId}`
      )[0];
      if (!project) return;
      clearTimeout(closeTimeout.current);
      setProjectId(projectId);
      setIsOpen(true);
    }
  }, [isOpen, dashboardCtx.projects]);

  useEffect(() => {
    if (!project || !isOpen) return;
    if (`${projectCopyRef.current.title}` !== `${project.title}`) {
      setProjectTitle(project.title as string);
      setlastProjectIcon(project.icon as string);
    }
    projectCopyRef.current = {
      title: project?.title as string,
      icon: project?.icon as string,
    };
  }, [isOpen, project]);

  const updateProjectName = () => {
    clearTimeout(updateProjectTitleTimeout.current);
    updateProjectTitleTimeout.current = setTimeout(() => {
      callApi
        .patch(`/project/${project?.id}`, {
          data: {
            title: projectCopyRef.current.title,
          },
        })
        .then((res) => {
          if (res.status !== 200) {
            throw new Error('Error saving project title');
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
          projectId: project?.id,
          data: {
            title: projectCopyRef.current.title,
          },
        },
      })
    );
  };

  const updateProjectIcon = () => {
    clearTimeout(updateProjectIconTimeout.current);
    updateProjectIconTimeout.current = setTimeout(() => {
      callApi
        .patch(`/project/${project?.id}`, {
          data: {
            icon: projectCopyRef.current.icon,
          },
        })
        .then((res) => {
          if (res.status !== 200) {
            throw new Error('Error saving project icon');
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
          projectId: project?.id,
          data: {
            icon: projectCopyRef.current.icon,
          },
        },
      })
    );
  };

  const deleteProject = () => {
    openDeleteProjectConfirmDialog({ projectId: project?.id as string });
    setIsOpen(false);
    // onOpenChange?.(false);
  };

  return (
    <Sheet
      modal={false}
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setlastProjectIcon(project?.icon as string);
          closeTimeout.current = setTimeout(() => {
            try {
              setIsOpen(false);
            } catch (err) {
              console.warn(err);
            }
          }, 320);
        } else {
          clearTimeout(closeTimeout.current);
        }
      }}
    >
      <SheetContent autoFocus>
        <SheetHeader className='gap-1'>
          <SheetTitle className='flex justify-start gap-2'>
            <Button
              onClick={() => {
                setIsOpen(false);
              }}
              autoFocus
              size='icon'
              variant='outline'
              className='mr-auto'
            >
              <LucideX />
            </Button>
            <GetRelativeProjectControllers projectId={projectId} />
            <DropdownMenu modal={true}>
              <DropdownMenuTrigger asChild>
                <Button size='icon' variant='outline' autoFocus={false}>
                  <LucideMoreVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem variant='destructive' onClick={deleteProject}>
                  <LucideTrash2 />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SheetTitle>
        </SheetHeader>
        <div className='flex flex-col gap-4 overflow-y-auto px-4 pb-4 text-sm'>
          <form className='flex flex-col gap-4'>
            <div className='flex flex-col gap-3'>
              <div className='flex flex-row justify-center items-center'>
                <Select
                  onValueChange={(newIcon) => {
                    projectCopyRef.current = {
                      ...projectCopyRef.current,
                      icon: newIcon,
                    };
                    setlastProjectIcon(newIcon);
                    updateProjectIcon();
                  }}
                >
                  <SelectTrigger
                    className='w-18! h-18! justify-center items-center'
                    showIcon={false}
                  >
                    <ProjectIcon
                      color='var(--primary)'
                      name={lastProjectIcon || ''}
                      className='size-8'
                    />
                  </SelectTrigger>
                  <SelectContent side='bottom' position='popper'>
                    <div className='max-w-[272px] flex flex-row flex-wrap gap-2 m-2'>
                      {availableProjectIcons.map((iconName) => {
                        return (
                          <SelectItem
                            className='group/noCheckIndicator flex justify-center items-center gap-0 w-12 h-12 p-0'
                            key={iconName}
                            value={iconName}
                          >
                            <ProjectIcon
                              color='var(--primary)'
                              name={iconName}
                              className='size-5.2'
                            />
                          </SelectItem>
                        );
                      })}
                    </div>
                  </SelectContent>
                </Select>
              </div>
              <Label htmlFor={`${projectId}_name_input`} className='pt-3'>
                Project name
              </Label>
              <Input
                id={`${projectId}_name_input`}
                value={projectTitle}
                placeholder='Project name'
                onChange={(e) => {
                  const newTitle = e.target.value;
                  projectCopyRef.current = {
                    ...projectCopyRef.current,
                    title: newTitle,
                  };
                  setProjectTitle(newTitle);
                  updateProjectName();
                }}
              />
            </div>
          </form>
          {projectId && <ProjectMembersOptions projectId={projectId} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function GetRelativeProjectControllers({
  projectId,
}: {
  projectId: string | undefined;
}) {
  const dashboardCtx = useDashboardContext();
  const [haseNext, setHasNext] = useState<boolean>(true);
  const [haseBefore, setHasBefore] = useState<boolean>(true);

  function getNextProject() {
    const currentProject = dashboardCtx.projects.find(
      (project) => project.id === projectId
    );

    if (!currentProject) return;
    if (currentProject.order >= dashboardCtx.projects.length - 1) return;

    const nextProject = dashboardCtx.projects.find(
      (project) => project.order === currentProject.order + 1
    );
    if (!nextProject) return;

    openEditProjectPanel({ projectId: nextProject.id });
  }

  function getBeforeProject() {
    const currentProject = dashboardCtx.projects.find(
      (project) => project.id === projectId
    );
    if (!currentProject) return;
    if (currentProject.order === 0) return;

    const beforeProject = dashboardCtx.projects.find(
      (project) => project.order === currentProject.order - 1
    );
    if (!beforeProject) return;

    openEditProjectPanel({ projectId: beforeProject.id });
  }

  useEffect(() => {
    const project = dashboardCtx.projects.find(
      (project) => project.id === projectId
    );
    if (!project) {
      setHasNext(false);
      setHasBefore(false);
      return;
    }

    setHasBefore(project.order > 0);
    setHasNext(project.order < dashboardCtx.projects.length - 1);
  }, [projectId, dashboardCtx.projects]);

  if (!projectId) return null;

  return (
    <>
      <Button
        onClick={getBeforeProject}
        size='icon'
        variant='outline'
        disabled={!haseBefore}
      >
        <LucideArrowUp />
      </Button>
      <Button
        onClick={getNextProject}
        size='icon'
        variant='outline'
        disabled={!haseNext}
      >
        <LucideArrowDown />
      </Button>
    </>
  );
}

function openEditProjectPanel({ projectId }: { projectId: string }) {
  window.dispatchEvent(
    new CustomEvent(OPEN_EDIT_PROJECT_PANEL_EVENT, {
      detail: { projectId },
    })
  );
}

export {
  EditProjectPanel,
  openEditProjectPanel,
  CLOSE_EDIT_PROJECT_PANEL_EVENT,
  OPEN_EDIT_PROJECT_PANEL_EVENT,
};
