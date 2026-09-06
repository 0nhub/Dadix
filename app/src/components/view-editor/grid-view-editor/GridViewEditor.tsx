import { TableFieldTypeIcon } from '@/components/table-field-type-icon/TableFieldTypeIcon';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { dadixEvents } from '@/constants/events';
// import { useCurrentTableContext } from '@/context/CurrentTableContext';
import { patchGridViewColumn } from '@/lib/views/gridView';
import tableService from '@/lib/table';
import type {
  DadixFieldDataTypes,
  IDadixGridView,
  IDadixGridViewField,
  IDadixViewButton,
} from '@/types';
import {
  createViewButton,
  updateViewButton,
  deleteViewButton,
} from '@/lib/view';
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { LucideGripVertical, LucidePlus, LucideTrash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { LoadingIndicator } from '@/components/loading-indicator/LoadingIndicator';
import { getView } from '@/lib/view';
import {
  availableDadixFieldsDataTypes,
  dadixFieldsDataTypes,
  VIEW_BUTTON_TYPE,
} from '@/constants';
import { openEditTableFieldPanel } from '@/components/table-editor/EditTableFieldPanel';
import {
  GRIDVIEW_ALL_FIELDS_VISIBLE,
  GRIDVIEW_HIDE_ALL_FIELDS,
} from '@/components/view-editor/ViewEditor';
import { useTableContext } from '@/context/TableContext';
import { useLanguage } from '@/context/LanguageContext';

export function GridViewEditor({
  view,
  viewId: viewIdProp,
  tableId: tableIdProp,
}: {
  view?: IDadixGridView;
  viewId?: number;
  tableId?: string;
}) {
  const currentTableCtx = useTableContext();
  const { t } = useLanguage();
  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {})
  );

  const viewIdRef = useRef<number>(-1);

  const viewId = viewIdProp ?? view?.id;
  const tableId = tableIdProp ?? (view?.tableId != null ? `${view.tableId}` : undefined);

  const [gridView, setGridView] = useState<IDadixGridView | undefined>(view);
  const [loadingGridView, setLoadingGridView] = useState<boolean>(!!viewId && !!tableId);

  // Merge all table fields with view fields so every table field appears in Hidden fields.
  // View may only contain columns that were ever added to the view (e.g. 3); table has all (e.g. 6).
  const gridFields = useMemo(() => {
    const viewFields = gridView?.fields ?? [];
    const table = currentTableCtx?.table;
    const tableIdStr = tableId != null ? `${tableId}` : undefined;
    const ctxTableIdStr =
      currentTableCtx?.id != null ? `${currentTableCtx.id}` : undefined;
    const useTableFields =
      table?.fields?.length &&
      tableIdStr &&
      ctxTableIdStr &&
      tableIdStr === ctxTableIdStr;
    const tableFields = useTableFields ? table.fields : [];
    if (tableFields.length === 0) return viewFields;
    const byFieldId = new Map(
      viewFields.map((f) => [f.fieldId, f])
    );
    const merged: IDadixGridViewField[] = tableFields.map((tf) => {
      const vf = byFieldId.get(tf.id);
      if (vf) return vf;
      return {
        ...tf,
        id: -tf.id,
        fieldId: tf.id,
        fieldName: tf.name,
        fieldOrder: tf.order,
        isVisible: false,
      } as IDadixGridViewField;
    });
    return merged.sort((a, b) => {
      if (a.id < 0 && b.id < 0)
        return (a.fieldOrder ?? a.order) - (b.fieldOrder ?? b.order);
      if (a.id < 0) return 1;
      if (b.id < 0) return -1;
      return a.order - b.order;
    });
  }, [
    currentTableCtx?.table?.fields,
    currentTableCtx?.id,
    gridView?.fields,
    tableId,
  ]);

  let updatedField: IDadixGridViewField | undefined = undefined;

  // Always fetch when viewId and tableId are available so we get the full merged fields
  // (all table fields + view column config) from the server. The context view may only
  // contain the view's configured columns, not table fields that are not yet in the view.
  useEffect(() => {
    if (!tableId || viewId == null) return;
    setLoadingGridView(true);
    viewIdRef.current = viewId;
    const id = viewId;
    getView({ tableId, id })
      .then((res) => {
        if (id !== viewIdRef.current) return;
        if (!res) {
          throw new Error("couldn't load view options");
        }
        setGridView({ ...(res as unknown as IDadixGridView) });
        setLoadingGridView(false);
        return res;
      })
      .catch((err) => {
        if (id !== viewIdRef.current) return;
        setLoadingGridView(false);
        console.error("couldn't load view options:", err);
      });
  }, [viewId, tableId]);

  useEffect(() => {
    // handle create table field event
    window.addEventListener(
      dadixEvents.tableEvents.onCreateField,
      handleCreateTableFieldEvent
    );
    return () => {
      window.removeEventListener(
        dadixEvents.tableEvents.onCreateField,
        handleCreateTableFieldEvent
      );
    };

    function handleCreateTableFieldEvent(evnt: Event) {
      const { tableId, data, addToView } = (evnt as CustomEvent).detail || {};
      // Only add to view when created via Hidden fields; Table Editor must not auto-add to current view
      if (addToView !== true) return;
      if (!tableId || !data || !gridView) return;
      if (`${tableId}` !== `${gridView.tableId}`) return;
      setGridView((prev) => {
        if (!prev) return prev;
        const existing = prev.fields?.some((f) => f.fieldId === data.id);
        if (existing) return prev;
        return {
          ...prev,
          fields: [
            ...(prev.fields || []),
            {
              ...data,
              id: -data.id,
              fieldId: data.id,
              fieldName: data.name,
              fieldOrder: data.order,
              isVisible: true,
            },
          ],
        };
      });
    }
  }, [gridView]);

  useEffect(() => {
    // handle update table field event
    window.addEventListener(
      dadixEvents.gridViewEvents.onPatchField,
      handlePatchGridViewFieldFieldEvent
    );
    return () => {
      window.removeEventListener(
        dadixEvents.gridViewEvents.onPatchField,
        handlePatchGridViewFieldFieldEvent
      );
    };

    function handlePatchGridViewFieldFieldEvent(evnt: Event) {
      const { viewId, id, data } = (evnt as CustomEvent).detail || {};
      if (!viewId || !id || !data || !gridView) return;
      if (`${gridView.id}` !== `${viewId}`) return;
      const updatedField = gridView.fields?.find(
        (field) => `${field.id}` === `${id}`
      );
      if (!updatedField) return;
      setGridView((gridView) => {
        if (!gridView) return undefined;
        const fieldsToBeUpdated = {
          [`${id}`]: { ...data },
        };
        const fieldsAttributesToBeUpdated = Object.keys(data);

        if (fieldsAttributesToBeUpdated.indexOf('order') >= 0) {
          const reorderFrom = updatedField?.order ?? 0;
          const reorderTo = data.order ?? 0;
          if (reorderFrom === reorderTo) return gridView;
          const reorderDirection = Math.sign(reorderFrom - reorderTo);
          const minOrder = Math.min(reorderFrom, reorderTo);
          const maxOrder = Math.max(reorderFrom, reorderTo);
          gridView.fields?.map((field) => {
            if (`${field.id}` === `${id}`) return null;
            if (field.order < minOrder || field.order > maxOrder) return null;
            fieldsToBeUpdated[`${field.id}`] = {
              ...(fieldsToBeUpdated[`${field.id}`] || {}),
              order: field.order + reorderDirection,
            };
            return null;
          });
        }
        return {
          ...gridView,
          fields: gridView.fields
            ?.map((field) => {
              if (fieldsToBeUpdated[`${field.id}`]) {
                return { ...field, ...fieldsToBeUpdated[`${field.id}`] };
              }
              return field;
            })
            .sort((field1, field2) => {
              if (field1.id < 0) return 1;
              if (field2.id < 0) return -1;
              return field1.order - field2.order;
            }),
        };
      });
    }
  }, [gridView]);

  useEffect(() => {
    // handle delete table field event
    window.addEventListener(
      dadixEvents.tableEvents.onDeleteField,
      handleDeleteTableFieldEvent
    );
    return () => {
      window.removeEventListener(
        dadixEvents.tableEvents.onDeleteField,
        handleDeleteTableFieldEvent
      );
    };

    function handleDeleteTableFieldEvent(evnt: Event) {
      const { tableId, fieldId } = (evnt as CustomEvent).detail;
      if (!tableId || !fieldId || !gridView) return;
      if (`${tableId}` !== `${gridView.tableId}`) return;

      const deletedField = gridView.fields.find(
        (field) => `${field.fieldId}` === `${fieldId}`
      );
      if (!deletedField) return;

      setGridView((gridView) => {
        if (!gridView) {
          return gridView;
        }
        return {
          ...gridView,
          fields: gridView.fields
            ?.filter((field) => field.fieldId !== fieldId)
            .sort((field1, field2) => {
              if (field1.id < 0) return -1;
              if (field2.id < 0) return 1;
              return field1.order - field2.order;
            })
            .map((field, index) => ({ ...field, order: index })),
        };
      });
    }
  }, [gridView]);

  useEffect(() => {
    const onAllVisible = (evnt: Event) => {
      const { viewId: evViewId, tableId: evTableId } = (evnt as CustomEvent).detail || {};
      if (!gridView || `${evViewId}` !== `${gridView.id}` || `${evTableId}` !== `${gridView.tableId}`) return;
      void handleAllFieldsVisible();
    };
    const onHideAll = (evnt: Event) => {
      const { viewId: evViewId, tableId: evTableId } = (evnt as CustomEvent).detail || {};
      if (!gridView || `${evViewId}` !== `${gridView.id}` || `${evTableId}` !== `${gridView.tableId}`) return;
      void handleHideAllFields();
    };
    window.addEventListener(GRIDVIEW_ALL_FIELDS_VISIBLE, onAllVisible);
    window.addEventListener(GRIDVIEW_HIDE_ALL_FIELDS, onHideAll);
    return () => {
      window.removeEventListener(GRIDVIEW_ALL_FIELDS_VISIBLE, onAllVisible);
      window.removeEventListener(GRIDVIEW_HIDE_ALL_FIELDS, onHideAll);
    };
  }, [gridView]);

  function updateViewField(
    opts: {
      id: number;
      data: Partial<IDadixGridViewField>;
      /** Pass the field when toggling so we have fieldId even if it's not in gridView.fields */
      fieldRef?: IDadixGridViewField;
    }
  ) {
    const { id, data, fieldRef } = opts;
    if (!id || !data || !gridView) return;
    updatedField = gridView.fields?.find((field) => `${field.id}` === `${id}`);
    if (!updatedField && id < 0) {
      updatedField = fieldRef ?? gridFields.find((f) => f.id === id);
    }
    if (!updatedField) return;
    const fieldsAttributesToBeUpdated = Object.keys(data);
    const fieldExistsInView = gridView.fields?.some((f) => `${f.id}` === `${id}`);
    // Only update local view state when the field is already in gridView.fields (not for virtual)
    if (fieldExistsInView) {
      setGridView((gridView) => {
        if (!gridView) return undefined;
        const fieldsToBeUpdated = {
          [`${id}`]: { ...data },
        };

        if (fieldsAttributesToBeUpdated.indexOf('order') >= 0) {
          const reorderFrom = updatedField?.order ?? 0;
          const reorderTo = data.order ?? 0;
          if (reorderFrom === reorderTo) return gridView;
          const reorderDirection = Math.sign(reorderFrom - reorderTo);
          const minOrder = Math.min(reorderFrom, reorderTo);
          const maxOrder = Math.max(reorderFrom, reorderTo);
          gridView.fields?.map((field) => {
            if (`${field.id}` === `${id}`) return null;
            if (field.order < minOrder || field.order > maxOrder) return null;
            fieldsToBeUpdated[`${field.id}`] = {
              ...(fieldsToBeUpdated[`${field.id}`] || {}),
              order: field.order + reorderDirection,
            };
            return null;
          });
        }
        return {
          ...gridView,
          fields: gridView.fields
            ?.map((field) => {
              if (fieldsToBeUpdated[`${field.id}`]) {
                return { ...field, ...fieldsToBeUpdated[`${field.id}`] };
              }
              return field;
            })
            .sort((field1, field2) => {
              if (field1.id < 0) return 1;
              if (field2.id < 0) return -1;
              return field1.order - field2.order;
            }),
        };
      });
    }
    if (
      fieldsAttributesToBeUpdated.length === 1 &&
      fieldsAttributesToBeUpdated[0] === 'id'
    ) {
      window.dispatchEvent(
        new CustomEvent(dadixEvents.gridViewEvents.onPatchField, {
          detail: {
            viewId: gridView.id,
            id,
            data: {
              id: data.id,
            },
          },
        })
      );
      return;
    }
    const fieldToPatch = updatedField;
    const tableIdStr = `${gridView.tableId}`;
    if (!tableIdStr || tableIdStr === 'undefined') {
      toast.error('View has no table');
      return;
    }
    // Optimistic update for virtual fields (id < 0): show switch as on immediately
    if (fieldToPatch.id < 0 && data.isVisible === true) {
      setGridView((prev) => {
        if (!prev?.fields) return prev;
        const already = prev.fields.some(
          (f) => String(f.id) === String(fieldToPatch.id) || f.fieldId === fieldToPatch.fieldId
        );
        if (already) {
          return {
            ...prev,
            fields: prev.fields.map((f) =>
              f.fieldId === fieldToPatch.fieldId ? { ...f, isVisible: true } : f
            ),
          };
        }
        return {
          ...prev,
          fields: [
            ...prev.fields,
            { ...fieldToPatch, isVisible: true },
          ].sort((a, b) => {
            if (a.id < 0) return 1;
            if (b.id < 0) return -1;
            return (a.order ?? 0) - (b.order ?? 0);
          }),
        };
      });
    }
    patchGridViewColumn({
      tableId: tableIdStr,
      gridViewId: gridView.id,
      tableColumnId: fieldToPatch.fieldId,
      id: fieldToPatch.id,
      data: {
        isVisible: data.isVisible,
        name: data.name,
        order: data.order,
        size: data.size,
      },
    })
      .then((res) => {
        const raw = res && typeof res === 'object' ? res : null;
        const newId = raw != null && 'id' in raw ? Number((raw as { id: unknown }).id) : undefined;
        if (fieldToPatch.id < 0 && newId != null && !Number.isNaN(newId)) {
          setGridView((prev) => {
            if (!prev?.fields) return prev;
            const withoutOld = prev.fields.filter(
              (f) => String(f.id) !== String(fieldToPatch.id)
            );
            const next = {
              ...prev,
              fields: [
                ...withoutOld,
                {
                  ...fieldToPatch,
                  id: newId,
                  isVisible: data.isVisible ?? true,
                },
              ].sort((a, b) => {
                if (a.id < 0) return 1;
                if (b.id < 0) return -1;
                return a.order - b.order;
              }),
            };
            return next;
          });
          const newField = {
            ...fieldToPatch,
            id: newId,
            isVisible: data.isVisible ?? true,
          };
          window.dispatchEvent(
            new CustomEvent(dadixEvents.gridViewEvents.onPatchField, {
              detail: {
                viewId: gridView.id,
                tableId: gridView.tableId != null ? `${gridView.tableId}` : undefined,
                id: fieldToPatch.id,
                data: { id: newId, isVisible: data.isVisible ?? true },
                newField,
              },
            })
          );
          window.dispatchEvent(
            new CustomEvent(dadixEvents.gridViewEvents.onRefetchView, {
              detail: { viewId: gridView.id, tableId: gridView.tableId != null ? `${gridView.tableId}` : undefined },
            })
          );
        } else {
          // Existing field (id > 0): update panel state and notify GridViewContext so the table shows the new visibility
          setGridView((prev) => {
            if (!prev?.fields) return prev;
            return {
              ...prev,
              fields: prev.fields.map((f) =>
                String(f.id) === String(fieldToPatch.id)
                  ? { ...f, isVisible: data.isVisible ?? f.isVisible, name: data.name ?? f.name, order: data.order ?? f.order, size: data.size ?? f.size }
                  : f
              ),
            };
          });
          window.dispatchEvent(
            new CustomEvent(dadixEvents.gridViewEvents.onPatchField, {
              detail: {
                viewId: gridView.id,
                tableId: tableIdStr,
                id: fieldToPatch.id,
                data: { isVisible: data.isVisible, name: data.name, order: data.order, size: data.size },
              },
            })
          );
        }
        return res;
      })
      .catch((err) => {
        console.error('Error patching grid view column:', err);
        const msg = err?.message ?? err?.response?.data?.message ?? 'Failed to update field visibility';
        toast.error(msg);
        // Revert optimistic update for virtual field
        if (fieldToPatch.id < 0 && data.isVisible === true) {
          setGridView((prev) => {
            if (!prev?.fields) return prev;
            return {
              ...prev,
              fields: prev.fields.filter(
                (f) => String(f.id) !== String(fieldToPatch.id) && f.fieldId !== fieldToPatch.fieldId
              ),
            };
          });
        }
      });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.data.current?.id as number | undefined;
    const overId = over.data.current?.id as number | undefined;
    const orderTo = over?.data.current?.order as number | undefined;
    if (activeId === undefined || orderTo === undefined) return;

    if (activeId > 0 && overId != null && overId > 0) {
      if (active.data.current?.order === orderTo) return;
      updateViewField({ id: activeId, data: { order: orderTo } });
      return;
    }
    // Hidden field (id < 0) dropped: add to view, then set order so position is correct
    if (activeId < 0 && gridView?.tableId) {
      const field = gridFields.find((f) => f.id === activeId);
      if (!field) return;
      patchGridViewColumn({
        tableId: `${gridView.tableId}`,
        gridViewId: gridView.id,
        tableColumnId: field.fieldId,
        id: field.id,
        data: { isVisible: true, order: orderTo },
      })
        .then((res) => {
          const newId = res && (res as { id?: number }).id;
          if (newId) {
            setGridView((prev) => {
              if (!prev?.fields) return prev;
              const without = prev.fields.filter((f) => f.id !== field.id);
              const next = {
                ...prev,
                fields: [
                  ...without,
                  { ...field, id: newId, isVisible: true, order: orderTo },
                ].sort((a, b) => {
                  if (a.id < 0) return 1;
                  if (b.id < 0) return -1;
                  return a.order - b.order;
                }),
              };
              return next;
            });
            if (orderTo !== undefined) {
              patchGridViewColumn({
                tableId: `${gridView.tableId}`,
                gridViewId: gridView.id,
                tableColumnId: field.fieldId,
                id: newId,
                data: { order: orderTo },
              }).catch((err) => console.error('Error patching column order:', err));
            }
          }
          return res;
        })
        .catch((err) => console.error('Error adding column to view:', err));
    }
  }

  async function handleAllFieldsVisible() {
    if (!gridView?.fields?.length || !gridView.tableId) return;
    const tableIdStr = `${gridView.tableId}`;
    for (const field of gridView.fields) {
      if (field.type === availableDadixFieldsDataTypes.RELATION) continue;
      await patchGridViewColumn({
        tableId: tableIdStr,
        gridViewId: gridView.id,
        tableColumnId: field.fieldId,
        id: field.id,
        data: { isVisible: true },
      });
    }
    setGridView((prev) => {
      if (!prev?.fields) return prev;
      return {
        ...prev,
        fields: prev.fields.map((f) =>
          f.type === availableDadixFieldsDataTypes.RELATION ? f : { ...f, isVisible: true }
        ),
      };
    });
  }

  async function handleHideAllFields() {
    if (!gridView?.fields?.length || !gridView.tableId) return;
    const tableIdStr = `${gridView.tableId}`;
    for (const field of gridView.fields) {
      if (field.type === availableDadixFieldsDataTypes.RELATION) continue;
      await patchGridViewColumn({
        tableId: tableIdStr,
        gridViewId: gridView.id,
        tableColumnId: field.fieldId,
        id: field.id,
        data: { isVisible: false },
      });
    }
    setGridView((prev) => {
      if (!prev?.fields) return prev;
      return {
        ...prev,
        fields: prev.fields.map((f) =>
          f.type === availableDadixFieldsDataTypes.RELATION ? f : { ...f, isVisible: false }
        ),
      };
    });
  }

  if (!view && !tableId && !viewId) return null;

  // if (!currentTableCtx.table || !currentTableCtx.table.fields) {
  //   return null;
  // }

  if (loadingGridView) {
    return (
      <div className='flex justify-center items-center w-full'>
        {/*<LoadingIndicator visibilityDelay={false} />*/}
      </div>
    );
  }

  if (!gridView || (!view && gridView.id !== viewId)) return null;

  return (
    <div>
      <DndContext
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
        sensors={sensors}
        id='projects-editor--projects-list'
      >
        <SortableContext
          items={gridFields.map((f) => f.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className='flex-col border mt-0 mb-4 rounded-md overflow-hidden'>
            {gridFields.map((field) => {
              return (
                <GridViewField
                  key={field.id}
                  field={field}
                  updateField={updateViewField}
                  tableContext={currentTableCtx}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
      {gridView && (
        <AddNewFieldForm
          tableId={gridView.tableId}
          gridViewId={gridView.id}
          gridView={gridView}
          setGridView={setGridView}
          onRefetch={() => {
            window.dispatchEvent(
              new CustomEvent(dadixEvents.gridViewEvents.onRefetchView, {
                detail: {
                  viewId: gridView.id,
                  tableId: gridView.tableId != null ? `${gridView.tableId}` : undefined,
                },
              })
            );
          }}
        />
      )}
      {gridView && (gridView.buttons?.length ?? 0) > 0 && (
        <ViewButtonsList
          gridView={gridView}
          setGridView={setGridView}
          onRefetch={() => {
            window.dispatchEvent(
              new CustomEvent(dadixEvents.gridViewEvents.onRefetchView, {
                detail: {
                  viewId: gridView.id,
                  tableId: gridView.tableId != null ? `${gridView.tableId}` : undefined,
                },
              })
            );
          }}
        />
      )}
    </div>
  );
}

function ViewButtonsList({
  gridView,
  setGridView,
  onRefetch,
}: {
  gridView: IDadixGridView;
  setGridView: React.Dispatch<React.SetStateAction<IDadixGridView | undefined>>;
  onRefetch: () => void;
}) {
  const buttons = gridView.buttons ?? [];
  const tableId = gridView.tableId != null ? `${gridView.tableId}` : undefined;
  const [saving, setSaving] = useState(false);

  const handleDelete = (btn: IDadixViewButton) => {
    if (!tableId) return;
    setSaving(true);
    deleteViewButton({ buttonId: btn.id, tableId })
      .then(() => {
        setGridView((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            buttons: (prev.buttons || []).filter((b) => b.id !== btn.id),
          };
        });
        onRefetch();
      })
      .catch((err) => toast.error(err?.message ?? 'Failed to delete'))
      .finally(() => setSaving(false));
  };

  const handleRename = (btn: IDadixViewButton, label: string) => {
    if (!tableId || !label.trim()) return;
    setSaving(true);
    updateViewButton({ buttonId: btn.id, tableId, label: label.trim() })
      .then((updated) => {
        setGridView((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            buttons: (prev.buttons || []).map((b) =>
              b.id === btn.id ? (updated as IDadixViewButton) : b
            ),
          };
        });
        onRefetch();
      })
      .catch((err) => toast.error(err?.message ?? 'Failed to update'))
      .finally(() => setSaving(false));
  };

  return (
    <div className='mt-4 pt-4 border-t'>
      <div className='text-sm font-medium text-muted-foreground mb-2'>
        Buttons (only in this view)
      </div>
      <div className='flex flex-col gap-2'>
        {buttons.map((btn) => (
          <ViewButtonRow
            key={btn.id}
            button={btn}
            onDelete={() => handleDelete(btn)}
            onRename={(label) => handleRename(btn, label)}
            disabled={saving}
          />
        ))}
      </div>
    </div>
  );
}

function ViewButtonRow({
  button,
  onDelete,
  onRename,
  disabled,
}: {
  button: IDadixViewButton;
  onDelete: () => void;
  onRename: (_label: string) => void;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(button.label);

  useEffect(() => {
    setLabel(button.label);
  }, [button.label]);

  if (editing) {
    return (
      <div className='flex items-center gap-2 h-9'>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => {
            setEditing(false);
            if (label.trim() && label.trim() !== button.label) {
              onRename(label.trim());
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setEditing(false);
              if (label.trim() && label.trim() !== button.label) {
                onRename(label.trim());
              }
            }
          }}
          className='flex-1 h-8'
          autoFocus
        />
      </div>
    );
  }

  return (
    <div className='flex items-center gap-2 h-9 px-2 rounded-md border bg-background'>
      <span
        className='flex-1 min-w-0 truncate text-sm cursor-pointer'
        onClick={() => setEditing(true)}
        title={button.label}
      >
        {button.label}
      </span>
      <Button
        type='button'
        variant='ghost'
        size='icon'
        className='shrink-0 h-7 w-7'
        onClick={onDelete}
        disabled={disabled}
        aria-label='Delete button'
      >
        <LucideTrash2 className='size-3.5' />
      </Button>
    </div>
  );
}

function GridViewField({
  field,
  updateField,
  tableContext,
}: {
  field: IDadixGridViewField;
  updateField: (opts: {
    id: number;
    data: Partial<IDadixGridViewField>;
    fieldRef?: IDadixGridViewField;
  }) => void;
  tableContext: ReturnType<typeof useTableContext>;
}) {
  const {
    transform,
    transition,
    setNodeRef,
    isDragging,
    attributes,
    listeners,
  } = useSortable({
    id: field.id,
    data: {
      id: field.id,
      order: field.order,
    },
  });
  return (
    <div
      data-dragging={isDragging}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className='relative flex flex-row justify-start items-center h-12 bg-background not-last:border-b gap-3 z-0 data-[dragging=true]:border data-[dragging=true]:z-10 data-[dragging=true]:opacity-80 data-[selected=true]:bg-muted'
    >
      <span
        {...attributes}
        {...listeners}
        className='h-full flex items-center justify-end w-7 shrink-0 grow-0 opacity-20'
      >
        <LucideGripVertical className='size-4.5' />
      </span>
      <button
        type='button'
        className='flex min-w-0 flex-1 items-center gap-3 text-left hover:opacity-80'
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => {
          const tableFieldId = Number(field.fieldId ?? field.id);
          if (!tableFieldId || tableFieldId < 0 || !tableContext?.table) return;
          openEditTableFieldPanel({
            fieldId: tableFieldId,
            tableContext,
            allowNavigation: true,
          });
        }}
      >
        <span>
          <TableFieldTypeIcon name={field?.type || ''} className='size-4.5' />
        </span>
        <span
          title={field.fieldName}
          className='min-w-0 shrink grow overflow-hidden text-ellipsis whitespace-nowrap text-sm'
        >
          {field.fieldName}
        </span>
      </button>
      {field.type !== availableDadixFieldsDataTypes.RELATION && (
        <div
          className='shrink-0 grow-0 ml-auto mr-2'
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <Switch
            checked={field.isVisible}
            onCheckedChange={(value) => {
              updateField({
                id: field.id,
                data: { isVisible: value },
                fieldRef: field,
              });
            }}
          />
        </div>
      )}
    </div>
  );
}

function AddNewFieldForm({
  tableId,
  gridViewId,
  gridView,
  setGridView,
  onRefetch,
}: {
  tableId: string;
  gridViewId: number;
  gridView: IDadixGridView;
  setGridView: React.Dispatch<React.SetStateAction<IDadixGridView | undefined>>;
  onRefetch: () => void;
}) {
  const tableCtx = useTableContext();
  const [newFieldType, setNewFieldType] = useState('1');
  const [newFieldName, setNewFieldName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleAddField = () => {
    if (!newFieldName.trim()) {
      toast.error('Please enter a field name');
      return;
    }

    const selectedType = dadixFieldsDataTypes.find(
      (type) => type.id === parseInt(newFieldType)
    );

    if (!selectedType) {
      toast.error('Please select a valid field type');
      return;
    }

    if (!tableId) return;

    // View-only button: add via same dropdown, no table field
    if (selectedType.value === VIEW_BUTTON_TYPE) {
      setIsSaving(true);
      const label = newFieldName.trim();
      const order = gridView.buttons?.length ?? 0;
      createViewButton({ viewId: gridViewId, tableId: `${tableId}`, label, order })
        .then((created) => {
          const b = created as IDadixViewButton;
          setGridView((prev) => {
            if (!prev) return prev;
            return { ...prev, buttons: [...(prev.buttons || []), b] };
          });
          setNewFieldName('');
          onRefetch();
        })
        .catch((err) => toast.error(err?.response?.data?.message ?? err?.message ?? t('table.buttonAddFailed')))
        .finally(() => setIsSaving(false));
      return;
    }

    try {
      const fieldData = {
        name: newFieldName.trim(),
        type: selectedType.value as DadixFieldDataTypes,
      };

      setIsSaving(true);

      tableService
        .createTableField({
          tableId: `${tableId}`,
          fieldData,
        })
        .then(async (res) => {
          if (res.status !== 201 || !res.data) {
            throw new Error('Error creating new Field');
          }
          const tableIdForContext = tableCtx?.id ?? tableId;
          window.dispatchEvent(
            new CustomEvent(dadixEvents.tableEvents.onCreateField, {
              detail: {
                tableId: tableIdForContext,
                data: { ...res.data },
                addToView: true,
              },
            })
          );
          window.dispatchEvent(
            new CustomEvent(dadixEvents.tableEvents.onRefetchTable, {
              detail: { tableId: tableIdForContext },
            })
          );
          try {
            await patchGridViewColumn({
              id: -(res.data.id as number),
              tableColumnId: res.data.id as number,
              tableId: `${tableId}`,
              gridViewId,
              data: {
                isVisible: true,
              },
            });
          } catch (viewErr) {
            console.error('[dadix] VIEW_COLUMN_UPDATE_FAILED after field create', viewErr);
          }
          setNewFieldName('');
          setNewFieldType('1');
          setIsSaving(false);
          openEditTableFieldPanel({
            fieldId: (res.data as { id: number }).id,
            tableContext: tableCtx,
          });
          return res;
        })
        .catch((err) => {
          setIsSaving(false);
          const msg = err instanceof Error ? err.message : String(err);
          console.error('FIELD_CREATE_FAILED', err);
          toast.error(msg || 'Failed to add field');
        });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('FIELD_CREATE_FAILED', error);
      toast.error(msg || 'Failed to add field');
    }
  };

  return (
    <form
      className='flex flex-row flex-nowrap items-center justify-start gap-2'
      onSubmit={(evnt) => {
        evnt.preventDefault();
        handleAddField();
      }}
    >
      <Select value={newFieldType} onValueChange={setNewFieldType}>
        <SelectTrigger className='min-w-17.5 [&_.label]:hidden!'>
          <SelectValue className='' />
        </SelectTrigger>
        <SelectContent>
          {dadixFieldsDataTypes.map((dadixFieldType) => (
            <SelectItem key={dadixFieldType.id} value={`${dadixFieldType.id}`}>
              <TableFieldTypeIcon
                name={dadixFieldType.value}
                className='size-5 text-primary'
              />
              <span className='label'>{dadixFieldType.name}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        placeholder={`${dadixFieldsDataTypes[parseInt(newFieldType) - 1].name} field`}
        value={newFieldName}
        onChange={(e) => setNewFieldName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            handleAddField();
          }
        }}
        required
      />
      <Button size='icon' variant='default' type='submit' disabled={isSaving}>
        {/*{isSaving ? (
          <LoadingIndicator className='size-4' visibilityDelay={false} />
        ) : (
          <LucidePlus className='size-4' />
        )}*/}
        <LucidePlus className='size-4' />
      </Button>
    </form>
  );
}
