#!/usr/bin/env node
/**
 * Desktop QA harness: drives the running Dadix.app through
 * UI script → adapter → Tauri → dadix-core → SQLite → React dump.
 */
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const HOME = homedir();
const SCRIPT = join(HOME, "Dadix", ".dadix-ui-script.json");
const RESULT = join(HOME, "Dadix", ".dadix-ui-result.json");
const REPORT = join(HOME, "Dadix", ".dadix-qa-report.json");
const failures = [];
const passes = [];

function log(message) {
  console.log(message);
}

function fail(name, detail) {
  failures.push({ name, detail });
  console.error(`FAIL ${name}: ${detail}`);
}

function pass(name) {
  passes.push(name);
  console.log(`PASS ${name}`);
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

function runScript(id, actions, timeoutMs = 120000) {
  if (existsSync(RESULT)) unlinkSync(RESULT);
  writeFileSync(SCRIPT, JSON.stringify({ id, actions }));
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (existsSync(RESULT)) {
      const raw = readFileSync(RESULT, "utf8");
      try {
        const parsed = JSON.parse(raw);
        if (parsed.id === id || parsed.ok === false || parsed.ok === true) {
          if (!parsed.ok) {
            throw new Error(parsed.error || `script ${id} failed`);
          }
          return parsed;
        }
      } catch (error) {
        if (error instanceof SyntaxError) {
          sleep(200);
          continue;
        }
        throw error;
      }
    }
    sleep(250);
  }
  throw new Error(`timeout waiting for script ${id}`);
}

function sqlite(file, sql) {
  return execFileSync("sqlite3", [file, sql], { encoding: "utf8" }).trim();
}

function latestQaFile() {
  const dir = join(HOME, "Dadix");
  const listing = execFileSync("ls", ["-t", dir], { encoding: "utf8" })
    .split("\n")
    .filter((name) => name.startsWith("QA Matrix") && name.endsWith(".dadix"));
  return listing[0] ? join(dir, listing[0]) : null;
}

function assertIncludes(name, haystack, needle) {
  if (!String(haystack || "").includes(needle)) {
    fail(name, `expected "${needle}" in "${haystack}"`);
    return false;
  }
  pass(name);
  return true;
}

function assertEquals(name, actual, expected) {
  if (String(actual) !== String(expected)) {
    fail(name, `expected ${expected}, got ${actual}`);
    return false;
  }
  pass(name);
  return true;
}

