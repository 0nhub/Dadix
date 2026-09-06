import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { ViewSort } from "@/types";
import type { WorkspaceField } from "@/lib/fields";

export function parseSorts(raw: string | null | undefined): ViewSort[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ViewSort[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function SortDialog({
  open,
  fields,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  fields: WorkspaceField[];
  initial: ViewSort[];
  onClose: () => void;
  onSave: (sorts: ViewSort[]) => void;
}) {
  const [sorts, setSorts] = useState<ViewSort[]>(
    initial.length ? initial : [{ fieldId: fields[0]?.id, direction: "ASC" }]
  );

  return (
    <Dialog
      title="Sortierung"
      open={open}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={() => onSave(sorts)}>Anwenden</Button>
        </>
      }
    >
      <div className="grid gap-3">
        {sorts.map((sort, index) => (
          <div key={index} className="grid grid-cols-2 gap-2">
            <select
              className="h-9 rounded-md border px-2 text-sm"
              value={sort.fieldId ?? ""}
              onChange={(e) => {
                const next = [...sorts];
                next[index] = { ...sort, fieldId: Number(e.target.value) };
                setSorts(next);
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
              value={sort.direction ?? "ASC"}
              onChange={(e) => {
                const next = [...sorts];
                next[index] = { ...sort, direction: e.target.value as "ASC" | "DESC" };
                setSorts(next);
              }}
            >
              <option value="ASC">Aufsteigend</option>
              <option value="DESC">Absteigend</option>
            </select>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
