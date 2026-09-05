import { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { createProject, openProject } from "../lib/dadix";
import type { ProjectMeta } from "../types";
import "./WelcomeScreen.css";

interface WelcomeScreenProps {
  onOpen: (meta: ProjectMeta) => void;
}

export function WelcomeScreen({ onOpen }: WelcomeScreenProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleOpen() {
    setError(null);
    setLoading(true);
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Dadix Project", extensions: ["dadix"] }],
      });
      if (typeof selected === "string") {
        const meta = await openProject(selected);
        onOpen(meta);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    setError(null);
    setLoading(true);
    try {
      const path = await save({
        defaultPath: "Unnamed.dadix",
        filters: [{ name: "Dadix Project", extensions: ["dadix"] }],
      });
      if (path) {
        const meta = await createProject(path);
        onOpen(meta);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="welcome">
      <div className="welcome-card">
        <h1>Dadix</h1>
        <p className="welcome-subtitle">Local-first project file</p>
        <div className="welcome-actions">
          <button
            type="button"
            className="welcome-btn primary"
            onClick={handleOpen}
            disabled={loading}
          >
            {loading ? "…" : "Open project"}
          </button>
          <button
            type="button"
            className="welcome-btn"
            onClick={handleCreate}
            disabled={loading}
          >
            {loading ? "…" : "Create project"}
          </button>
        </div>
        {error && <p className="welcome-error">{error}</p>}
      </div>
    </div>
  );
}
