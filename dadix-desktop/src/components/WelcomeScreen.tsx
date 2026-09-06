import { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { createProject, openDemoProject, openProject } from "../lib/dadix";
import type { ProjectMeta } from "../types";
import { Button } from "./ui/button";

interface WelcomeScreenProps {
  onOpen: (meta: ProjectMeta) => void;
}

export function WelcomeScreen({ onOpen }: WelcomeScreenProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setError(null);
    setLoading(true);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-sidebar p-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-sm">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Lokale Datei
        </p>
        <h1 className="mt-1 text-3xl font-semibold">Dadix</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Testprojekt mit <strong className="text-foreground">Kunden</strong> und{" "}
          <strong className="text-foreground">Bestellungen</strong>. Felder
          anlegen, Zellen ändern, Zeilen hinzufügen.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button
            disabled={loading}
            onClick={() =>
              void run(async () => {
                onOpen(await openDemoProject());
              })
            }
          >
            {loading ? "…" : "Testprojekt öffnen"}
          </Button>
          <Button
            variant="outline"
            disabled={loading}
            onClick={() =>
              void run(async () => {
                const selected = await open({
                  multiple: false,
                  filters: [{ name: "Dadix Project", extensions: ["dadix"] }],
                });
                if (typeof selected === "string") {
                  onOpen(await openProject(selected));
                }
              })
            }
          >
            Projekt öffnen
          </Button>
          <Button
            variant="outline"
            disabled={loading}
            onClick={() =>
              void run(async () => {
                const path = await save({
                  defaultPath: "Unbenannt.dadix",
                  filters: [{ name: "Dadix Project", extensions: ["dadix"] }],
                });
                if (path) onOpen(await createProject(path));
              })
            }
          >
            Leeres Projekt
          </Button>
        </div>
        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}
