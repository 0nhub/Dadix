import { dadixEvents } from '@/constants/events';
import { callApi } from '../api';
import type { IDadixGridViewField } from '@/types';
import {
  findLocalView,
  isDevDemoTable,
  isDevTable,
  patchLocalView,
  patchViewColumnLayout,
  usesLocalViews,
} from '@/lib/dev-demo-data';

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
    if (usesLocalViews(tableId)) {
      const layoutPatch = {
        ...(typeof updates.size === 'number' ? { size: updates.size } : {}),
        ...(typeof updates.order === 'number' ? { order: updates.order } : {}),
        ...(typeof updates.fieldOrder === 'number'
          ? { fieldOrder: updates.fieldOrder }
          : {}),
        ...(typeof updates.fixed === 'boolean' ? { fixed: updates.fixed } : {}),
        ...(typeof updates.isVisible === 'boolean'
          ? { isVisible: updates.isVisible }
          : {}),
      };
      if (Object.keys(layoutPatch).length) {
        patchViewColumnLayout(tableId, gridViewId, tableColumnId, layoutPatch);
        if (id !== tableColumnId) {
          patchViewColumnLayout(tableId, gridViewId, id, layoutPatch);
        }
      }
      const view = findLocalView(tableId, gridViewId);
      if (view) {
        const nextOrder =
          typeof updates.order === 'number' ? updates.order : undefined;
        const fields = applyLocalFieldOrderShift(
          view.fields ?? [],
          id,
          tableColumnId,
          updates,
          nextOrder
        );
        patchLocalView(tableId, gridViewId, { fields });
      }
    }
    if (!silent) {
      window.dispatchEvent(
        new CustomEvent(dadixEvents.gridViewEvents.onPatchField, {
          detail: { viewId: gridViewId, tableId, id, data: updates },
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

function fieldMatches(
  field: IDadixGridViewField,
  id: number,
  tableColumnId: number
) {
  return (
    Number(field.id) === Number(id) ||
    Number(field.fieldId) === Number(tableColumnId)
  );
}

function applyLocalFieldOrderShift(
  fields: IDadixGridViewField[],
  id: number,
  tableColumnId: number,
  updates: Partial<IDadixGridViewField>,
  nextOrder: number | undefined
): IDadixGridViewField[] {
  if (nextOrder === undefined) {
    return fields.map((field) =>
      fieldMatches(field, id, tableColumnId) ? { ...field, ...updates } : field
    );
  }
  const moved = fields.find((field) => fieldMatches(field, id, tableColumnId));
  if (!moved) return fields;
  const from = moved.order ?? moved.fieldOrder ?? 0;
  if (from === nextOrder) {
    return fields.map((field) =>
      fieldMatches(field, id, tableColumnId) ? { ...field, ...updates } : field
    );
  }
  const direction = Math.sign(from - nextOrder);
  const minOrder = Math.min(from, nextOrder);
  const maxOrder = Math.max(from, nextOrder);
  return fields
    .map((field) => {
      if (fieldMatches(field, id, tableColumnId)) {
        return {
          ...field,
          ...updates,
          order: nextOrder,
          fieldOrder: nextOrder,
        };
      }
      const order = field.order ?? field.fieldOrder ?? 0;
      if (order < minOrder || order > maxOrder) return field;
      const shifted = order + direction;
      return { ...field, order: shifted, fieldOrder: shifted };
    })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export { patchGridViewColumn };
