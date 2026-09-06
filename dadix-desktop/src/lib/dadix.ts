/**
 * Desktop data access: invoke Tauri `dadix_*` commands only.
 * Project logic lives in `crates/dadix-core`. Do not add SQLite, DuckDB,
 * SQL, filter, or sort logic here.
 */
import { invoke } from "@tauri-apps/api/core";
import type {
  DadixError,
  ProjectMeta,
  TableRow,
  ColumnRow,
  ViewRow,
  GridViewColumnRow,
  RecordPage,
  RecordRow,
  SourceRow,
  SourceTableRow,
  JobRow,
  SettingRow,
  ValidationReport,
  MissingSource,
  BoundFileSource,
  DatabaseEngine,
  QueryParam,
  QueryResult,
  QueryStatus,
  RemoteColumn,
  RemoteTable,
} from "../types";

function formatDadixError(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as Partial<DadixError>;
    if (typeof e.message === "string") {
      const prefix = e.code ? `${e.code}: ${e.message}` : e.message;
      return e.query_id ? `${prefix} (${e.query_id})` : prefix;
    }
  }
  return error instanceof Error ? error.message : String(error);
}

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (error) {
    throw new Error(formatDadixError(error));
  }
}

export async function takePendingOpenPath(): Promise<string | null> {
  return call("dadix_take_pending_open_path");
}

export async function createProject(path: string): Promise<ProjectMeta> {
  return call("dadix_create_project", { path });
}

export async function createNamedProject(name: string): Promise<ProjectMeta> {
  return call("dadix_create_named_project", { name });
}

export async function openProject(path: string): Promise<ProjectMeta> {
  return call("dadix_open_project", { path });
}

export async function openDemoProject(): Promise<ProjectMeta> {
  return call("dadix_open_demo_project");
}

export async function closeProject(): Promise<void> {
  return call("dadix_close_project");
}

export async function saveProject(): Promise<void> {
  return call("dadix_save_project");
}

export async function validateProject(path?: string): Promise<ValidationReport> {
  return call("dadix_validate_project", { path: path ?? null });
}

export async function getProjectMeta(): Promise<ProjectMeta | null> {
  return call("dadix_get_project_meta");
}

export async function getTables(): Promise<TableRow[]> {
  return call("dadix_get_tables");
}

export async function getTable(id: number): Promise<TableRow | null> {
  return call("dadix_get_table", { id });
}

export async function getColumns(tableId: number): Promise<ColumnRow[]> {
  return call("dadix_get_columns", { tableId });
}

export async function getViews(tableId: number): Promise<ViewRow[]> {
  return call("dadix_get_views", { tableId });
}

export async function getView(viewId: number): Promise<ViewRow | null> {
  return call("dadix_get_view", { viewId });
}

export async function getGridViewColumns(viewId: number): Promise<GridViewColumnRow[]> {
  return call("dadix_get_grid_view_columns", { viewId });
}

export async function getRecords(
  tableId: number,
  limit: number,
  offset: number
): Promise<RecordRow[]> {
  const rows = await call<unknown[]>("dadix_get_records", { tableId, limit, offset });
  return rows.map(normalizeRecord);
}

export async function getRecordCount(tableId: number): Promise<number> {
  return call("dadix_get_record_count", { tableId });
}

export async function queryRecords(args: {
  tableId: number;
  filter?: string | null;
  sort?: string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
}): Promise<RecordPage> {
  const page = await call<RecordPage>("dadix_query_records", {
    tableId: args.tableId,
    filter: args.filter ?? null,
    sort: args.sort ?? null,
    search: args.search ?? null,
    limit: args.limit ?? 200,
    offset: args.offset ?? 0,
  });
  return {
    total: page.total,
    records: (page.records ?? []).map(normalizeRecord),
  };
}

export async function insertRecord(
  tableId: number,
  data: Record<string, unknown>
): Promise<RecordRow> {
  return normalizeRecord(await call("dadix_insert_record", { tableId, data }));
}

export async function updateRecord(
  tableId: number,
  id: number,
  data: Record<string, unknown>
): Promise<RecordRow> {
  return normalizeRecord(await call("dadix_update_record", { tableId, id, data }));
}

export function normalizeRecord(row: unknown): RecordRow {
  if (!row || typeof row !== "object") {
    return { id: 0 };
  }
  const raw = row as Record<string, unknown>;
  const nested = raw.data;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return { id: Number(raw.id), ...(nested as Record<string, unknown>) };
  }
  return raw as RecordRow;
}