async function main() {
  mkdirSync(join(HOME, "Dadix"), { recursive: true });
  const reopen = process.argv.includes("--reopen");
  const fileHint = process.argv.find((arg) => arg.startsWith("--file="))?.slice(7);

  if (reopen) {
    const file = fileHint || latestQaFile();
    if (!file || !existsSync(file)) {
      fail("reopen-file", "QA Matrix .dadix not found");
      writeFileSync(REPORT, JSON.stringify({ ok: false, passes, failures }, null, 2));
      process.exit(1);
    }
    let opened;
    try {
      opened = runScript("reopen", [
        { type: "open", path: file },
        { type: "wait", ms: 1500 },
        { type: "dump" },
      ]);
    } catch (error) {
      if (!String(error).includes("PROJECT_LOCKED")) throw error;
      opened = runScript("reopen-already-open", [
        { type: "wait", ms: 800 },
        { type: "dump" },
      ]);
    }
    const projectId = (opened.href || "").replace(/^#\/dashboard\/([^/?]+).*/, "$1");
    const focused = runScript("reopen-table", [
      { type: "hash", value: `#/dashboard/${projectId}?tableId=1` },
      { type: "wait", ms: 1000 },
      { type: "dump" },
    ]);
    const dump = parseDump(focused.results);
    assertIncludes("reopen-tables", `${dump.tables} ${dump.stateTables} ${dump.coreTables}`, "QA Tabelle");
    assertIncludes("reopen-fields", dump.fields || dump.grid, "Geburtsdatum");
    assertIncludes("reopen-renamed-field", dump.fields || "", "VornameNeu");
    if ((dump.fields || "").split(" || ").some((item) => item.endsWith(":Feld") || item.includes(":Feld:"))) {
      fail("reopen-no-generic-feld", dump.fields);
    } else {
      pass("reopen-no-generic-feld");
    }
    writeFileSync(REPORT, JSON.stringify({ ok: failures.length === 0, passes, failures, dump }, null, 2));
    if (failures.length) process.exit(1);
    return;
  }

  const created = runScript("create-project", [
    { type: "api", method: "POST", url: "/project", body: { name: "QA Matrix", title: "QA Matrix" } },
    { type: "wait", ms: 1200 },
    { type: "dump" },
  ]);
  const file = latestQaFile();
  if (!file) fail("project-file", "QA Matrix.dadix was not created");
  else pass("project-create");

  const tableCreate = runScript("create-table", [
    { type: "api", method: "POST", url: "/table", body: { name: "QA Tabelle", icon: "Table", sourceKind: "local" } },
    { type: "wait", ms: 800 },
    { type: "dump" },
  ]);
  const tableDump = parseDump(tableCreate.results);
  assertIncludes("table-create-ui", `${tableDump.tables} ${tableDump.stateTables} ${tableDump.coreTables}`, "QA Tabelle");

  const tableApi = tableCreate.results.find((line) => line.startsWith("api POST /table"));
  const tableJson = tableApi ? tableApi.slice(tableApi.indexOf("{")) : "{}";
  let tableId = "";
  try {
    tableId = String(JSON.parse(tableJson).id ?? "");
  } catch {
    tableId = "";
  }
  if (!tableId) {
    const core = tableDump.coreTables || "";
    const match = core.match(/(\d+):QA Tabelle/);
    tableId = match?.[1] ?? "";
  }
  if (!tableId) fail("table-id", `could not parse table id from ${tableApi}`);
  else pass("table-id");

  if (tableId) {
    runScript("open-table", [
      { type: "hash", value: `${created.href || ""}`.includes("tableId") ? created.href : `#/dashboard/${(created.href || "").replace(/^#\/dashboard\/([^/?]+).*/, "$1")}?tableId=${tableId}` },
      { type: "wait", ms: 800 },
    ], 30000);
  }

  const fieldNames = ["Vorname", "Nachname", "Alter", "Geburtsdatum"];
  const fieldTypes = ["TEXT", "TEXT", "INTEGER", "DATE"];
  const createdFields = [];
  for (let i = 0; i < fieldNames.length; i += 1) {
    const res = runScript(`field-${fieldNames[i]}`, [
      {
        type: "api",
        method: "POST",
        url: "/column",
        body: { tableId, name: fieldNames[i], type: fieldTypes[i] },
      },
      { type: "wait", ms: 400 },
      { type: "dump" },
    ]);
    const dump = parseDump(res.results);
    const blob = `${dump.fields} ${dump.grid}`;
    assertIncludes(`field-create-${fieldNames[i]}`, blob, fieldNames[i]);
    if (i > 0) assertIncludes(`field-keep-first-after-${fieldNames[i]}`, blob, "Vorname");
    const apiLine = res.results.find((line) => line.startsWith("api POST /column")) || "";
    try {
      const json = JSON.parse(apiLine.slice(apiLine.indexOf("{")));
      createdFields.push(json);
    } catch {
      createdFields.push({ name: fieldNames[i] });
    }
  }

  if (file && existsSync(file)) {
    const cols = sqlite(file, "SELECT name FROM columns ORDER BY id;");
    for (const name of fieldNames) {
      assertIncludes(`sqlite-field-${name}`, cols, name);
    }
    if (cols.split("\n").filter((line) => line === "Feld").length) {
      fail("sqlite-no-generic-feld", cols);
    } else {
      pass("sqlite-no-generic-feld");
    }
  }

  const extraTypes = [
    ["Aktiv", "BOOLEAN"],
    ["Status", "CHOICE"],
    ["Formel", "FORMULA"],
    ["Notiz", "CODE"],
  ];
  for (const [name, type] of extraTypes) {
    const res = runScript(`field-type-${type}`, [
      { type: "api", method: "POST", url: "/column", body: { tableId, name, type } },
      { type: "wait", ms: 300 },
      { type: "dump" },
    ]);
    assertIncludes(`field-type-${type}`, parseDump(res.results).fields, name);
  }

  const renameTarget = createdFields[0];
  if (renameTarget?.id) {
    const res = runScript("rename-field", [
      {
        type: "api",
        method: "PATCH",
        url: `/column/${renameTarget.id}`,
        body: { tableId, data: { name: "VornameNeu" } },
      },
      { type: "wait", ms: 400 },
      { type: "dump" },
    ]);
    assertIncludes("field-rename", parseDump(res.results).fields, "VornameNeu");
  }

  runScript("create-records", [
    { type: "api", method: "POST", url: "/record", body: { tableId, data: { VornameNeu: "Anna", Nachname: "Muster", Alter: 31 } } },
    { type: "api", method: "POST", url: "/record", body: { tableId, data: { VornameNeu: "Ben", Nachname: "Beispiel", Alter: 22 } } },
    { type: "wait", ms: 500 },
    { type: "dump" },
  ]);
  if (file) {
    const count = sqlite(file, `SELECT COUNT(*) FROM records WHERE table_id = ${tableId};`);
    assertEquals("record-count", count, "2");
  }

  const viewRes = runScript("create-view", [
    { type: "api", method: "POST", url: "/view", body: { tableId, name: "QA Ansicht", type: "gridView", icon: "LayoutGrid" } },
    { type: "wait", ms: 400 },
    { type: "dump" },
  ]);
  assertIncludes("view-create", `${parseDump(viewRes.results).views} ${viewRes.results.join(" ")}`, "QA Ansicht");
  let viewId = "";
  const viewApi = viewRes.results.find((line) => line.startsWith("api POST /view")) || "";
  try {
    viewId = String(JSON.parse(viewApi.slice(viewApi.indexOf("{"))).view?.id ?? "");
  } catch {
    viewId = "";
  }

  if (viewId) {
    runScript("rename-view", [
      { type: "api", method: "PATCH", url: `/view/${viewId}`, body: { tableId, data: { name: "QA Ansicht 2" } } },
    ]);
    runScript("delete-view", [
      { type: "api", method: "DELETE", url: `/view/${viewId}`, body: { tableId } },
      { type: "wait", ms: 400 },
      { type: "dump" },
    ]);
  }

  const second = runScript("second-table", [
    { type: "api", method: "POST", url: "/table", body: { name: "Zweite Tabelle", icon: "Table", sourceKind: "local" } },
    { type: "wait", ms: 500 },
    { type: "dump" },
  ]);
  const secondDump = parseDump(second.results);
  assertIncludes("second-table", `${secondDump.tables} ${secondDump.coreTables}`, "Zweite Tabelle");
  let secondId = "";
  const secondApi = second.results.find((line) => line.startsWith("api POST /table")) || "";
  try {
    secondId = String(JSON.parse(secondApi.slice(secondApi.indexOf("{"))).id ?? "");
  } catch {
    const match = (secondDump.coreTables || "").match(/(\d+):Zweite Tabelle/);
    secondId = match?.[1] ?? "";
  }

  if (secondId) {
    const deleted = runScript("delete-second-table", [
      { type: "api", method: "DELETE", url: `/table/${secondId}` },
      { type: "wait", ms: 600 },
      { type: "dump" },
    ]);
    const after = parseDump(deleted.results);
    if (String(after.coreTables || "").includes("Zweite Tabelle")) {
      fail("table-delete-core", after.coreTables);
    } else {
      pass("table-delete-core");
    }
    if (String(after.tables || after.stateTables || "").includes("Zweite Tabelle")) {
      fail("table-delete-ui", `${after.tables} ${after.stateTables}`);
    } else {
      pass("table-delete-ui");
    }
  }

  log("stress: 10 tables × 10 fields × 100 records");
  const stressIds = [];
  for (let t = 0; t < 10; t += 1) {
    const res = runScript(`stress-table-${t}`, [
      { type: "api", method: "POST", url: "/table", body: { name: `Stress ${t + 1}`, icon: "Table", sourceKind: "local" } },
    ], 60000);
    const line = res.results.find((item) => item.startsWith("api POST /table")) || "";
    try {
      stressIds.push(String(JSON.parse(line.slice(line.indexOf("{"))).id));
    } catch {
      fail(`stress-table-${t}`, line);
    }
  }
  for (const id of stressIds) {
    const actions = [];
    for (let f = 0; f < 10; f += 1) {
      actions.push({
        type: "api",
        method: "POST",
        url: "/column",
        body: { tableId: id, name: `Spalte ${id}-${f + 1}`, type: "TEXT" },
      });
    }
    for (let r = 0; r < 100; r += 1) {
      actions.push({
        type: "api",
        method: "POST",
        url: "/record",
        body: { tableId: id, data: { [`Spalte ${id}-1`]: `Wert ${r + 1}` } },
      });
    }
    runScript(`stress-fill-${id}`, actions, 180000);
  }
  if (file) {
    const tableCount = Number(sqlite(file, "SELECT COUNT(*) FROM tables;"));
    if (tableCount < 11) fail("stress-table-count", String(tableCount));
    else pass("stress-table-count");
    const colNames = sqlite(file, "SELECT name FROM columns;");
    if (colNames.split("\n").some((name) => name === "Feld" && !name.includes("-"))) {
      fail("stress-generic-feld", colNames);
    } else {
      pass("stress-generic-feld");
    }
  }

  const finalDump = parseDump(runScript("final-dump", [{ type: "dump" }]).results);
  writeFileSync(
    REPORT,
    JSON.stringify(
      {
        ok: failures.length === 0,
        file,
        tableId,
        passes,
        failures,
        finalDump,
      },
      null,
      2
    )
  );
  console.log(`\n${passes.length} passed, ${failures.length} failed`);
  console.log(`project file: ${file || "(unknown)"}`);
  if (failures.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
