export interface RecentProject {
  id: string;
  path: string;
  title: string;
  icon: string;
  order: number;
}

const KEY = "dadix-recent-projects";

let currentOpen: RecentProject | null = null;

export function setCurrentOpen(project: RecentProject) {
  currentOpen = project;
  upsertRecent(project);
}

export function listRecents(): RecentProject[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as RecentProject[]) : [];
    const stored = Array.isArray(parsed) ? parsed : [];
    if (currentOpen && !stored.some((item) => item.id === currentOpen?.id)) {
      return [currentOpen, ...stored];
    }
    return stored;
  } catch {
    return currentOpen ? [currentOpen] : [];
  }
}

export function upsertRecent(project: RecentProject): RecentProject[] {
  currentOpen = project;
  const stored = (() => {
    try {
      const raw = localStorage.getItem(KEY);
      const parsed = raw ? (JSON.parse(raw) as RecentProject[]) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();
  const next = [project, ...stored.filter((item) => item.id !== project.id || item.path !== project.path)]
    .slice(0, 40)
    .map((item, order) => ({ ...item, order }));
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function findRecent(id: string): RecentProject | undefined {
  return listRecents().find((item) => item.id === id);
}

export function removeRecent(id: string): RecentProject[] {
  const next = listRecents()
    .filter((item) => item.id !== id)
    .map((item, order) => ({ ...item, order }));
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
