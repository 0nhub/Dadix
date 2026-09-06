export interface ProjectMeta {
  id: number;
  project_id?: string;
  path?: string;
  name: string;
  created_at: string;
  updated_at?: string;
  app_version?: string;
  format_version: number;
  minimum_reader_version?: number;
}

export interface DadixError {
  code: string;
  message: string;
  details?: string | null;
  query_id?: string | null;
  position?: number | null;
}

export interface ValidationReport {
  ok: boolean;
  format_version: number | null;
  issues: { code: string; message: string }[];
}

export interface TableRow {
  id: number;
  name: string;
  reference_name: string;
  icon: string;
  order: number;
}

export interface ColumnRow {
  id: number;
  table_id: number;
  name: string;
  type_name: string;
  options: string | null;
  order: number;
}

export interface ViewRow {
  id: number;
  table_id: number;
  name: string;
  type_name: string;
  filter: string | null;
  sort: string | null;
  order: number;
}

export interface GridViewColumnRow {
  id: number;
  view_id: number;
  column_id: number;
  name: string | null;
  size: number | null;
  order: number;
  is_visible: boolean;
  content_align: string | null;
}

export interface RecordRow {
  id: number;
  [key: string]: unknown;
}

export interface RecordPage {
  records: RecordRow[];
  total: number;
}

export type FilterOperation =
  | "eq"
  | "neq"
  | "like"
  | "nlike"
  | "lte"
  | "gte"
  | "isnull"
  | "notnull";

export interface ViewFilter {
  id: string;
  operation: FilterOperation;
  fieldId: number;
  relation: "and" | "or" | "where";
  value: string;
}

export interface ViewSort {
  fieldId: number | undefined;
  direction: "ASC" | "DESC" | undefined;
}

export interface CredentialRef {
  id: string;
}

export type SourceKind =
  | "embedded_table"
  | "embedded_file"
  | "linked_file"
  | "external_database";

export interface SourceRow {
  id: number;
  name: string;
  type_name: string;
  kind: SourceKind;
  path_mode: "embedded" | "absolute" | "relative";
  uri: string | null;
  options: string | null;
  credential: CredentialRef | null;
  created_at: string;
}

export interface MissingSource {
  source_id: number;
  name: string;
  kind: SourceKind;
  path_mode: "embedded" | "absolute" | "relative";
  stored_uri: string | null;
  expected_path: string;
}

export interface SourceTableRow {
  id: number;
  source_id: number;
  logical_name: string;
  remote_name: string | null;
  options: string | null;
}

export interface JobRow {
  id: number;
  name: string;
  enabled: boolean;
  schedule: string | null;
  payload: string | null;
  created_at: string;
}

export interface SettingRow {
  key: string;
  value: string;
}

export type QueryParam =
  | { type: "null" }
  | { type: "bool"; value: boolean }
  | { type: "int"; value: number }
  | { type: "float"; value: number }
  | { type: "text"; value: string };

export type QueryStatus = "queued" | "running" | "completed" | "cancelled" | "failed";

export type LogicalType =
  | "null"
  | "boolean"
  | "bool"
  | "int64"
  | "uint64"
  | "decimal"
  | "float64"
  | "string"
  | "utf8"
  | "binary"
  | "date"
  | "time"
  | "date_time"
  | "timestamp"
  | "date_time_tz"
  | "uuid"
  | "json";

export type ColumnData =
  | { encoding: "bool"; values: boolean[] }
  | { encoding: "int64"; values: number[] }
  | { encoding: "uint64"; values: number[] }
  | { encoding: "float64"; values: number[] }
  | { encoding: "decimal"; values: string[] }
  | { encoding: "utf8"; values: string[] }
  | { encoding: "binary"; values: number[][] };

export interface TypedColumn {
  name: string;
  data_type: LogicalType;
  native_type?: string | null;
  validity: boolean[];
  data: ColumnData;
}

export type QueryPayload =
  | { encoding: "columnar"; columns: TypedColumn[] }
  | { encoding: "arrow_ipc"; schema: string; buffers: number[] };

export type FileFormat = "csv" | "tsv" | "parquet" | "json" | "ndjson";

export type DatabaseEngine = "sqlite" | "postgres" | "mysql" | "sql_server";

export interface RemoteTable {
  schema: string | null;
  name: string;
}

export interface RemoteColumn {
  name: string;
  dadix_type: string;
  native_type: string;
  nullable: boolean;
}

export interface BoundFileSource {
  source_id: number;
  name: string;
  logical_name: string;
  format?: FileFormat | null;
  path: string;
  bound: boolean;
  error?: string | null;
  scan_hint?: string | null;
}

export interface QueryResult {
  query_id: string;
  status: QueryStatus;
  statement_kind: string;
  payload: QueryPayload;
  offset: number;
  returned_rows: number;
  has_more: boolean;
  execution_time_ms: number;
}
