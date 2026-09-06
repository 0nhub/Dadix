import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { HashRouter, Navigate, Outlet, Route, Routes, useParams } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import { Toaster } from "@/components/ui/sonner";
import { LanguageContextProvider } from "@/context/LanguageContext";
import { AuthContextProvider } from "@/context/AuthContext";
import { LoadingIndicator } from "@/components/loading-indicator/LoadingIndicator";
import DashboardLayout from "@/app/(dashboard)/dashboard/layout";
import DashboardHomePage from "@/app/(dashboard)/dashboard/page";
import ProjectLayout from "@/app/(dashboard)/dashboard/[projectId]/layout";
import ProjectPage from "@/app/(dashboard)/dashboard/[projectId]/page";
import DocumentsPage from "@/app/(dashboard)/dashboard/[projectId]/documents/page";
import SharePage from "@/app/share/[shareId]/page";
import WebformSharePage from "@/app/share/webform/page";
import { UserLocalStorage } from "@/lib/userLocalStorage";
import { getProjectMeta, getTables, openDemoProject, openProject, pollUiScript, takePendingOpenPath, writeUiResult } from "./lib/dadix";
import { findRecent, listRecents, setCurrentOpen } from "./bridge/recents";
import { callApi } from "./bridge/callApi";
import tableService from "@/lib/table";
import { installDesktopGuards } from "./bridge/networkGuard";
import { dadixEvents } from "@/constants/events";
import { WindowControls } from "./components/WindowControls";
import { TableEditorAuxPage } from "@/components/table-editor/TableEditorAuxPage";
import { DocumentEditorAuxPage } from "@/components/document-editor/DocumentEditorAuxPage";
import {
  installAuxWindowNavigation,
  installAuxWindowOpener,
  isAuxWindow,
  notifyAuxWindowClosed,
  openAuxWindow,
} from "./bridge/auxWindows";
import { dispatchInAuxWindow, installWindowEventBridge } from "./bridge/windowEvents";

let bootstrapPromise: Promise<string> | null = null;

class RouteErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info);
    void writeUiResult(
      JSON.stringify({
        ok: false,
        error: `${error.message}\n${error.stack ?? ""}\n${info.componentStack ?? ""}`,
        href: window.location.hash,
      })
    );
  }

  render() {
    if (this.state.error) {
      return (
        <div className="fixed inset-0 overflow-auto bg-background p-8 text-foreground">
          <p className="text-sm text-muted-foreground">Dadix konnte die Oberfläche nicht laden.</p>
          <pre className="mt-3 whitespace-pre-wrap text-sm">
            {this.state.error.message}
            {"\n"}
            {this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

async function rememberOpen() {
  const meta = await getProjectMeta();
  if (!meta) return;
  setCurrentOpen({
    id: meta.project_id ?? String(meta.id),
    path: meta.path ?? "",
    title: meta.name,
    icon: "FolderClosed",
    order: 0,
  });
  window.dispatchEvent(new CustomEvent(dadixEvents.projectEvents.onPatch, { detail: meta }));
}

function currentAuxHash() {
  const raw = window.location.hash.replace(/^#/, "");
  if (/\/edit-table(\?|$)/.test(raw) || /\/documents-editor(\?|$)/.test(raw) || raw.startsWith("/aux/")) {
    return raw.startsWith("/") ? raw : `/${raw}`;
  }
  return null;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function openLastProject() {
  const pending = await takePendingOpenPath();
  if (pending) {
    await withTimeout(openProject(pending), 8000, "openProject");
    return;
  }
  const recents = listRecents();
  const last = recents.find((item) => item.path) ?? recents[0];
  if (last?.path) {
    await withTimeout(openProject(last.path), 8000, "openProject");
    return;
  }
  await withTimeout(openDemoProject(), 8000, "openDemoProject");
}

async function hrefForOpenProject() {
  await rememberOpen();
  const meta = await withTimeout(getProjectMeta(), 4000, "getProjectMeta");
  if (!meta) return "/dashboard";
  const id = meta.project_id ?? String(meta.id);
  UserLocalStorage.setProjectId(id);
  const tables = await withTimeout(getTables(), 4000, "getTables");
  const storedTable = UserLocalStorage.getTableId();
  const table = tables.find((item) => String(item.id) === storedTable) ?? tables[0];
  if (table) {
    UserLocalStorage.setTableId(String(table.id));
    return `/dashboard/${id}?tableId=${table.id}`;
  }
  return `/dashboard/${id}`;
}

async function resolveStartHref(): Promise<string> {
  const auxHash = currentAuxHash();
  if (auxHash) {
    try {
      await rememberOpen();
    } catch {
      // Aux windows share the already-open project in the host process.
    }
    return auxHash;
  }
  try {
    await openLastProject();
  } catch (error) {
    console.error(error);
    try {
      return await hrefForOpenProject();
    } catch {
      return "/dashboard";
    }
  }
  try {
    return await hrefForOpenProject();
  } catch (error) {
    console.error(error);
    return "/dashboard";
  }
}

function bootstrapStartHref() {
  if (!bootstrapPromise) {
    bootstrapPromise = resolveStartHref();
  }
  return bootstrapPromise;
}

function ProjectFileSync() {
  const { projectId } = useParams();
  useEffect(() => {
    if (!projectId) return;
    void (async () => {
      const meta = await getProjectMeta();
      const currentId = meta?.project_id ?? (meta ? String(meta.id) : null);
      if (currentId !== projectId) {
        const recent = findRecent(projectId);
        if (recent?.path) {
          await openProject(recent.path);
        }
      }
      await rememberOpen();
      window.dispatchEvent(new CustomEvent(dadixEvents.tableEvents.onRefetchTables));
    })();
  }, [projectId]);
  return null;
}

type UiScriptAction =
  | { type: "click"; selector: string }
  | { type: "clickName"; name: string }
  | { type: "hoverName"; name: string }
  | { type: "drag"; name: string; dx: number; dy?: number; index?: number }
  | { type: "fill"; selector: string; value: string }
  | { type: "dispatch"; name: string; detail?: Record<string, unknown> }
  | { type: "hash"; value: string }
  | { type: "wait"; ms: number }
  | { type: "dump" }
  | { type: "api"; method?: "GET" | "POST" | "PATCH" | "DELETE"; url: string; body?: unknown }
  | { type: "open"; path: string }
  | { type: "aux"; kind: string; title: string; hash: string }
  | { type: "auxDispatch"; name: string; detail?: Record<string, unknown> }
  | { type: "contextmenu"; selector: string };

function realClick(node: HTMLElement) {
  const rect = node.getBoundingClientRect();
  const x = rect.left + Math.max(rect.width / 2, 1);
  const y = rect.top + Math.max(rect.height / 2, 1);
  const opts: PointerEventInit = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y,
    pointerId: 1,
    pointerType: "mouse",
    buttons: 1,
  };
  node.dispatchEvent(new PointerEvent("pointerdown", opts));
  node.dispatchEvent(new MouseEvent("mousedown", opts));
  node.dispatchEvent(new PointerEvent("pointerup", opts));
  node.dispatchEvent(new MouseEvent("mouseup", opts));
  node.click();
}

function isVisible(node: HTMLElement) {
  const rect = node.getBoundingClientRect();
  const style = window.getComputedStyle(node);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.visibility !== "hidden" &&
    style.display !== "none" &&
    style.pointerEvents !== "none"
  );
}

function labeledNodes(name: string) {
  return Array.from(document.querySelectorAll<HTMLElement>("button, [role='menuitem'], [aria-label], a, [data-slot]")).filter((node) => {
    const label = (node.getAttribute("aria-label") || node.textContent || "").replace(/\s+/g, " ").trim();
    return label === name || label.includes(name);
  });
}

function findByName(name: string) {
  const nodes = labeledNodes(name);
  const match = nodes.find(isVisible) ?? nodes[0];
  if (!match) throw new Error(`NOT_FOUND: ${name}`);
  return match;
}

function clickByName(name: string) {
  realClick(findByName(name));
}

function dragByName(name: string, dx: number, dy = 0, index = 0) {
  const nodes = labeledNodes(name).filter(isVisible);
  const node = nodes[index] ?? nodes[0];
  if (!node) throw new Error(`NOT_FOUND: ${name}`);
  const rect = node.getBoundingClientRect();
  const startX = rect.left + Math.max(rect.width / 2, 1);
  const startY = rect.top + Math.max(rect.height / 2, 1);
  const steps = 8;
  const down: PointerEventInit = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: startX,
    clientY: startY,
    pointerId: 1,
    pointerType: "mouse",
    buttons: 1,
  };
  node.dispatchEvent(new PointerEvent("pointerdown", down));
  node.dispatchEvent(new MouseEvent("mousedown", down));
  for (let step = 1; step <= steps; step += 1) {
    const move: PointerEventInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: startX + (dx * step) / steps,
      clientY: startY + (dy * step) / steps,
      pointerId: 1,
      pointerType: "mouse",
      buttons: 1,
    };
    window.dispatchEvent(new PointerEvent("pointermove", move));
    node.dispatchEvent(new PointerEvent("pointermove", move));
  }
  const up: PointerEventInit = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: startX + dx,
    clientY: startY + dy,
    pointerId: 1,
    pointerType: "mouse",
    buttons: 0,
  };
  window.dispatchEvent(new PointerEvent("pointerup", up));
  node.dispatchEvent(new PointerEvent("pointerup", up));
  node.dispatchEvent(new MouseEvent("mouseup", up));
}

function hoverNode(node: HTMLElement) {
  const rect = node.getBoundingClientRect();
  const x = rect.left + Math.max(rect.width / 2, 1);
  const y = rect.top + Math.max(rect.height / 2, 1);
  const opts: PointerEventInit = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y,
    pointerId: 1,
    pointerType: "mouse",
  };
  node.dispatchEvent(new PointerEvent("pointerover", opts));
  node.dispatchEvent(new PointerEvent("pointerenter", opts));
  node.dispatchEvent(new MouseEvent("mouseover", opts));
  node.dispatchEvent(new MouseEvent("mouseenter", opts));
  node.dispatchEvent(new PointerEvent("pointermove", opts));
  node.dispatchEvent(new MouseEvent("mousemove", opts));
}

