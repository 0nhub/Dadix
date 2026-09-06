import { useCallback, useEffect, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  Plus,
  Search,
  Table2,
  ChevronsUpDown,
  PanelLeft,
  LayoutGrid,
  Filter,
  ArrowUpDown,
  Trash2,
  Ellipsis,
  FileSpreadsheet,
  Database,
  Code2,
  FolderOpen,
  FilePlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  addDatabaseSource,
  closeProject,
  createColumn,
  createProject,
  createTable,
  createView,
  openDemoProject,
  openProject,
  deleteColumn,
  deleteRecord,
  deleteTable,
  deleteView,
  getColumns,
  getTables,
  getViews,
  queryRecords,
  renameTable,
  updateView,
  insertRecord,
  linkFile,
  listBoundSources,
  listMissingSources,
  listSources,
  relinkSource,
  storeCredential,
  updateColumn,
  updateRecord,
  recordFields,
} from "@/lib/dadix";
import {
  columnToField,
  emptyFieldValue,
  fieldOptionsJson,
  type WorkspaceField,
} from "@/lib/fields";
import type {
  BoundFileSource,
  DatabaseEngine,
  MissingSource,
  ProjectMeta,
  RecordRow,
  SourceRow,
  TableRow,
  ViewRow,
} from "@/types";
import { DatabasePanel } from "../DatabasePanel";
import { QueryPanel } from "../QueryPanel";
import { SourcePreview } from "../SourcePreview";
import { DataGrid } from "./DataGrid";
import { FieldPanel } from "./FieldPanel";
import { FilterDialog, parseFilters } from "./FilterDialog";
import { SortDialog, parseSorts } from "./SortDialog";
import { Dialog } from "@/components/ui/dialog";

interface WorkspaceProps {
  initialMeta: ProjectMeta;
  onReplace: (meta: ProjectMeta) => void;
  onClose: () => void;
}

type MainView =
  | { kind: "table"; tableId: number }
  | { kind: "sql" }
  | { kind: "file"; sourceId: number }
  | { kind: "database"; sourceId: number };

