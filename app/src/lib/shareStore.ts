/**
 * In-memory share store for API routes. In production replace with DB.
 */

import type { ShareConfig, ShareType, ShareSnapshot } from './share';
import { randomUUID } from 'crypto';
import { createHash, timingSafeEqual } from 'crypto';

const store = new Map<string, StoredShareConfig>();

function hashPassword(password: string): string {
  return createHash('sha256').update(password, 'utf8').digest('hex');
}

function verifyPassword(password: string, hash: string): boolean {
  const h = hashPassword(password);
  if (h.length !== hash.length) return false;
  try {
    return timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(hash, 'hex'));
  } catch {
    return false;
  }
}

export interface StoredShareConfig extends ShareConfig {
  passwordHash?: string;
}

export function createShare(data: {
  type: ShareType;
  projectId: string;
  tableId?: string;
  viewId?: string;
  title: string;
  thumbnailUrl?: string;
  password?: string;
  snapshot?: ShareSnapshot;
}): ShareConfig {
  const shareId = randomUUID().slice(0, 8);
  const passwordProtected = Boolean(data.password?.trim());
  const config: StoredShareConfig = {
    shareId,
    type: data.type,
    projectId: data.projectId,
    tableId: data.tableId,
    viewId: data.viewId,
    title: data.title,
    thumbnailUrl: data.thumbnailUrl,
    passwordProtected,
    active: true,
    createdAt: new Date().toISOString(),
    snapshot: data.snapshot,
  };
  if (passwordProtected && data.password) {
    config.passwordHash = hashPassword(data.password);
  }
  store.set(shareId, config);
  const { passwordHash: _, ...out } = config;
  return out as ShareConfig;
}

export function getShare(shareId: string): ShareConfig | null {
  const raw = store.get(shareId);
  if (!raw) return null;
  const { passwordHash: _, ...out } = raw;
  return out as ShareConfig;
}

export function verifyPasswordAndGetShare(
  shareId: string,
  password: string
): ShareConfig | null {
  const raw = store.get(shareId) as StoredShareConfig | undefined;
  if (!raw || !raw.active || !raw.passwordHash) return null;
  if (!verifyPassword(password, raw.passwordHash)) return null;
  const { passwordHash: _, ...config } = raw;
  return config as ShareConfig;
}

export function setShareActive(shareId: string, active: boolean): boolean {
  const s = store.get(shareId);
  if (!s) return false;
  store.set(shareId, { ...s, active });
  return true;
}
