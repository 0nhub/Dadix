import { useState } from "react";
import { cancelQuery, executeQuery } from "../lib/dadix";
import { formatQueryCell } from "../lib/queryCells";
import type { BoundFileSource, QueryResult } from "../types";
import "./QueryPanel.css";

interface QueryPanelProps {
  onError: (msg: string | null) => void;
  sources?: BoundFileSource[];
}

export function QueryPanel({ onError, sources = [] }: QueryPanelProps) {
  const [sql, setSql] = useState("SELECT 1 AS n");
  const [limit, setLimit] = useState(500);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(offset: number) {
    const queryId = crypto.randomUUID();
    setBusy(true);
    setRunningId(queryId);
    onError(null);
    try {
      const next = await executeQuery({
        sql,
        limit,
        offset,
        queryId,
      });
      setResult(next);
    } catch (e) {
      setResult(null);
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setRunningId(null);
    }
  }

  async function handleCancel() {
    if (!runningId) return;
    try {
      await cancelQuery(runningId);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  const columns = result?.payload.encoding === "columnar" ? result.payload.columns : [];
  const rowCount = result?.returned_rows ?? 0;

  return (
    <div className="query-panel">
      <div className="query-toolbar">
        <label>
          Limit
          <input
            type="number"
            min={1}
            max={10000}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value) || 500)}
          />
        </label>
        <button type="button" onClick={() => void run(0)} disabled={busy}>
          {busy ? "Running…" : "Run"}
        </button>
        <button type="button" onClick={() => void handleCancel()} disabled={!runningId}>
          Cancel
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
      {sources.filter((s) => s.bound).length > 0 && (
        <div className="query-sources">
          {sources
            .filter((s) => s.bound)
            .map((source) => (
              <button
                key={source.source_id}
                type="button"
                onClick={() =>
                  setSql(`SELECT * FROM ${source.logical_name}`)
                }
              >
                {source.logical_name}
              </button>
            ))}
        </div>
      )}
      <textarea
        className="query-sql"
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        spellCheck={false}
        rows={6}
      />
      {result && (
        <div className="query-meta">
          {result.returned_rows} rows · offset {result.offset}
          {result.has_more ? " · more available" : ""} · {result.execution_time_ms} ms
          {" · "}
          {result.statement_kind}
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
