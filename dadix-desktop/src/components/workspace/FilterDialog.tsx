import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ViewFilter } from "@/types";
import type { WorkspaceField } from "@/lib/fields";

const OPS: { value: ViewFilter["operation"]; label: string }[] = [
  { value: "eq", label: "ist" },
  { value: "neq", label: "ist nicht" },
  { value: "like", label: "enthält" },
  { value: "nlike", label: "enthält nicht" },
  { value: "isnull", label: "ist leer" },
  { value: "notnull", label: "ist nicht leer" },
  { value: "lte", label: "≤" },
  { value: "gte", label: "≥" },
];

export function parseFilters(raw: string | null | undefined): ViewFilter[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ViewFilter[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function FilterDialog({
  open,
  fields,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  fields: WorkspaceField[];
  initial: ViewFilter[];
  onClose: () => void;
  onSave: (filters: ViewFilter[]) => void;
}) {
  const [filters, setFilters] = useState<ViewFilter[]>(initial);

  return (
    <Dialog
      title="Filter"
      open={open}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={() => onSave(filters)}>Anwenden</Button>
        </>
      }
    >
      <div className="grid gap-3">
        {filters.map((filter, index) => (
          <div key={filter.id} className="grid grid-cols-[72px_1fr_1fr_1fr_auto] items-center gap-2">
            {index === 0 ? (
              <span className="text-sm text-muted-foreground">Wo</span>
            ) : (
              <select
                className="h-9 rounded-md border px-2 text-sm"
                value={filter.relation}
                onChange={(e) => {
                  const next = [...filters];
                  next[index] = { ...filter, relation: e.target.value as ViewFilter["relation"] };
                  setFilters(next);
                }}
              >
                <option value="and">und</option>
                <option value="or">oder</option>
              </select>
            )}
            <select
              className="h-9 rounded-md border px-2 text-sm"
              value={filter.fieldId}
              onChange={(e) => {
                const next = [...filters];
                next[index] = { ...filter, fieldId: Number(e.target.value) };
                setFilters(next);
              }}
            >
              {fields.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.name}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border px-2 text-sm"
              value={filter.operation}
              onChange={(e) => {
                const next = [...filters];
                next[index] = { ...filter, operation: e.target.value as ViewFilter["operation"] };
                setFilters(next);
              }}
            >
              {OPS.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>
            {filter.operation === "isnull" || filter.operation === "notnull" ? (
              <span />
            ) : (
              <Input
                value={filter.value}
                onChange={(e) => {
                  const next = [...filters];
                  next[index] = { ...filter, value: e.target.value };
                  setFilters(next);
                }}
              />
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setFilters(filters.filter((_, i) => i !== index))}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() =>
            setFilters([
              ...filters,
              {
                id: `f-${Date.now()}`,
                operation: "like",
                fieldId: fields[0]?.id ?? 0,
                relation: filters.length ? "and" : "where",
                value: "",
              },
            ])
          }
        >
          <Plus /> Filter
        </Button>
      </div>
    </Dialog>
  );
}
