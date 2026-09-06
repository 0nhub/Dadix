import {
  addDatabaseSource,
  createColumn,
  createNamedProject,
  createTable,
  createView,
  createViewButton,
  deleteColumn,
  deleteRecord,
  deleteTable,
  deleteView,
  deleteViewButton,
  describeSource,
  executeSourceQuery,
  getColumns,
  getGridViewColumns,
  getProjectMeta,
  getRecords,
  getSetting,
  getTables,
  getView,
  getViews,
  insertRecord,
  linkFile,
  listMissingSources,
  listRemoteColumns,
  listRemoteSchemas,
  listRemoteTables,
  listSources,
  listViewButtons,
  previewSource,
  queryRecords,
  relinkSource,
  setProjectName,
  setSetting,
  storeCredential,
  updateColumn,
  updateGridViewColumn,
  updateRecord,
  updateTable,
  updateView,
  updateViewButton,
  writeFileSource,
} from "../lib/dadix";
import { formatQueryCell } from "../lib/queryCells";
import type { DatabaseEngine, QueryResult, TableRow } from "../types";
import { columnToField, fieldOptionsPayload, parseColumnOptions, recordToWeb, tableToWeb, viewToWeb } from "./map";
import { listRecents, removeRecent, setCurrentOpen, upsertRecent } from "./recents";

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface BridgeResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
}

function ok<T>(data: T, status = 200): BridgeResponse<T> {
  return { data, status, statusText: "OK" };
}

function parseUrl(url: string): { path: string; query: URLSearchParams } {
  const raw = url.replace(/^https?:\/\/[^/]+/, "");
  const [path, search = ""] = raw.split("?");
  return { path, query: new URLSearchParams(search) };
}

function num(value: string | number | undefined): number {
  return Number(value);
}

function fail(code: string, details: Record<string, unknown>, reason: string): never {
  const parts = Object.entries(details)
    .filter(([, value]) => value != null && value !== "")
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  const message = parts ? `${code} ${parts} reason=${reason}` : `${code} reason=${reason}`;
  console.error("[dadix]", message);
  throw new Error(message);
}

function requiredName(value: unknown, code: string, details: Record<string, unknown>): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) fail(code, details, "name is required");
  return name;
}

function resolvePersistedName(requested: unknown, current?: string | null): string {
  const next = typeof requested === "string" ? requested.trim() : "";
  if (next) return next;
  const existing = (current ?? "").trim();
  if (existing) return existing;
  fail("FIELD_UPDATE_FAILED", {}, "name is required and no existing name was found");
}

async function findColumn(columnId: number, tableIdHint?: number) {
  if (tableIdHint && Number.isFinite(tableIdHint) && tableIdHint > 0) {
    const columns = await getColumns(tableIdHint);
    const found = columns.find((column) => column.id === columnId);
    if (found) return { column: found, tableId: tableIdHint };
  }
  const tables = await getTables();
  for (const table of tables) {
    const columns = await getColumns(table.id);
    const found = columns.find((column) => column.id === columnId);
    if (found) return { column: found, tableId: table.id };
  }
  return null;
}

async function projectId(): Promise<string> {
  const meta = await getProjectMeta();
  return meta?.project_id ?? String(meta?.id ?? "local");
}

async function tableKind(tableId: number): Promise<"local" | "linked_file" | "external_database"> {
  const kind = await getSetting(`table_kind_${tableId}`);
  if (kind === "linked_file" || kind === "external_database") return kind;
  return "local";
}

async function webTable(tableId: string) {
  const id = num(tableId);
  const [tables, columns, pid, sourceKind, sourceId] = await Promise.all([
    getTables(),
    getColumns(id),
    projectId(),
    tableKind(id),
    getSetting(`table_source_${id}`),
  ]);
  const table = tables.find((item) => item.id === id);
  if (!table) throw new Error("Table not found");
  const views = await getViews(id);
  return {
    ...tableToWeb(table, columns.map(columnToField), pid),
    sourceKind,
    sourceId: num(sourceId ?? "") || undefined,
    defaultViewId: views[0]?.id ?? null,
  };
}

async function webTableFromRow(table: TableRow) {
  const [columns, pid, sourceKind, views, sourceId] = await Promise.all([
    getColumns(table.id),
    projectId(),
    tableKind(table.id),
    getViews(table.id),
    getSetting(`table_source_${table.id}`),
  ]);
  return {
    ...tableToWeb(table, columns.map(columnToField), pid),
    sourceKind,
    sourceId: num(sourceId ?? "") || undefined,
    defaultViewId: views[0]?.id ?? null,
  };
}

function queryColumnNames(result: QueryResult): string[] {
  if (result.payload.encoding !== "columnar") return [];
  const columns = result.payload.columns;
  const nameCol =
    columns.find((column) => /^(column_name|name|column)$/i.test(column.name)) ?? null;
  if (nameCol && columns.some((column) => /type/i.test(column.name))) {
    const names: string[] = [];
    for (let i = 0; i < nameCol.validity.length; i++) {
      if (!nameCol.validity[i]) continue;
      const value = formatQueryCell(nameCol, i).trim();
      if (value && value !== "NULL") names.push(value);
    }
    return names;
  }
  return columns.map((column) => column.name).filter(Boolean);
}

function queryResultToRecords(result: QueryResult): Array<Record<string, unknown>> {
  if (result.payload.encoding !== "columnar") return [];
  const columns = result.payload.columns;
  const rows = columns[0]?.validity.length ?? 0;
  const records: Array<Record<string, unknown>> = [];
  for (let i = 0; i < rows; i++) {
    const row: Record<string, unknown> = { id: i + 1 + Number(result.offset ?? 0) };
    for (const column of columns) {
      row[column.name] = column.validity[i] ? formatQueryCell(column, i) : null;
    }
    records.push(row);
  }
  return records;
}

