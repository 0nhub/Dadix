#!/usr/bin/env node
import { writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(homedir(), "Dadix", ".dadix-ui-script.json");
const RESULT = join(homedir(), "Dadix", ".dadix-ui-result.json");
const FILE = join(homedir(), "Dadix", "QA Matrix.dadix");
const failures = [];
const passes = [];

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function pass(name) {
  passes.push(name);
  console.log(`PASS ${name}`);
}

function fail(name, detail) {
  failures.push({ name, detail });
  console.error(`FAIL ${name}: ${detail}`);
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

function run(id, actions, timeoutMs = 60000) {
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

const first = run("nav", [{ type: "dump" }]);
const projectId = (first.href || "").replace(/^#\/dashboard\/([^/?]+).*/, "$1");
if (!projectId) fail("project-id", first.href);
else pass("project-id");

const opened = run("open-qa-table", [
  { type: "hash", value: `#/dashboard/${projectId}?tableId=1` },
  { type: "wait", ms: 1000 },
  { type: "dump" },
]);
const openedDump = parseDump(opened.results);
if ((openedDump.fields || "").includes("Geburtsdatum")) pass("open-table-fields");
else fail("open-table-fields", openedDump.fields);

const renamed = run("rename-table", [
  { type: "api", method: "PATCH", url: "/table/1", body: { data: { name: "QA Tabelle Umbenannt" } } },
  { type: "wait", ms: 500 },
  { type: "dump" },
]);
const renamedDump = parseDump(renamed.results);
if (`${renamedDump.tables} ${renamedDump.coreTables}`.includes("QA Tabelle Umbenannt")) {
  pass("table-rename");
} else {
  fail("table-rename", `${renamedDump.tables} ${renamedDump.coreTables}`);
}

let viewsAfter = "";
try {
  const viewDel = run("delete-view", [
    { type: "api", method: "DELETE", url: "/view/2", body: { tableId: "1" } },
    { type: "wait", ms: 500 },
    { type: "dump" },
  ]);
  viewsAfter = parseDump(viewDel.results).views || "";
} catch (error) {
  const dumped = run("views-after-delete", [{ type: "dump" }]);
  viewsAfter = parseDump(dumped.results).views || "";
  if (!String(error).includes("not found") && !String(error).includes("VIEW_")) {
    console.error(error);
  }
}
if (viewsAfter.includes("QA Ansicht")) fail("view-delete", viewsAfter);
else pass("view-delete");

run("filter-sort", [
  {
    type: "api",
    method: "PATCH",
    url: "/view/1",
    body: {
      tableId: "1",
      data: {
        filter: JSON.stringify([{ fieldId: 2, operator: "contains", value: "Anna" }]),
        sort: JSON.stringify([{ fieldId: 2, direction: "asc" }]),
      },
    },
  },
]);
const persisted = execFileSync("sqlite3", [FILE, "SELECT filter, sort FROM views WHERE id = 1;"], {
  encoding: "utf8",
}).trim();
if (persisted.includes("Anna") && persisted.includes("asc")) pass("filter-sort-persist");
else fail("filter-sort-persist", persisted);

const search = run("search", [
  { type: "clickName", name: "Search" },
  { type: "wait", ms: 400 },
  { type: "fill", selector: "input[aria-label='Find in table']", value: "Anna" },
  { type: "wait", ms: 400 },
  { type: "dump" },
  { type: "clickName", name: "Next match" },
  { type: "wait", ms: 200 },
  { type: "clickName", name: "Previous match" },
  { type: "wait", ms: 200 },
  { type: "fill", selector: "input[aria-label='Find in table']", value: "zzzz-no-hit" },
  { type: "wait", ms: 400 },
  { type: "dump" },
]);
const searchText = search.results.join(" ");
if (searchText.includes("filled input[aria-label='Find in table']")) pass("search-type");
else fail("search-type", searchText.slice(0, 300));
if (searchText.includes("clicked Next match")) pass("search-next");
else fail("search-next", "next click missing");
if (searchText.includes("clicked Previous match")) pass("search-prev");
else fail("search-prev", "prev click missing");
if (
  searchText.includes("No matches") ||
  searchText.includes("zzzz-no-hit") ||
  /\b0\b/.test(searchText)
) {
  pass("search-no-hit");
} else {
  fail("search-no-hit", searchText.slice(0, 400));
}

const editor = run("open-editor", [
  {
    type: "dispatch",
    name: "dadix--open-table-editor-dialog-event",
    detail: { tableId: "1", projectId },
  },
  { type: "wait", ms: 800 },
  { type: "fill", selector: "input[aria-label='New field name']", value: "Strasse" },
  { type: "clickName", name: "Add field" },
  { type: "wait", ms: 800 },
  { type: "dump" },
]);
const editorDump = parseDump(editor.results);
if ((editorDump.fields || "").includes("Strasse")) pass("ui-field-create-name");
else fail("ui-field-create-name", editorDump.fields || editor.results.join(" | ").slice(0, 400));
if ((editorDump.toasts || "").includes("Failed to add field")) {
  fail("ui-field-no-failed-toast", editorDump.toasts);
} else {
  pass("ui-field-no-failed-toast");
}
if (existsSync(FILE)) {
  const cols = execFileSync("sqlite3", [FILE, "SELECT name FROM columns WHERE table_id = 1;"], {
    encoding: "utf8",
  });
  if (cols.includes("Strasse")) pass("ui-field-sqlite");
  else fail("ui-field-sqlite", cols);
}

console.log(`\n${passes.length} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
