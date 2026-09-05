import { invoke } from "@tauri-apps/api/core";
import type {
  ProjectMeta,
  TableRow,
  ColumnRow,
  ViewRow,
  GridViewColumnRow,
  RecordRow,
} from "../types";

export async function createProject(path: string): Promise<ProjectMeta> {
  return invoke("dadix_create_project", { path });
}

export async function openProject(path: string): Promise<ProjectMeta> {
  return invoke("dadix_open_project", { path });
}

export async function closeProject(): Promise<void> {
  return invoke("dadix_close_project");
}

export async function getProjectMeta(): Promise<ProjectMeta | null> {
  return invoke("dadix_get_project_meta");
}

export async function getTables(): Promise<TableRow[]> {
  return invoke("dadix_get_tables");
}

export async function getTable(id: number): Promise<TableRow | null> {
  return invoke("dadix_get_table", { id });
}

export async function getColumns(tableId: number): Promise<ColumnRow[]> {
  return invoke("dadix_get_columns", { tableId });
}

export async function getViews(tableId: number): Promise<ViewRow[]> {
  return invoke("dadix_get_views", { tableId });
}

export async function getView(viewId: number): Promise<ViewRow | null> {
  return invoke("dadix_get_view", { viewId });
}

export async function getGridViewColumns(viewId: number): Promise<GridViewColumnRow[]> {
  return invoke("dadix_get_grid_view_columns", { viewId });
}

export async function getRecords(
  tableId: number,
  limit: number,
  offset: number
): Promise<RecordRow[]> {
  return invoke("dadix_get_records", { tableId, limit, offset });
}

export async function getRecordCount(tableId: number): Promise<number> {
  return invoke("dadix_get_record_count", { tableId });
}

export async function createTable(name: string): Promise<TableRow> {
  return invoke("dadix_create_table", { name });
}

export async function createColumn(
  tableId: number,
  name: string,
  typeName: string
): Promise<ColumnRow> {
  return invoke("dadix_create_column", {
    tableId,
    name,
    typeName,
  });
}