async function ensureDefaultNameColumn(tableId: number) {
  const columns = await getColumns(tableId);
  if (columns.length > 0) return columns;
  const created = await createColumn(
    tableId,
    "Name",
    "TEXT",
    JSON.stringify({ size: 255, isVisible: true, contentAlign: "left" })
  );
  return [created];
}

async function createColumnsFromNames(tableId: number, names: string[]) {
  const existing = await getColumns(tableId);
  if (existing.length > 0) return existing;
  const unique = names.filter((name, index) => names.indexOf(name) === index);
  if (unique.length === 0) return ensureDefaultNameColumn(tableId);
  const created = [];
  for (const name of unique) {
    created.push(
      await createColumn(
        tableId,
        name,
        "TEXT",
        JSON.stringify({ size: 255, isVisible: true, contentAlign: "left" })
      )
    );
  }
  return created;
}

async function createLocalDadixTable(name: string, icon?: string) {
  const table = await createTable(name);
  if (icon) await updateTable(table.id, { icon });
  await setSetting(`table_kind_${table.id}`, "local");
  await ensureDefaultNameColumn(table.id);
  return webTableFromRow(icon ? { ...table, icon } : table);
}

async function pickLinkedFile(extensions?: string[]): Promise<string> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    multiple: false,
    filters: [
      {
        name: "Tables",
        extensions: extensions?.length
          ? extensions
          : ["csv", "tsv", "parquet", "json", "jsonl", "ndjson"],
      },
    ],
  });
  if (!selected) throw new Error("No file selected");
  return Array.isArray(selected) ? selected[0] : selected;
}

async function createLinkedFileTable(data?: Record<string, unknown>) {
  const filePath = String(data?.filePath ?? "") || (await pickLinkedFile());
  const format = data?.fileFormat ? String(data.fileFormat) : undefined;
  const source = await linkFile(filePath, true, format);
  const fallbackName = source.name || filePath.split("/").pop() || "File";
  const name = String(data?.name ?? fallbackName).trim() || fallbackName;
  const table = await createTable(name);
  if (data?.icon) await updateTable(table.id, { icon: String(data.icon) });
  await setSetting(`table_kind_${table.id}`, "linked_file");
  await setSetting(`table_source_${table.id}`, String(source.id));
  try {
    const described = await describeSource(source.id);
    await createColumnsFromNames(table.id, queryColumnNames(described));
  } catch {
    await ensureDefaultNameColumn(table.id);
  }
  return webTableFromRow(data?.icon ? { ...table, icon: String(data.icon) } : table);
}

async function createExternalDatabaseTable(data?: Record<string, unknown>) {
  const connection = (data?.connection ?? data ?? {}) as Record<string, unknown>;
  let sourceId = num(String(connection.sourceId ?? data?.sourceId ?? 0));
  if (!sourceId) {
    const username = String(connection.username ?? "");
    const password = String(connection.password ?? "");
    const credentialId = username || password ? await storeCredential(username, password) : null;
    const source = await addDatabaseSource({
      name: String(connection.name ?? data?.name ?? "Database"),
      engine: String(connection.engine ?? "postgres") as DatabaseEngine,
      uri: connection.uri ? String(connection.uri) : undefined,
      host: connection.host ? String(connection.host) : undefined,
      port: connection.port ? Number(connection.port) : undefined,
      database: connection.database ? String(connection.database) : undefined,
      username: username || undefined,
      credentialId,
    });
    sourceId = source.id;
  }
  const remoteSchema = connection.schema ? String(connection.schema) : "";
  const remoteTable = String(connection.table ?? connection.remoteTable ?? "");
  if (!remoteTable) throw new Error("Please choose a database table");
  const name = String(data?.name ?? remoteTable).trim() || remoteTable;
  const table = await createTable(name);
  if (data?.icon) await updateTable(table.id, { icon: String(data.icon) });
  await setSetting(`table_kind_${table.id}`, "external_database");
  await setSetting(`table_source_${table.id}`, String(sourceId));
  if (remoteSchema) await setSetting(`table_remote_schema_${table.id}`, remoteSchema);
  await setSetting(`table_remote_name_${table.id}`, remoteTable);
  try {
    const remoteCols = await listRemoteColumns(sourceId, remoteTable);
    await createColumnsFromNames(
      table.id,
      remoteCols.map((column) => column.name)
    );
  } catch {
    await ensureDefaultNameColumn(table.id);
  }
  return webTableFromRow(data?.icon ? { ...table, icon: String(data.icon) } : table);
}

async function sourceRecords(tableId: number, offset: number, limit: number) {
  const sourceId = num((await getSetting(`table_source_${tableId}`)) ?? "");
  if (!sourceId) return null;
  const kind = await tableKind(tableId);
  if (kind === "linked_file") {
    const preview = await previewSource(sourceId, offset, limit);
    const records = queryResultToRecords(preview);
    return { records, total: preview.has_more ? records.length + offset + 1 : records.length + offset };
  }
  if (kind === "external_database") {
    const schema = (await getSetting(`table_remote_schema_${tableId}`)) ?? "";
    const remote = (await getSetting(`table_remote_name_${tableId}`)) ?? "";
    if (!remote) return null;
    const ident = schema ? `"${schema}"."${remote}"` : `"${remote}"`;
    const result = await executeSourceQuery({
      sourceId,
      sql: `SELECT * FROM ${ident}`,
      offset,
      limit,
    });
    const records = queryResultToRecords(result);
    return { records, total: result.has_more ? records.length + offset + 1 : records.length + offset };
  }
  return null;
}