function projectIdFromHash() {
  return window.location.hash.replace(/^#\/dashboard\/([^/?]+).*/, "$1");
}

function announceCanonicalMutation(method: string, url: string, body: unknown, data: unknown) {
  const path = url.split("?")[0] ?? url;
  const payload = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const projectId = projectIdFromHash();
  if (method === "POST" && path === "/project") {
    const id = String((data as { id?: string; project_id?: string })?.id ?? (data as { project_id?: string })?.project_id ?? "");
    if (id) {
      UserLocalStorage.setProjectId(id);
      window.location.hash = `#/dashboard/${id}`;
    }
    window.dispatchEvent(new CustomEvent(dadixEvents.projectEvents.onCreate, { detail: data }));
    window.dispatchEvent(new CustomEvent(dadixEvents.tableEvents.onRefetchTables));
  }
  if (method === "POST" && path === "/table") {
    window.dispatchEvent(
      new CustomEvent(dadixEvents.tableEvents.onCreate, {
        detail: { projectId, createdTable: data },
      })
    );
    window.dispatchEvent(new CustomEvent(dadixEvents.tableEvents.onRefetchTables));
  }
  if (method === "PATCH" && path.startsWith("/table/")) {
    const tableId = path.replace("/table/", "").split("?")[0];
    window.dispatchEvent(
      new CustomEvent(dadixEvents.tableEvents.onPatch, {
        detail: { projectId, tableId, data: (payload.data as object) ?? payload },
      })
    );
    window.dispatchEvent(new CustomEvent(dadixEvents.tableEvents.onRefetchTables));
  }
  if (method === "DELETE" && path.startsWith("/table/")) {
    const tableId = path.replace("/table/", "").split("?")[0];
    window.dispatchEvent(
      new CustomEvent(dadixEvents.tableEvents.onDelete, {
        detail: { projectId, tableId },
      })
    );
    window.dispatchEvent(new CustomEvent(dadixEvents.tableEvents.onRefetchTables));
  }
  if (method === "POST" && path === "/column") {
    window.dispatchEvent(
      new CustomEvent(dadixEvents.tableEvents.onCreateField, {
        detail: { tableId: payload.tableId, data },
      })
    );
    window.dispatchEvent(
      new CustomEvent(dadixEvents.tableEvents.onRefetchTable, {
        detail: { tableId: payload.tableId },
      })
    );
    const hashQuery = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
    window.dispatchEvent(
      new CustomEvent(dadixEvents.gridViewEvents.onRefetchView, {
        detail: {
          tableId: payload.tableId ?? hashQuery.get("tableId"),
          viewId: hashQuery.get("viewId"),
        },
      })
    );
  }
  if (method === "PATCH" && path.startsWith("/column/")) {
    const fieldId = Number(path.replace("/column/", ""));
    window.dispatchEvent(
      new CustomEvent(dadixEvents.tableEvents.onPatchField, {
        detail: { tableId: payload.tableId, fieldId, data: (payload.data as object) ?? payload },
      })
    );
  }
  if (method === "DELETE" && path.startsWith("/column/")) {
    const query = new URLSearchParams(url.split("?")[1] ?? "");
    window.dispatchEvent(
      new CustomEvent(dadixEvents.tableEvents.onDeleteField, {
        detail: { tableId: query.get("tableId") ?? payload.tableId, fieldId: Number(path.replace("/column/", "")) },
      })
    );
  }
  if (method === "POST" && path === "/view") {
    window.dispatchEvent(
      new CustomEvent(dadixEvents.viewEvents.onCreate, {
        detail: { tableId: payload.tableId, createdView: (data as { view?: unknown })?.view ?? data },
      })
    );
  }
  if (method === "DELETE" && path.startsWith("/view/")) {
    window.dispatchEvent(
      new CustomEvent(dadixEvents.viewEvents.onDelete, {
        detail: { id: Number(path.replace("/view/", "")), tableId: payload.tableId },
      })
    );
  }
  if (method === "POST" && path === "/record") {
    const created = Array.isArray(data) ? data[0] : data;
    window.dispatchEvent(
      new CustomEvent(dadixEvents.recordEvents.onCreate, {
        detail: { tableId: String(payload.tableId ?? ""), createdRecord: created },
      })
    );
  }
  if (method === "DELETE" && path.startsWith("/record/")) {
    const recordId = Number(path.replace("/record/", "").split("?")[0]);
    window.dispatchEvent(
      new CustomEvent(dadixEvents.recordEvents.onDelete, {
        detail: { tableId: String(payload.tableId ?? ""), ids: [recordId] },
      })
    );
  }
}

async function runUiScript(raw: string) {
  const script = JSON.parse(raw) as { id?: string; actions?: UiScriptAction[] };
  const results: string[] = [];
  for (const action of script.actions ?? []) {
    if (action.type === "wait") {
      await new Promise((resolve) => setTimeout(resolve, action.ms));
      results.push(`wait ${action.ms}`);
      continue;
    }
    if (action.type === "auxDispatch") {
      await dispatchInAuxWindow(action.name, action.detail ?? {});
      results.push(`auxDispatch ${action.name}`);
      continue;
    }
    if (action.type === "dump") {
      const labels = Array.from(document.querySelectorAll<HTMLElement>("button, [role='menuitem'], [aria-label], input, [data-slot]"))
        .filter(isVisible)
        .slice(0, 80)
        .map((node) => {
          const rect = node.getBoundingClientRect();
          const label = (node.getAttribute("aria-label") || node.getAttribute("placeholder") || node.textContent || "").replace(/\s+/g, " ").trim();
          return `${node.tagName.toLowerCase()}:${label}@${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)}x${Math.round(rect.height)}`;
        });
      const tableNames = Array.from(document.querySelectorAll<HTMLElement>("[data-table-name]"))
        .filter(isVisible)
        .map((node) => node.getAttribute("data-table-name") || "")
        .filter(Boolean);
      const viewNames = Array.from(document.querySelectorAll<HTMLElement>("[data-view-name]"))
        .filter(isVisible)
        .map((node) => node.getAttribute("data-view-name") || "")
        .filter(Boolean);
      const gridHeaderNodes = Array.from(document.querySelectorAll<HTMLElement>("[data-field-name], th, [role='columnheader']"));
      const gridHeaders = gridHeaderNodes
        .filter(isVisible)
        .map((node) => (node.getAttribute("data-field-name") || node.textContent || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 20);
      const gridDom = gridHeaderNodes
        .map((node) => (node.getAttribute("data-field-name") || node.textContent || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 20);
      const newRecord = document.querySelector<HTMLElement>("[aria-label='New record']");
      const hashQuery = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
      const cellText = Array.from(document.querySelectorAll<HTMLElement>("[data-record-id], [data-cell-value]"))
        .filter(isVisible)
        .map((node) => (node.getAttribute("data-cell-value") || node.textContent || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 20);
      const pageText = (document.body.innerText || "").replace(/\s+/g, " ");
      const markers = ["UI Test Tabelle", "Test 123", "Name", "Alle Einträge", "Erste Tabelle", "Example", "Neue Zeile", "No records"];
      const stateTables = ((window as Window & { __dadixProjectTables?: Array<{ id?: string | number; name?: string }> }).__dadixProjectTables ?? [])
        .map((table) => `${table.id}:${table.name ?? ""}`)
        .filter((item) => item !== ":");
      let coreTables = "";
      try {
        const rows = await getTables();
        coreTables = rows.map((table) => `${table.id}:${table.name}`).join(" || ");
      } catch (error) {
        coreTables = `ERROR ${error instanceof Error ? error.message : String(error)}`;
      }
      let bridgeTables = "";
      try {
        const res = await callApi.get("/table");
        const rows = Array.isArray(res.data) ? res.data : [];
        bridgeTables = rows.map((table: { id?: string | number; name?: string }) => `${table.id}:${table.name ?? ""}`).join(" || ");
      } catch (error) {
        bridgeTables = `ERROR ${error instanceof Error ? error.message : String(error)}`;
      }
      let serviceTables = "";
      try {
        const hashId = window.location.hash.replace(/^#\/dashboard\/([^/?]+).*/, "$1");
        const rows = await tableService.getTables({ projectId: hashId });
        serviceTables = Array.isArray(rows)
          ? rows.map((table: { id?: string | number; name?: string }) => `${table.id}:${table.name ?? ""}`).join(" || ")
          : `NOT_ARRAY ${typeof rows}`;
      } catch (error) {
        serviceTables = `ERROR ${error instanceof Error ? error.message : String(error)}`;
      }
      const root = document.getElementById("root");
      const rootRect = root?.getBoundingClientRect();
      results.push(
        `root ${Math.round(rootRect?.width ?? -1)}x${Math.round(rootRect?.height ?? -1)} children=${root?.childElementCount ?? 0} text=${(document.body.innerText || "").replace(/\s+/g, " ").slice(0, 180)}`
      );
      results.push(`dump ${labels.join(" | ")}`);
      results.push(`window ${isAuxWindow() ? "aux" : "main"} ${window.location.hash}`);
      results.push(`tables ${tableNames.join(" || ") || "(none)"}`);
      results.push(`stateTables ${stateTables.join(" || ") || "(none)"}`);
      results.push(`coreTables ${coreTables || "(none)"}`);
      results.push(`bridgeTables ${bridgeTables || "(none)"}`);
      results.push(`serviceTables ${serviceTables || "(none)"}`);
      results.push(`views ${viewNames.join(" || ") || "(none)"}`);
      results.push(`grid ${gridHeaders.join(" || ") || gridDom.join(" || ") || "(none)"}`);
      results.push(`gridDom ${gridDom.join(" || ") || "(none)"}`);
      const columnWidths = Array.from(document.querySelectorAll<HTMLElement>("[data-field-name][data-column-width]"))
        .map((node) => `${node.getAttribute("data-field-name")}=${node.getAttribute("data-column-width")}`)
        .filter(Boolean);
      results.push(`widths ${columnWidths.join(" || ") || "(none)"}`);
      results.push(`newRecord ${newRecord && isVisible(newRecord) ? "visible" : newRecord ? "hidden" : "missing"}`);
      results.push(`selected table=${hashQuery.get("tableId") || ""} view=${hashQuery.get("viewId") || ""}`);
      results.push(`cells ${cellText.join(" || ") || "(none)"}`);
      const alignCols = Array.from(document.querySelectorAll<HTMLElement>("[data-field-name]"))
        .filter((node) => node.closest("[aria-description='TableHeader']") && isVisible(node))
        .slice(0, 4)
        .map((header) => {
          const name = header.getAttribute("data-field-name") || "";
          const title = header.querySelector<HTMLElement>("button span.relative, button span:last-child, span.relative");
          const colId = header.getAttribute("data-idx");
          const cell = document.querySelector<HTMLElement>(
            `[aria-description='TableCell'][data-cell-idx='${colId}']`
          );
          const cellTextNode =
            cell?.querySelector<HTMLElement>(":scope > span, :scope > button, [data-slot]") ?? cell;
          const hx = title ? Math.round(title.getBoundingClientRect().left) : -1;
          const cx = cellTextNode ? Math.round(cellTextNode.getBoundingClientRect().left) : -1;
          const pill = header.querySelector<HTMLElement>("button");
          const px = pill ? Math.round(pill.getBoundingClientRect().left) : -1;
          return `${name} title=${hx} cell=${cx} pill=${px} d=${hx >= 0 && cx >= 0 ? hx - cx : "?"}`;
        });
      results.push(`align ${alignCols.join(" || ") || "(none)"}`);
      results.push(`noRecords ${pageText.includes("No records!") ? "yes" : "no"}`);
      results.push(`visible ${markers.filter((item) => pageText.includes(item)).join(" || ") || "(none)"}`);
      const tableFields =
        (window as Window & { __dadixTableFields?: string[] }).__dadixTableFields ?? [];
      results.push(`fields ${tableFields.join(" || ") || "(none)"}`);
      const findBar = document.querySelector<HTMLElement>("[aria-label='Find in table']");
      if (findBar) {
        results.push(`find ${(findBar.innerText || "").replace(/\s+/g, " ").trim() || "(open)"}`);
      }
      const toasts = Array.from(document.querySelectorAll<HTMLElement>("[data-sonner-toast], [data-sonner-toaster] li, [role='status']"))
        .map((node) => (node.textContent || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 8);
      results.push(`toasts ${toasts.join(" || ") || "(none)"}`);
      const menuItems = Array.from(document.querySelectorAll<HTMLElement>("[role='menuitem']"))
        .filter(isVisible)
        .map((node) => (node.textContent || "").replace(/\s+/g, " ").trim())
        .filter(Boolean);
      results.push(`menuItems ${menuItems.join(" || ") || "(none)"}`);
      const menuColors = Array.from(document.querySelectorAll<HTMLElement>("[role='menuitem']"))
        .filter(isVisible)
        .map((node) => {
          const svg = node.querySelector("svg");
          const item = getComputedStyle(node);
          const icon = svg ? getComputedStyle(svg) : null;
          return `${(node.textContent || "").replace(/\s+/g, " ").trim()}:item=${item.color}/hl=${node.getAttribute("data-highlighted")}/svg=${icon?.color ?? "none"}`;
        });
      results.push(`menuColors ${menuColors.join(" || ") || "(none)"}`);
      const plusBtn = document.querySelector<HTMLElement>("[aria-label='New record']");
      const plusCell = plusBtn?.closest<HTMLElement>("[data-idx]") ?? plusBtn;
      const headerRow = document.querySelector<HTMLElement>("[aria-description='TableRow']");
      const lastHeader = headerRow
        ? Array.from(headerRow.querySelectorAll<HTMLElement>("[data-idx], [data-field-name]")).at(-1)
        : null;
      const inset = document.querySelector<HTMLElement>("[data-slot='sidebar-inset']");
      const radiusOf = (el: HTMLElement | null) => {
        if (!el) return "missing";
        const s = getComputedStyle(el);
        return `${s.borderTopLeftRadius}/${s.borderTopRightRadius}`;
      };
      results.push(`corners plus=${radiusOf(plusCell)} last=${radiusOf(lastHeader ?? null)} row=${radiusOf(headerRow)} inset=${radiusOf(inset)}`);
      try {
        const meta = await getProjectMeta();
        results.push(`projectPath ${meta?.path || "(none)"}`);
      } catch {
        results.push("projectPath (none)");
      }
      continue;
    }
    if (action.type === "api") {
      const method = (action.method ?? "GET").toUpperCase() as "GET" | "POST" | "PATCH" | "DELETE";
      const res =
        method === "GET"
          ? await callApi.get(action.url)
          : method === "DELETE"
            ? await callApi.delete(action.url, { data: action.body })
            : method === "PATCH"
              ? await callApi.patch(action.url, action.body)
              : await callApi.post(action.url, action.body);
      announceCanonicalMutation(method, action.url, action.body, res.data);
      results.push(
        `api ${method} ${action.url} ${res.status} ${JSON.stringify(res.data).slice(0, 4000)}`
      );
      continue;
    }
    if (action.type === "aux") {
      await openAuxWindow({
        kind: action.kind,
        title: action.title,
        hash: action.hash,
      });
      results.push(`aux ${action.kind} ${action.hash}`);
      continue;
    }
    if (action.type === "open") {
      await openProject(action.path);
      await rememberOpen();
      const meta = await getProjectMeta();
      const id = meta?.project_id ?? (meta ? String(meta.id) : "");
      if (id) {
        window.location.hash = `#/dashboard/${id}`;
      }
      results.push(`opened ${action.path}`);
      continue;
    }
    if (action.type === "click") {
      const node = document.querySelector<HTMLElement>(action.selector);
      if (!node) throw new Error(`CLICK_NOT_FOUND: ${action.selector}`);
      realClick(node);
      results.push(`clicked ${action.selector}`);
      continue;
    }
    if (action.type === "contextmenu") {
      const node = document.querySelector<HTMLElement>(action.selector);
      if (!node) throw new Error(`CONTEXTMENU_NOT_FOUND: ${action.selector}`);
      const rect = node.getBoundingClientRect();
      node.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: rect.left + Math.max(rect.width / 2, 1),
          clientY: rect.top + Math.max(rect.height / 2, 1),
        })
      );
      results.push(`contextmenu ${action.selector}`);
      continue;
    }
    if (action.type === "clickName") {
      clickByName(action.name);
      results.push(`clicked ${action.name}`);
      continue;
    }
    if (action.type === "hoverName") {
      hoverNode(findByName(action.name));
      results.push(`hovered ${action.name}`);
      continue;
    }
    if (action.type === "drag") {
      dragByName(action.name, action.dx, action.dy ?? 0, action.index ?? 0);
      results.push(`dragged ${action.name} ${action.dx}`);
      continue;
    }
    if (action.type === "dispatch") {
      window.dispatchEvent(new CustomEvent(action.name, { detail: action.detail ?? {} }));
      results.push(`dispatched ${action.name}`);
      continue;
    }
    if (action.type === "hash") {
      window.location.hash = action.value.startsWith("#") ? action.value : `#${action.value}`;
      results.push(`hash ${window.location.hash}`);
      continue;
    }
    if (action.type === "fill") {
      const node = document.querySelector<HTMLInputElement>(action.selector);
      if (!node) throw new Error(`FILL_NOT_FOUND: ${action.selector}`);
      const proto =
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value") ??
        Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value");
      const last = node.value;
      proto?.set?.call(node, action.value);
      const tracker = (node as unknown as { _valueTracker?: { setValue: (value: string) => void } })._valueTracker;
      tracker?.setValue(last);
      node.dispatchEvent(new Event("input", { bubbles: true }));
      node.dispatchEvent(new Event("change", { bubbles: true }));
      results.push(`filled ${action.selector}`);
    }
  }
  await writeUiResult(JSON.stringify({ id: script.id ?? "", ok: true, results, href: window.location.hash }));
}

function DesktopUiScriptRunner() {
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        const raw = await pollUiScript();
        if (raw) await runUiScript(raw);
      } catch (error) {
        await writeUiResult(
          JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            href: window.location.hash,
          })
        ).catch(() => undefined);
      }
    };
    const timer = window.setInterval(() => void tick(), 400);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);
  return null;
}

