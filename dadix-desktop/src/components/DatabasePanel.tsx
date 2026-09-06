import { useEffect, useState } from "react";
import {
  executeSourceQuery,
  listRemoteColumns,
  listRemoteTables,
} from "../lib/dadix";
import { formatQueryCell } from "../lib/queryCells";
import type { QueryResult, RemoteTable, SourceRow } from "../types";
import "./QueryPanel.css";

interface DatabasePanelProps {
  source: SourceRow;
  onError: (msg: string | null) => void;
}

export function DatabasePanel({ source, onError }: DatabasePanelProps) {
  const [tables, setTables] = useState<RemoteTable[]>([]);
  const [sql, setSql] = useState("SELECT 1 AS n");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void listRemoteTables(source.id)
      .then((list) => {
        if (!cancelled) setTables(list);
      })
      .catch((e) => {
        if (!cancelled) onError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [onError, source.id]);

  async function run(offset: number) {
    setBusy(true);
    onError(null);
    try {
      const next = await executeSourceQuery({
        sourceId: source.id,
        sql,
        limit: 500,
        offset,
      });
      setResult(next);
    } catch (e) {
      setResult(null);
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function inspect(table: RemoteTable) {
    try {
      const columns = await listRemoteColumns(source.id, table.name);
      onError(null);
      setResult(null);
      const qualified =
        source.type_name === "sqlserver" && table.schema
          ? `[${table.schema}].[${table.name}]`
          : table.schema
            ? `${table.schema}.${table.name}`
            : table.name;
      setSql(
        `SELECT ${columns.map((c) => c.name).join(", ") || "*"} FROM ${qualified}`
      );
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  const columns = result?.payload.encoding === "columnar" ? result.payload.columns : [];
  const rowCount = result?.returned_rows ?? 0;

  return (
    <div className="query-panel">
      <div className="query-meta">
        {source.name} · {source.type_name} · credential_id only · no federation
      </div>
      {tables.length > 0 && (
        <div className="query-sources">
          {tables.map((table) => (
            <button
              key={`${table.schema ?? ""}.${table.name}`}
              type="button"
              onClick={() => void inspect(table)}
            >
              {table.schema ? `${table.schema}.` : ""}
              {table.name}
            </button>
          ))}
        </div>
      )}
      <div className="query-toolbar">
        <button type="button" onClick={() => void run(0)} disabled={busy}>
          {busy ? "Running…" : "Run"}
        </button>
        {result?.has_more && (
          <button
            type="button"
            onClick={() => void run(result.offset + result.returned_rows)}
            disabled={busy}
          >
            Load more
          </button>
        )}
      </div>
      <textarea
        className="query-sql"
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        spellCheck={false}
        rows={6}
      />
      {result && (
        <div className="query-meta">
          {result.returned_rows} rows · {result.execution_time_ms} ms
        </div>
      )}
      {columns.length > 0 && (
        <div className="query-table-wrap">
          <table className="query-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.name}>
                    {col.name}
                    <span className="query-type">{col.data_type}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rowCount }, (_, row) => (
                <tr key={row}>
                  {columns.map((col) => (
                    <td key={col.name}>{formatQueryCell(col, row)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
