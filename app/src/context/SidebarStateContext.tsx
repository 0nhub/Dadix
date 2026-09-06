'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  type SidebarGroup,
  type SidebarLink,
  getSidebarGroups,
  setSidebarGroups as persistGroups,
  getTableToGroup,
  setTableToGroup as persistTableToGroup,
  getLinkToGroup,
  setLinkToGroup as persistLinkToGroup,
  getSidebarLinks,
  setSidebarLinks as persistLinks,
  getGroupItemOrder,
  setGroupItemOrder as persistGroupItemOrder,
  getSearchVisible,
  setSearchVisible as persistSearchVisible,
  getShowHiddenGroups,
  setShowHiddenGroups as persistShowHiddenGroups,
  ensureDefaultGroup,
  DEFAULT_GROUP_ID,
} from '@/lib/sidebarState';

interface SidebarStateContextValue {
  projectId: string | undefined;
  groups: SidebarGroup[];
  tableToGroup: Record<string, string>;
  linkToGroup: Record<string, string>;
  links: SidebarLink[];
  searchVisible: boolean;
  showHiddenGroups: boolean;
  setGroups: (
    groups: SidebarGroup[] | ((prev: SidebarGroup[]) => SidebarGroup[])
  ) => void;
  setTableToGroup: (
    map:
      | Record<string, string>
      | ((prev: Record<string, string>) => Record<string, string>)
  ) => void;
  setLinks: (
    links: SidebarLink[] | ((prev: SidebarLink[]) => SidebarLink[])
  ) => void;
  setSearchVisible: (visible: boolean) => void;
  setShowHiddenGroups: (visible: boolean) => void;
  assignTableToGroup: (tableId: string, groupId: string) => void;
  assignLinkToGroup: (linkId: string, groupId: string) => void;
  addGroup: (name: string) => string;
  renameGroup: (groupId: string, name: string) => void;
  removeGroup: (groupId: string) => void;
  setGroupHidden: (groupId: string, hidden: boolean) => void;
  setGroupCollapsed: (groupId: string, collapsed: boolean) => void;
  addLink: (title: string, url: string, icon?: string) => void;
  updateLink: (id: string, title: string, url: string, icon?: string) => void;
  removeLink: (id: string) => void;
  groupItemOrder: Record<string, string[]>;
  setGroupItemOrder: (
    order:
      | Record<string, string[]>
      | ((prev: Record<string, string[]>) => Record<string, string[]>)
  ) => void;
}

const SidebarStateContext = createContext<SidebarStateContextValue | null>(
  null
);

