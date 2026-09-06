import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  getColumns,
  getViews,
  getGridViewColumns,
  getRecords,
  getRecordCount,
  insertRecord,
  updateRecord,
  normalizeRecord,
  recordFields,
} from "../lib/dadix";
import type {
  ColumnRow,
  GridViewColumnRow,
  RecordRow,
} from "../types";
import "./GridView.css";

const ROW_HEIGHT = 36;
const OVERSCAN = 8;

interface GridViewProps {
  tableId: number;
  onError: (msg: string | null) => void;
}

function cellText(record: RecordRow | undefined, columnName: string): string {
  if (!record) return "";
  const value = record[columnName];
  if (value == null) return "";
  return String(value);
}

export function GridView({ tableId, onError }: GridViewProps) {
  const [columns, setColumns] = useState<ColumnRow[]>([]);
  const [gridColumns, setGridColumns] = useState<GridViewColumnRow[]>([]);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<{ id: number; column: string } | null>(
    null
  );
  const [draft, setDraft] = useState("");
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
    setFilter("");
    setEditing(null);
    loadTableMeta().finally(() => setLoading(false));
    loadCount();
  }, [loadTableMeta, loadCount]);

  const visibleColumns: { id: number; name: string }[] = useMemo(() => {
    if (gridColumns.length > 0) {
      return gridColumns
        .filter((c) => c.is_visible)
        .sort((a, b) => a.order - b.order)
        .map((c) => {
          const col = columns.find((x) => x.id === c.column_id);
          return {
            id: col?.id ?? c.column_id,
            name: col?.name ?? c.name ?? String(c.column_id),
          };
        });
    }
    return [...columns]
      .sort((a, b) => a.order - b.order)
      .map((c) => ({ id: c.id, name: c.name }));
  }, [columns, gridColumns]);

  const virtualizer = useVirtualizer({
    count: totalCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    if (totalCount === 0) {
      setRecords([]);
      return;
    }
    const start = virtualItems[0]?.index ?? 0;
    const end = virtualItems[virtualItems.length - 1]?.index ?? Math.min(totalCount - 1, 50);
    const from = Math.max(0, start - OVERSCAN);
    const to = Math.min(totalCount, end + OVERSCAN + 1);
    const limit = Math.max(to - from, totalCount);
    const offset = limit >= totalCount ? 0 : from;
    getRecords(tableId, limit, offset)
      .then((rows) => {
        const merged = rows.map(normalizeRecord);
        if (offset === 0 && merged.length >= totalCount) {
          setRecords(merged);
          return;
        }
        setRecords((prev) => {
          const next = prev.slice();
          merged.forEach((row, i) => {
            next[offset + i] = row;
          });
          return next;
        });
      })
      .catch((e) => onError(e instanceof Error ? e.message : String(e)));
  }, [
    tableId,
    totalCount,
    virtualItems[0]?.index ?? 0,
    virtualItems[virtualItems.length - 1]?.index ?? 0,
    onError,
  ]);

  const shown = useMemo(() => {
    const query = filter.trim().toLowerCase();
    const rows = records.filter(Boolean);
    if (!query) return rows;
    return rows.filter((row) =>
      visibleColumns.some((col) =>
        cellText(row, col.name).toLowerCase().includes(query)
      )
    );
  }, [records, filter, visibleColumns]);

  async function saveCell(record: RecordRow, column: string, value: string) {
    const next = { ...recordFields(record), [column]: value };
    try {
      const saved = await updateRecord(tableId, record.id, next);
      setRecords((prev) =>
        prev.map((row) => (row?.id === saved.id ? saved : row))
      );
      onError(null);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setEditing(null);
    }
  }

  async function handleAddRow() {
    const empty: Record<string, unknown> = {};
    for (const col of visibleColumns) {
      empty[col.name] = "";
    }
    try {
      const created = await insertRecord(tableId, empty);
      setRecords((prev) => [...prev.filter(Boolean), created]);
      setTotalCount((n) => n + 1);
      setEditing({ id: created.id, column: visibleColumns[0]?.name ?? "" });
      setDraft("");
      onError(null);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  if (loading) {
    return (
      <div className="grid-view">
        <p className="grid-loading">Laden…</p>
      </div>
    );
  }

  return (
    <div className="grid-view">
      <div className="grid-toolbar">
        <input
          type="search"
          className="grid-filter"
          placeholder="Suchen…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button type="button" className="grid-add" onClick={() => void handleAddRow()}>
          Zeile hinzufügen
        </button>
        <span className="grid-count">
          {filter.trim()
            ? `${shown.length} von ${totalCount}`
            : `${totalCount} Zeilen`}
        </span>
      </div>
      <div className="grid-header-row">
        <div className="grid-cell grid-cell-header grid-cell-id">#</div>
        {visibleColumns.map((col) => (
          <div key={col.id} className="grid-cell grid-cell-header">
            {col.name}
          </div>
        ))}
      </div>
      <div ref={parentRef} className="grid-body">
        {shown.length === 0 ? (
          <p className="grid-empty">
            {totalCount === 0
              ? "Keine Zeilen. „Zeile hinzufügen“ legt den ersten Eintrag an."
              : "Kein Treffer für diese Suche."}
          </p>
        ) : filter.trim() ? (
          shown.map((record) => (
            <div className="grid-row" key={record.id}>
              <GridRow
                record={record}
                columns={visibleColumns}
                editing={editing}
                draft={draft}
                onDraft={setDraft}
                onStartEdit={(column, value) => {
                  setEditing({ id: record.id, column });
                  setDraft(value);
                }}
                onCancel={() => setEditing(null)}
                onSave={(column, value) => void saveCell(record, column, value)}
              />
            </div>
          ))
        ) : (
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
                  }}
                >
                  <GridRow
                    record={record}
                    columns={visibleColumns}
                    editing={editing}
                    draft={draft}
                    onDraft={setDraft}
                    onStartEdit={(column, value) => {
                      if (!record) return;
                      setEditing({ id: record.id, column });
                      setDraft(value);
                    }}
                    onCancel={() => setEditing(null)}
                    onSave={(column, value) => {
                      if (!record) return;
                      void saveCell(record, column, value);
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function GridRow({
  record,
  columns,
  editing,
  draft,
  onDraft,
  onStartEdit,
  onCancel,
  onSave,
}: {
  record: RecordRow | undefined;
  columns: { id: number; name: string }[];
  editing: { id: number; column: string } | null;
  draft: string;
  onDraft: (value: string) => void;
  onStartEdit: (column: string, value: string) => void;
  onCancel: () => void;
  onSave: (column: string, value: string) => void;
}) {
  return (
    <div className="grid-row-inner">
      <div className="grid-cell grid-cell-id">{record?.id ?? ""}</div>
      {columns.map((col) => {
        const value = cellText(record, col.name);
        const isEditing =
          !!record && editing?.id === record.id && editing.column === col.name;
        return (
          <div key={col.id} className="grid-cell">
            {isEditing ? (
              <input
                className="grid-editor"
                value={draft}
                autoFocus
                onChange={(e) => onDraft(e.target.value)}
                onBlur={() => onSave(col.name, draft)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSave(col.name, draft);
                  if (e.key === "Escape") onCancel();
                }}
              />
            ) : (
              <button
                type="button"
                className="grid-value"
                onClick={() => {
                  if (!record) return;
                  onStartEdit(col.name, value);
                }}
              >
                {value}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
