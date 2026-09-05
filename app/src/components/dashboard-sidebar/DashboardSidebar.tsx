'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';

import { useRouter, usePathname } from 'next/navigation';
import { useCurrentProjectContext } from '@/context/CurrentProjectContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
} from '@/components/ui/select';
import { useDashboardContext } from '@/context/DashboardContext';
import { useDashboardSectionsOptional } from '@/context/DashboardSectionsContext';
import { useSidebarStateOptional } from '@/context/SidebarStateContext';
import { ProjectIcon } from '@/components/project-icon/ProjectIcon';
import { SelectItemText } from '@radix-ui/react-select';
import { ProjectTablesList } from './ProjectTablesList';
import { SidebarFooterMenu } from './SidebarFooterMenu';
import { useRequireRole } from '@/hooks/useRequireRole';
import { UserLocalStorage } from '@/lib/userLocalStorage';

export function DashboardSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const dashboardCtx = useDashboardContext();
  const sectionsCtx = useDashboardSectionsOptional();
  const currentProjectCtx = useCurrentProjectContext();
  const sidebarState = useSidebarStateOptional();
  const { state: sidebarStateExpand, setOpenMobile, isMobile } = useSidebar();
  const router = useRouter();
  const pathname = usePathname();
  const isDashboardHome = pathname === '/dashboard';
  const { canEditTables } = useRequireRole();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const isIconOnly = sidebarStateExpand === 'collapsed';
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (sidebarState?.searchVisible) {
      const t = setTimeout(() => {
        searchInputRef.current?.focus({ preventScroll: true });
      }, 200);
      return () => clearTimeout(t);
    }
  }, [sidebarState?.searchVisible]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 200);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const selectedProject = isDashboardHome
    ? { id: 'dashboard', title: 'Dashboard', icon: 'LayoutGrid' }
    : [
        ...dashboardCtx.projects,
        ...dashboardCtx.sharedProjects,
      ].find((project) => `${project.id}` === `${currentProjectCtx.id}`);

  return (
    <Sidebar
      collapsible='icon'
      {...props}
      className='shadow-none border-r h-screen px-2 pb-2 pt-0 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center'
    >
      <SidebarHeader className='h-12 min-h-12 flex shrink-0 items-center w-full group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:w-auto'>
        <SidebarMenu className='w-full group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:w-auto'>
          <SidebarMenuItem className='w-full group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:w-auto'>
            {selectedProject ? (
              <Select
                value={isDashboardHome ? 'dashboard' : `${currentProjectCtx.id}`}
                onValueChange={(projectId) => {
                  if (projectId === 'dashboard') {
                    UserLocalStorage.preferDashboardHome();
                    router.push('/dashboard');
                    if (isMobile) setOpenMobile(false);
                    return;
                  }
                  if (`${currentProjectCtx.id}` === `${projectId}`) return;
                  router.push(`/dashboard/${projectId}`);
                  if (isMobile) setOpenMobile(false);
                }}
              >
                <SelectTrigger
                  showIcon={!isIconOnly}
                  iconVariant='up-down'
                  className='w-full min-w-0 bg-background focus:ring-0 focus-visible:ring-0 focus:outline-none focus-visible:outline-none focus-visible:border-input group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:min-w-8 group-data-[collapsible=icon]:max-w-8 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:items-center'
                  value={currentProjectCtx.id}
                >
                  <div className='font-medium text-sm flex flex-row flex-nowrap justify-start items-center gap-2 min-w-0 overflow-hidden group-data-[collapsible=icon]:justify-center'>
                    <ProjectIcon
                      color='var(--primary)'
                      className='size-4.5 shrink-0'
                      name={selectedProject.icon}
                    />
                    <span className='truncate group-data-[collapsible=icon]:hidden'>{selectedProject.title}</span>
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {sectionsCtx
                    ? (() => {
                        const currentSectionId =
                          sectionsCtx.projectSection[currentProjectCtx.id] ?? 'main';
                        const orderedIds = sectionsCtx.sectionOrder[currentSectionId] ?? [];
                        const byOrder = orderedIds
                          .map((id) => dashboardCtx.projects.find((p) => String(p.id) === id))
                          .filter(Boolean) as { id: string; title: string; icon: string }[];
                        const bySection = dashboardCtx.projects.filter(
                          (p) => (sectionsCtx.projectSection[p.id] ?? 'main') === currentSectionId
                        );
                        const seen = new Set(byOrder.map((p) => p.id));
                        const currentSectionProjects = [
                          ...byOrder,
                          ...bySection.filter((p) => !seen.has(p.id)),
                        ];
                        return (
                          <>
                            {currentSectionProjects.map((project) => (
                              <SelectItem
                                className='text-primary'
                                key={project.id}
                                value={project.id}
                              >
                                <ProjectIcon
                                  color='var(--primary)'
                                  className='size-4.5'
                                  name={project.icon}
                                />
                                <SelectItemText>{project.title}</SelectItemText>
                              </SelectItem>
                            ))}
                          </>
                        );
                      })()
                    : dashboardCtx.projects.map((project) => (
                        <SelectItem
                          className='text-primary'
                          key={project.id}
                          value={project.id}
                        >
                          <ProjectIcon
                            color='var(--primary)'
                            className='size-4.5'
                            name={project.icon}
                          />
                          <SelectItemText>{project.title}</SelectItemText>
                        </SelectItem>
                      ))}
                  {dashboardCtx.sharedProjects.length > 0 && (
                    <>
                      <SelectSeparator />
                      <div className='px-2 py-1.5 text-xs font-medium text-muted-foreground'>
                        Shared
                      </div>
                      {dashboardCtx.sharedProjects.map((project) => (
                        <SelectItem
                          className='text-primary'
                          key={project.id}
                          value={project.id}
                        >
                          <ProjectIcon
                            color='var(--primary)'
                            className='size-4.5'
                            name={project.icon}
                          />
                          <SelectItemText>{project.title}</SelectItemText>
                        </SelectItem>
                      ))}
                    </>
                  )}
                  <SelectSeparator />
                  <SelectItem value='dashboard'>
                    <ProjectIcon color='var(--primary)' className='size-4.5' name='LayoutGrid' />
                    <SelectItemText>Dashboard</SelectItemText>
                  </SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <div className='h-9 pl-2 flex flex-row justify-start items-center'>
                {/*<LoadingIndicator className='size-5' />*/}
              </div>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      {sidebarState?.searchVisible && (
        <div className='px-2 pt-2 group-data-[collapsible=icon]:hidden'>
          <div className='relative flex h-8 items-center gap-1'>
            <Search className='absolute left-0 size-4 shrink-0 text-muted-foreground pointer-events-none' />
            <input
              ref={searchInputRef}
              type='text'
              placeholder='Search'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className='h-8 min-w-0 flex-1 border-0 bg-transparent pl-6 pr-8 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-0'
              aria-label='Search tables'
            />
            <button
              type='button'
              onClick={() => {
                setSearchQuery('');
                setDebouncedSearchQuery('');
                sidebarState?.setSearchVisible(false);
              }}
              className='absolute right-0 flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground'
              aria-label='Close search'
            >
              <X className='size-4' />
            </button>
          </div>
        </div>
      )}
      <SidebarContent className='mt-0 gap-0 flex-1 min-h-0 w-full group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:w-auto'>
        {dashboardCtx.initialized && (
          <>
            {currentProjectCtx.initialized ? (
              <>
                <ProjectTablesList
                  canEditTables={canEditTables}
                  searchQuery={debouncedSearchQuery}
                />
              </>
            ) : (
              <div className='w-full h-8 flex justify-center items-center' />
            )}
          </>
        )}
      </SidebarContent>
      {sidebarState && <SidebarFooterMenu />}
    </Sidebar>
  );
}
