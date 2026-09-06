import { useState } from "react";
import { Plus } from "lucide-react";
import type { RecordRow } from "@/types";
import type { WorkspaceField } from "@/lib/fields";
import { cn } from "@/lib/utils";

interface DataGridProps {
  fields: WorkspaceField[];
  records: RecordRow[];
  selectedIds: number[];
  onSelectedIdsChange: (ids: number[]) => void;
  onEditField: (field: WorkspaceField) => void;
  onAddField: () => void;
  onChangeCell: (record: RecordRow, field: WorkspaceField, value: unknown) => void;
  onAddRow: () => void;
}

function displayValue(record: RecordRow, field: WorkspaceField): string {
  const value = record[field.name];
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  return String(value);
}

function choiceColor(field: WorkspaceField, value: unknown): string {
  return (
    field.options.options?.find((o) => o.value === String(value))?.color ??
    "#94a3b8"
  );
}

export function DataGrid({
  fields,
  records,
  selectedIds,
  onSelectedIdsChange,
  onEditField,
  onAddField,
  onChangeCell,
  onAddRow,
}: DataGridProps) {
  const [editing, setEditing] = useState<{ id: number; field: string } | null>(
    null
  );
  const [draft, setDraft] = useState("");
  const allSelected = records.length > 0 && selectedIds.length === records.length;

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-background">
          <tr>
            <th className="w-10 border-b px-2 py-2 text-left">
              <button
                type="button"
                className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent"
                onClick={onAddRow}
                title="Zeile hinzufügen"
              >
                <Plus className="size-4" />
              </button>
            </th>
            <th className="w-10 border-b px-2 py-2">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) =>
                  onSelectedIdsChange(e.target.checked ? records.map((r) => r.id) : [])
                }
              />
            </th>
            {fields.map((field) => (
              <th
                key={field.id}
                className="min-w-[180px] border-b px-2 py-2 text-left text-[13px] font-medium text-foreground"
              >
                <button
                  type="button"
                  className="hover:underline"
                  onClick={() => onEditField(field)}
                >
                  {field.name}
                </button>
              </th>
            ))}
            <th className="border-b px-2 py-2 text-left">
              <button
                type="button"
                className="text-sm text-muted-foreground hover:text-foreground"
                onClick={onAddField}
              >
                +
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {records.map((record, index) => (
            <tr key={record.id} className="hover:bg-muted/40">
              <td className="w-10 border-b px-2 py-2 text-center text-xs text-muted-foreground">
                {index + 1}
              </td>
              <td className="w-10 border-b px-2 py-2 text-center">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(record.id)}
                  onChange={(e) =>
                    onSelectedIdsChange(
                      e.target.checked
                        ? [...selectedIds, record.id]
                        : selectedIds.filter((id) => id !== record.id)
                    )
                  }
                />
              </td>
              {fields.map((field) => {
                const isEditing =
                  editing?.id === record.id && editing.field === field.name;
                const value = record[field.name];
                return (
                  <td key={field.id} className="border-b p-0">
                    {field.type === "BOOLEAN" ? (
                      <label className="flex h-11 items-center px-3">
                        <input
                          type="checkbox"
                          checked={Boolean(value)}
                          onChange={(e) =>
                            onChangeCell(record, field, e.target.checked)
                          }
                        />
                      </label>
                    ) : field.type === "CHOICE" && !isEditing ? (
                      <button
                        type="button"
                        className="flex h-11 w-full items-center px-3"
                        onClick={() => {
                          setEditing({ id: record.id, field: field.name });
                          setDraft(String(value ?? ""));
                        }}
                      >
                        {value ? (
                          <span
                            className="rounded-md px-2 py-0.5 text-xs font-medium text-white"
                            style={{ background: choiceColor(field, value) }}
                          >
                            {String(value)}
                          </span>
                        ) : null}
                      </button>
                    ) : isEditing ? (
                      field.type === "CHOICE" ? (
                        <select
                          autoFocus
                          className="h-11 w-full bg-background px-3 outline-none"
                          value={draft}
                          onChange={(e) => {
                            onChangeCell(record, field, e.target.value);
                            setEditing(null);
                          }}
                          onBlur={() => setEditing(null)}
                        >
                          <option value="">—</option>
                          {(field.options.options ?? []).map((option) => (
                            <option key={option.id} value={option.value}>
                              {option.value}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          autoFocus
                          className="h-11 w-full bg-background px-3 outline-none"
                          type={
                            field.type === "DATE"
                              ? "date"
                              : field.type === "INTEGER"
                                ? "number"
                                : "text"
                          }
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => {
                            const next =
                              field.type === "INTEGER" && draft !== ""
                                ? Number(draft)
                                : draft;
                            onChangeCell(record, field, next);
                            setEditing(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              (e.target as HTMLInputElement).blur();
                            }
                            if (e.key === "Escape") setEditing(null);
                          }}
                        />
                      )
                    ) : (
                      <button
                        type="button"
                        className={cn(
                          "flex h-11 w-full items-center px-3 text-left",
                          !value && "text-muted-foreground"
                        )}
                        onClick={() => {
                          setEditing({ id: record.id, field: field.name });
                          setDraft(value == null ? "" : String(value));
                        }}
                      >
                        {displayValue(record, field)}
                      </button>
                    )}
                  </td>
                );
              })}
              <td className="border-b" />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