function DashboardShell() {
  return (
    <DashboardLayout>
      <Outlet />
    </DashboardLayout>
  );
}

function ProjectShell() {
  return (
    <>
      <ProjectFileSync />
      <ProjectLayout>
        <Outlet />
      </ProjectLayout>
    </>
  );
}

function App() {
  const [startHref, setStartHref] = useState<string | null>(null);

  useEffect(() => {
    installDesktopGuards();
    installAuxWindowOpener();
    void import("@tauri-apps/plugin-opener").then(({ openUrl }) => {
      (
        window as Window & {
          __dadixOpenExternalUrl?: (href: string) => void | Promise<void>;
        }
      ).__dadixOpenExternalUrl = async (href) => {
        try {
          await openUrl(href);
        } catch (error) {
          console.error(error);
        }
      };
    });
    const uninstallWindowEvents = installWindowEventBridge();
    (
      window as Window & {
        __dadixNotifyAuxClosed?: (detail: Record<string, string>) => void;
      }
    ).__dadixNotifyAuxClosed = (detail) => {
      void notifyAuxWindowClosed(detail);
    };
    document.documentElement.dataset.dadixOs = /Windows/i.test(navigator.userAgent)
      ? "windows"
      : /Mac/i.test(navigator.userAgent)
        ? "macos"
        : "linux";
    const unlistenNav = installAuxWindowNavigation();
    void bootstrapStartHref()
      .then(setStartHref)
      .catch(() => setStartHref(currentAuxHash() ?? "/dashboard"));
    const unlistenOpen = listen<string>("dadix-open-file", async (event) => {
      await openProject(event.payload);
      await rememberOpen();
    });
    const unlistenClosed = isAuxWindow()
      ? Promise.resolve(() => undefined)
      : listen<{ tableId?: string }>("dadix-aux-closed", (event) => {
          const tableId = event.payload?.tableId;
          if (!tableId) return;
          window.dispatchEvent(
            new CustomEvent(dadixEvents.tableEvents.onRefetchTable, {
              detail: { tableId },
            })
          );
          window.dispatchEvent(
            new CustomEvent(dadixEvents.gridViewEvents.onRefetchView, {
              detail: { tableId },
            })
          );
        });
    return () => {
      uninstallWindowEvents();
      void unlistenNav.then((fn) => fn());
      void unlistenOpen.then((fn) => fn());
      void unlistenClosed.then((fn) => fn());
    };
  }, []);

  if (!startHref) {
    return (
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <WindowControls />
        <LoadingIndicator visibilityDelay={false} className="size-7" />
        <p className="text-sm">Projekt wird geöffnet…</p>
      </div>
    );
  }

  return (
    <HashRouter>
      <LanguageContextProvider>
        <AuthContextProvider>
          <DesktopUiScriptRunner />
          <WindowControls />
          <Toaster position="top-center" duration={1800} />
          <div className="flex h-full min-h-[800px] w-full flex-1 flex-col">
          <RouteErrorBoundary>
          <Routes>
            <Route path="/" element={<Navigate to={startHref} replace />} />
            <Route path="/share/:shareId" element={<SharePage />} />
            <Route path="/share/webform" element={<WebformSharePage />} />
            <Route path="/dashboard" element={<DashboardShell />}>
              <Route index element={<DashboardHomePage />} />
              <Route path=":projectId/edit-table" element={<TableEditorAuxPage />} />
              <Route path=":projectId/documents-editor" element={<DocumentEditorAuxPage />} />
              <Route path=":projectId" element={<ProjectShell />}>
                <Route index element={<ProjectPage />} />
                <Route path="documents" element={<DocumentsPage />} />
              </Route>
            </Route>
          </Routes>
          </RouteErrorBoundary>
          </div>
        </AuthContextProvider>
      </LanguageContextProvider>
    </HashRouter>
  );
}

export default App;
