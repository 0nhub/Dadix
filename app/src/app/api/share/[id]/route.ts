import { type NextRequest, NextResponse } from 'next/server';
import { getShare, setShareActive } from '@/lib/shareStore';
import type { SharePublicInfo } from '@/lib/share';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ message: 'Missing share id' }, { status: 400 });
  }
  const share = getShare(id);
  if (!share) {
    return NextResponse.json({ message: 'Share not found' }, { status: 404 });
  }
  if (!share.active) {
    return NextResponse.json({ message: 'Share not found' }, { status: 404 });
  }
  const info: SharePublicInfo = {
    active: share.active,
    title: share.title,
    thumbnailUrl: share.thumbnailUrl,
    passwordProtected: share.passwordProtected,
  };
  if (!share.passwordProtected) {
    info.type = share.type;
    info.projectId = share.projectId;
    info.tableId = share.tableId;
    info.viewId = share.viewId;
    if (share.snapshot) info.snapshot = share.snapshot;
  }
  return NextResponse.json(info);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ message: 'Missing share id' }, { status: 400 });
  }
  try {
    const body = await request.json();
    if (body.active === false) {
      const ok = setShareActive(id, false);
      if (!ok) {
        return NextResponse.json(
          { message: 'Share not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ message: 'Invalid body' }, { status: 400 });
  } catch {
    return NextResponse.json({ message: 'Invalid body' }, { status: 400 });
  }
}