export function recordFields(row: RecordRow): Record<string, unknown> {
  const { id: _id, ...fields } = row;
  return fields;
}

export async function createTable(name: string): Promise<TableRow> {
  return call("dadix_create_table", { name });
}

export async function createColumn(
  tableId: number,
  name: string,
  typeName: string,
  options?: string | null
): Promise<ColumnRow> {
  return call("dadix_create_column", {
    tableId,
    name,
    typeName,
    options: options ?? null,
  });
}

export async function updateColumn(
  columnId: number,
  name: string,
  typeName: string,
  options?: string | null
): Promise<ColumnRow> {
  return call("dadix_update_column", {
    columnId,
    name,
    typeName,
    options: options ?? null,
  });
}

export async function deleteColumn(columnId: number): Promise<void> {
  return call("dadix_delete_column", { columnId });
}

export async function renameTable(tableId: number, name: string): Promise<TableRow> {
  return call("dadix_rename_table", { tableId, name });
}

export async function updateTable(
  tableId: number,
  data: { name?: string | null; icon?: string | null; order?: number | null }
): Promise<TableRow> {
  return call("dadix_update_table", {
    tableId,
    name: data.name ?? null,
    icon: data.icon ?? null,
    order: data.order ?? null,
  });
}

export async function setProjectName(name: string): Promise<void> {
  await call("dadix_set_project_name", { name });
}

export async function deleteTable(tableId: number): Promise<void> {
  return call("dadix_delete_table", { tableId });
}

export async function deleteRecord(tableId: number, id: number): Promise<void> {
  return call("dadix_delete_record", { tableId, id });
}

export async function createView(
  tableId: number,
  name: string,
  typeName = "gridView"
): Promise<ViewRow> {
  return call("dadix_create_view", { tableId, name, typeName });
}

export async function updateView(
  viewId: number,
  name: string,
  filter?: string | null,
  sort?: string | null
): Promise<ViewRow> {
  return call("dadix_update_view", {
    viewId,
    name,
    filter: filter ?? null,
    sort: sort ?? null,
  });
}

export async function deleteView(viewId: number): Promise<void> {
  return call("dadix_delete_view", { viewId });
}

export async function listSources(): Promise<SourceRow[]> {
  return call("dadix_list_sources");
}

export async function listSourceTables(sourceId: number): Promise<SourceTableRow[]> {
  return call("dadix_list_source_tables", { sourceId });
}

export async function listJobs(): Promise<JobRow[]> {
  return call("dadix_list_jobs");
}

export async function listSettings(): Promise<SettingRow[]> {
  return call("dadix_list_settings");
}

export async function getSetting(key: string): Promise<string | null> {
  return call("dadix_get_setting", { key });
}

export async function setSetting(key: string, value: string): Promise<void> {
  await call("dadix_set_setting", { key, value });
}

export async function updateGridViewColumn(
  id: number,
  data: {
    name?: string | null;
    size?: number | null;
    order?: number | null;
    isVisible?: boolean | null;
    contentAlign?: string | null;
  }
): Promise<GridViewColumnRow> {
  return call("dadix_update_grid_view_column", {
    id,
    name: data.name ?? null,
    size: data.size ?? null,
    order: data.order ?? null,
    isVisible: data.isVisible ?? null,
    contentAlign: data.contentAlign ?? null,
  });
}

export async function listViewButtons(viewId: number): Promise<{ id: number; view_id: number; label: string; order: number }[]> {
  return call("dadix_view_buttons", { viewId });
}

export async function createViewButton(
  viewId: number,
  label: string,
  order?: number | null
): Promise<{ id: number; view_id: number; label: string; order: number }> {
  return call("dadix_create_view_button", { viewId, label, order: order ?? null });
}

export async function updateViewButton(
  id: number,
  label?: string | null,
  order?: number | null
): Promise<{ id: number; view_id: number; label: string; order: number }> {
  return call("dadix_update_view_button", { id, label: label ?? null, order: order ?? null });
}

export async function deleteViewButton(id: number): Promise<void> {
  return call("dadix_delete_view_button", { id });
}

export async function resolveSourcePath(sourceId: number): Promise<string> {
  return call("dadix_resolve_source_path", { sourceId });
}

export async function listMissingSources(): Promise<MissingSource[]> {
  return call("dadix_list_missing_sources");
}

export async function relinkSource(
  sourceId: number,
  newPath: string,
  preferRelative = true
): Promise<SourceRow> {
  return call("dadix_relink_source", { sourceId, newPath, preferRelative });
}

