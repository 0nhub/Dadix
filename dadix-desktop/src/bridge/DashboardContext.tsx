import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getProjectMeta } from "../lib/dadix";
import { findRecent, listRecents, upsertRecent, type RecentProject } from "./recents";
import { dadixEvents } from "@/constants/events";
import type { MemberRole } from "@/types";

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

function toProject(item: RecentProject): Project {
  return {
    id: item.id,
    title: item.title,
    icon: item.icon || "FolderClosed",
    order: item.order,
    role: "Owner",
  };
}

export function DashboardContextProvider({ children }: { children?: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>(() => listRecents().map(toProject));
  const [isLoading, setIsLoading] = useState(() => listRecents().length === 0);
  const [initialized, setInitialized] = useState(() => listRecents().length > 0);

  function applyRecents() {
    setProjects(listRecents().map(toProject));
    setIsLoading(false);
    setInitialized(true);
  }

  async function refresh() {
    applyRecents();
    const meta = await getProjectMeta();
    if (meta) {
      upsertRecent({
        id: meta.project_id ?? String(meta.id),
        path: meta.path ?? "",
        title: meta.name,
        icon: "FolderClosed",
        order: 0,
      });
    }
    applyRecents();
  }

  useEffect(() => {
    applyRecents();
    void refresh();
    const onCreate = (event: Event) => {
      const created = (event as CustomEvent).detail?.createdProject as
        | { id?: string; title?: string; icon?: string; order?: number }
        | undefined;
      if (created?.id) {
        upsertRecent({
          id: String(created.id),
          path: findRecent(String(created.id))?.path ?? "",
          title: created.title ?? "Dadix",
          icon: created.icon || "FolderClosed",
          order: created.order ?? 0,
        });
      }
      applyRecents();
      void refresh();
    };
    const onChange = () => void refresh();
    window.addEventListener(dadixEvents.projectEvents.onCreate, onCreate);
    window.addEventListener(dadixEvents.projectEvents.onPatch, onChange);
    window.addEventListener(dadixEvents.projectEvents.onDelete, onChange);
    return () => {
      window.removeEventListener(dadixEvents.projectEvents.onCreate, onCreate);
      window.removeEventListener(dadixEvents.projectEvents.onPatch, onChange);
      window.removeEventListener(dadixEvents.projectEvents.onDelete, onChange);
    };
  }, []);

  return (
    <DashboardContext.Provider
      value={{ projects, sharedProjects: [], isLoading, initialized }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboardContext() {
  return useContext(DashboardContext);
}
