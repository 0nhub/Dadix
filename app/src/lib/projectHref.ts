export function projectTableHref(
  projectId: string | number | undefined,
  tableId: string | number | undefined,
  viewId?: string | number | null
) {
  const pid = projectId != null ? String(projectId) : '';
  const tid = tableId != null ? String(tableId) : '';
  const viewQuery =
    viewId != null && `${viewId}` !== '' ? `&viewId=${viewId}` : '';
  return `/dashboard/${pid}?tableId=${tid}${viewQuery}`;
}
