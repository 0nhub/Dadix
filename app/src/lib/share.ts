/**
 * Share types and client-side service for creating/managing shares.
 * Public share data is stored via Next.js API routes (in-memory for dev).
 */

export type ShareType = 'currentView' | 'fullProject';

/** Snapshot of table/view/records for public display without backend auth. */
export interface ShareSnapshot {
  tableName: string;
  tableIcon?: string;
  tableFields: { id: number; name: string; type: string; order: number }[];
  viewName?: string;
  viewType?: string;
  records: Record<string, unknown>[];
}

export interface ShareConfig {
  shareId: string;
  type: ShareType;
  projectId: string;
  tableId?: string;
  viewId?: string;
  title: string;
  thumbnailUrl?: string;
  passwordProtected: boolean;
  /** Set to false to deactivate the share (URL stops working). */
  active: boolean;
  createdAt: string;
  /** Data snapshot for public view (no backend needed). */
  snapshot?: ShareSnapshot;
}

export interface CreateShareInput {
  type: ShareType;
  projectId: string;
  tableId?: string;
  viewId?: string;
  title: string;
  thumbnailUrl?: string;
  password?: string;
  snapshot?: ShareSnapshot;
}

export interface CreateShareResult {
  shareId: string;
  url: string;
  share: ShareConfig;
}

/** Public info returned by GET /api/share/[id] (no sensitive data until password verified). */
export interface SharePublicInfo {
  active: boolean;
  title: string;
  thumbnailUrl?: string;
  passwordProtected: boolean;
  /** Present only if !passwordProtected or after verify. */
  type?: ShareType;
  projectId?: string;
  tableId?: string;
  viewId?: string;
  snapshot?: ShareSnapshot;
}

const getBaseUrl = () =>
  typeof window !== 'undefined' ? window.location.origin : '';

const MY_SHARES_STORAGE_KEY = 'dadix_my_share_ids';

export interface MyShareEntry {
  shareId: string;
  projectId: string;
  tableId?: string;
  createdAt: string;
}

function getMyShareIds(): MyShareEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(MY_SHARES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveMyShareIds(entries: MyShareEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MY_SHARES_STORAGE_KEY, JSON.stringify(entries));
  } catch {}
}

export function addMyShare(entry: MyShareEntry): void {
  const list = getMyShareIds();
  if (list.some((e) => e.shareId === entry.shareId)) return;
  saveMyShareIds([...list, entry]);
}

export function removeMyShare(shareId: string): void {
  saveMyShareIds(getMyShareIds().filter((e) => e.shareId !== shareId));
}

export function getMySharesForProject(projectId: string): MyShareEntry[] {
  return getMyShareIds().filter((e) => e.projectId === projectId);
}

async function createShare(input: CreateShareInput): Promise<CreateShareResult> {
  const res = await fetch('/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to create share');
  }
  return res.json();
}

async function getShare(shareId: string): Promise<SharePublicInfo> {
  const res = await fetch(`/api/share/${shareId}`, { method: 'GET' });
  if (!res.ok) {
    if (res.status === 404) throw new Error('Share not found');
    throw new Error('Failed to load share');
  }
  return res.json();
}

async function verifySharePassword(
  shareId: string,
  password: string
): Promise<SharePublicInfo> {
  const res = await fetch(`/api/share/${shareId}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Invalid password');
    throw new Error('Verification failed');
  }
  return res.json();
}

async function deactivateShare(shareId: string): Promise<void> {
  const res = await fetch(`/api/share/${shareId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active: false }),
  });
  if (!res.ok) throw new Error('Failed to deactivate share');
}

export const shareService = {
  createShare,
  getShare,
  verifySharePassword,
  deactivateShare,
  getShareUrl: (shareId: string) => `${getBaseUrl()}/share/${shareId}`,
  getMyShareIds,
  addMyShare,
  removeMyShare,
  getMySharesForProject,
};
