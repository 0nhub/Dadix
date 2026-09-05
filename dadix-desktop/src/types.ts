export interface ProjectMeta {
  id: number;
  name: string;
  created_at: string;
  format_version: number;
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
