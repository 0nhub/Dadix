import { useState, useEffect, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  getProjectMeta,
  getTables,
  closeProject,
  createTable,
  listMissingSources,
  listBoundSources,
  listSources,
  linkFile,
  relinkSource,
  addDatabaseSource,
  storeCredential,
} from "../lib/dadix";
import type {
  BoundFileSource,
  DatabaseEngine,
  MissingSource,
  ProjectMeta,
  SourceRow,
  TableRow,
} from "../types";
import { DatabasePanel } from "./DatabasePanel";
import { GridView } from "./GridView";
import { QueryPanel } from "./QueryPanel";
import { SourcePreview } from "./SourcePreview";
import "./ProjectLayout.css";

interface ProjectLayoutProps {
  initialMeta: ProjectMeta;
  onClose: () => void;
}

export function ProjectLayout({ initialMeta, onClose }: ProjectLayoutProps) {
  const [meta, setMeta] = useState<ProjectMeta | null>(initialMeta);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<number | null>(null);
  const [boundSources, setBoundSources] = useState<BoundFileSource[]>([]);
  const [dbSources, setDbSources] = useState<SourceRow[]>([]);
  const [addingDatabase, setAddingDatabase] = useState(false);
  const [dbName, setDbName] = useState("");
  const [dbEngine, setDbEngine] = useState<DatabaseEngine>("sqlite");
  const [dbUri, setDbUri] = useState("");
  const [dbHost, setDbHost] = useState("");
  const [dbPort, setDbPort] = useState("");
  const [dbDatabase, setDbDatabase] = useState("");
  const [dbUser, setDbUser] = useState("");
  const [dbPassword, setDbPassword] = useState("");
  const [dbTrustCert, setDbTrustCert] = useState(false);
  const [showQuery, setShowQuery] = useState(false);
  const [newTableName, setNewTableName] = useState("");
  const [addingTable, setAddingTable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<MissingSource[]>([]);
  const [preferRelative, setPreferRelative] = useState(true);
  const [relinkingId, setRelinkingId] = useState<number | null>(null);

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
      setSelectedTableId((current) => current ?? list[0]?.id ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setTables([]);
    }
  }, []);

  useEffect(() => {
    refreshMeta();
  }, [refreshMeta]);

  const refreshMissing = useCallback(async () => {
    try {
      setMissing(await listMissingSources());
    } catch {
      setMissing([]);
    }
  }, []);

  const refreshSources = useCallback(async () => {
    try {
      setBoundSources(await listBoundSources());
      const all = await listSources();
      setDbSources(all.filter((s) => s.kind === "external_database"));
    } catch {
      setBoundSources([]);
      setDbSources([]);
    }
  }, []);

  useEffect(() => {
    refreshTables();
    void refreshMissing();
    void refreshSources();
    setLoading(false);
  }, [refreshTables, refreshMissing, refreshSources]);

  async function handleRelink(source: MissingSource) {
    setError(null);
    setRelinkingId(source.source_id);
    try {
      const selected = await open({
        multiple: false,
        title: `Quelle nicht gefunden\n${source.expected_path}`,
      });
      if (typeof selected === "string") {
        await relinkSource(source.source_id, selected, preferRelative);
        await refreshMissing();
        await refreshSources();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRelinkingId(null);
    }
  }

  async function handleClose() {
    try {
      await closeProject();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleLinkFile() {
    setError(null);
    try {
      const selected = await open({
        multiple: false,
        title: "Datei verknüpfen (nicht importieren)",
        filters: [
          { name: "Data files", extensions: ["csv", "tsv", "parquet", "json", "jsonl", "ndjson"] },
        ],
      });
      if (typeof selected === "string") {
        const source = await linkFile(selected, preferRelative);
        await refreshSources();
        setShowQuery(false);
        setSelectedTableId(null);
        setSelectedSourceId(source.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleAddDatabase() {
    setError(null);
    try {
      let credentialId: string | undefined;
      if (dbPassword) {
        credentialId = await storeCredential("", dbPassword);
      }
      const port = dbPort.trim() ? Number(dbPort) : undefined;
      const source = await addDatabaseSource({
        name: dbName.trim() || dbEngine,
        engine: dbEngine,
        uri: dbUri.trim(),
        host: dbHost.trim() || undefined,
        port: Number.isFinite(port) ? port : undefined,
        database: dbDatabase.trim() || undefined,
        username: dbUser.trim() || undefined,
        credentialId,
        preferRelative: preferRelative,
        encrypt: true,
        trustServerCertificate: dbTrustCert,
      });
      setDbPassword("");
      setDbUser("");
      setDbUri("");
      setDbHost("");
      setDbPort("");
      setDbDatabase("");
      setDbName("");
      setDbTrustCert(false);
      setAddingDatabase(false);
      await refreshSources();
      setShowQuery(false);
      setSelectedTableId(null);
      setSelectedSourceId(source.id);
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
            <span>Tabellen</span>
            <button
              type="button"
              className="add-table-btn"
              onClick={() => setAddingTable(true)}
              title="Tabelle hinzufügen"
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
                placeholder="Tabellenname"
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
                Anlegen
              </button>
            </div>
          )}
          {loading ? (
            <p className="sidebar-loading">Laden…</p>
          ) : (
            <ul className="table-list">
              <li>
                <button
                  type="button"
                  className={showQuery ? "selected" : ""}
                  onClick={() => {
                    setShowQuery(true);
                    setSelectedTableId(null);
                    setSelectedSourceId(null);
                  }}
                >
                  SQL
                </button>
              </li>
              {tables.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className={!showQuery && selectedTableId === t.id ? "selected" : ""}
                    onClick={() => {
                      setShowQuery(false);
                      setSelectedSourceId(null);
                      setSelectedTableId(t.id);
                    }}
                  >
                    {t.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="sidebar-tables-header">
            <span>Dateien</span>
            <button
              type="button"
              className="add-table-btn"
              onClick={() => void handleLinkFile()}
              title="CSV, Parquet oder JSON verknüpfen"
            >
              +
            </button>
          </div>
          <ul className="table-list">
            {boundSources.map((source) => (
              <li key={source.source_id}>
                <button
                  type="button"
                  className={!showQuery && selectedSourceId === source.source_id ? "selected" : ""}
                  onClick={() => {
                    setShowQuery(false);
                    setSelectedTableId(null);
                    setSelectedSourceId(source.source_id);
                  }}
                >
                  {source.logical_name || source.name}
                  {!source.bound ? " !" : ""}
                </button>
              </li>
            ))}
          </ul>
          <div className="sidebar-tables-header">
            <span>Datenbanken</span>
            <button
              type="button"
              className="add-table-btn"
              onClick={() => setAddingDatabase((open) => !open)}
              title="SQLite, PostgreSQL, MySQL oder SQL Server"
            >
              +
            </button>
          </div>
          {addingDatabase && (
            <div className="add-table-form stack">
              <select
                value={dbEngine}
                onChange={(e) => setDbEngine(e.target.value as DatabaseEngine)}
              >
                <option value="sqlite">SQLite</option>
                <option value="postgres">PostgreSQL</option>
                <option value="mysql">MySQL</option>
                <option value="sql_server">SQL Server</option>
              </select>
              <input
                type="text"
                value={dbName}
                onChange={(e) => setDbName(e.target.value)}
                placeholder="Name"
              />
              {dbEngine === "sqlite" ? (
                <input
                  type="text"
                  value={dbUri}
                  onChange={(e) => setDbUri(e.target.value)}
                  placeholder="/path/to/app.sqlite"
                />
              ) : (
                <>
                  <input
                    type="text"
                    value={dbHost}
                    onChange={(e) => setDbHost(e.target.value)}
                    placeholder="Host"
                    autoComplete="off"
                  />
                  <input
                    type="text"
                    value={dbPort}
                    onChange={(e) => setDbPort(e.target.value)}
                    placeholder={
                      dbEngine === "sql_server"
                        ? "1433"
                        : dbEngine === "mysql"
                          ? "3306"
                          : "5432"
                    }
                    autoComplete="off"
                  />
                  <input
                    type="text"
                    value={dbDatabase}
                    onChange={(e) => setDbDatabase(e.target.value)}
                    placeholder="Database"
                    autoComplete="off"
                  />
                  <input
                    type="text"
                    value={dbUser}
                    onChange={(e) => setDbUser(e.target.value)}
                    placeholder="Username"
                    autoComplete="off"
                  />
                  <input
                    type="password"
                    value={dbPassword}
                    onChange={(e) => setDbPassword(e.target.value)}
                    placeholder="Password (OS-Keychain)"
                    autoComplete="new-password"
                  />
                  <label className="stack-check">
                    <input
                      type="checkbox"
                      checked={dbTrustCert}
                      onChange={(e) => setDbTrustCert(e.target.checked)}
                    />
                    Server certificate trust without validation
                  </label>
                </>
              )}
              <button type="button" onClick={() => void handleAddDatabase()}>
                Connect
              </button>
            </div>
          )}
          <ul className="table-list">
            {dbSources.map((source) => (
              <li key={source.id}>
                <button
                  type="button"
                  className={!showQuery && selectedSourceId === source.id ? "selected" : ""}
                  onClick={() => {
                    setShowQuery(false);
                    setSelectedTableId(null);
                    setSelectedSourceId(source.id);
                  }}
                >
                  {source.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
        {error && <p className="sidebar-error">{error}</p>}
      </aside>
      <main className="project-main">
        {missing.length > 0 && (
          <div className="missing-sources">
            <div className="missing-sources-header">
              <strong>Fehlende Quellen ({missing.length})</strong>
              <label className="missing-relative">
                <input
                  type="checkbox"
                  checked={preferRelative}
                  onChange={(e) => setPreferRelative(e.target.checked)}
                />
                Relativ zum Projektordner speichern
              </label>
            </div>
            <ul>
              {missing.map((source) => (
                <li key={source.source_id}>
                  <div>
                    <div className="missing-name">{source.name}</div>
                    <div className="missing-path">Quelle nicht gefunden</div>
                    <div className="missing-path">{source.expected_path}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRelink(source)}
                    disabled={relinkingId === source.source_id}
                  >
                    {relinkingId === source.source_id ? "…" : "Neu verknüpfen"}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {showQuery ? (
          <QueryPanel onError={setError} sources={boundSources} />
        ) : selectedSourceId &&
          dbSources.find((s) => s.id === selectedSourceId) ? (
          <DatabasePanel
            source={dbSources.find((s) => s.id === selectedSourceId)!}
            onError={setError}
          />
        ) : selectedSourceId ? (
          boundSources.find((s) => s.source_id === selectedSourceId) ? (
            <SourcePreview
              source={boundSources.find((s) => s.source_id === selectedSourceId)!}
              onError={setError}
            />
          ) : (
            <div className="project-empty">
              <p>Source not available.</p>
            </div>
          )
        ) : selectedTableId ? (
          <GridView
            tableId={selectedTableId}
            onError={setError}
          />
        ) : (
          <div className="project-empty">
            <p>Links eine Tabelle anklicken — im Testprojekt liegen Kunden und Bestellungen.</p>
          </div>
        )}
      </main>
    </div>
  );
}
