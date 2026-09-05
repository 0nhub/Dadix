import { type NextRequest, NextResponse } from 'next/server';
import { createShare } from '@/lib/shareStore';
import type { CreateShareInput, ShareType, ShareSnapshot } from '@/lib/share';

function parseSnapshot(o: unknown): ShareSnapshot | undefined {
  if (!o || typeof o !== 'object') return undefined;
  const s = o as Record<string, unknown>;
  const tableName = typeof s.tableName === 'string' ? s.tableName : '';
  const tableFields = Array.isArray(s.tableFields)
    ? s.tableFields
        .filter(
          (f: unknown) =>
            f &&
            typeof f === 'object' &&
            typeof (f as Record<string, unknown>).id === 'number' &&
            typeof (f as Record<string, unknown>).name === 'string'
        )
        .map((f: unknown) => {
          const x = f as Record<string, unknown>;
          return {
            id: Number(x.id),
            name: String(x.name),
            type: String((x as Record<string, unknown>).type ?? 'TEXT'),
            order: Number((x as Record<string, unknown>).order ?? 0),
          };
        })
    : [];
  const records = Array.isArray(s.records) ? s.records : [];
  if (!tableName) return undefined;
  return {
    tableName,
    tableIcon: typeof s.tableIcon === 'string' ? s.tableIcon : undefined,
    tableFields,
    viewName: typeof s.viewName === 'string' ? s.viewName : undefined,
    viewType: typeof s.viewType === 'string' ? s.viewType : undefined,
    records: records as Record<string, unknown>[],
  };
}

function parseBody(body: unknown): CreateShareInput | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  const type = o.type as string;
  if (type !== 'currentView' && type !== 'fullProject') return null;
  const projectId = typeof o.projectId === 'string' ? o.projectId : '';
  const title = typeof o.title === 'string' ? o.title : 'Shared view';
  if (!projectId) return null;
  return {
    type: type as ShareType,
    projectId,
    tableId: typeof o.tableId === 'string' ? o.tableId : undefined,
    viewId: typeof o.viewId === 'string' ? o.viewId : undefined,
    title,
    thumbnailUrl:
      typeof o.thumbnailUrl === 'string' ? o.thumbnailUrl : undefined,
    password: typeof o.password === 'string' ? o.password : undefined,
    snapshot: parseSnapshot(o.snapshot),
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = parseBody(body);
    if (!input) {
      return NextResponse.json(
        { message: 'Invalid body: type, projectId, title required' },
        { status: 400 }
      );
    }
    const share = createShare(input);
    const url = `${request.nextUrl.origin}/share/${share.shareId}`;
    return NextResponse.json({
      shareId: share.shareId,
      url,
      share: {
        shareId: share.shareId,
        type: share.type,
        projectId: share.projectId,
        tableId: share.tableId,
        viewId: share.viewId,
        title: share.title,
        thumbnailUrl: share.thumbnailUrl,
        passwordProtected: share.passwordProtected,
        active: share.active,
        createdAt: share.createdAt,
      },
    });
  } catch (e) {
    console.error('Share create error:', e);
    return NextResponse.json(
      { message: 'Failed to create share' },
      { status: 500 }
    );
  }
}
