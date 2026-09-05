'use client';
//
// this context contains a list of all projects belong to current logged in user
//

import { createContext, useContext, useEffect, useState } from 'react';

import { dadixEvents } from '@/constants/events';
import { callApi } from '@/lib/api';
import { DEV_DEMO_PROJECT, getLocalProjects, saveLocalProject } from '@/lib/dev-demo-data';

import type { MemberRole } from '@/types';

interface Project {
  id: string;
  title: string;
  icon: string;
  order: number;
  role: MemberRole;
}

interface IDashboardContext {
  projects: Project[];
  sharedProjects: Project[];
  isLoading: boolean;
  initialized: boolean;
}

const DashboardContext = createContext<IDashboardContext>({
  projects: [],
  sharedProjects: [],
  isLoading: true,
  initialized: false,
});

export function DashboardContextProvider({
  children,
}: {
  children?: React.ReactNode;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [sharedProjects, setSharedProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [initialized, setInitialized] = useState<boolean>(false);

  useEffect(() => {
    // Lokale Demo: keine /project-API (vermeidet 401 wenn DB/Auth offline)
    if (process.env.NODE_ENV === 'development') {
      setProjects([{ ...DEV_DEMO_PROJECT } as Project, ...getLocalProjects()]);
      setSharedProjects([]);
      setIsLoading(false);
      setInitialized(true);
      return;
    }

    callApi
      .get('/project')
      .then((res) => {
        if (res?.data.projects) {
          setProjects(
            res.data.projects
              .filter((project: Project) => project.role === 'Owner')
              .sort(
                (project1: Project, project2: Project) =>
                  project1.order - project2.order
              )
              .map((project: Project, index: number) => ({
                ...project,
                order: index,
              }))
          );
          setSharedProjects(
            res.data.projects.filter(
              (project: Project) => project.role !== 'Owner'
            )
          );
        }
        setIsLoading(false);
        setInitialized(true);
        return res;
      })
      .catch((err) => {
        console.error(err);
        setProjects([]);
        setSharedProjects([]);
        setIsLoading(false);
        setInitialized(true);
      });
  }, []);

  useEffect(() => {
    // handle create new project event
    window.addEventListener(
      dadixEvents.projectEvents.onCreate,
      handleCreateProjectEvent
    );
    return () => {
      window.removeEventListener(
        dadixEvents.projectEvents.onCreate,
        handleCreateProjectEvent
      );
    };
    function handleCreateProjectEvent(evnt: Event) {
      const { createdProject } = (evnt as CustomEvent).detail || {};
      if (!createdProject) return;
      if (process.env.NODE_ENV === 'development' && createdProject.id) {
        saveLocalProject({
          id: String(createdProject.id),
          title: createdProject.title,
          icon: createdProject.icon,
          order: createdProject.order ?? 0,
          role: 'Owner',
        });
      }
      // update project in state
      setProjects((projects) => {
        return [
          ...projects,
          {
            id: createdProject.id,
            title: createdProject.title,
            icon: createdProject.icon,
            order: createdProject.order,
            role: 'Owner',
          },
        ];
      });
    }
  }, [projects]);

  useEffect(() => {
    // handle delete project event
    window.addEventListener(
      dadixEvents.projectEvents.onDelete,
      handleDeleteProjectEvent
    );
    return () => {
      window.removeEventListener(
        dadixEvents.projectEvents.onDelete,
        handleDeleteProjectEvent
      );
    };
    function handleDeleteProjectEvent(evnt: Event) {
      const { projectId } = (evnt as CustomEvent).detail || {};
      if (!projectId) return;
      const deletedProject = projects.filter(
        (project) => `${project.id}` === `${projectId}`
      )[0];
      if (!deletedProject) return;
      const deletedProjectOrder = deletedProject.order;
      // update projects in state
      setProjects((projects) => {
        return projects
          .filter((project) => `${project.id}` !== `${projectId}`)
          .map((project) => {
            if (project.order > deletedProjectOrder) {
              return { ...project, order: project.order - 1 };
            }
            return { ...project };
          })
          .sort((project1, project2) => project1.order - project2.order);
      });
    }
  }, [projects]);

  useEffect(() => {
    // handle update project event
    window.addEventListener(
      dadixEvents.projectEvents.onPatch,
      handleUpdateProjectEvent
    );
    return () => {
      window.removeEventListener(
        dadixEvents.projectEvents.onPatch,
        handleUpdateProjectEvent
      );
    };
    function handleUpdateProjectEvent(evnt: Event) {
      const { projectId, data } = (evnt as CustomEvent).detail || {};
      if (!projectId || !data) return;
      const allowedFieldsToUpdate = ['title', 'icon', 'order'];
      const fieldsToUpdate = Object.keys(data);
      if (
        fieldsToUpdate.filter(
          (field) => allowedFieldsToUpdate.indexOf(field) < 0
        ).length > 0
      )
        return;

      // check if project exist
      const projectToUpdate = projects.filter(
        (project) => `${project.id}` === `${projectId}`
      )[0];
      if (!projectToUpdate) return;
      const updates = { [`${projectId}`]: data };
      // check if order updated
      if (fieldsToUpdate.indexOf('order') >= 0) {
        // update reordered projects order
        const fromOrder = projectToUpdate.order;
        const toOrder = data.order;
        const reorderDirection = Math.sign(fromOrder - toOrder);
        const minOrder = fromOrder < toOrder ? fromOrder : toOrder - 1;
        const maxOrder = toOrder < fromOrder ? fromOrder : toOrder + 1;
        projects.map((project) => {
          if (project.order > minOrder && project.order < maxOrder) {
            updates[`${project.id}`] = {
              ...(updates[`${project.id}`] || {}),
              order: project.order + reorderDirection,
            };
          }
          return null;
        });
      }
      const projectsToUpdates = Object.keys(updates);
      // update project in state
      setProjects((projects) => {
        return projects
          .map((project) => {
            if (projectsToUpdates.indexOf(`${project.id}`) >= 0) {
              return { ...project, ...updates[`${project.id}`] };
            }
            return { ...project };
          })
          .sort((project1, project2) => project1.order - project2.order);
      });
    }
  }, [projects]);

  return (
    <DashboardContext.Provider
      value={{ projects, sharedProjects, isLoading, initialized }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboardContext() {
  const context = useContext(DashboardContext);
  if (context === undefined) {
    throw new Error(
      'useDashboardContext must be used within a DashboardContextProvider'
    );
  }
  return context;
}