const LINKED_META_KEYS = new Set(["id", "createdAt", "updatedAt"]);
const LINKED_PAGE_SIZE = 10_000;

async function linkedSourceId(tableId: number): Promise<number | null> {
  if ((await tableKind(tableId)) !== "linked_file") return null;
  const id = num((await getSetting(`table_source_${tableId}`)) ?? "");
  return id > 0 ? id : null;
}

async function loadLinkedPreviewPages(sourceId: number) {
  const records: Array<Record<string, unknown>> = [];
  let offset = 0;
  for (;;) {
    const preview = await previewSource(sourceId, offset, LINKED_PAGE_SIZE);
    const page = queryResultToRecords(preview);
    records.push(...page);
    if (!preview.has_more || page.length === 0) break;
    offset += page.length;
  }
  return records;
}

async function linkedFileColumns(tableId: number, sourceId: number, records: Array<Record<string, unknown>>) {
  let columns: string[] = [];
  try {
    columns = queryColumnNames(await describeSource(sourceId));
  } catch {
    columns = [];
  }
  if (columns.length === 0 && records[0]) {
    columns = Object.keys(records[0]).filter((key) => !LINKED_META_KEYS.has(key));
  }
  const tableColumns = await getColumns(tableId);
  for (const column of tableColumns) {
    if (column.name && !columns.includes(column.name)) columns.push(column.name);
  }
  return columns;
}

async function loadLinkedFileState(tableId: number) {
  const sourceId = await linkedSourceId(tableId);
  if (!sourceId) return null;
  const records = await loadLinkedPreviewPages(sourceId);
  const columns = await linkedFileColumns(tableId, sourceId, records);
  if (columns.length === 0) {
    throw new Error("linked file has no columns");
  }
  return { sourceId, records, columns };
}

async function persistLinkedFile(
  sourceId: number,
  columns: string[],
  records: Array<Record<string, unknown>>
) {
  const rows = records.map((record) => {
    const row: Record<string, unknown> = {};
    for (const column of columns) {
      row[column] = record[column] ?? null;
    }
    return row;
  });
  await writeFileSource(sourceId, columns, rows);
}

function findLinkedRecordIndex(records: Array<Record<string, unknown>>, recordId: number) {
  const exact = records.findIndex(
    (record) => Number(record.id) === recordId || String(record.id) === String(recordId)
  );
  if (exact >= 0) return exact;
  const pos = recordId - 1;
  return pos >= 0 && pos < records.length ? pos : -1;
}

function stripLinkedPatch(patch: Record<string, unknown>, columns: string[]) {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (LINKED_META_KEYS.has(key) && !columns.includes(key)) continue;
    next[key] = value;
  }
  return next;
}

function uniqueNames(names: string[]) {
  return names.filter((name, index) => name && names.indexOf(name) === index);
}

async function updateLinkedFileRecord(
  tableId: number,
  recordId: number,
  patch: Record<string, unknown>
) {
  const state = await loadLinkedFileState(tableId);
  if (!state) return null;
  const idx = findLinkedRecordIndex(state.records, recordId);
  if (idx < 0) throw new Error("record not found");
  state.records[idx] = { ...state.records[idx], ...stripLinkedPatch(patch, state.columns) };
  await persistLinkedFile(state.sourceId, state.columns, state.records);
  const { id: _id, ...fields } = state.records[idx];
  return { id: recordId, ...fields };
}

async function insertLinkedFileRecord(tableId: number, patch: Record<string, unknown>) {
  const state = await loadLinkedFileState(tableId);
  if (!state) return null;
  const cleaned = stripLinkedPatch(patch, state.columns);
  const row: Record<string, unknown> = {};
  for (const column of state.columns) {
    row[column] = cleaned[column] ?? null;
  }
  state.records.push(row);
  await persistLinkedFile(state.sourceId, state.columns, state.records);
  return { id: state.records.length, ...row };
}

async function deleteLinkedFileRecords(tableId: number, ids: number[]) {
  const state = await loadLinkedFileState(tableId);
  if (!state) return false;
  const drop = new Set<number>();
  for (const id of ids) {
    const idx = findLinkedRecordIndex(state.records, id);
    if (idx >= 0) drop.add(idx);
  }
  await persistLinkedFile(
    state.sourceId,
    state.columns,
    state.records.filter((_, index) => !drop.has(index))
  );
  return true;
}

async function syncLinkedFileSchema(
  tableId: number,
  change: { add?: string; rename?: { from: string; to: string }; remove?: string }
) {
  const state = await loadLinkedFileState(tableId);
  if (!state) return;
  let columns = [...state.columns];
  const records = state.records.map((record) => ({ ...record }));
  if (change.add && !columns.includes(change.add)) {
    columns.push(change.add);
  }
  if (change.rename && change.rename.from && change.rename.to && change.rename.from !== change.rename.to) {
    columns = columns.map((name) => (name === change.rename!.from ? change.rename!.to : name));
    for (const record of records) {
      if (Object.prototype.hasOwnProperty.call(record, change.rename.from)) {
        record[change.rename.to] = record[change.rename.from];
        delete record[change.rename.from];
      }
    }
  }
  if (change.remove) {
    columns = columns.filter((name) => name !== change.remove);
    for (const record of records) delete record[change.remove];
  }
  columns = uniqueNames(columns);
  if (columns.length === 0) return;
  await persistLinkedFile(state.sourceId, columns, records);
}