export function SidebarStateProvider({
  projectId,
  children,
}: {
  projectId: string | undefined;
  children: React.ReactNode;
}) {
  const [groups, setGroupsState] = useState<SidebarGroup[]>([]);
  const [tableToGroup, setTableToGroupState] = useState<Record<string, string>>(
    {}
  );
  const [linkToGroup, setLinkToGroupState] = useState<Record<string, string>>(
    {}
  );
  const [links, setLinksState] = useState<SidebarLink[]>([]);
  const [searchVisible, setSearchVisibleState] = useState(false);
  const [showHiddenGroups, setShowHiddenGroupsState] = useState(false);
  const [groupItemOrder, setGroupItemOrderState] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!projectId) {
      setGroupsState([]);
      setTableToGroupState({});
      setLinkToGroupState({});
      setLinksState([]);
      setGroupItemOrderState({});
      return;
    }
    const g = ensureDefaultGroup(projectId);
    setGroupsState(g);
    setTableToGroupState(getTableToGroup(projectId));
    const linkToGroupRaw = getLinkToGroup(projectId);
    const linksRaw = getSidebarLinks(projectId);
    setLinksState(linksRaw);
    setLinkToGroupState(() => {
      const next = { ...linkToGroupRaw };
      linksRaw.forEach((l) => {
        if (next[l.id] == null) next[l.id] = DEFAULT_GROUP_ID;
      });
      return next;
    });
    setGroupItemOrderState(getGroupItemOrder(projectId));
    setSearchVisibleState(getSearchVisible());
    setShowHiddenGroupsState(getShowHiddenGroups());
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    persistGroups(projectId, groups);
  }, [projectId, groups]);

  useEffect(() => {
    if (!projectId) return;
    persistTableToGroup(projectId, tableToGroup);
  }, [projectId, tableToGroup]);

  useEffect(() => {
    if (!projectId) return;
    persistLinkToGroup(projectId, linkToGroup);
  }, [projectId, linkToGroup]);

  useEffect(() => {
    if (!projectId) return;
    persistLinks(projectId, links);
  }, [projectId, links]);

  useEffect(() => {
    if (!projectId) return;
    persistGroupItemOrder(projectId, groupItemOrder);
  }, [projectId, groupItemOrder]);

  useEffect(() => {
    persistSearchVisible(searchVisible);
  }, [searchVisible]);

  useEffect(() => {
    persistShowHiddenGroups(showHiddenGroups);
  }, [showHiddenGroups]);

  const setGroups = useCallback(
    (updater: SidebarGroup[] | ((prev: SidebarGroup[]) => SidebarGroup[])) => {
      setGroupsState((prev) =>
        typeof updater === 'function' ? updater(prev) : updater
      );
    },
    []
  );

  const setTableToGroup = useCallback(
    (
      updater:
        | Record<string, string>
        | ((prev: Record<string, string>) => Record<string, string>)
    ) => {
      setTableToGroupState((prev) =>
        typeof updater === 'function' ? updater(prev) : updater
      );
    },
    []
  );

  const setLinks = useCallback(
    (updater: SidebarLink[] | ((prev: SidebarLink[]) => SidebarLink[])) => {
      setLinksState((prev) =>
        typeof updater === 'function' ? updater(prev) : updater
      );
    },
    []
  );

  const setGroupItemOrder = useCallback(
    (
      updater:
        | Record<string, string[]>
        | ((prev: Record<string, string[]>) => Record<string, string[]>)
    ) => {
      setGroupItemOrderState((prev) =>
        typeof updater === 'function' ? updater(prev) : updater
      );
    },
    []
  );

  const setSearchVisible = useCallback((visible: boolean) => {
    setSearchVisibleState(visible);
  }, []);

  const setShowHiddenGroups = useCallback((visible: boolean) => {
    setShowHiddenGroupsState(visible);
  }, []);

  const assignTableToGroup = useCallback((tableId: string, groupId: string) => {
    setTableToGroupState((prev) => ({ ...prev, [tableId]: groupId }));
  }, []);

  const assignLinkToGroup = useCallback((linkId: string, groupId: string) => {
    setLinkToGroupState((prev) => ({ ...prev, [linkId]: groupId }));
  }, []);

  const addGroup = useCallback((name: string) => {
    const id = `group-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setGroupsState((prev) => {
      const newGroup: SidebarGroup = { id, name, order: prev.length };
      return [...prev, newGroup].sort((a, b) => a.order - b.order);
    });
    return id;
  }, []);

  const renameGroup = useCallback((groupId: string, name: string) => {
    setGroupsState((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, name } : g))
    );
  }, []);

  const removeGroup = useCallback((groupId: string) => {
    if (groupId === DEFAULT_GROUP_ID) return;
    setGroupsState((prev) => prev.filter((g) => g.id !== groupId));
    setTableToGroupState((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((tableId) => {
        if (next[tableId] === groupId) next[tableId] = DEFAULT_GROUP_ID;
      });
      return next;
    });
    setLinkToGroupState((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((linkId) => {
        if (next[linkId] === groupId) next[linkId] = DEFAULT_GROUP_ID;
      });
      return next;
    });
    setGroupItemOrderState((prev) => {
      const next = { ...prev };
      const moving = next[groupId] ?? [];
      delete next[groupId];
      const dest = next[DEFAULT_GROUP_ID] ?? [];
      const seen = new Set(dest);
      next[DEFAULT_GROUP_ID] = [
        ...dest,
        ...moving.filter((id) => !seen.has(id)),
      ];
      return next;
    });
  }, []);

  const setGroupHidden = useCallback((groupId: string, hidden: boolean) => {
    setGroupsState((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, hidden } : g))
    );
    if (hidden) {
      setShowHiddenGroupsState(false);
    }
  }, []);

  const setGroupCollapsed = useCallback((groupId: string, collapsed: boolean) => {
    setGroupsState((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, collapsed } : g))
    );
  }, []);

  const addLink = useCallback(
    (title: string, url: string, icon?: string) => {
      const id = `link-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      setLinksState((prev) => [
        ...prev,
        { id, title, url, icon: icon ?? 'Globe', order: prev.length },
      ]);
      setLinkToGroupState((prev) => ({ ...prev, [id]: DEFAULT_GROUP_ID }));
    },
    []
  );

  const updateLink = useCallback(
    (id: string, title: string, url: string, icon?: string) => {
      setLinksState((prev) =>
        prev.map((l) =>
          l.id === id ? { ...l, title, url, ...(icon !== undefined && { icon }) } : l
        )
      );
    },
    []
  );

  const removeLink = useCallback((id: string) => {
    setLinksState((prev) => prev.filter((l) => l.id !== id));
    setLinkToGroupState((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const value: SidebarStateContextValue = {
    projectId,
    groups,
    tableToGroup,
    linkToGroup,
    links,
    searchVisible,
    showHiddenGroups,
    setGroups,
    setTableToGroup,
    setLinks,
    setSearchVisible,
    setShowHiddenGroups,
    assignTableToGroup,
    assignLinkToGroup,
    addGroup,
    renameGroup,
    removeGroup,
    setGroupHidden,
    setGroupCollapsed,
    addLink,
    updateLink,
    removeLink,
    groupItemOrder,
    setGroupItemOrder,
  };

  return (
    <SidebarStateContext.Provider value={value}>
      {children}
    </SidebarStateContext.Provider>
  );
}

export function useSidebarState() {
  const ctx = useContext(SidebarStateContext);
  if (!ctx) {
    throw new Error('useSidebarState must be used within SidebarStateProvider');
  }
  return ctx;
}

export function useSidebarStateOptional() {
  return useContext(SidebarStateContext);
}