export function Workspace({ initialMeta, onReplace, onClose }: WorkspaceProps) {
  const [meta] = useState(initialMeta);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedViewId, setSelectedViewId] = useState<number | null>(null);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [fields, setFields] = useState<WorkspaceField[]>([]);
  const [views, setViews] = useState<ViewRow[]>([]);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [view, setView] = useState<MainView | null>(null);
  const [boundSources, setBoundSources] = useState<BoundFileSource[]>([]);
  const [dbSources, setDbSources] = useState<SourceRow[]>([]);
  const [missing, setMissing] = useState<MissingSource[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [addingTable, setAddingTable] = useState(false);
  const [newTableName, setNewTableName] = useState("");
  const [addingDatabase, setAddingDatabase] = useState(false);
  const [dbEngine, setDbEngine] = useState<DatabaseEngine>("sqlite");
  const [dbName, setDbName] = useState("");
  const [dbUri, setDbUri] = useState("");
  const [dbHost, setDbHost] = useState("");
  const [dbPort, setDbPort] = useState("");
  const [dbDatabase, setDbDatabase] = useState("");
  const [dbUser, setDbUser] = useState("");
  const [dbPassword, setDbPassword] = useState("");
  const [dbTrustCert, setDbTrustCert] = useState(false);
  const [fieldPanel, setFieldPanel] = useState<
    { mode: "edit"; field: WorkspaceField } | { mode: "create" } | null
  >(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [total, setTotal] = useState(0);
  const [rowsTick, setRowsTick] = useState(0);

  const selectedTable = tables.find(
    (t) => view?.kind === "table" && t.id === view.tableId
  );
  const currentView = views.find((v) => v.id === selectedViewId) ?? views[0];

  const refreshTables = useCallback(async () => {
    const list = await getTables();
    setTables(list);
    return list;
  }, []);

  const refreshSources = useCallback(async () => {
    try {
      setBoundSources(await listBoundSources());
      const all = await listSources();
      setDbSources(all.filter((s) => s.kind === "external_database"));
      setMissing(await listMissingSources());
    } catch {
      setBoundSources([]);
      setDbSources([]);
    }
  }, []);

  const loadTable = useCallback(async (tableId: number) => {
    const [cols, viewList] = await Promise.all([
      getColumns(tableId),
      getViews(tableId),
    ]);
    setFields(cols.map(columnToField).sort((a, b) => a.order - b.order));
    setViews(viewList);
    setSelectedViewId((prev) =>
      viewList.some((v) => v.id === prev) ? prev : viewList[0]?.id ?? null
    );
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const list = await refreshTables();
        await refreshSources();
        if (list[0]) {
          setView({ kind: "table", tableId: list[0].id });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [refreshTables, refreshSources]);

  useEffect(() => {
    if (view?.kind !== "table") {
      setFields([]);
      setRecords([]);
      setViews([]);
      return;
    }
    void loadTable(view.tableId).catch((e) =>
      setError(e instanceof Error ? e.message : String(e))
    );
  }, [view, loadTable]);

  useEffect(() => {
    if (view?.kind !== "table" || !currentView) return;
    void queryRecords({
      tableId: view.tableId,
      filter: currentView.filter,
      sort: currentView.sort,
      search: filter,
      limit: 500,
      offset: 0,
    })
      .then((page) => {
        setRecords(page.records);
        setTotal(page.total);
        setSelectedIds([]);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [view, currentView?.id, currentView?.filter, currentView?.sort, filter, rowsTick]);

  async function handleAddTable() {
    const name = newTableName.trim() || "Neue Tabelle";
    setNewTableName("");
    setAddingTable(false);
    try {
      const table = await createTable(name);
      setTables((prev) => [...prev, table]);
      setView({ kind: "table", tableId: table.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleAddRow() {
    if (view?.kind !== "table") return;
    const data: Record<string, unknown> = {};
    for (const field of fields) {
      data[field.name] = emptyFieldValue(field.type);
    }
    try {
      await insertRecord(view.tableId, data);
      setRowsTick((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleSaveField(draft: WorkspaceField) {
    if (view?.kind !== "table") return;
    const options = fieldOptionsJson(draft);
    try {
      if (fieldPanel?.mode === "create") {
        await createColumn(view.tableId, draft.name, draft.type, options);
      } else if (draft.id > 0) {
        await updateColumn(draft.id, draft.name, draft.type, options);
      }
      await loadTable(view.tableId);
      setRowsTick((n) => n + 1);
      setFieldPanel(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDeleteField(field: WorkspaceField) {
    if (view?.kind !== "table") return;
    try {
      await deleteColumn(field.id);
      await loadTable(view.tableId);
      setRowsTick((n) => n + 1);
      setFieldPanel(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleChangeCell(
    record: RecordRow,
    field: WorkspaceField,
    value: unknown
  ) {
    if (view?.kind !== "table") return;
    const next = { ...recordFields(record), [field.name]: value };
    try {
      const saved = await updateRecord(view.tableId, record.id, next);
      setRecords((prev) => prev.map((row) => (row.id === saved.id ? saved : row)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDeleteSelected() {
    if (view?.kind !== "table") return;
    try {
      for (const id of selectedIds) {
        await deleteRecord(view.tableId, id);
      }
      setSelectedIds([]);
      setRowsTick((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleSaveFilters(next: ReturnType<typeof parseFilters>) {
    if (!currentView) return;
    try {
      const saved = await updateView(
        currentView.id,
        currentView.name,
        JSON.stringify(next),
        currentView.sort
      );
      setViews((prev) => prev.map((item) => (item.id === saved.id ? saved : item)));
      setFilterOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleSaveSorts(next: ReturnType<typeof parseSorts>) {
    if (!currentView) return;
    try {
      const saved = await updateView(
        currentView.id,
        currentView.name,
        currentView.filter,
        JSON.stringify(next)
      );
      setViews((prev) => prev.map((item) => (item.id === saved.id ? saved : item)));
      setSortOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleRenameTable() {
    if (!selectedTable) return;
    try {
      const saved = await renameTable(selectedTable.id, renameValue.trim() || selectedTable.name);
      setTables((prev) => prev.map((item) => (item.id === saved.id ? saved : item)));
      setRenameOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDeleteView(viewId: number) {
    try {
      await deleteView(viewId);
      if (view?.kind === "table") await loadTable(view.tableId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDeleteTable(table: TableRow) {
    try {
      await deleteTable(table.id);
      const list = await refreshTables();
      setView(list[0] ? { kind: "table", tableId: list[0].id } : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleOpenExisting() {
    try {
      const selected = await open({
        multiple: false,
        title: "Projekt öffnen",
        filters: [{ name: "Dadix", extensions: ["dadix"] }],
      });
      if (typeof selected === "string") {
        onReplace(await openProject(selected));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleNewProject() {
    try {
      const selected = await save({
        title: "Neues Projekt",
        defaultPath: "Neues Projekt.dadix",
        filters: [{ name: "Dadix", extensions: ["dadix"] }],
      });
      if (typeof selected === "string") {
        onReplace(await createProject(selected));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleOpenDemo() {
    try {
      onReplace(await openDemoProject());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleCreateView() {
    if (view?.kind !== "table") return;
    try {
      const created = await createView(view.tableId, "Neue Ansicht");
      setViews((prev) => [...prev, created]);
      setSelectedViewId(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleLinkFile() {
    try {
      const selected = await open({
        multiple: false,
        title: "Datei verknüpfen",
        filters: [
          {
            name: "Data files",
            extensions: ["csv", "tsv", "parquet", "json", "jsonl", "ndjson"],
          },
        ],
      });
      if (typeof selected === "string") {
        const source = await linkFile(selected, true);
        await refreshSources();
        setView({ kind: "file", sourceId: source.id });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleAddDatabase() {
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
        encrypt: true,
        trustServerCertificate: dbTrustCert,
      });
      setDbPassword("");
      setAddingDatabase(false);
      await refreshSources();
      setView({ kind: "database", sourceId: source.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleRelink(source: MissingSource) {
    try {
      const selected = await open({
        multiple: false,
        title: source.expected_path,
      });
      if (typeof selected === "string") {
        await relinkSource(source.source_id, selected, true);
        await refreshSources();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="flex h-full bg-sidebar">
      {sidebarOpen && (
      <aside className="flex w-64 shrink-0 flex-col px-2 pb-2">
        <div className="flex h-12 items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-10 w-full items-center gap-2 rounded-md border bg-background px-2 text-left text-sm font-medium hover:bg-sidebar-accent"
              >
                <span className="flex size-7 items-center justify-center rounded-md bg-primary text-xs text-primary-foreground">
                  {(meta.name[0] ?? "D").toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate">{meta.name}</span>
                <ChevronsUpDown className="size-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem onClick={() => void handleOpenExisting()}>
                <FolderOpen /> Projekt öffnen
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleNewProject()}>
                <FilePlus /> Neues Projekt
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleOpenDemo()}>
                <LayoutGrid /> Demo
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  await closeProject();
                  onClose();
                }}
              >
                Projekt schließen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex-1 overflow-auto px-2">
          <div className="mb-1 flex items-center justify-between px-2 pt-2">
            <span className="text-xs text-muted-foreground">Tables</span>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setAddingTable(true)}
            >
              <Plus className="size-4" />
            </button>
          </div>
          {addingTable && (
            <Input
              autoFocus
              className="mb-2"
              value={newTableName}
              placeholder="Tabelle"
              onChange={(e) => setNewTableName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleAddTable();
                if (e.key === "Escape") setAddingTable(false);
              }}
            />
          )}
          {tables.map((table) => (
            <div key={table.id} className="group flex items-center">
              <button
                type="button"
                onClick={() => setView({ kind: "table", tableId: table.id })}
                className={`mb-0.5 flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                  view?.kind === "table" && view.tableId === table.id
                    ? "bg-sidebar-accent font-medium"
                    : "hover:bg-sidebar-accent/70"
                }`}
              >
                <Table2 className="size-4 text-muted-foreground" />
                <span className="truncate">{table.name}</span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="hidden px-1 text-muted-foreground group-hover:block"
                  >
                    <Ellipsis className="size-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem
                    onClick={() => {
                      setRenameValue(table.name);
                      setView({ kind: "table", tableId: table.id });
                      setRenameOpen(true);
                    }}
                  >
                    Umbenennen
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void handleDeleteTable(table)}>
                    Löschen
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
        <div className="p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setView({ kind: "sql" })}>
                <Code2 /> SQL
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleLinkFile()}>
                <FileSpreadsheet /> Datei verknüpfen
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAddingDatabase(true)}>
                <Database /> Datenbank
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
      )}

      <main className="relative m-2 ml-0 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-background shadow-sm">
        {view?.kind === "table" && selectedTable ? (
          <>
            <header className="flex h-12 items-center gap-2 px-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen((open) => !open)}
              >
                <PanelLeft />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <LayoutGrid className="size-4" />
                    {currentView?.name ?? "Alle Einträge"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {views.map((item) => (
                    <DropdownMenuItem
                      key={item.id}
                      onClick={() => setSelectedViewId(item.id)}
                    >
                      <LayoutGrid />
                      {item.name}
                    </DropdownMenuItem>
                  ))}
                  {currentView && views.length > 1 && (
                    <DropdownMenuItem onClick={() => void handleDeleteView(currentView.id)}>
                      <Trash2 /> Ansicht löschen
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => void handleCreateView()}>
                    <Plus /> Ansicht anlegen
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <span className="text-xs text-muted-foreground">{total} Zeilen</span>
              <div className="ml-auto flex items-center gap-2">
                {selectedIds.length > 0 ? (
                  <Button variant="destructive" size="sm" onClick={() => void handleDeleteSelected()}>
                    <Trash2 /> Löschen
                  </Button>
                ) : null}
                {searchOpen ? (
                  <Input
                    autoFocus
                    className="h-8 w-40"
                    placeholder="Find"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    onBlur={() => {
                      if (!filter) setSearchOpen(false);
                    }}
                  />
                ) : (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setSearchOpen(true)}
                  >
                    <Search />
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="icon"
                  title="Filter"
                  onClick={() => setFilterOpen(true)}
                >
                  <Filter />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  title="Sortierung"
                  onClick={() => setSortOpen(true)}
                >
                  <ArrowUpDown />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon">
                      <Ellipsis />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => setFieldPanel({ mode: "create" })}
                    >
                      Feld anlegen
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void handleAddRow()}>
                      Zeile hinzufügen
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </header>
            {error && (
              <div className="px-4 text-sm text-destructive">{error}</div>
            )}
            {missing.length > 0 && (
              <div className="px-4 text-sm">
                {missing.map((source) => (
                  <button
                    key={source.source_id}
                    type="button"
                    className="text-amber-700 underline"
                    onClick={() => void handleRelink(source)}
                  >
                    Quelle fehlt — neu verknüpfen
                  </button>
                ))}
              </div>
            )}
            <div className="flex min-h-0 flex-1">
              <DataGrid
                fields={fields}
                records={records}
                selectedIds={selectedIds}
                onSelectedIdsChange={setSelectedIds}
                onEditField={(field) => setFieldPanel({ mode: "edit", field })}
                onAddField={() => setFieldPanel({ mode: "create" })}
                onChangeCell={handleChangeCell}
                onAddRow={() => void handleAddRow()}
              />
              {fieldPanel && (
                <FieldPanel
                  creating={fieldPanel.mode === "create"}
                  field={fieldPanel.mode === "edit" ? fieldPanel.field : null}
                  onClose={() => setFieldPanel(null)}
                  onSave={handleSaveField}
                  onDelete={
                    fieldPanel.mode === "edit" ? handleDeleteField : undefined
                  }
                />
              )}
            </div>
            <button
              type="button"
              onClick={() => void handleAddRow()}
              className="absolute bottom-5 right-5 flex size-12 items-center justify-center rounded-full bg-foreground text-background shadow-lg"
              title="Zeile hinzufügen"
            >
              <Plus className="size-5" />
            </button>
            {filterOpen && (
              <FilterDialog
                key={`filter-${currentView?.id ?? 0}`}
                open={filterOpen}
                fields={fields}
                initial={parseFilters(currentView?.filter)}
                onClose={() => setFilterOpen(false)}
                onSave={(next) => void handleSaveFilters(next)}
              />
            )}
            {sortOpen && (
              <SortDialog
                key={`sort-${currentView?.id ?? 0}`}
                open={sortOpen}
                fields={fields}
                initial={parseSorts(currentView?.sort)}
                onClose={() => setSortOpen(false)}
                onSave={(next) => void handleSaveSorts(next)}
              />
            )}
            <Dialog
              title="Tabelle umbenennen"
              open={renameOpen}
              onClose={() => setRenameOpen(false)}
              footer={
                <Button onClick={() => void handleRenameTable()}>Speichern</Button>
              }
            >
              <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
            </Dialog>
          </>
        ) : view?.kind === "sql" ? (
          <QueryPanel onError={setError} sources={boundSources} />
        ) : view?.kind === "file" &&
          boundSources.find((s) => s.source_id === view.sourceId) ? (
          <SourcePreview
            source={boundSources.find((s) => s.source_id === view.sourceId)!}
            onError={setError}
          />
        ) : view?.kind === "database" &&
          dbSources.find((s) => s.id === view.sourceId) ? (
          <DatabasePanel
            source={dbSources.find((s) => s.id === view.sourceId)!}
            onError={setError}
          />
        ) : addingDatabase ? (
          <div className="grid max-w-sm gap-2 p-6">
            <select
              className="h-9 rounded-md border px-2"
              value={dbEngine}
              onChange={(e) => setDbEngine(e.target.value as DatabaseEngine)}
            >
              <option value="sqlite">SQLite</option>
              <option value="postgres">PostgreSQL</option>
              <option value="mysql">MySQL</option>
              <option value="sql_server">SQL Server</option>
            </select>
            <Input placeholder="Name" value={dbName} onChange={(e) => setDbName(e.target.value)} />
            {dbEngine === "sqlite" ? (
              <Input placeholder="Datei" value={dbUri} onChange={(e) => setDbUri(e.target.value)} />
            ) : (
              <>
                <Input placeholder="Host" value={dbHost} onChange={(e) => setDbHost(e.target.value)} />
                <Input placeholder="Port" value={dbPort} onChange={(e) => setDbPort(e.target.value)} />
                <Input placeholder="Datenbank" value={dbDatabase} onChange={(e) => setDbDatabase(e.target.value)} />
                <Input placeholder="Benutzer" value={dbUser} onChange={(e) => setDbUser(e.target.value)} />
                <Input type="password" placeholder="Passwort" value={dbPassword} onChange={(e) => setDbPassword(e.target.value)} />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={dbTrustCert}
                    onChange={(e) => setDbTrustCert(e.target.checked)}
                  />
                  Zertifikat vertrauen
                </label>
              </>
            )}
            <Button onClick={() => void handleAddDatabase()}>Verbinden</Button>
          </div>
        ) : (
          <EmptyState text="Tabelle anlegen." />
        )}
      </main>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