async function sourceRecordsAll(tableId: number) {
  const sourceId = num((await getSetting(`table_source_${tableId}`)) ?? "");
  if (!sourceId) return null;
  const kind = await tableKind(tableId);
  if (kind === "linked_file") {
    return loadLinkedPreviewPages(sourceId);
  }
  if (kind === "external_database") {
    const schema = (await getSetting(`table_remote_schema_${tableId}`)) ?? "";
    const remote = (await getSetting(`table_remote_name_${tableId}`)) ?? "";
    if (!remote) return null;
    const ident = schema ? `"${schema}"."${remote}"` : `"${remote}"`;
    const records: Array<Record<string, unknown>> = [];
    let offset = 0;
    for (;;) {
      const result = await executeSourceQuery({
        sourceId,
        sql: `SELECT * FROM ${ident}`,
        offset,
        limit: LINKED_PAGE_SIZE,
      });
      const page = queryResultToRecords(result);
      records.push(...page);
      if (!result.has_more || page.length === 0) break;
      offset += page.length;
    }
    return records;
  }
  return null;
}

async function webView(tableId: string, viewId: number) {
  const view = await getView(viewId);
  if (!view) throw new Error("View not found");
  const [columns, grid, buttons] = await Promise.all([
    getColumns(num(tableId)),
    getGridViewColumns(viewId),
    listViewButtons(viewId),
  ]);
  const icon = (await getSetting(`view_icon_${viewId}`)) ?? "LayoutGrid";
  return viewToWeb(
    view,
    columns.map(columnToField),
    grid,
    icon,
    buttons.map((button) => ({
      id: button.id,
      viewId: button.view_id,
      label: button.label,
      order: button.order,
    }))
  );
}

async function relationKey(tableId: string, recordId: number, relationId: number) {
  return `rel:${tableId}:${recordId}:${relationId}`;
}

