'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
} from 'react';
import {
  getDashboardSectionsState,
  persistDashboardSectionsState,
  type DashboardSection,
  type DashboardSectionsState,
  DEFAULT_MAIN,
} from '@/lib/dashboardSections';

type ContextValue = {
  sections: DashboardSection[];
  projectSection: Record<string, string>;
  sectionOrder: Record<string, string[]>;
  setSections: (sections: DashboardSection[]) => void;
  setProjectSection: (projectId: string, sectionId: string) => void;
  setSectionOrder: (sectionId: string, projectIds: string[]) => void;
  addSection: (name: string) => string;
  renameSection: (sectionId: string, name: string) => void;
  removeSection: (sectionId: string) => void;
  moveProjectToSection: (projectId: string, sectionId: string, index: number) => void;
  reorderSections: (orderedSectionIds: string[]) => void;
};

const DashboardSectionsContext = createContext<ContextValue | null>(null);

export function DashboardSectionsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DashboardSectionsState>(getDashboardSectionsState);

  useEffect(() => {
    setState(getDashboardSectionsState());
  }, []);

  const persist = useCallback((next: DashboardSectionsState) => {
    setState(next);
    persistDashboardSectionsState(next);
  }, []);

  const setSections = useCallback(
    (sections: DashboardSection[]) => {
      const sorted = sections.slice().sort((a, b) => a.order - b.order);
      persist({ ...state, sections: sorted });
    },
    [state, persist]
  );

  const setProjectSection = useCallback(
    (projectId: string, sectionId: string) => {
      const next = { ...state };
      const prevSection = next.projectSection[projectId] ?? 'main';
      next.projectSection = { ...next.projectSection, [projectId]: sectionId };
      const prevOrder = next.sectionOrder[prevSection] ?? [];
      next.sectionOrder = { ...next.sectionOrder };
      next.sectionOrder[prevSection] = prevOrder.filter((id) => id !== projectId);
      const targetOrder = next.sectionOrder[sectionId] ?? [];
      next.sectionOrder[sectionId] = [...targetOrder, projectId];
      persist(next);
    },
    [state, persist]
  );

  const setSectionOrder = useCallback(
    (sectionId: string, projectIds: string[]) => {
      const next = { ...state };
      next.sectionOrder = { ...next.sectionOrder, [sectionId]: projectIds };
      persist(next);
    },
    [state, persist]
  );

  const addSection = useCallback(
    (name: string) => {
      const maxOrder = Math.max(0, ...state.sections.map((s) => s.order));
      const id = `section-${Date.now()}`;
      const section: DashboardSection = { id, name, order: maxOrder + 1 };
      persist({
        ...state,
        sections: [...state.sections, section],
        sectionOrder: { ...state.sectionOrder, [id]: [] },
      });
      return id;
    },
    [state, persist]
  );

  const renameSection = useCallback(
    (sectionId: string, name: string) => {
      const sections = state.sections.map((s) =>
        s.id === sectionId ? { ...s, name } : s
      );
      persist({ ...state, sections });
    },
    [state, persist]
  );

  const removeSection = useCallback(
    (sectionId: string) => {
      if (state.sections.length <= 1) return;
      const projectIds = state.sectionOrder[sectionId] ?? [];
      const next = { ...state };
      const otherSections = next.sections.filter((s) => s.id !== sectionId).sort((a, b) => a.order - b.order);
      const targetSectionId = otherSections[0]?.id ?? 'main';
      next.sections = next.sections.filter((s) => s.id !== sectionId);
      next.sectionOrder = { ...next.sectionOrder };
      delete next.sectionOrder[sectionId];
      projectIds.forEach((pid) => {
        next.projectSection = { ...next.projectSection, [pid]: targetSectionId };
        const targetOrder = next.sectionOrder[targetSectionId] ?? [];
        next.sectionOrder[targetSectionId] = [...targetOrder, pid];
      });
      persist(next);
    },
    [state, persist]
  );

  const moveProjectToSection = useCallback(
    (projectId: string, sectionId: string, index: number) => {
      const next = { ...state };
      const prevSection = next.projectSection[projectId] ?? 'main';
      next.projectSection = { ...next.projectSection, [projectId]: sectionId };

      const prevOrder = next.sectionOrder[prevSection] ?? [];
      next.sectionOrder = { ...next.sectionOrder };
      next.sectionOrder[prevSection] = prevOrder.filter((id) => id !== projectId);

      let targetOrder = next.sectionOrder[sectionId] ?? [];
      if (prevSection === sectionId) {
        targetOrder = targetOrder.filter((id) => id !== projectId);
      }
      targetOrder = [...targetOrder];
      targetOrder.splice(Math.min(index, targetOrder.length), 0, projectId);
      next.sectionOrder[sectionId] = targetOrder;
      persist(next);
    },
    [state, persist]
  );

  const reorderSections = useCallback(
    (orderedSectionIds: string[]) => {
      const sections = state.sections.map((s) => {
        const idx = orderedSectionIds.indexOf(s.id);
        return { ...s, order: idx >= 0 ? idx : s.order };
      });
      persist({ ...state, sections });
    },
    [state, persist]
  );

  const value = useMemo<ContextValue>(
    () => ({
      sections: state.sections.slice().sort((a, b) => a.order - b.order),
      projectSection: state.projectSection,
      sectionOrder: state.sectionOrder,
      setSections,
      setProjectSection,
      setSectionOrder,
      addSection,
      renameSection,
      removeSection,
      moveProjectToSection,
      reorderSections,
    }),
    [
      state,
      setSections,
      setProjectSection,
      setSectionOrder,
      addSection,
      renameSection,
      removeSection,
      moveProjectToSection,
      reorderSections,
    ]
  );

  return (
    <DashboardSectionsContext.Provider value={value}>
      {children}
    </DashboardSectionsContext.Provider>
  );
}

export function useDashboardSections() {
  const ctx = useContext(DashboardSectionsContext);
  if (!ctx) throw new Error('useDashboardSections must be used within DashboardSectionsProvider');
  return ctx;
}

export function useDashboardSectionsOptional() {
  return useContext(DashboardSectionsContext);
}
