import type { ColumnRow } from "../types";

export type FieldType = "TEXT" | "INTEGER" | "BOOLEAN" | "CHOICE" | "DATE";

export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "TEXT", label: "Text" },
  { value: "INTEGER", label: "Zahl" },
  { value: "BOOLEAN", label: "Schalter" },
  { value: "CHOICE", label: "Auswahl" },
  { value: "DATE", label: "Datum" },
];

export interface ChoiceOption {
  id: string;
  value: string;
  color: string;
  order: number;
}

export interface FieldOptions {
  choiceMode?: "single" | "multi";
  options?: ChoiceOption[];
}

export interface WorkspaceField {
  id: number;
  name: string;
  type: FieldType;
  options: FieldOptions;
  order: number;
}

export function normalizeType(typeName: string): FieldType {
  const upper = typeName.toUpperCase();
  if (upper === "NUMBER") return "INTEGER";
  if (upper === "TEXT" || upper === "INTEGER" || upper === "BOOLEAN" || upper === "CHOICE" || upper === "DATE") {
    return upper;
  }
  return "TEXT";
}

export function columnToField(column: ColumnRow): WorkspaceField {
  let parsed: FieldOptions = {};
  if (column.options) {
    try {
      parsed = JSON.parse(column.options) as FieldOptions;
    } catch {
      parsed = {};
    }
  }
  return {
    id: column.id,
    name: column.name,
    type: normalizeType(column.type_name),
    options: parsed,
    order: column.order,
  };
}

export function fieldOptionsJson(field: Pick<WorkspaceField, "type" | "options">): string | null {
  if (field.type !== "CHOICE") return null;
  return JSON.stringify({
    choiceMode: field.options.choiceMode ?? "single",
    options: field.options.options ?? [],
  });
}

export function emptyFieldValue(type: FieldType): unknown {
  switch (type) {
    case "BOOLEAN":
      return false;
    case "INTEGER":
      return "";
    default:
      return "";
  }
}
