import { dadixEvents } from '@/constants/events';
import { callApi } from './api';
import { ISortingRule } from '@/types';
import {
  findLocalTableById,
  isDevTable,
  tableFieldsToGridViewFields,
} from './dev-demo-data';

async function createView({
  tableId,
  name,
  icon,
  type,
  silent = false,
}: {
  tableId: string;
  name: string;
  icon: string;
  type: string;
  silent?: boolean;
}): Promise<Record<string, unknown>> {
  const response = await callApi.post('/view', {
    tableId,
    name: name.trim(),
    icon,
    type,
  });
  if (
    !response ||
    response.status !== 201 ||
    !response.data ||
    !response.data.view
  ) {
    const msg =
      (response as { data?: { message?: string } })?.data?.message ||
      'Error creating View';
    throw new Error(msg);
  }
  if (!silent) {
    window.dispatchEvent(
      new CustomEvent(dadixEvents.viewEvents.onCreate, {
        detail: {
          tableId,
          createdView: { ...response.data.view },
        },
      })
    );
  }
  return response.data;
}

async function getTableViews({
  tableId,
}: {
  tableId: string;
}): Promise<Record<string, unknown>> {
  // get all table views
  const response = await callApi.get(`/view?tableId=${tableId}`);
  if (!response || response.status !== 200 || !response.data) {
    throw new Error('Error get table views');
  }
  return response.data;
}

async function getView({
  tableId,
  id,
}: {
  tableId: string;
  id: number;
}): Promise<Record<string, unknown>> {
  if (isDevTable(tableId)) {
    const table = findLocalTableById(tableId);
    return {
      id,
      tableId,
      name: 'Alle Einträge',
      icon: 'LayoutGrid',
      order: 0,
      filter: '[]',
      sort: '[]',
      type: 'gridView',
      fields: tableFieldsToGridViewFields(table?.fields),
    };
  }
  const response = await callApi.get(`/view/${id}?tableId=${tableId}`);
  if (!response || response.status !== 200 || !response.data) {
    throw new Error('Error get view');
  }
  return response.data;
}

async function patchView({
  tableId,
  id,
  data,
  silent = false,
}: {
  tableId: string;
  id: number;
  data: {
    icon?: string | undefined;
    name?: string | undefined;
    order?: number | undefined;
    filter?: string | undefined;
    sort?: string | undefined;
  };
  silent?: boolean;
}): Promise<Record<string, unknown>> {
  // update a view
  const response = await callApi.patch(
    `/view/${id}?tableId=${tableId}`,
    JSON.stringify({
      data: {
        ...data,
      },
    })
  );
  if (!response || response.status !== 200 || !response.data) {
    throw new Error('Error update view');
  }
  if (!silent) {
    window.dispatchEvent(
      new CustomEvent(dadixEvents.viewEvents.onPatch, {
        detail: {
          tableId,
          id,
          updates: { ...data },
        },
      })
    );
  }
  return response.data;
}

async function deleteView({
  tableId,
  id,
  silent = false,
}: {
  tableId: string;
  id: number;
  silent?: boolean;
}): Promise<Record<string, unknown>> {
  // delete a view
  const response = await callApi.delete(`/view/${id}?tableId=${tableId}`);
  if (!response || response.status !== 200 || !response.data) {
    throw new Error('Error remove view');
  }
  if (!silent) {
    window.dispatchEvent(
      new CustomEvent(dadixEvents.viewEvents.onDelete, {
        detail: {
          tableId,
          id,
        },
      })
    );
  }
  return response.data;
}

async function duplicateView({
  tableId,
  viewId,
  silent = false,
}: {
  tableId: string;
  viewId: number;
  silent?: boolean;
}): Promise<Record<string, unknown>> {
  // create new view
  const response = await callApi.post(
    `/view/${viewId}/duplicate`,
    JSON.stringify({
      tableId,
    })
  );
  if (
    !response ||
    response.status !== 201 ||
    !response.data ||
    !response.data.view
  ) {
    throw new Error('Error duplicating View');
  }
  if (!silent) {
    window.dispatchEvent(
      new CustomEvent(dadixEvents.viewEvents.onCreate, {
        detail: {
          tableId,
          createdView: { ...response.data.view },
        },
      })
    );
  }
  return response.data;
}

/** Create a new view with auto-generated name (View1, View2, …). User can rename later. */
async function createNewViewDirect(
  tableId: string,
  existingViewCount: number
): Promise<Record<string, unknown>> {
  const name = `View${existingViewCount + 1}`;
  return createView({
    tableId,
    name,
    icon: 'LayoutGrid',
    type: 'gridView',
  });
}

/** View-only buttons (visible only in this grid view). */
async function createViewButton({
  viewId,
  tableId,
  label,
  order,
}: {
  viewId: number;
  tableId: string;
  label: string;
  order?: number;
}): Promise<Record<string, unknown>> {
  const res = await callApi.post('/view/grid/buttons', {
    viewId,
    tableId,
    label: label || 'Button',
    order,
  });
  if (!res || (res.status !== 200 && res.status !== 201) || !res.data) {
    throw new Error((res as { data?: { message?: string } })?.data?.message ?? 'Error creating button');
  }
  return res.data as Record<string, unknown>;
}

async function updateViewButton({
  buttonId,
  tableId,
  label,
  order,
}: {
  buttonId: number;
  tableId: string;
  label?: string;
  order?: number;
}): Promise<Record<string, unknown>> {
  const res = await callApi.patch(`/view/grid/buttons/${buttonId}`, {
    tableId,
    label,
    order,
  });
  if (!res || res.status !== 200 || !res.data) {
    throw new Error((res as { data?: { message?: string } })?.data?.message ?? 'Error updating button');
  }
  return res.data as Record<string, unknown>;
}

async function deleteViewButton({
  buttonId,
  tableId,
}: {
  buttonId: number;
  tableId: string;
}): Promise<void> {
  const res = await callApi.delete(`/view/grid/buttons/${buttonId}?tableId=${tableId}`);
  if (!res || res.status !== 200) {
    throw new Error('Error deleting button');
  }
}

export {
  createView,
  createNewViewDirect,
  getView,
  getTableViews,
  patchView,
  deleteView,
  duplicateView,
  createViewButton,
  updateViewButton,
  deleteViewButton,
};
