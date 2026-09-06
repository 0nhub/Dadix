import type { TypedColumn } from "../types";

export function formatQueryCell(column: TypedColumn, row: number): string {
  if (!column.validity[row]) {
    return "NULL";
  }
  switch (column.data.encoding) {
    case "bool":
      return column.data.values[row] ? "true" : "false";
    case "int64":
    case "uint64":
      return String(column.data.values[row]);
    case "float64":
      return String(column.data.values[row]);
    case "decimal":
    case "utf8":
      return column.data.values[row];
    case "binary":
      return `[${column.data.values[row].length} bytes]`;
  }
}
