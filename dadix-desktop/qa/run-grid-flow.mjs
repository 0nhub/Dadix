#!/usr/bin/env node
/**
 * Greenfield TABLE → FIELDS → VIEW → GRID → RECORDS.
 * A test is green only if the visible grid dump contains columns.
 * Internal field/SQLite state without grid headers is a failure.
 */
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const HOME = homedir();
const SCRIPT = join(HOME, "Dadix", ".dadix-ui-script.json");
const RESULT = join(HOME, "Dadix", ".dadix-ui-result.json");
const REPORT = join(HOME, "Dadix", ".dadix-grid-flow-report.json");
const PROJECT_NAME = `Grid Flow ${Date.now()}`;
const FIELD_DEFS = [
  { name: "Vorname", type: "TEXT" },
  { name: "Nachname", type: "TEXT" },
  { name: "Alter", type: "INTEGER" },
  { name: "Aktiv", type: "BOOLEAN" },
  { name: "Geburtsdatum", type: "DATE" },
];

const failures = [];
const passes = [];

function pass(name) {
  passes.push(name);
  console.log(`PASS ${name}`);
}

function fail(name, detail) {
  failures.push({ name, detail });
  console.error(`FAIL ${name}: ${detail}`);
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function parseDump(results = []) {
  const out = {};
  for (const line of results) {
    const idx = line.indexOf(" ");
    if (idx < 0) continue;
    out[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return out;
}

function run(id, actions, timeoutMs = 120000) {
  if (existsSync(RESULT)) unlinkSync(RESULT);
  writeFileSync(SCRIPT, JSON.stringify({ id, actions }));
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (existsSync(RESULT)) {
      const parsed = JSON.parse(readFileSync(RESULT, "utf8"));
      if (parsed.ok === false) throw new Error(parsed.error || id);
      if (parsed.ok === true) return parsed;
    }
    sleep(200);
  }
  throw new Error(`timeout ${id}`);
}

function sqlite(file, sql) {
  return execFileSync("sqlite3", [file, sql], { encoding: "utf8" }).trim();
}

function latestProjectFile() {
  const listing = execFileSync("ls", ["-t", join(HOME, "Dadix")], { encoding: "utf8" })
    .split("\n")
    .filter((name) => name.startsWith("Grid Flow") && name.endsWith(".dadix"));
  return listing[0] ? join(HOME, "Dadix", listing[0]) : null;
}

function projectIdFromHref(href) {
  return String(href || "").replace(/^#\/dashboard\/([^/?]+).*/, "$1");
}

function parseApiJson(results, prefix) {
  const line = (results || []).find((item) => item.startsWith(prefix)) || "";
  const idx = line.indexOf("{");
  if (idx < 0) return {};
  try {
    return JSON.parse(line.slice(idx));
  } catch {
    return {};
  }
}

function visibleGrid(dump) {
  const grid = `${dump.grid || ""} ${dump.gridDom || ""}`;
  return grid.includes("(none)") ? "" : grid;
}

function assertGridColumns(label, dump, names) {
  const grid = visibleGrid(dump);
  if (!grid) {
    fail(label, `grid is empty. fields=${dump.fields} selected=${dump.selected} newRecord=${dump.newRecord}`);
    return false;
  }
  const missing = names.filter((name) => !grid.includes(name));
  if (missing.length) {
    fail(label, `missing ${missing.join(", ")} in grid="${grid}" fields=${dump.fields}`);
    return false;
  }
  pass(label);
  return true;
}

function assertNewRecord(label, dump) {
  if (dump.newRecord === "visible") {
    pass(label);
    return true;
  }
  fail(label, `newRecord=${dump.newRecord} dump=${dump.dump || ""}`);
  return false;
}

async function main() {
  mkdirSync(join(HOME, "Dadix"), { recursive: true });

  if (process.argv.includes("--reopen")) {
    const file = latestProjectFile();
    if (!file || !existsSync(file)) {
      fail("reopen-file", `${PROJECT_NAME}.dadix not found`);
      writeFileSync(REPORT, JSON.stringify({ ok: false, passes, failures }, null, 2));
      process.exit(1);
    }
    let opened;
    try {
      opened = run("reopen", [
        { type: "open", path: file },
        { type: "wait", ms: 1500 },
        { type: "dump" },
      ]);
    } catch (error) {
      if (!String(error).includes("PROJECT_LOCKED")) throw error;
      opened = run("reopen-already-open", [{ type: "wait", ms: 800 }, { type: "dump" }]);
    }
    const projectId = projectIdFromHref(opened.href);
    const openedDump = parseDump(opened.results);
    const tableMatch = `${openedDump.coreTables}`.match(/(\d+):Personen/);
    const tableId = tableMatch?.[1] ?? "1";
    const viewsRes = run("reopen-views", [
      { type: "api", method: "GET", url: `/view?tableId=${tableId}` },
    ]);
    const viewsJson = parseApiJson(viewsRes.results, "api GET /view");
    const viewId = String(viewsJson.views?.[0]?.id ?? "1");
    const dump = parseDump(
      run("reopen-table", [
        { type: "hash", value: `#/dashboard/${projectId}?tableId=${tableId}&viewId=${viewId}` },
        { type: "wait", ms: 1200 },
        { type: "dump" },
      ]).results
    );
    assertGridColumns("reopen-grid", dump, FIELD_DEFS.map((field) => field.name));
    if (`${dump.cells} ${dump.dump}`.includes("Max")) pass("reopen-record");
    else fail("reopen-record", `${dump.cells} ${dump.dump}`);
    writeFileSync(REPORT, JSON.stringify({ ok: failures.length === 0, passes, failures, dump }, null, 2));
    if (failures.length) process.exit(1);
    return;
  }

  const created = run("create-project", [
    { type: "api", method: "POST", url: "/project", body: { name: PROJECT_NAME, title: PROJECT_NAME } },
    { type: "wait", ms: 1500 },
    { type: "dump" },
  ]);
  const projectId = projectIdFromHref(created.href);
  const createdDump = parseDump(created.results);
  const file = createdDump.projectPath && createdDump.projectPath !== "(none)"
    ? createdDump.projectPath
    : join(HOME, "Dadix", `${PROJECT_NAME}.dadix`);
  if (!projectId) fail("project-id", created.href);
  else pass("project-id");
  if (!file) fail("project-file", `${PROJECT_NAME}.dadix missing`);
  else pass("project-file");

  let tableId = "";
  let viewId = "";
  try {
    run("ui-create-table", [
      { type: "dispatch", name: "dadix-events-open-create-new-table-dialog" },
      { type: "wait", ms: 700 },
      { type: "fill", selector: "#tablename", value: "Personen" },
      { type: "clickName", name: "Create table" },
      { type: "wait", ms: 1500 },
      { type: "dump" },
    ]);
  } catch (error) {
    fail("ui-table-dialog", String(error));
  }
  if (file && existsSync(file)) {
    tableId = sqlite(file, "SELECT id FROM tables WHERE name = 'Personen' LIMIT 1;");
    viewId = sqlite(file, "SELECT id FROM views WHERE table_id = (SELECT id FROM tables WHERE name = 'Personen' LIMIT 1) ORDER BY id LIMIT 1;");
  }
  if (tableId) pass("ui-table-dialog");
  else if (!failures.some((item) => item.name === "ui-table-dialog")) {
    fail("ui-table-dialog", "Personen was not persisted after Create");
  }

  if (!tableId) {
    const tableCreate = run("api-create-table", [
      { type: "api", method: "POST", url: "/table", body: { name: "Personen", icon: "Table", sourceKind: "local" } },
      { type: "wait", ms: 800 },
    ]);
    const tableJson = parseApiJson(tableCreate.results, "api POST /table");
    tableId = String(tableJson.id ?? "");
    viewId = String(tableJson.defaultViewId ?? "");
    if (!tableId && file && existsSync(file)) {
      tableId = sqlite(file, "SELECT id FROM tables WHERE name = 'Personen' LIMIT 1;");
    }
    if (!tableId) fail("table-id", JSON.stringify(tableJson));
    else pass("table-id");
  } else {
    pass("table-id");
  }

  if (tableId && !viewId && file && existsSync(file)) {
    viewId = sqlite(file, `SELECT id FROM views WHERE table_id = ${Number(tableId)} ORDER BY id LIMIT 1;`);
  }
  if (viewId) pass("default-view-id");
  else fail("default-view-id", "no default view");

  run("open-editor", [
    {
      type: "dispatch",
      name: "dadix--open-table-editor-dialog-event",
      detail: { projectId, tableId },
    },
    { type: "wait", ms: 600 },
    { type: "dump" },
  ]);
  pass("table-editor-open");

  for (const field of FIELD_DEFS) {
    const res = run(`field-${field.name}`, [
      {
        type: "api",
        method: "POST",
        url: "/column",
        body: { tableId, name: field.name, type: field.type },
      },
      { type: "wait", ms: 400 },
    ]);
    const json = parseApiJson(res.results, "api POST /column");
    if (json.name === field.name && json.id > 0) pass(`field-api-${field.name}`);
    else fail(`field-api-${field.name}`, JSON.stringify(json));
  }

  try {
    run("close-editor", [
      { type: "clickName", name: "Close table editor" },
      { type: "wait", ms: 400 },
      {
        type: "dispatch",
        name: "dadix-table-refetch-request",
        detail: { tableId },
      },
      {
        type: "dispatch",
        name: "dadix-gridView-refetch-view",
        detail: { tableId, viewId },
      },
      { type: "hash", value: `#/dashboard/${projectId}?tableId=${tableId}&viewId=${viewId}` },
      { type: "wait", ms: 1200 },
      { type: "dump" },
    ]);
  } catch {
    run("close-editor-fallback", [
      {
        type: "dispatch",
        name: "dadix-table-refetch-request",
        detail: { tableId },
      },
      {
        type: "dispatch",
        name: "dadix-gridView-refetch-view",
        detail: { tableId, viewId },
      },
      { type: "hash", value: `#/dashboard/${projectId}?tableId=${tableId}&viewId=${viewId}` },
      { type: "wait", ms: 1200 },
      { type: "dump" },
    ]);
  }

  const emptyDump = parseDump(
    run("empty-table-grid", [
      { type: "hash", value: `#/dashboard/${projectId}?tableId=${tableId}&viewId=${viewId}` },
      { type: "wait", ms: 1200 },
      { type: "dump" },
    ]).results
  );
  assertGridColumns("empty-table-renders-grid", emptyDump, FIELD_DEFS.map((field) => field.name));
  assertNewRecord("empty-table-new-record", emptyDump);
  if (emptyDump.grid && emptyDump.grid !== "(none)") pass("empty-table-not-blank");
  else fail("empty-table-not-blank", `grid=${emptyDump.grid} dump=${emptyDump.dump}`);

  const recordRes = run("create-record", [
    {
      type: "api",
      method: "POST",
      url: "/record",
      body: {
        tableId,
        data: {
          Vorname: "Max",
          Nachname: "Mustermann",
          Alter: 42,
          Aktiv: true,
          Geburtsdatum: "1984-01-01",
        },
      },
    },
    { type: "wait", ms: 800 },
    { type: "dump" },
  ]);
  const recordDump = parseDump(recordRes.results);
  const recordBlob = `${recordDump.cells} ${recordDump.visible} ${recordDump.dump}`;
  if (recordBlob.includes("Max") && recordBlob.includes("Mustermann")) pass("record-visible");
  else fail("record-visible", recordBlob);
  assertGridColumns("record-grid-still-visible", recordDump, FIELD_DEFS.map((field) => field.name));

  if (file && existsSync(file)) {
    const cols = sqlite(file, "SELECT name FROM columns ORDER BY id;");
    for (const field of FIELD_DEFS) {
      if (cols.includes(field.name)) pass(`sqlite-field-${field.name}`);
      else fail(`sqlite-field-${field.name}`, cols);
    }
    const data = sqlite(file, "SELECT data FROM records;");
    if (data.includes("Max") && data.includes("Mustermann") && data.includes("1984-01-01")) {
      pass("sqlite-record");
    } else {
      fail("sqlite-record", data);
    }
  }

  const extra = run("field-after-grid-open", [
    {
      type: "api",
      method: "POST",
      url: "/column",
      body: { tableId, name: "Notizen", type: "TEXT" },
    },
    { type: "wait", ms: 800 },
    { type: "dump" },
  ]);
  assertGridColumns("field-add-after-grid-open", parseDump(extra.results), [
    ...FIELD_DEFS.map((field) => field.name),
    "Notizen",
  ]);

  run("create-view-2", [
    {
      type: "api",
      method: "POST",
      url: "/view",
      body: { tableId, name: "View2", type: "gridView", icon: "LayoutGrid" },
    },
    { type: "wait", ms: 500 },
  ]);
  let view2Id = "";
  if (file && existsSync(file)) {
    view2Id = sqlite(file, "SELECT id FROM views WHERE name = 'View2' LIMIT 1;");
  }
  if (!view2Id) {
    const viewsAfter = parseApiJson(
      run("list-views", [{ type: "api", method: "GET", url: `/view?tableId=${tableId}` }]).results,
      "api GET /view"
    );
    view2Id = String((viewsAfter.views ?? []).find((view) => view.name === "View2")?.id ?? "");
  }
  if (!view2Id) fail("view2-id", "View2 was not created");
  else pass("view2-id");

  const view1Dump = parseDump(
    run("switch-view1", [
      { type: "hash", value: `#/dashboard/${projectId}?tableId=${tableId}&viewId=${viewId}` },
      { type: "wait", ms: 900 },
      { type: "dump" },
    ]).results
  );
  assertGridColumns("view1-grid", view1Dump, FIELD_DEFS.map((field) => field.name));

  if (view2Id) {
    const view2Dump = parseDump(
      run("switch-view2", [
        { type: "hash", value: `#/dashboard/${projectId}?tableId=${tableId}&viewId=${view2Id}` },
        { type: "wait", ms: 900 },
        { type: "dump" },
      ]).results
    );
    assertGridColumns("view2-grid", view2Dump, FIELD_DEFS.map((field) => field.name));
    if (`${view2Dump.cells} ${view2Dump.dump}`.includes("Max")) pass("view2-record");
    else fail("view2-record", `${view2Dump.cells} ${view2Dump.dump}`);
  }

  writeFileSync(
    REPORT,
    JSON.stringify(
      {
        ok: failures.length === 0,
        passes,
        failures,
        projectId,
        tableId,
        viewId,
        file,
      },
      null,
      2
    )
  );
  if (failures.length) {
    console.error(`GRID FLOW FAILED ${failures.length}`);
    process.exit(1);
  }
  console.log(`GRID FLOW PASSED ${passes.length}`);
}

main().catch((error) => {
  fail("runner", String(error));
  writeFileSync(REPORT, JSON.stringify({ ok: false, passes, failures }, null, 2));
  process.exit(1);
});
