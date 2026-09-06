import { useCallback, useEffect, useState } from "react";
import { previewSource } from "../lib/dadix";
import { formatQueryCell } from "../lib/queryCells";
import type { BoundFileSource, QueryResult } from "../types";
import "./QueryPanel.css";

interface SourcePreviewProps {
  source: BoundFileSource;
  onError: (msg: string | null) => void;
}

export function SourcePreview({ source, onError }: SourcePreviewProps) {
  const [result, setResult] = useState<QueryResult | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (offset: number) => {
      setBusy(true);
      onError(null);
      try {
        const next = await previewSource(source.source_id, offset, 500);
        setResult(next);
      } catch (e) {
        setResult(null);
        onError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [onError, source.source_id]
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  const columns = result?.payload.encoding === "columnar" ? result.payload.columns : [];
  const rowCount = result?.returned_rows ?? 0;

  return (
    <div className="query-panel">
      <div className="query-meta">
        {source.logical_name}
        {source.format ? ` · ${source.format}` : ""}
        {" · "}
        linked file, not imported
        {result
          ? ` · ${result.returned_rows} rows · ${result.execution_time_ms} ms`
          : busy
            ? " · loading…"
            : ""}
      </div>
      {source.scan_hint ? <div className="query-meta">{source.scan_hint}</div> : null}
      <div className="query-toolbar">
        <button type="button" onClick={() => void load(0)} disabled={busy}>
          Reload
        </button>
        {result?.has_more && (
          <button
            type="button"
            onClick={() => void load(result.offset + result.returned_rows)}
            disabled={busy}
          >
            Load more
          </button>
        )}
      </div>
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