export async function executeQuery(args: {
  sql: string;
  limit?: number;
  offset?: number;
  parameters?: QueryParam[];
  queryId?: string;
  timeoutMs?: number;
}): Promise<QueryResult> {
  return call("dadix_execute_query", {
    request: {
      query_id: args.queryId ?? null,
      sql: args.sql,
      offset: args.offset ?? 0,
      limit: args.limit ?? null,
      parameters: args.parameters ?? [],
      timeout_ms: args.timeoutMs ?? null,
    },
  });
}

export async function cancelQuery(queryId: string): Promise<void> {
  return call("dadix_cancel_query", { queryId });
}

export async function explainQuery(
  sql: string,
  parameters: QueryParam[] = []
): Promise<QueryResult> {
  return call("dadix_explain_query", { sql, parameters });
}

export async function queryStatus(queryId: string): Promise<QueryStatus | null> {
  return call("dadix_query_status", { queryId });
}

export async function linkFile(
  path: string,
  preferRelative = true,
  format?: string
): Promise<SourceRow> {
  return call("dadix_link_file", {
    path,
    preferRelative,
    format: format ?? null,
  });
}

export async function listBoundSources(): Promise<BoundFileSource[]> {
  return call("dadix_list_bound_sources");
}

export async function previewSource(
  sourceId: number,
  offset = 0,
  limit = 500
): Promise<QueryResult> {
  return call("dadix_preview_source", { sourceId, offset, limit });
}

export async function describeSource(sourceId: number): Promise<QueryResult> {
  return call("dadix_describe_source", { sourceId });
}

export async function writeFileSource(
  sourceId: number,
  columns: string[],
  rows: Array<Record<string, unknown>>
): Promise<void> {
  return call("dadix_write_file_source", { sourceId, columns, rows });
}

export async function storeCredential(
  username: string,
  password: string
): Promise<string> {
  return call("dadix_store_credential", {
    secret: { username, password },
  });
}

export async function credentialExists(id: string): Promise<boolean> {
  return call("dadix_credential_exists", { id });
}

export async function deleteStoredCredential(id: string): Promise<void> {
  return call("dadix_delete_credential", { id });
}

export async function addDatabaseSource(args: {
  name: string;
  engine: DatabaseEngine;
  uri?: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  credentialId?: string | null;
  preferRelative?: boolean;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
}): Promise<SourceRow> {
  return call("dadix_add_database_source", {
    spec: {
      name: args.name,
      engine: args.engine,
      uri: args.uri ?? "",
      host: args.host ?? null,
      port: args.port ?? null,
      database: args.database ?? null,
      username: args.username ?? null,
      credential_id: args.credentialId ?? null,
      prefer_relative: args.preferRelative ?? true,
      encrypt: args.encrypt ?? true,
      trust_server_certificate: args.trustServerCertificate ?? false,
    },
  });
}

export async function executeSourceQuery(args: {
  sourceId: number;
  sql: string;
  limit?: number;
  offset?: number;
  queryId?: string;
}): Promise<QueryResult> {
  return call("dadix_execute_source_query", {
    sourceId: args.sourceId,
    request: {
      query_id: args.queryId ?? null,
      sql: args.sql,
      offset: args.offset ?? 0,
      limit: args.limit ?? null,
      parameters: [],
      timeout_ms: null,
    },
  });
}

export async function testSourceConnection(sourceId: number): Promise<void> {
  return call("dadix_test_source_connection", { sourceId });
}

export async function listRemoteDatabases(sourceId: number): Promise<string[]> {
  return call("dadix_list_remote_databases", { sourceId });
}

export async function listRemoteSchemas(sourceId: number): Promise<string[]> {
  return call("dadix_list_remote_schemas", { sourceId });
}

export async function cancelSourceQuery(
  sourceId: number,
  queryId: string
): Promise<void> {
  return call("dadix_cancel_source_query", { sourceId, queryId });
}

export async function listRemoteTables(sourceId: number): Promise<RemoteTable[]> {
  return call("dadix_list_remote_tables", { sourceId });
}

export async function listRemoteColumns(
  sourceId: number,
  table: string
): Promise<RemoteColumn[]> {
  return call("dadix_list_remote_columns", { sourceId, table });
}

export async function pollUiScript(): Promise<string | null> {
  return call("dadix_poll_ui_script");
}

export async function writeUiResult(payload: string): Promise<void> {
  await call("dadix_write_ui_result", { payload });
}
