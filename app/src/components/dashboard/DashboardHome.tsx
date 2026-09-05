'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  type DragEndEvent,
  type DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import { arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import {
  LucideEllipsis,
  LucidePlus,
  LucideCog,
  LucideLogOut,
  LucidePencil,
  LucideTrash2,
  LucideFolderOpen,
  LucideGripVertical,
  LucideFolder,
  LucideDatabase,
  LucideLayoutList,
  LucideX,
} from 'lucide-react';
import { useAuthContext } from '@/context/AuthContext';
import { useDashboardContext } from '@/context/DashboardContext';
import { useDashboardSections } from '@/context/DashboardSectionsContext';
import { useLanguage } from '@/context/LanguageContext';
import { ProjectIcon } from '@/components/project-icon/ProjectIcon';
import { openUserSettingsDialog } from '@/components/settings-dialog/SettingsDialog';
import { NewProjectDialog } from './NewProjectDialog';
import { NewSectionDialog } from './NewSectionDialog';
import { RenameSectionDialog } from './RenameSectionDialog';
import { ConnectDialog } from './ConnectDialog';
import {
  DeleteProjectConfirmDialog,
  openDeleteProjectConfirmDialog,
} from '@/components/projects-editor/DeleteProjectConfirmDialog';
import { openEditProjectPanel } from '@/components/projects-editor/EditProjectPanel';
import { callApi } from '@/lib/api';
import { UserLocalStorage } from '@/lib/userLocalStorage';
import { dadixEvents } from '@/constants/events';
import { cn } from '@/lib/utils';

type ProjectItem = { id: string; title: string; icon: string; order?: number };

export function DashboardHome() {
  const { t } = useLanguage();
  const router = useRouter();
  const authCtx = useAuthContext();
  const dashboardCtx = useDashboardContext();
  const sectionsCtx = useDashboardSections();
  const [searchQuery, setSearchQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [plusDropdownOpen, setPlusDropdownOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newSectionOpen, setNewSectionOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    project: ProjectItem;
  } | null>(null);
  const [renameSectionOpen, setRenameSectionOpen] = useState(false);
  const [renameSectionTarget, setRenameSectionTarget] = useState<{ id: string; name: string } | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<Set<string>>(() => new Set());
  const [newProjectSectionId, setNewProjectSectionId] = useState<string | null>(null);
  const justDraggedSectionRef = useRef(false);

  const ownProjects = dashboardCtx.projects;
  const sharedProjects = dashboardCtx.sharedProjects;
  const { sections, sectionOrder, projectSection, moveProjectToSection, addSection, renameSection, removeSection, reorderSections } = sectionsCtx;

  const activeProjectId = activeDragId && !activeDragId.startsWith('section-') ? activeDragId : null;
  const activeSectionId = activeDragId?.startsWith('section-') ? activeDragId.replace(/^section-/, '') : null;
  const minimizeAllForSectionDrag = Boolean(activeDragId?.startsWith('section-'));

  // Ensure every own project is in a section (default main) and in sectionOrder
  useEffect(() => {
    const mainOrder = sectionOrder.main ?? [];
    const allOrdered = sections.flatMap((s) => sectionOrder[s.id] ?? []);
    const missing = ownProjects.filter((p) => !allOrdered.includes(String(p.id)));
    if (missing.length > 0) {
      missing.forEach((p) => {
        const id = String(p.id);
        moveProjectToSection(id, 'main', mainOrder.length);
      });
    }
  }, [ownProjects.length, sections, sectionOrder, projectSection, moveProjectToSection]);

  // Sections with their projects (search filters only projects, sections always shown)
  const sectionsWithProjects = sections.map((section) => {
    const projectIds = sectionOrder[section.id] ?? [];
    const sectionProjects = projectIds
      .map((id) => ownProjects.find((p) => String(p.id) === id))
      .filter(Boolean) as ProjectItem[];
    const filtered = searchQuery.trim()
      ? sectionProjects.filter((p) =>
          (p.title ?? '').toLowerCase().includes(searchQuery.trim().toLowerCase())
        )
      : sectionProjects;
    return { section, projects: filtered };
  });

  const isReorderEnabled = !searchQuery.trim() && ownProjects.length > 0;
  const isSearchMode = searchQuery.trim().length > 0;
  const flatFilteredProjects = isSearchMode
    ? sectionsWithProjects.flatMap((sp) => sp.projects)
    : [];
  const sharedFilteredInSearch = isSearchMode
    ? sharedProjects.filter((p) =>
        (p.title ?? '').toLowerCase().includes(searchQuery.trim().toLowerCase())
      )
    : sharedProjects;
  const updateOrderTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 100, distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      const activeId = String(active.id);

      if (activeId.startsWith('section-')) {
        justDraggedSectionRef.current = true;
        setTimeout(() => {
          justDraggedSectionRef.current = false;
        }, 100);
        if (over) {
          const overId = String(over.id);
          const sectionIds = sections.map((s) => s.id);
          const activeSectionIdRaw = activeId.replace(/^section-/, '');
          const oldIndex = sectionIds.indexOf(activeSectionIdRaw);
          let overSectionIndex: number;
          if (overId.startsWith('section-')) {
            overSectionIndex = sectionIds.indexOf(overId.replace(/^section-/, ''));
          } else {
            const overProjectSection = projectSection[overId] ?? 'main';
            overSectionIndex = sectionIds.indexOf(overProjectSection);
          }
          if (oldIndex >= 0 && overSectionIndex >= 0 && oldIndex !== overSectionIndex) {
            const newOrder = arrayMove(sectionIds, oldIndex, overSectionIndex);
            reorderSections(newOrder);
          }
        }
      } else {
        if (over) {
          const overId = String(over.id);
          if (activeId === overId) {
            setActiveDragId(null);
            return;
          }
          if (overId.startsWith('section-')) {
            const sectionId = overId.replace(/^section-/, '');
            moveProjectToSection(activeId, sectionId, 999);
            window.dispatchEvent(
              new CustomEvent(dadixEvents.projectEvents.onPatch, {
                detail: { projectId: activeId, data: { order: 0 } },
              })
            );
            clearTimeout(updateOrderTimeoutRef.current);
            updateOrderTimeoutRef.current = setTimeout(() => {
              callApi.patch(`/project/${activeId}`, { data: { order: 0 } }).catch(() => {});
            }, 300);
          } else {
            const overProject = ownProjects.find((p) => String(p.id) === overId);
            if (overProject) {
              const targetSection = projectSection[overId] ?? 'main';
              const targetOrder = sectionOrder[targetSection] ?? [];
              const index = targetOrder.indexOf(overId);
              const newIndex = index >= 0 ? index : targetOrder.length;
              moveProjectToSection(activeId, targetSection, newIndex);
              window.dispatchEvent(
                new CustomEvent(dadixEvents.projectEvents.onPatch, {
                  detail: { projectId: activeId, data: { order: newIndex } },
                })
              );
              clearTimeout(updateOrderTimeoutRef.current);
              updateOrderTimeoutRef.current = setTimeout(() => {
                callApi
                  .patch(`/project/${activeId}`, { data: { order: newIndex } })
                  .then((res) => {
                    if (res.status !== 200) throw new Error('Error saving project order');
                    return res;
                  })
                  .catch(() => {});
              }, 300);
            }
          }
        }
      }
      setActiveDragId(null);
    },
    [ownProjects, projectSection, sectionOrder, moveProjectToSection, sections, reorderSections]
  );

  const activeProject = activeProjectId ? ownProjects.find((p) => String(p.id) === activeProjectId) : null;

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

  return (
    <div className='flex flex-col h-full w-full bg-background'>
      {/* Header: Dadix left, Search center, Plus + Menu right */}
      <header className='grid grid-cols-[1fr_minmax(36rem,1fr)_1fr] items-center gap-4 w-full shrink-0 h-14 min-h-14 px-6 py-2.5 bg-background/95 backdrop-blur'>
        <div className='min-w-0'>
          <Link
            href='/dashboard'
            onClick={() => UserLocalStorage.preferDashboardHome()}
            className='text-lg font-semibold text-foreground hover:opacity-80 transition-opacity'
          >
            Dadix
          </Link>
        </div>

        <div className='w-full min-w-0 flex justify-center'>
          <div className='flex h-9 w-full max-w-xl items-center overflow-hidden rounded-md border border-input bg-background pl-3 pr-1 shadow-sm hover:bg-accent/5 [&_input]:h-auto [&_input]:py-0'>
            <Input
              type='text'
              placeholder={t('dashboard.search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className='flex-1 min-w-0 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0'
              aria-label={t('dashboard.search')}
            />
            {searchQuery.trim() ? (
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='size-7 shrink-0 rounded-sm'
                onClick={() => setSearchQuery('')}
                aria-label='Clear search'
              >
                <LucideX className='size-4' />
              </Button>
            ) : null}
          </div>
        </div>

        <div className='flex items-center justify-end gap-1 min-w-0'>
          <DropdownMenu open={plusDropdownOpen} onOpenChange={setPlusDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant='outline' size='icon' className='size-9 shrink-0'>
                <LucidePlus className='size-4' />
                <span className='sr-only'>Add</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-40 z-[100]'>
              <DropdownMenuItem
                onClick={() => {
                  setPlusDropdownOpen(false);
                  setNewProjectOpen(true);
                }}
              >
                <LucideFolder className='size-4' />
                <span>{t('dashboard.plus.project')}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setPlusDropdownOpen(false);
                  setNewSectionOpen(true);
                }}
              >
                <LucideLayoutList className='size-4' />
                <span>{t('dashboard.plus.section')}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setPlusDropdownOpen(false);
                  setConnectOpen(true);
                }}
              >
                <LucideDatabase className='size-4' />
                <span>{t('dashboard.plus.connect')}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant='outline' size='icon' className='size-9'>
                <LucideEllipsis className='size-4' />
                <span className='sr-only'>Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-40 z-[100]'>
              <DropdownMenuItem
                onClick={() => {
                  setDropdownOpen(false);
                  openUserSettingsDialog();
                }}
              >
                <LucideCog className='size-4' />
                <span>{t('nav.settings')}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => authCtx.methods.logout()}>
                <LucideLogOut className='size-4' />
                {t('nav.logout')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Projects: when search active = flat list only (like sidebar); else sections */}
      <main className='flex-1 overflow-auto p-6'>
        {ownProjects.length === 0 && sharedProjects.length === 0 ? (
          <div className='flex flex-col items-center justify-center gap-4 py-16 text-center'>
            <p className='text-muted-foreground'>{t('dashboard.noProjects')}</p>
            <Button variant='outline' onClick={() => setNewProjectOpen(true)}>
              <LucidePlus className='size-4' />
              {t('dashboard.newProject')}
            </Button>
          </div>
        ) : (
          <div className='flex justify-center w-full max-w-xl mx-auto'>
            <div className='w-full flex flex-col gap-6'>
              {isSearchMode ? (
                <>
                  {flatFilteredProjects.map((project) => (
                    <NormalListRow
                      key={project.id}
                      project={project}
                      sections={sections}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setContextMenu({ x: e.clientX, y: e.clientY, project });
                      }}
                      onOpen={() => router.push(`/dashboard/${project.id}`)}
                      onEdit={() => openEditProjectPanel({ projectId: project.id })}
                      onMoveToSection={(sectionId) => moveProjectToSection(project.id, sectionId, 999)}
                      onRemove={() => openDeleteProjectConfirmDialog({ projectId: project.id })}
                    />
                  ))}
                  {sharedFilteredInSearch.length > 0 && (
                    <div className='flex flex-col gap-1'>
                      <div className='text-xs font-medium text-muted-foreground px-2 py-1'>
                        Shared
                      </div>
                      {sharedFilteredInSearch.map((project) => (
                        <NormalListRow
                          key={project.id}
                          project={project}
                          sections={sections}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setContextMenu({ x: e.clientX, y: e.clientY, project });
                          }}
                          onOpen={() => router.push(`/dashboard/${project.id}`)}
                          onEdit={() => openEditProjectPanel({ projectId: project.id })}
                          onMoveToSection={(sectionId) => moveProjectToSection(project.id, sectionId, 999)}
                          onRemove={() => openDeleteProjectConfirmDialog({ projectId: project.id })}
                        />
                      ))}
                    </div>
                  )}
                </>
              ) : isReorderEnabled ? (
                <DndContext
                  collisionDetection={rectIntersection}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  sensors={sensors}
                >
                  {sectionsWithProjects.map(({ section, projects: sectionProjects }) =>
                    isReorderEnabled ? (
                      <SortableSectionBlock
                        key={section.id}
                        section={section}
                        projects={sectionProjects}
                        allSections={sections}
                        canRemove={sections.length > 1}
                        collapsed={collapsedSectionIds.has(section.id) || minimizeAllForSectionDrag}
                        onToggleCollapse={() => {
                          if (justDraggedSectionRef.current) return;
                          setCollapsedSectionIds((prev) => {
                            const n = new Set(prev);
                            if (n.has(section.id)) n.delete(section.id);
                            else n.add(section.id);
                            return n;
                          });
                        }}
                        onNewProject={() => {
                          setNewProjectSectionId(section.id);
                          setNewProjectOpen(true);
                        }}
                        onRename={() => {
                          setRenameSectionTarget({ id: section.id, name: section.name });
                          setRenameSectionOpen(true);
                        }}
                        onRemove={() => removeSection(section.id)}
                        onContextMenu={(e, project) => {
                          e.preventDefault();
                          setContextMenu({ x: e.clientX, y: e.clientY, project });
                        }}
                        onOpen={(project) => router.push(`/dashboard/${project.id}`)}
                        onEditProject={(project) => openEditProjectPanel({ projectId: project.id })}
                        onMoveProjectToSection={(projectId, sectionId) => moveProjectToSection(projectId, sectionId, 999)}
                        onRemoveProject={(project) => openDeleteProjectConfirmDialog({ projectId: project.id })}
                      />
                    ) : (
                      <SectionBlock
                        key={section.id}
                        section={section}
                        projects={sectionProjects}
                        allSections={sections}
                        canRemove={sections.length > 1}
                        collapsed={collapsedSectionIds.has(section.id)}
                        onToggleCollapse={() => {
                          setCollapsedSectionIds((prev) => {
                            const n = new Set(prev);
                            if (n.has(section.id)) n.delete(section.id);
                            else n.add(section.id);
                            return n;
                          });
                        }}
                        onNewProject={() => {
                          setNewProjectSectionId(section.id);
                          setNewProjectOpen(true);
                        }}
                        onRename={() => {
                          setRenameSectionTarget({ id: section.id, name: section.name });
                          setRenameSectionOpen(true);
                        }}
                        onRemove={() => removeSection(section.id)}
                        onContextMenu={(e, project) => {
                          e.preventDefault();
                          setContextMenu({ x: e.clientX, y: e.clientY, project });
                        }}
                        onOpen={(project) => router.push(`/dashboard/${project.id}`)}
                        onEditProject={(project) => openEditProjectPanel({ projectId: project.id })}
                        onMoveProjectToSection={(projectId, sectionId) => moveProjectToSection(projectId, sectionId, 999)}
                        onRemoveProject={(project) => openDeleteProjectConfirmDialog({ projectId: project.id })}
                      />
                    )
                  )}
                  {sharedProjects.length > 0 && (
                    <div className='flex flex-col gap-1'>
                      <div className='text-xs font-medium text-muted-foreground px-2 py-1'>
                        Shared
                      </div>
                      {sharedProjects.map((project) => (
                        <NormalListRow
                          key={project.id}
                          project={project}
                          sections={sections}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setContextMenu({ x: e.clientX, y: e.clientY, project });
                          }}
                          onOpen={() => router.push(`/dashboard/${project.id}`)}
                          onEdit={() => openEditProjectPanel({ projectId: project.id })}
                          onMoveToSection={(sectionId) => moveProjectToSection(project.id, sectionId, 999)}
                          onRemove={() => openDeleteProjectConfirmDialog({ projectId: project.id })}
                        />
                      ))}
                    </div>
                  )}
                  <DragOverlay dropAnimation={null}>
                    {activeSectionId ? (
                      (() => {
                        const section = sections.find((s) => s.id === activeSectionId);
                        if (!section) return null;
                        return (
                          <div className='flex items-center gap-2 px-3 py-2 rounded-lg min-h-10 bg-background/95 shadow-lg border border-border cursor-grabbing'>
                            <span className='text-sm font-medium text-muted-foreground truncate flex-1 min-w-0'>
                              {section.name}
                            </span>
                          </div>
                        );
                      })()
                    ) : activeProject ? (
                      <div className='flex items-center gap-3 w-full px-4 py-3 rounded-lg bg-muted/90 shadow-lg border border-border cursor-grabbing'>
                        <div className='shrink-0 p-1'>
                          <LucideGripVertical className='size-4 text-muted-foreground' />
                        </div>
                        <ProjectIcon name={activeProject.icon} className='size-8 text-primary shrink-0' />
                        <span className='text-sm font-medium truncate flex-1 min-w-0'>{activeProject.title}</span>
                      </div>
                    ) : null}
                  </DragOverlay>
                </DndContext>
              ) : (
                <>
                  {sectionsWithProjects.map(({ section, projects: sectionProjects }) => (
                    <div key={section.id} className='flex flex-col gap-1'>
                      <div className='text-xs font-medium text-muted-foreground px-2 py-1'>
                        {section.name}
                      </div>
                      {sectionProjects.map((project) => (
                        <div
                          key={project.id}
                          role='button'
                          tabIndex={0}
                          onClick={() => router.push(`/dashboard/${project.id}`)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setContextMenu({ x: e.clientX, y: e.clientY, project });
                          }}
                          className={cn(
                            'flex items-center gap-3 w-full pl-4 pr-4 py-3 rounded-lg bg-muted/60 hover:bg-muted transition-colors cursor-pointer text-left'
                          )}
                        >
                          <div className='w-6 shrink-0' />
                          <ProjectIcon name={project.icon} className='size-8 text-primary shrink-0' />
                          <span className='text-sm font-medium truncate flex-1 min-w-0'>
                            {project.title}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                  {sharedProjects.length > 0 && (
                    <div className='flex flex-col gap-1'>
                      <div className='text-xs font-medium text-muted-foreground px-2 py-1'>
                        Shared
                      </div>
                      {sharedProjects.map((project) => (
                        <NormalListRow
                          key={project.id}
                          project={project}
                          sections={sections}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setContextMenu({ x: e.clientX, y: e.clientY, project });
                          }}
                          onOpen={() => router.push(`/dashboard/${project.id}`)}
                          onEdit={() => openEditProjectPanel({ projectId: project.id })}
                          onMoveToSection={(sectionId) => moveProjectToSection(project.id, sectionId, 999)}
                          onRemove={() => openDeleteProjectConfirmDialog({ projectId: project.id })}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </main>

      {contextMenu && (
        <div
          className='fixed z-[200] min-w-36 rounded-md border bg-popover p-1 text-popover-foreground shadow-md'
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            variant='ghost'
            className='w-full justify-start'
            size='sm'
            onClick={() => {
              router.push(`/dashboard/${contextMenu.project.id}`);
              setContextMenu(null);
            }}
          >
            <LucideFolderOpen className='size-4' />
            {t('dashboard.open')}
          </Button>
          <Button
            variant='ghost'
            className='w-full justify-start'
            size='sm'
            onClick={() => {
              openEditProjectPanel({ projectId: contextMenu.project.id });
              setContextMenu(null);
            }}
          >
            <LucidePencil className='size-4' />
            {t('common.edit')}
          </Button>
          <Button
            variant='ghost'
            className='w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive'
            size='sm'
            onClick={() => {
              openDeleteProjectConfirmDialog({ projectId: contextMenu.project.id });
              setContextMenu(null);
            }}
          >
            <LucideTrash2 className='size-4' />
            {t('common.delete')}
          </Button>
        </div>
      )}

      <NewProjectDialog
        open={newProjectOpen}
        onOpenChange={(open) => {
          setNewProjectOpen(open);
          if (!open) setNewProjectSectionId(null);
        }}
        initialSectionId={newProjectSectionId ?? undefined}
        onCreated={(projectId, sectionId) => {
          if (sectionId) moveProjectToSection(projectId, sectionId, 999);
          setNewProjectSectionId(null);
        }}
      />
      <NewSectionDialog
        open={newSectionOpen}
        onOpenChange={setNewSectionOpen}
        onConfirm={(name) => addSection(name)}
      />
      <RenameSectionDialog
        open={renameSectionOpen}
        onOpenChange={setRenameSectionOpen}
        sectionId={renameSectionTarget?.id ?? null}
        sectionName={renameSectionTarget?.name ?? ''}
        onConfirm={(sectionId, newName) => {
          renameSection(sectionId, newName);
          setRenameSectionOpen(false);
          setRenameSectionTarget(null);
        }}
      />
      <ConnectDialog open={connectOpen} onOpenChange={setConnectOpen} />
      <DeleteProjectConfirmDialog />
    </div>
  );
}

function SortableSectionBlock({
  section,
  projects,
  allSections,
  canRemove,
  collapsed,
  onToggleCollapse,
  onNewProject,
  onRename,
  onRemove,
  onContextMenu,
  onOpen,
  onEditProject,
  onMoveProjectToSection,
  onRemoveProject,
}: {
  section: { id: string; name: string; order: number };
  projects: ProjectItem[];
  allSections: { id: string; name: string; order: number }[];
  canRemove: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNewProject: () => void;
  onRename: () => void;
  onRemove: () => void;
  onContextMenu: (e: React.MouseEvent, project: ProjectItem) => void;
  onOpen: (project: ProjectItem) => void;
  onEditProject: (project: ProjectItem) => void;
  onMoveProjectToSection: (projectId: string, sectionId: string) => void;
  onRemoveProject: (project: ProjectItem) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `section-${section.id}` });
  return (
    <SectionBlock
      section={section}
      projects={projects}
      allSections={allSections}
      canRemove={canRemove}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      onNewProject={onNewProject}
      onRename={onRename}
      onRemove={onRemove}
      onContextMenu={onContextMenu}
      onOpen={onOpen}
      onEditProject={onEditProject}
      onMoveProjectToSection={onMoveProjectToSection}
      onRemoveProject={onRemoveProject}
      sectionHeaderSortable={{
        setNodeRef: setSortableRef,
        attributes,
        listeners,
        transform,
        transition,
        isDragging,
      }}
    />
  );
}

function SectionBlock({
  section,
  projects,
  allSections,
  canRemove,
  collapsed,
  onToggleCollapse,
  onNewProject,
  onRename,
  onRemove,
  onContextMenu,
  onOpen,
  onEditProject,
  onMoveProjectToSection,
  onRemoveProject,
  sectionHeaderSortable,
}: {
  section: { id: string; name: string; order: number };
  projects: ProjectItem[];
  allSections: { id: string; name: string; order: number }[];
  canRemove: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNewProject: () => void;
  onRename: () => void;
  onRemove: () => void;
  onContextMenu: (e: React.MouseEvent, project: ProjectItem) => void;
  onOpen: (project: ProjectItem) => void;
  onEditProject: (project: ProjectItem) => void;
  onMoveProjectToSection: (projectId: string, sectionId: string) => void;
  onRemoveProject: (project: ProjectItem) => void;
  sectionHeaderSortable?: {
    setNodeRef: (el: HTMLElement | null) => void;
    attributes: Record<string, unknown>;
    listeners: Record<string, unknown>;
    transform: { x: number; y: number; scaleX: number; scaleY: number } | null;
    transition: string | undefined;
    isDragging: boolean;
  };
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `section-${section.id}` });

  const headerContent = (
    <>
      <button
        type='button'
        onClick={onToggleCollapse}
        className='text-sm font-medium text-muted-foreground hover:text-foreground truncate text-left flex-1 min-w-0'
      >
        {section.name}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            size='icon'
            className='size-8 shrink-0 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 transition-opacity'
          >
            <LucideEllipsis className='size-4' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem onClick={onNewProject}>
            <LucideFolder className='size-4' />
            New Project
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onRename}>
            <LucidePencil className='size-4' />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onRemove}
            disabled={!canRemove}
            className='text-destructive focus:text-destructive'
          >
            <LucideTrash2 className='size-4' />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );

  const headerEl = (
    <div
      ref={sectionHeaderSortable ? sectionHeaderSortable.setNodeRef : undefined}
      style={
        sectionHeaderSortable
          ? {
              transform: CSS.Transform.toString(sectionHeaderSortable.transform),
              transition: sectionHeaderSortable.transition,
            }
          : undefined
      }
      className={cn(
        'group flex items-center gap-2 px-4 py-2 rounded-lg min-h-10 transition-colors',
        isOver && 'bg-primary/15 ring-2 ring-primary/30',
        sectionHeaderSortable?.isDragging && 'opacity-40'
      )}
      {...(sectionHeaderSortable ? sectionHeaderSortable.attributes : {})}
      {...(sectionHeaderSortable ? sectionHeaderSortable.listeners : {})}
    >
      {headerContent}
    </div>
  );

  return (
    <div ref={setNodeRef} className='flex flex-col gap-1'>
      {headerEl}
      {!collapsed &&
        projects.map((project) => (
          <SortableListRow
            key={project.id}
            project={project}
            sections={allSections}
            onContextMenu={(e) => onContextMenu(e, project)}
            onOpen={() => onOpen(project)}
            onEdit={() => onEditProject(project)}
            onMoveToSection={(sectionId) => onMoveProjectToSection(project.id, sectionId)}
            onRemove={() => onRemoveProject(project)}
          />
        ))}
    </div>
  );
}

function SortableListRow({
  project,
  sections,
  onContextMenu,
  onOpen,
  onEdit,
  onMoveToSection,
  onRemove,
}: {
  project: ProjectItem & { order?: number };
  sections: { id: string; name: string; order: number }[];
  onContextMenu: (e: React.MouseEvent) => void;
  onOpen: () => void;
  onEdit: () => void;
  onMoveToSection: (sectionId: string) => void;
  onRemove: () => void;
}) {
  const { t } = useLanguage();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      role='button'
      tabIndex={0}
      onClick={onOpen}
      onContextMenu={onContextMenu}
      className={cn(
        'group flex items-center gap-3 w-full px-4 py-3 rounded-lg bg-muted/60 hover:bg-muted transition-colors cursor-pointer text-left',
        isDragging && 'opacity-40'
      )}
    >
      <div
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className='shrink-0 cursor-grab active:cursor-grabbing p-1 -ml-1'
      >
        <LucideGripVertical className='size-4 text-muted-foreground' />
      </div>
      <ProjectIcon name={project.icon} className='size-8 text-primary shrink-0' />
      <Link
        href={`/dashboard/${project.id}`}
        className='text-sm font-medium truncate flex-1 min-w-0'
        onClick={(e) => e.stopPropagation()}
      >
        {project.title}
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            size='icon'
            className='size-8 shrink-0 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 transition-opacity'
            onClick={(e) => e.stopPropagation()}
          >
            <LucideEllipsis className='size-4' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onOpen(); }}>
            <LucideFolderOpen className='size-4' />
            {t('dashboard.open')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
            <LucidePencil className='size-4' />
            {t('common.edit')}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger onClick={(e) => e.stopPropagation()}>
              <LucideLayoutList className='size-4' />
              {t('dashboard.move')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className='min-w-[11rem]'>
              {sections.map((sec) => (
                <DropdownMenuItem
                  key={sec.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveToSection(sec.id);
                  }}
                >
                  {sec.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem
            className='text-destructive focus:text-destructive'
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
          >
            <LucideTrash2 className='size-4' />
            {t('common.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function NormalListRow({
  project,
  sections,
  onContextMenu,
  onOpen,
  onEdit,
  onMoveToSection,
  onRemove,
}: {
  project: ProjectItem;
  sections: { id: string; name: string; order: number }[];
  onContextMenu: (e: React.MouseEvent) => void;
  onOpen: () => void;
  onEdit: () => void;
  onMoveToSection: (sectionId: string) => void;
  onRemove: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div
      role='button'
      tabIndex={0}
      onClick={onOpen}
      onContextMenu={onContextMenu}
      className={cn(
        'group flex items-center gap-3 w-full px-4 py-3 rounded-lg bg-muted/60 hover:bg-muted transition-colors cursor-pointer text-left pl-4'
      )}
    >
      <div className='w-6 shrink-0' />
      <ProjectIcon name={project.icon} className='size-8 text-primary shrink-0' />
      <Link
        href={`/dashboard/${project.id}`}
        className='text-sm font-medium truncate flex-1 min-w-0'
        onClick={(e) => e.stopPropagation()}
      >
        {project.title}
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            size='icon'
            className='size-8 shrink-0 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 transition-opacity'
            onClick={(e) => e.stopPropagation()}
          >
            <LucideEllipsis className='size-4' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onOpen(); }}>
            <LucideFolderOpen className='size-4' />
            {t('dashboard.open')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
            <LucidePencil className='size-4' />
            {t('common.edit')}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger onClick={(e) => e.stopPropagation()}>
              <LucideLayoutList className='size-4' />
              {t('dashboard.move')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className='min-w-[11rem]'>
              {sections.map((sec) => (
                <DropdownMenuItem
                  key={sec.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveToSection(sec.id);
                  }}
                >
                  {sec.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem
            className='text-destructive focus:text-destructive'
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
          >
            <LucideTrash2 className='size-4' />
            {t('common.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
