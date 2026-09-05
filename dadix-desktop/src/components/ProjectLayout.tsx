import { useState, useEffect, useCallback } from "react";
import {
  getProjectMeta,
  getTables,
  closeProject,
  createTable,
} from "../lib/dadix";
import type { ProjectMeta, TableRow } from "../types";
import { GridView } from "./GridView";
import "./ProjectLayout.css";

interface ProjectLayoutProps {
  initialMeta: ProjectMeta;
  onClose: () => void;
}

export function ProjectLayout({ initialMeta, onClose }: ProjectLayoutProps) {
  const [meta, setMeta] = useState<ProjectMeta | null>(initialMeta);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [newTableName, setNewTableName] = useState("");
  const [addingTable, setAddingTable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshMeta = useCallback(async () => {
    try {
      const m = await getProjectMeta();
      if (m) setMeta(m);
    } catch {
      setMeta(null);
    }
  }, []);

  const refreshTables = useCallback(async () => {
    try {
      const list = await getTables();
      setTables(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setTables([]);
    }
  }, []);

  useEffect(() => {
    refreshMeta();
  }, [refreshMeta]);

  useEffect(() => {
    refreshTables();
    setLoading(false);
  }, [refreshTables]);

  async function handleClose() {
    try {
      await closeProject();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleAddTable() {
    const name = newTableName.trim() || "Neue Tabelle";
    setNewTableName("");
    setAddingTable(true);
    try {
      const table = await createTable(name);
      setTables((prev) => [...prev, table]);
      setSelectedTableId(table.id);
      setAddingTable(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAddingTable(false);
    }
  }

  if (!meta) {
    return (
      <div className="project-layout">
        <p className="project-error">Project not loaded.</p>
        <button type="button" onClick={onClose}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="project-layout">
      <aside className="project-sidebar">
        <div className="sidebar-header">
          <h2 className="project-title">{meta.name}</h2>
          <button
            type="button"
            className="sidebar-close"
            onClick={handleClose}
            title="Close project"
          >
            ✕
          </button>
        </div>
        <div className="sidebar-tables">
          <div className="sidebar-tables-header">
            <span>Tables</span>
            <button
              type="button"
              className="add-table-btn"
              onClick={() => setAddingTable(true)}
              title="Add table"
            >
              +
            </button>
          </div>
          {addingTable && (
            <div className="add-table-form">
              <input
                type="text"
                value={newTableName}
                onChange={(e) => setNewTableName(e.target.value)}
                placeholder="Table name"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleAddTable();
                  if (e.key === "Escape") {
                    setAddingTable(false);
                    setNewTableName("");
                  }
                }}
                autoFocus
              />
              <button
                type="button"
                onClick={handleAddTable}
                disabled={addingTable && !newTableName.trim()}
              >
                Add
              </button>
            </div>
          )}
          {loading ? (
            <p className="sidebar-loading">Loading…</p>
          ) : (
            <ul className="table-list">
              {tables.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className={selectedTableId === t.id ? "selected" : ""}
                    onClick={() => setSelectedTableId(t.id)}
                  >
                    {t.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {error && <p className="sidebar-error">{error}</p>}
      </aside>
      <main className="project-main">
        {selectedTableId ? (
          <GridView
            tableId={selectedTableId}
            onError={setError}
          />
        ) : (
          <div className="project-empty">
            <p>Select a table or create one.</p>
          </div>
        )}
      </main>
    </div>
  );
}