async function handle(method: Method, url: string, body?: unknown): Promise<BridgeResponse> {
  const { path, query } = parseUrl(url);
  const data = (body && typeof body === "string" ? JSON.parse(body) : body) as Record<string, unknown> | undefined;

  if (path === "/user" && method === "GET") {
    return ok({
      username: "Local",
      email: "local@dadix.app",
      createdAt: new Date().toISOString(),
    });
  }
  if (path === "/user" && method === "PATCH") {
    return ok({ username: "Local", email: "local@dadix.app" });
  }
  if (path === "/auth/logout") {
    return ok({ ok: true });
  }
  if (path === "/auth/login" && method === "POST") {
    return ok({ accessToken: "local", user: { username: "Local", email: "local@dadix.app" } });
  }
  if (path === "/project" && method === "POST") {
    const title = String(data?.title ?? data?.name ?? "Unbenannt").trim() || "Unbenannt";
    const icon = String(data?.icon ?? "FolderClosed");
    const meta = await createNamedProject(title);
    const id = meta.project_id ?? String(meta.id);
    setCurrentOpen({
      id,
      path: meta.path ?? "",
      title,
      icon,
      order: 0,
    });
    return ok(
      {
        id,
        title,
        icon,
        order: 0,
        role: "Owner",
      },
      201
    );
  }
  if (path === "/project" && method === "GET") {
    return ok({
      projects: listRecents().map((item) => ({
        id: item.id,
        title: item.title,
        icon: item.icon,
        order: item.order,
        role: "Owner",
      })),
    });
  }
  if (path.endsWith("/members") && method === "GET") {
    return ok([{ id: "local", username: "Local", email: "local@dadix.app", role: "Owner" }]);
  }
  if (path.endsWith("/invites") && method === "GET") {
    return ok({ invites: [] });
  }
  if (path.includes("/invites") && (method === "POST" || method === "DELETE")) {
    return ok({ invites: [] });
  }
  const projectMatch = path.match(/^\/project\/([^/]+)$/);
  if (projectMatch && method === "GET") {
    const recent = listRecents().find((item) => item.id === projectMatch[1]);
    return ok({
      id: projectMatch[1],
      title: recent?.title ?? "Dadix",
      icon: recent?.icon ?? "FolderClosed",
      order: recent?.order ?? 0,
      role: "Owner",
    });
  }
  if (projectMatch && method === "PATCH") {
    const patch = (data?.data as { title?: string; icon?: string; order?: number }) ?? {};
    const recent = listRecents().find((item) => item.id === projectMatch[1]);
    if (recent) {
      upsertRecent({
        ...recent,
        title: patch.title ?? recent.title,
        icon: patch.icon ?? recent.icon,
        order: patch.order ?? recent.order,
      });
    }
    const meta = await getProjectMeta();
    const currentId = meta?.project_id ?? (meta ? String(meta.id) : null);
    if (currentId === projectMatch[1] && patch.title) {
      await setProjectName(patch.title);
    }
    return ok({ ok: true });
  }
  if (projectMatch && method === "DELETE") {
    removeRecent(projectMatch[1]);
    return ok({ ok: true });
  }

  if (path === "/table" && method === "GET") {
    const tables = await getTables();
    const pid = await projectId().catch(() => "local");
    const mapped = [];
    for (const table of tables) {
      try {
        mapped.push(await webTableFromRow(table));
      } catch {
        mapped.push({
          ...tableToWeb(table, [], pid),
          sourceKind: "local",
          defaultViewId: null,
        });
      }
    }
    return ok(mapped);
  }
  if (path === "/table/import") {
    throw new Error("TABLE_IMPORT: import is not available offline");
  }
  if (path === "/table" && method === "POST") {
    const sourceKind = String(data?.sourceKind ?? "local");
    if (sourceKind === "linked_file") {
      return ok(await createLinkedFileTable(data), 201);
    }
    if (sourceKind === "external_database") {
      return ok(await createExternalDatabaseTable(data), 201);
    }
    return ok(
      await createLocalDadixTable(String(data?.name ?? "Table"), data?.icon ? String(data.icon) : undefined),
      201
    );
  }
  if (path === "/source/missing" && method === "GET") {
    return ok(await listMissingSources());
  }
  const relinkMatch = path.match(/^\/source\/(\d+)\/relink$/);
  if (relinkMatch && method === "POST") {
    const nextPath = String(data?.path ?? "");
    if (!nextPath) throw new Error("No file selected");
    return ok(await relinkSource(num(relinkMatch[1]), nextPath, true));
  }
  if (path === "/source/pick-file" && method === "POST") {
    const extensions = Array.isArray(data?.extensions)
      ? data.extensions.map((value) => String(value))
      : undefined;
    return ok({ path: await pickLinkedFile(extensions) });
  }
  if (path === "/source" && method === "GET") {
    return ok(await listSources());
  }
  if (path === "/source" && method === "POST") {
    const username = String(data?.username ?? "");
    const password = String(data?.password ?? "");
    const credentialId = username || password ? await storeCredential(username, password) : null;
    return ok(
      await addDatabaseSource({
        name: String(data?.name ?? "Database"),
        engine: String(data?.engine ?? "postgres") as DatabaseEngine,
        uri: data?.uri ? String(data.uri) : undefined,
        host: data?.host ? String(data.host) : undefined,
        port: data?.port ? Number(data.port) : undefined,
        database: data?.database ? String(data.database) : undefined,
        username: username || undefined,
        credentialId,
      }),
      201
    );
  }
  const sourceSchemas = path.match(/^\/source\/(\d+)\/schemas$/);
  if (sourceSchemas && method === "GET") {
    return ok(await listRemoteSchemas(num(sourceSchemas[1])));
  }
  const sourceTables = path.match(/^\/source\/(\d+)\/tables$/);
  if (sourceTables && method === "GET") {
    return ok(await listRemoteTables(num(sourceTables[1])));
  }
  const tableMatch = path.match(/^\/table\/([^/]+)$/);
  if (tableMatch && method === "GET") {
    return ok(await webTable(tableMatch[1]));
  }
  if (tableMatch && method === "PATCH") {
    const patch = (data?.data as { name?: string; icon?: string; order?: number }) ?? {};
    await updateTable(num(tableMatch[1]), {
      name: patch.name,
      icon: patch.icon,
      order: patch.order,
    });
    return ok(await webTable(tableMatch[1]));
  }
  if (tableMatch && method === "DELETE") {
    const tableId = num(tableMatch[1]);
    if (!Number.isFinite(tableId) || tableId <= 0) {
      fail("TABLE_DELETE_FAILED", { table_id: tableMatch[1] }, "invalid table id");
    }
    await deleteTable(tableId);
    return ok({ ok: true });
  }

  if (path === "/column" && method === "POST") {
    const tableId = num(String(data?.tableId ?? query.get("tableId") ?? 0));
    const typeName = String(data?.type ?? "TEXT");
    if (!Number.isFinite(tableId) || tableId <= 0) {
      fail("FIELD_CREATE_FAILED", { table_id: data?.tableId, type: typeName }, "invalid table id");
    }
    const name = requiredName(data?.name, "FIELD_CREATE_FAILED", {
      table_id: tableId,
      type: typeName,
    });
    const created = await createColumn(
      tableId,
      name,
      typeName,
      JSON.stringify({
        options: data?.options,
        formula: data?.formula,
        textOptions: data?.textOptions,
        numberOptions: data?.numberOptions,
        relationOptions: data?.relationOptions,
        aiOptions: data?.aiOptions,
        placeholder: data?.placeholder,
        defaultValue: typeName === 'FILE' ? undefined : data?.defaultValue,
        size: typeName === 'FILE' ? 180 : data?.size,
        isVisible: data?.isVisible !== false,
        action: data?.action ?? (typeName === 'FILE' ? 'edit' : null),
      })
    );
    await syncLinkedFileSchema(tableId, { add: name });
    return ok(columnToField(created), 201);
  }
  const columnMatch = path.match(/^\/column\/(\d+)$/);
  if (columnMatch && method === "PATCH") {
    const id = num(columnMatch[1]);
    const field = (data?.data ?? data ?? {}) as Record<string, unknown>;
    const tableIdHint = num(String(field.tableId ?? data?.tableId ?? query.get("tableId") ?? 0));
    const found = await findColumn(id, tableIdHint);
    if (!found) {
      fail("FIELD_UPDATE_FAILED", { field_id: id, table_id: tableIdHint }, "column not found");
    }
    const nextName = resolvePersistedName(field.name, found.column.name);
    const saved = await updateColumn(
      id,
      nextName,
      String(field.type ?? found.column.type_name ?? "TEXT"),
      fieldOptionsPayload(field, found.column)
    );
    if (found.column.name !== nextName) {
      await syncLinkedFileSchema(found.tableId, {
        rename: { from: found.column.name, to: nextName },
      });
    }
    return ok(columnToField(saved));
  }
  if (columnMatch && method === "DELETE") {
    const id = num(columnMatch[1]);
    const tableIdHint = num(String(data?.tableId ?? query.get("tableId") ?? 0));
    const found = await findColumn(id, tableIdHint);
    await deleteColumn(id);
    if (found) await syncLinkedFileSchema(found.tableId, { remove: found.column.name });
    return ok({ ok: true });
  }
  if (path.startsWith("/column/formula") && method === "POST") {
    const id = num(String(data?.id ?? data?.columnId));
    const tableId = num(String(data?.tableId));
    const cols = await getColumns(tableId);
    const current = cols.find((item) => item.id === id);
    if (current) {
      await updateColumn(
        id,
        current.name,
        current.type_name,
        fieldOptionsPayload({ formula: data?.formula }, current)
      );
    }
    return ok({ ok: true });
  }
  if (path.includes("relation-table-view-column") && method === "GET") {
    return ok([]);
  }
  if (path.includes("relation-table-view-column") && method === "PATCH") {
    return ok({ id: num(String(data?.id ?? 0)), ...(data?.data as object ?? {}) });
  }
  if (path === "/tag" && method === "POST") {
    const tableId = num(String(data?.tableId ?? 0));
    const columnId = num(String(data?.columnId ?? data?.fieldId ?? 0));
    const cols = tableId ? await getColumns(tableId) : [];
    const current = cols.find((item) => item.id === columnId);
    if (!current) return ok({ id: Date.now(), value: data?.value, color: data?.color }, 201);
    const parsed = parseColumnOptions(current.options);
    const options = Array.isArray(parsed.options) ? [...(parsed.options as object[])] : [];
    const created = {
      id: options.length + 1,
      value: data?.value,
      color: data?.color,
      order: options.length,
    };
    options.push(created);
    await updateColumn(
      current.id,
      current.name,
      current.type_name,
      fieldOptionsPayload({ options }, current)
    );
    return ok(created, 201);
  }
  const tagMatch = path.match(/^\/tag\/([^/]+)$/);
  if (tagMatch && (method === "PATCH" || method === "DELETE")) {
    const tableId = num(String(data?.tableId ?? query.get("tableId") ?? 0));
    const columnId = num(String(data?.columnId ?? data?.fieldId ?? query.get("columnId") ?? 0));
    const cols = tableId ? await getColumns(tableId) : [];
    const current = cols.find((item) => item.id === columnId);
    if (!current) return ok({ ok: true });
    const parsed = parseColumnOptions(current.options);
    let options = Array.isArray(parsed.options) ? [...(parsed.options as Array<Record<string, unknown>>)] : [];
    if (method === "DELETE") {
      options = options.filter((item) => String(item.id) !== tagMatch[1]);
    } else {
      const patch = (data?.data as Record<string, unknown>) ?? {};
      options = options.map((item) =>
        String(item.id) === tagMatch[1] ? { ...item, ...patch } : item
      );
    }
    await updateColumn(
      current.id,
      current.name,
      current.type_name,
      fieldOptionsPayload({ options }, current)
    );
    return ok({ ok: true });
  }
  if (path.startsWith("/column/text-options") || path.startsWith("/column/number-options") || path.startsWith("/column/relation-options")) {
    const id = num(String(data?.id ?? data?.columnId ?? data?.fieldId));
    const tableId = num(String(data?.tableId));
    const cols = tableId ? await getColumns(tableId) : [];
    const current = cols.find((item) => item.id === id);
    if (current) {
      await updateColumn(id, current.name, current.type_name, fieldOptionsPayload(data ?? {}, current));
    }
    return ok({ ok: true });
  }

  if (path === "/record" && method === "GET") {
    const tableId = num(query.get("tableId") ?? "");
    const limit = num(query.get("limit") ?? 200);
    const offset = num(query.get("offset") ?? 0);
    const sourced = await sourceRecords(tableId, offset, limit);
    if (sourced) {
      return ok({
        records: sourced.records,
        count: sourced.total,
        total: sourced.total,
      });
    }
    const orderBy = query.get("orderBy");
    const order = query.get("order") ?? "ASC";
    let sort = query.get("sort");
    if (!sort && orderBy && orderBy !== "id") {
      const cols = await getColumns(tableId);
      const col = cols.find((item) => item.name === orderBy);
      if (col) sort = JSON.stringify([{ fieldId: col.id, direction: order }]);
    }
    const page = await queryRecords({
      tableId,
      filter: query.get("filter"),
      sort,
      search: null,
      limit,
      offset,
    });
    return ok({
      records: page.records.map(recordToWeb),
      count: page.total,
      total: page.total,
    });
  }
  if (path === "/record/all" && method === "GET") {
    const tableId = num(query.get("tableId") ?? "");
    const sourced = await sourceRecordsAll(tableId);
    if (sourced) return ok(sourced);
    const rows = await getRecords(tableId, 100000, 0);
    return ok(rows.map(recordToWeb));
  }
  if (path === "/record" && method === "POST") {
    const tableId = num(String(data?.tableId));
    const payload = (data?.data as Record<string, unknown>) ?? {};
    const linked = await insertLinkedFileRecord(tableId, payload);
    if (linked) return ok([linked], 201);
    const created = await insertRecord(tableId, payload);
    return ok([recordToWeb(created)], 201);
  }
  if ((path === "/record" || path === "/record/") && method === "DELETE") {
    const tableId = num(String(data?.tableId ?? query.get("tableId")));
    const rawIds = (data?.ids as Array<string | number>)
      ?? (query.get("ids")?.split(",").filter(Boolean) ?? []);
    const ids = rawIds.map((id) => num(id));
    if (await deleteLinkedFileRecords(tableId, ids)) return ok({ ok: true });
    for (const id of ids) await deleteRecord(tableId, id);
    return ok({ ok: true });
  }
  const relatedMatch = path.match(/^\/record\/(\d+)\/related$/);
  if (relatedMatch) {
    const recordId = num(relatedMatch[1]);
    const tableId = String(data?.tableId ?? query.get("tableId") ?? "");
    const relationId = num(String(data?.relationId ?? query.get("relationId") ?? 0));
    const relatedTable = String(data?.relatedToTableWithId ?? query.get("relatedToTableWithId") ?? "");
    const key = await relationKey(tableId, recordId, relationId);
    const raw = (await getSetting(key)) ?? "[]";
    const ids = JSON.parse(raw) as number[];
    if (method === "GET") {
      const rows = relatedTable ? await getRecords(num(relatedTable), 100000, 0) : [];
      const records = rows.filter((row) => ids.includes(row.id)).map(recordToWeb);
      return ok({ records, count: records.length });
    }
    if (method === "POST") {
      const relatedId = num(String(data?.relateToRecordWithId));
      const next = Array.from(new Set([...ids, relatedId]));
      await setSetting(key, JSON.stringify(next));
      const rows = await getRecords(num(relatedTable), 100000, 0);
      const created = rows.find((row) => row.id === relatedId);
      return ok(created ? recordToWeb(created) : { id: relatedId }, 201);
    }
    if (method === "DELETE") {
      const relatedId = num(query.get("relatedToRecordWithId") ?? String(data?.relatedToRecordWithId ?? 0));
      await setSetting(key, JSON.stringify(ids.filter((id) => id !== relatedId)));
      return ok({ ok: true });
    }
  }
  const recordMatch = path.match(/^\/record\/(\d+)$/);
  if (recordMatch && method === "PATCH") {
    const tableId = num(String(data?.tableId ?? query.get("tableId")));
    const payload = (data?.data as Record<string, unknown>) ?? data ?? {};
    const linked = await updateLinkedFileRecord(tableId, num(recordMatch[1]), payload);
    if (linked) return ok(linked, 201);
    const saved = await updateRecord(tableId, num(recordMatch[1]), payload);
    return ok(recordToWeb(saved), 201);
  }
  if (recordMatch && method === "DELETE") {
    const tableId = num(String(data?.tableId ?? query.get("tableId")));
    const recordId = num(recordMatch[1]);
    if (await deleteLinkedFileRecords(tableId, [recordId])) return ok({ ok: true });
    await deleteRecord(tableId, recordId);
    return ok({ ok: true });
  }

  if (path === "/view" && method === "GET") {
    const tableId = query.get("tableId") ?? "";
    const views = await getViews(num(tableId));
    const mapped = await Promise.all(views.map((view) => webView(tableId, view.id)));
    return ok({ views: mapped });
  }
  if (path === "/view" && method === "POST") {
    const tableId = String(data?.tableId ?? "");
    const created = await createView(num(tableId), String(data?.name ?? "New view"), String(data?.type ?? "gridView"));
    if (data?.icon) await setSetting(`view_icon_${created.id}`, String(data.icon));
    return ok({ view: await webView(tableId, created.id) }, 201);
  }
  if (path === "/view/grid/buttons" && method === "POST") {
    const created = await createViewButton(num(String(data?.viewId)), String(data?.label ?? "Button"), data?.order as number | undefined);
    return ok(created, 201);
  }
  const buttonMatch = path.match(/^\/view\/grid\/buttons\/(\d+)$/);
  if (buttonMatch && method === "PATCH") {
    return ok(await updateViewButton(num(buttonMatch[1]), data?.label as string | undefined, data?.order as number | undefined));
  }
  if (buttonMatch && method === "DELETE") {
    await deleteViewButton(num(buttonMatch[1]));
    return ok({ ok: true });
  }
  const gridColMatch = path.match(/^\/view\/grid\/(-?\d+)$/);
  if (gridColMatch && method === "PATCH") {
    const payload = (data?.data ?? data ?? {}) as Record<string, unknown>;
    const requestedId = num(gridColMatch[1]);
    const tableColumnId = num(String(payload.tableColumnId ?? data?.tableColumnId ?? 0));
    const viewId = num(String(payload.gridViewId ?? data?.gridViewId ?? 0));
    let id = requestedId;
    if (id < 0) {
      if (!Number.isFinite(tableColumnId) || tableColumnId <= 0 || !Number.isFinite(viewId) || viewId <= 0) {
        fail(
          "VIEW_COLUMN_UPDATE_FAILED",
          { grid_id: requestedId, column_id: tableColumnId, view_id: viewId },
          "negative grid column id without tableColumnId/viewId"
        );
      }
      const existing = (await getGridViewColumns(viewId)).find((column) => column.column_id === tableColumnId);
      if (!existing) {
        fail(
          "VIEW_COLUMN_UPDATE_FAILED",
          { column_id: tableColumnId, view_id: viewId },
          "grid view column not found after field create"
        );
      }
      id = existing.id;
    }
    const name =
      typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : undefined;
    const saved = await updateGridViewColumn(id, {
      name,
      size: payload.size as number | undefined,
      order: (payload.order as number | undefined) ?? (payload.fieldOrder as number | undefined),
      isVisible: payload.isVisible as boolean | undefined,
      contentAlign: payload.contentAlign as string | undefined,
    });
    return ok(saved);
  }
  const viewDup = path.match(/^\/view\/(\d+)\/duplicate$/);
  if (viewDup && method === "POST") {
    const tableId = String(data?.tableId ?? query.get("tableId") ?? "");
    const source = await webView(tableId, num(viewDup[1]));
    const created = await createView(num(tableId), `${source.name} copy`, String(source.type));
    await updateView(created.id, `${source.name} copy`, String(source.filter), String(source.sort));
    return ok({ view: await webView(tableId, created.id) }, 201);
  }
  const viewMatch = path.match(/^\/view\/(\d+)$/);
  if (viewMatch && method === "GET") {
    return ok(await webView(query.get("tableId") ?? "", num(viewMatch[1])));
  }
  if (viewMatch && method === "PATCH") {
    const tableId = query.get("tableId") ?? String(data?.tableId ?? "");
    const patch = (data?.data ?? data ?? {}) as { name?: string; filter?: string; sort?: string; icon?: string };
    const current = await getView(num(viewMatch[1]));
    if (!current) throw new Error("View not found");
    await updateView(
      current.id,
      patch.name ?? current.name,
      patch.filter ?? current.filter,
      patch.sort ?? current.sort
    );
    if (patch.icon) await setSetting(`view_icon_${current.id}`, patch.icon);
    return ok({ view: await webView(tableId, current.id) });
  }
  if (viewMatch && method === "DELETE") {
    await deleteView(num(viewMatch[1]));
    return ok({ success: true });
  }

  if (path.startsWith("/ai")) {
    return ok({ result: "" });
  }
  if (path === "/api/share" && method === "POST") {
    const shareId = crypto.randomUUID();
    const share = {
      shareId,
      ...(data ?? {}),
      active: true,
      createdAt: new Date().toISOString(),
    };
    const existing = JSON.parse((await getSetting("shares")) ?? "{}") as Record<string, unknown>;
    existing[shareId] = share;
    await setSetting("shares", JSON.stringify(existing));
    return ok({
      shareId,
      url: `${window.location.origin}/share/${shareId}`,
      share,
    }, 201);
  }
  const shareMatch = path.match(/^\/api\/share\/([^/]+)(\/verify)?$/);
  if (shareMatch) {
    const existing = JSON.parse((await getSetting("shares")) ?? "{}") as Record<string, Record<string, unknown>>;
    const share = existing[shareMatch[1]];
    if (!share) return { data: { message: "Share not found" }, status: 404, statusText: "Not Found" };
    if (method === "PATCH") {
      existing[shareMatch[1]] = { ...share, ...(data ?? {}) };
      await setSetting("shares", JSON.stringify(existing));
      return ok(existing[shareMatch[1]]);
    }
    return ok(share);
  }
  if (path.startsWith("/api")) {
    return ok({ keys: [], enabled: true });
  }

  throw new Error(`UNSUPPORTED_DESKTOP_API ${method} ${path}`);
}

