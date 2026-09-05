import { type NextRequest, NextResponse } from 'next/server';
import { verifyPasswordAndGetShare } from '@/lib/shareStore';
import type { SharePublicInfo } from '@/lib/share';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ message: 'Missing share id' }, { status: 400 });
  }
  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid body' }, { status: 400 });
  }
  const password = typeof body.password === 'string' ? body.password : '';
  const share = verifyPasswordAndGetShare(id, password);
  if (!share) {
    return NextResponse.json({ message: 'Invalid password' }, { status: 401 });
  }
  const info: SharePublicInfo = {
    active: share.active,
    title: share.title,
    thumbnailUrl: share.thumbnailUrl,
    passwordProtected: share.passwordProtected,
    type: share.type,
    projectId: share.projectId,
    tableId: share.tableId,
    viewId: share.viewId,
    snapshot: share.snapshot,
  };
  return NextResponse.json(info);
}
