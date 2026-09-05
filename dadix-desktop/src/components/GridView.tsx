import { useState, useEffect, useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  getColumns,
  getViews,
  getGridViewColumns,
  getRecords,
  getRecordCount,
} from "../lib/dadix";
import type {
  ColumnRow,
  GridViewColumnRow,
  RecordRow,
} from "../types";
import "./GridView.css";

const ROW_HEIGHT = 36;
const OVERSCAN = 5;

interface GridViewProps {
  tableId: number;
  onError: (msg: string | null) => void;
}

export function GridView({ tableId, onError }: GridViewProps) {
  const [columns, setColumns] = useState<ColumnRow[]>([]);
  const [gridColumns, setGridColumns] = useState<GridViewColumnRow[]>([]);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const parentRef = useRef<HTMLDivElement>(null);

  const loadTableMeta = useCallback(async () => {
    try {
      const [cols, viewList] = await Promise.all([
        getColumns(tableId),
        getViews(tableId),
      ]);
      setColumns(cols);
      const gridView = viewList.find((v) => v.type_name === "gridView");
      if (gridView) {
        const gvCols = await getGridViewColumns(gridView.id);
        setGridColumns(gvCols);
      } else {
        setGridColumns([]);
      }
      onError(null);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }, [tableId, onError]);

  const loadCount = useCallback(async () => {
    try {
      const count = await getRecordCount(tableId);
      setTotalCount(count);
    } catch {
      setTotalCount(0);
    }
  }, [tableId]);

  useEffect(() => {
    setLoading(true);
    setRecords([]);
    setTotalCount(0);
    loadTableMeta().finally(() => setLoading(false));
    loadCount();
  }, [loadTableMeta, loadCount]);

  // Build visible columns: use grid view config if present, else all table columns in order
  const visibleColumns: { id: number; name: string }[] = (() => {
    if (gridColumns.length > 0) {
      const visible = gridColumns.filter((c) => c.is_visible);
      return visible
        .sort((a, b) => a.order - b.order)
        .map((c) => {
          const col = columns.find((x) => x.id === c.column_id);
          return { id: col?.id ?? c.column_id, name: col?.name ?? c.name ?? String(c.column_id) };
        });
    }
    return columns.sort((a, b) => a.order - b.order).map((c) => ({ id: c.id, name: c.name }));
  })();

  // Virtualizer: we need to fetch records in chunks as user scrolls
  const virtualizer = useVirtualizer({
    count: totalCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  const virtualItems = virtualizer.getVirtualItems();

  // Batch load records for the visible virtual window
  useEffect(() => {
    if (totalCount === 0 || virtualItems.length === 0) return;
    const start = virtualItems[0].index;
    const end = virtualItems[virtualItems.length - 1].index;
    const from = Math.max(0, start - OVERSCAN);
    const to = Math.min(totalCount, end + OVERSCAN + 1);
    const limit = to - from;
    getRecords(tableId, limit, from)
      .then((rows) => {
        const merged: RecordRow[] = rows.map((r) => {
          const x = r as { id: number; data?: Record<string, unknown> };
          return { id: x.id, ...(x.data ?? {}) } as RecordRow;
        });
        setRecords((prev) => {
          const next = [...prev];
          merged.forEach((row, i) => {
            next[from + i] = row;
          });
          return next;
        });
      })
      .catch((e) => onError(e instanceof Error ? e.message : String(e)));
  }, [tableId, totalCount, virtualItems[0]?.index ?? 0, virtualItems[virtualItems.length - 1]?.index ?? 0]);

  if (loading) {
    return (
      <div className="grid-view">
        <p className="grid-loading">Loading…</p>
      </div>
    );
  }

  return (
    <div className="grid-view">
      <div className="grid-header-row">
        <div className="grid-cell grid-cell-header grid-cell-id">#</div>
        {visibleColumns.map((col) => (
          <div key={col.id} className="grid-cell grid-cell-header">
            {col.name}
          </div>
        ))}
      </div>
      <div
        ref={parentRef}
        className="grid-body"
        style={{ height: "100%", overflow: "auto" }}
      >
        <div
          className="grid-virtual-root"
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const record = records[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                className="grid-row"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                  display: "flex",
                  alignItems: "stretch",
                }}
              >
                <div className="grid-cell grid-cell-id">
                  {record?.id ?? virtualRow.index + 1}
                </div>
                {visibleColumns.map((col) => (
                  <div key={col.id} className="grid-cell">
                    {record && (col.name in record || col.id in record)
                      ? String(record[col.name as keyof RecordRow] ?? record[col.id as keyof RecordRow] ?? "")
                      : ""}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
