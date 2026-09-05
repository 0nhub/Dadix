const STORAGE_KEY = 'dadix-dashboard-sections';

export type DashboardSection = { id: string; name: string; order: number };

const DEFAULT_MAIN: DashboardSection = { id: 'main', name: 'Main', order: 0 };

export type DashboardSectionsState = {
  sections: DashboardSection[];
  projectSection: Record<string, string>;
  sectionOrder: Record<string, string[]>;
};

function load(): DashboardSectionsState {
  if (typeof window === 'undefined') {
    return {
      sections: [DEFAULT_MAIN],
      projectSection: {},
      sectionOrder: { main: [] },
    };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultState();
    const parsed = JSON.parse(raw) as DashboardSectionsState;
    if (!parsed.sections?.length) parsed.sections = [DEFAULT_MAIN];
    if (!parsed.sections.some((s) => s.id === 'main')) {
      parsed.sections = [DEFAULT_MAIN, ...parsed.sections];
    }
    if (!parsed.projectSection) parsed.projectSection = {};
    if (!parsed.sectionOrder) parsed.sectionOrder = {};
    if (!parsed.sectionOrder.main) parsed.sectionOrder.main = [];
    return parsed;
  } catch {
    return getDefaultState();
  }
}

function getDefaultState(): DashboardSectionsState {
  return {
    sections: [DEFAULT_MAIN],
    projectSection: {},
    sectionOrder: { main: [] },
  };
}

export function getDashboardSectionsState(): DashboardSectionsState {
  return load();
}

export function persistDashboardSectionsState(state: DashboardSectionsState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function getSections(): DashboardSection[] {
  return load().sections.slice().sort((a, b) => a.order - b.order);
}

export function getProjectSection(projectId: string): string {
  const state = load();
  return state.projectSection[projectId] ?? 'main';
}

export function getSectionProjectOrder(sectionId: string): string[] {
  return load().sectionOrder[sectionId] ?? [];
}

export { DEFAULT_MAIN };