function errorCode(method: Method, path: string) {
  if (path.startsWith("/project") && method === "POST") return "PROJECT_CREATE_FAILED";
  if (path.startsWith("/project")) return "PROJECT_FAILED";
  if (path.startsWith("/table") && method === "POST") return "TABLE_CREATE_FAILED";
  if (path.startsWith("/table")) return "TABLE_FAILED";
  if (path.startsWith("/column") && method === "POST") return "FIELD_CREATE_FAILED";
  if (path.startsWith("/column") || path.startsWith("/tag")) return "FIELD_FAILED";
  if (path.startsWith("/record") && method === "POST") return "RECORD_CREATE_FAILED";
  if (path.startsWith("/record")) return "RECORD_FAILED";
  if (path.startsWith("/view") && method === "POST") return "VIEW_CREATE_FAILED";
  if (path.startsWith("/view")) return "VIEW_FAILED";
  return "DADIX_ACTION_FAILED";
}

function asCall() {
  const request = async (method: Method, url: string, body?: unknown) => {
    try {
      return await handle(method, url, body);
    } catch (error) {
      const { path } = parseUrl(url);
      const raw = error instanceof Error ? error.message : String(error);
      const code = errorCode(method, path);
      const message = /network error|failed to fetch|load failed/i.test(raw)
        ? `${code} operation=${method} ${path} reason=local action failed`
        : /^[A-Z][A-Z0-9_]+/.test(raw)
          ? raw
          : `${code} operation=${method} ${path} reason=${raw}`;
      console.error("[dadix]", message);
      const err = new Error(message) as Error & {
        response?: { status?: number; data?: { message?: string; error?: string; code?: string } };
      };
      err.response = { status: 400, data: { message, error: message, code } };
      throw err;
    }
  };
  const api = ((url: string, config?: { method?: Method; data?: unknown }) =>
    request((config?.method ?? "GET").toUpperCase() as Method, url, config?.data)) as {
    (url: string, config?: { method?: Method; data?: unknown }): Promise<BridgeResponse>;
    get: (url: string) => Promise<BridgeResponse>;
    post: (url: string, data?: unknown, _config?: unknown) => Promise<BridgeResponse>;
    patch: (url: string, data?: unknown) => Promise<BridgeResponse>;
    delete: (url: string, config?: { data?: unknown }) => Promise<BridgeResponse>;
    interceptors: { request: { use: (fn: (config: unknown) => unknown) => void } };
  };
  api.get = (url) => request("GET", url);
  api.post = (url, data) => request("POST", url, data);
  api.patch = (url, data) => request("PATCH", url, data);
  api.delete = (url, config) => request("DELETE", url, config?.data);
  api.interceptors = { request: { use: () => undefined } };
  return api;
}

export const callApi = asCall();
export function setStoredAccessToken(_token: string | null) {}
