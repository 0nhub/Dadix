import type { ColumnRow, RecordRow, TableRow, ViewRow, GridViewColumnRow } from "../types";

function fieldAction(raw: unknown): "copy" | "edit" | "openUrl" | null {
  if (raw === "copy" || raw === "edit" || raw === "openUrl") return raw;
  return null;
}

export function parseColumnOptions(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function columnToField(column: ColumnRow) {
  const options = parseColumnOptions(column.options);
  const choiceOptions = Array.isArray(options.options) ? options.options : undefined;
  return {
    id: column.id,
    name: column.name,
    type: column.type_name,
    size: typeof options.size === "number" ? options.size : 255,
    order: column.order,
    options: choiceOptions,
    choiceMode: options.choiceMode,
    formula: options.formula,
    textOptions: options.textOptions,
    numberOptions: options.numberOptions,
    relationOptions: options.relationOptions,
    aiOptions: options.aiOptions,
    isVisible: options.isVisible !== false,
    contentAlign: options.contentAlign ?? "left",
    action: fieldAction(options.action),
    placeholder: options.placeholder,
    defaultValue: options.defaultValue,
  };
}

const OPTION_KEYS = [
  "options",
  "formula",
  "textOptions",
  "numberOptions",
  "relationOptions",
  "aiOptions",
  "placeholder",
  "defaultValue",
  "size",
  "isVisible",
  "contentAlign",
  "action",
  "choiceMode",
] as const;

export function fieldOptionsPayload(field: Record<string, unknown>, fallback?: ColumnRow): string {
  const current = fallback ? parseColumnOptions(fallback.options) : {};
  const next: Record<string, unknown> = { ...current };
  for (const key of OPTION_KEYS) {
    if (field[key] !== undefined) next[key] = field[key];
  }
  return JSON.stringify(next);
}

export function tableToWeb(table: TableRow, fields: ReturnType<typeof columnToField>[], projectId: string) {
  return {
    id: String(table.id),
    name: table.name,
    icon: table.icon || "Table",
    userId: "local",
    projectId,
    order: table.order,
    fields,
    createdAt: "",
    updatedAt: "",
  };
}

export function viewToWeb(
  view: ViewRow,
  fields: ReturnType<typeof columnToField>[],
  gridColumns: GridViewColumnRow[],
  icon: string,
  buttons: { id: number; viewId: number; label: string; order: number }[]
) {
  const byColumn = new Map(fields.map((field) => [field.id, field]));
  const gridOrFallback = gridColumns.length
    ? gridColumns
    : fields.map((field, order) => ({
        id: field.id,
        view_id: view.id,
        column_id: field.id,
        name: field.name,
        size: null,
        order,
        is_visible: true,
        content_align: null,
      }));
  const mapped = gridOrFallback.map((column) => {
    const field = byColumn.get(column.column_id) ?? byColumn.get(column.id);
    return {
      ...(field ?? {
        id: column.column_id,
        name: column.name ?? "",
        type: "TEXT",
        size: 255,
        order: column.order,
        isVisible: column.is_visible,
        contentAlign: column.content_align ?? "left",
        action: null,
      }),
      id: column.id,
      fieldId: column.column_id,
      fieldName: (field?.name && String(field.name).trim()) || (column.name && String(column.name).trim()) || "",
      fieldOrder: column.order,
      order: column.order,
      size: column.size ?? field?.size ?? 0,
      isVisible: column.is_visible !== false,
      contentAlign: column.content_align ?? field?.contentAlign ?? "left",
    };
  });
  const have = new Set(mapped.map((field) => field.fieldId));
  const extras = fields
    .filter((field) => !have.has(field.id))
    .map((field, index) => ({
      ...field,
      id: field.id,
      fieldId: field.id,
      fieldName: field.name,
      fieldOrder: field.order ?? mapped.length + index,
      order: field.order ?? mapped.length + index,
      isVisible: field.isVisible !== false,
    }));
  return {
    id: view.id,
    tableId: String(view.table_id),
    name: view.name,
    icon,
    order: view.order,
    filter: view.filter ?? "[]",
    sort: view.sort ?? "[]",
    type: view.type_name || "gridView",
    fields: [...mapped, ...extras],
    buttons,
  };
}

export function recordToWeb(row: RecordRow): Record<string, unknown> {
  return { ...row };
}
