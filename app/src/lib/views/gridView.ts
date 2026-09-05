import { dadixEvents } from '@/constants/events';
import { callApi } from '../api';
import type { IDadixGridViewField } from '@/types';
import { isDevDemoTable, isDevTable } from '@/lib/dev-demo-data';

async function patchGridViewColumn({
  tableId,
  gridViewId,
  tableColumnId,
  id,
  data,
  silent = false,
}: {
  tableId: string;
  gridViewId: number;
  tableColumnId: number;
  id: number;
  data: Partial<IDadixGridViewField>;
  silent?: boolean;
}): Promise<Record<string, unknown>> {
  if ((isDevDemoTable(tableId) || isDevTable(tableId)) && typeof window !== 'undefined') {
    const updates: Partial<IDadixGridViewField> = {};
    Object.keys(data).forEach((key) => {
      const v = (data as Record<string, unknown>)[key];
      if (v !== undefined) (updates as Record<string, unknown>)[key] = v;
    });
    if (!silent) {
      window.dispatchEvent(
        new CustomEvent(dadixEvents.gridViewEvents.onPatchField, {
          detail: { viewId: gridViewId, id, data: updates },
        })
      );
    }
    return (updates as Record<string, unknown>) || {};
  }
  // update a view (200 or 201 for create)
  const response = await callApi.patch(
    `/view/grid/${id}`,
    JSON.stringify({
      tableId,
      gridViewId,
      tableColumnId,
      data,
    })
  );
  if (!response || (response.status !== 200 && response.status !== 201) || !response.data) {
    throw new Error('Error update column');
  }
  if (!silent) {
    const updates: typeof data = {};
    Object.keys(data).map((key) => {
      if ((data as Record<string, unknown>)[key] !== undefined)
        (updates as Record<string, unknown>)[key] = (
          data as Record<string, unknown>
        )[key];
      return null;
    });
    if (id < 0) {
      updates.id = response.data.id as number;
    }
    window.dispatchEvent(
      new CustomEvent(dadixEvents.gridViewEvents.onPatchField, {
        detail: {
          viewId: gridViewId,
          id,
          data: updates,
        },
      })
    );
  } else if (silent && id < 0 && response.data && typeof response.data === 'object' && 'id' in response.data) {
    // Created via Field Editor (silent): still notify so other listeners (e.g. View Editor) can merge the new column
    const created = response.data as { id: number; columnId?: number; name?: string; order?: number; isVisible?: boolean };
    const newField = {
      id: created.id,
      fieldId: tableColumnId,
      fieldName: created.name ?? '',
      fieldOrder: created.order ?? 0,
      isVisible: created.isVisible ?? true,
    };
    window.dispatchEvent(
      new CustomEvent(dadixEvents.gridViewEvents.onPatchField, {
        detail: {
          viewId: gridViewId,
          id,
          data: { id: created.id, isVisible: true },
          tableId,
          newField,
        },
      })
    );
  }
  return response.data;
}

export { patchGridViewColumn };
