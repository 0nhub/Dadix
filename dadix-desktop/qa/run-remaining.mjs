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
    const i = line.indexOf(" ");
    if (i > 0) out[line.slice(0, i)] = line.slice(i + 1);
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
function sqlite(sql) {
  return execFileSync("sqlite3", [FILE, sql], { encoding: "utf8" }).trim();
}

const typeChange = run("type-change", [
  { type: "api", method: "PATCH", url: "/column/5", body: { tableId: "1", data: { type: "TEXT" } } },
  { type: "wait", ms: 400 },
  { type: "dump" },
]);
const fields = parseDump(typeChange.results).fields || "";
if (fields.includes("Geburtsdatum:TEXT") || sqlite("SELECT type_name FROM columns WHERE id = 5;") === "TEXT") {
  pass("field-type-change");
} else {
  fail("field-type-change", `${fields} ${sqlite("SELECT type_name FROM columns WHERE id = 5;")}`);
}

const created = run("temp-field", [
  { type: "api", method: "POST", url: "/column", body: { tableId: "1", name: "TempWeg", type: "TEXT" } },
]);
const createdLine = created.results.find((line) => line.startsWith("api POST /column")) || "";
const tempId = JSON.parse(createdLine.slice(createdLine.indexOf("{"))).id;
run("delete-field", [
  { type: "api", method: "DELETE", url: `/column/${tempId}?tableId=1` },
  { type: "wait", ms: 400 },
  { type: "dump" },
]);
const afterDelete = parseDump(run("dump-after-field-delete", [{ type: "dump" }]).results).fields || "";
if (afterDelete.includes("TempWeg") || sqlite("SELECT COUNT(*) FROM columns WHERE name = 'TempWeg';") !== "0") {
  fail("field-delete", afterDelete);
} else {
  pass("field-delete");
}

run("relation-field", [
  { type: "api", method: "POST", url: "/column", body: { tableId: "1", name: "Kunde", type: "RELATION" } },
  { type: "wait", ms: 300 },
  { type: "dump" },
]);
if (sqlite("SELECT type_name FROM columns WHERE name = 'Kunde';") === "RELATION") pass("field-relation");
else fail("field-relation", sqlite("SELECT name, type_name FROM columns WHERE name = 'Kunde';"));

const rec = run("edit-record", [
  { type: "api", method: "GET", url: "/record?tableId=1&limit=10&offset=0" },
]);
const recLine = rec.results.find((line) => line.startsWith("api GET /record")) || "";
const recJson = JSON.parse(recLine.slice(recLine.indexOf("{")));
const firstId = recJson.records?.[0]?.id;
if (!firstId) fail("record-loaded", recLine.slice(0, 200));
else {
  run("patch-record", [
    { type: "api", method: "PATCH", url: `/record/${firstId}`, body: { tableId: "1", data: { Nachname: "Geändert" } } },
  ]);
  const data = sqlite(`SELECT data FROM records WHERE id = ${firstId};`);
  if (data.includes("Geändert")) pass("record-edit");
  else fail("record-edit", data);
  run("delete-record", [
    { type: "api", method: "DELETE", url: `/record/${firstId}`, body: { tableId: "1" } },
  ]);
  const gone = sqlite(
    `SELECT COUNT(*) FROM records WHERE table_id = 1 AND id = ${Number(firstId)};`
  );
  if (gone === "0") pass("record-delete");
  else fail("record-delete", `id=${firstId} count=${gone}`);
}

const t = run("cdc-table", [
  { type: "api", method: "POST", url: "/table", body: { name: "CDC", icon: "Table", sourceKind: "local" } },
]);
const tLine = t.results.find((line) => line.startsWith("api POST /table")) || "";
const tId = String(JSON.parse(tLine.slice(tLine.indexOf("{"))).id);
run("cdc-delete", [{ type: "api", method: "DELETE", url: `/table/${tId}` }]);
const again = run("cdc-create", [
  { type: "api", method: "POST", url: "/table", body: { name: "CDC", icon: "Table", sourceKind: "local" } },
  { type: "wait", ms: 400 },
  { type: "dump" },
]);
const againDump = parseDump(again.results);
const cdcCount = sqlite("SELECT COUNT(*) FROM tables WHERE name = 'CDC';");
if (cdcCount === "1" && `${againDump.tables} ${againDump.coreTables}`.includes("CDC")) pass("create-delete-create");
else fail("create-delete-create", `${cdcCount} ${againDump.tables} ${againDump.coreTables}`);

console.log(`\n${passes.length} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
