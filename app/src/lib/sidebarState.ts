/**
 * Sidebar state per project: table groups, table→group assignment, links (bookmarks), search visibility.
 * Persisted in localStorage.
 */

export const DEFAULT_GROUP_ID = 'default';
export const DEFAULT_GROUP_NAME = 'Tables';

export interface SidebarGroup {
  id: string;
  name: string;
  order: number;
  hidden?: boolean;
  collapsed?: boolean;
}

export interface SidebarLink {
  id: string;
  title: string;
  url: string;
  icon?: string;
  order?: number;
}

const PREFIX_GROUPS = 'dadix-sidebar-groups-';
const PREFIX_TABLE_TO_GROUP = 'dadix-sidebar-table-group-';
const PREFIX_LINK_TO_GROUP = 'dadix-sidebar-link-group-';
const PREFIX_LINKS = 'dadix-sidebar-links-';
const PREFIX_GROUP_ITEM_ORDER = 'dadix-sidebar-group-item-order-';
const KEY_SEARCH_VISIBLE = 'dadix-sidebar-search-visible';
const KEY_SHOW_HIDDEN_GROUPS = 'dadix-sidebar-show-hidden-groups';

function getKey(prefix: string, projectId: string) {
  return `${prefix}${projectId}`;
}

export function getSidebarGroups(projectId: string): SidebarGroup[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getKey(PREFIX_GROUPS, projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as SidebarGroup[]) : [];
  } catch {
    return [];
  }
}

export function setSidebarGroups(
  projectId: string,
  groups: SidebarGroup[]
): void {
  try {
    localStorage.setItem(
      getKey(PREFIX_GROUPS, projectId),
      JSON.stringify(groups)
    );
  } catch (e) {
    console.warn('sidebarState setSidebarGroups', e);
  }
}

export function getTableToGroup(projectId: string): Record<string, string> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(getKey(PREFIX_TABLE_TO_GROUP, projectId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

export function setTableToGroup(
  projectId: string,
  map: Record<string, string>
): void {
  try {
    localStorage.setItem(
      getKey(PREFIX_TABLE_TO_GROUP, projectId),
      JSON.stringify(map)
    );
  } catch (e) {
    console.warn('sidebarState setTableToGroup', e);
  }
}

export function getLinkToGroup(projectId: string): Record<string, string> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(getKey(PREFIX_LINK_TO_GROUP, projectId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

export function setLinkToGroup(
  projectId: string,
  map: Record<string, string>
): void {
  try {
    localStorage.setItem(
      getKey(PREFIX_LINK_TO_GROUP, projectId),
      JSON.stringify(map)
    );
  } catch (e) {
    console.warn('sidebarState setLinkToGroup', e);
  }
}

/** Per-group ordered list of item ids (table ids + link ids) for sidebar display. */
export function getGroupItemOrder(projectId: string): Record<string, string[]> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(getKey(PREFIX_GROUP_ITEM_ORDER, projectId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, string[]>)
      : {};
  } catch {
    return {};
  }
}

export function setGroupItemOrder(
  projectId: string,
  order: Record<string, string[]>
): void {
  try {
    localStorage.setItem(
      getKey(PREFIX_GROUP_ITEM_ORDER, projectId),
      JSON.stringify(order)
    );
  } catch (e) {
    console.warn('sidebarState setGroupItemOrder', e);
  }
}

export function getSidebarLinks(projectId: string): SidebarLink[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getKey(PREFIX_LINKS, projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as SidebarLink[]) : [];
  } catch {
    return [];
  }
}

export function setSidebarLinks(projectId: string, links: SidebarLink[]): void {
  try {
    localStorage.setItem(
      getKey(PREFIX_LINKS, projectId),
      JSON.stringify(links)
    );
  } catch (e) {
    console.warn('sidebarState setSidebarLinks', e);
  }
}

export function getSearchVisible(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const raw = localStorage.getItem(KEY_SEARCH_VISIBLE);
    if (raw === null) return false;
    return raw === 'true';
  } catch {
    return false;
  }
}

export function setSearchVisible(visible: boolean): void {
  try {
    localStorage.setItem(KEY_SEARCH_VISIBLE, visible ? 'true' : 'false');
  } catch (e) {
    console.warn('sidebarState setSearchVisible', e);
  }
}

export function getShowHiddenGroups(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const raw = localStorage.getItem(KEY_SHOW_HIDDEN_GROUPS);
    if (raw === null) return false;
    return raw === 'true';
  } catch {
    return false;
  }
}

export function setShowHiddenGroups(visible: boolean): void {
  try {
    localStorage.setItem(KEY_SHOW_HIDDEN_GROUPS, visible ? 'true' : 'false');
  } catch (e) {
    console.warn('sidebarState setShowHiddenGroups', e);
  }
}

export function ensureDefaultGroup(projectId: string): SidebarGroup[] {
  const groups = getSidebarGroups(projectId);
  const hasDefault = groups.some((g) => g.id === DEFAULT_GROUP_ID);
  if (hasDefault || groups.length > 0) return groups;
  const defaultGroups: SidebarGroup[] = [
    { id: DEFAULT_GROUP_ID, name: DEFAULT_GROUP_NAME, order: 0 },
  ];
  setSidebarGroups(projectId, defaultGroups);
  return defaultGroups;
}
