import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FIELD_TYPES,
  type FieldType,
  type WorkspaceField,
  type ChoiceOption,
} from "@/lib/fields";

interface FieldPanelProps {
  field: WorkspaceField | null;
  creating: boolean;
  onClose: () => void;
  onSave: (draft: WorkspaceField) => Promise<void>;
  onDelete?: (field: WorkspaceField) => Promise<void>;
}

export function FieldPanel({
  field,
  creating,
  onClose,
  onSave,
  onDelete,
}: FieldPanelProps) {
  const [name, setName] = useState(field?.name ?? "Neues Feld");
  const [type, setType] = useState<FieldType>(field?.type ?? "TEXT");
  const [choices, setChoices] = useState<ChoiceOption[]>(
    field?.options.options ?? [
      { id: "opt-1", value: "Option 1", color: "#2563eb", order: 0 },
    ]
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(field?.name ?? "Neues Feld");
    setType(field?.type ?? "TEXT");
    setChoices(
      field?.options.options ?? [
        { id: "opt-1", value: "Option 1", color: "#2563eb", order: 0 },
      ]
    );
  }, [field]);

  async function handleSave() {
    setBusy(true);
    try {
      await onSave({
        id: field?.id ?? -1,
        name: name.trim() || "Feld",
        type,
        order: field?.order ?? 0,
        options: { choiceMode: "single", options: choices },
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-sidebar-border bg-background">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold">
          {creating ? "Feld anlegen" : "Feld"}
        </h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Schließen
        </Button>
      </div>
      <div className="flex flex-1 flex-col gap-4 overflow-auto p-4">
        <label className="grid gap-1.5 text-sm">
          <span className="text-muted-foreground">Name</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="text-muted-foreground">Typ</span>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value as FieldType)}
          >
            {FIELD_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        {type === "CHOICE" && (
          <div className="grid gap-2">
            <span className="text-sm text-muted-foreground">Optionen</span>
            {choices.map((option, index) => (
              <div key={option.id} className="flex gap-2">
                <Input
                  value={option.value}
                  onChange={(e) => {
                    const next = [...choices];
                    next[index] = { ...option, value: e.target.value };
                    setChoices(next);
                  }}
                />
                <input
                  type="color"
                  className="h-9 w-10 cursor-pointer rounded border"
                  value={option.color}
                  onChange={(e) => {
                    const next = [...choices];
                    next[index] = { ...option, color: e.target.value };
                    setChoices(next);
                  }}
                />
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setChoices((prev) => [
                  ...prev,
                  {
                    id: `opt-${prev.length + 1}`,
                    value: `Option ${prev.length + 1}`,
                    color: "#64748b",
                    order: prev.length,
                  },
                ])
              }
            >
              Option hinzufügen
            </Button>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t p-4">
        {!creating && field && onDelete ? (
          <Button
            variant="destructive"
            size="sm"
            disabled={busy}
            onClick={() => void onDelete(field)}
          >
            Löschen
          </Button>
        ) : (
          <span />
        )}
        <Button size="sm" disabled={busy} onClick={() => void handleSave()}>
          Speichern
        </Button>
      </div>
    </aside>
  );
}
