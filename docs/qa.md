# QA und UI-Skripte

Die Desktop-QA steuert die **laufende gebaute App**, nicht den Vite-Dev-Server.

## Protokoll

Zwei Dateien im Home-Projektordner `/Users/gabriel/Dadix/` (gitignored):

| Datei | Richtung |
| --- | --- |
| `.dadix-ui-script.json` | Host → App |
| `.dadix-ui-result.json` | App → Host |

Ablauf:

1. Script schreibt `{ id, actions: [...] }` nach `.dadix-ui-script.json`
2. `DesktopUiScriptRunner` in `App.tsx` pollt alle **400 ms** `dadix_poll_ui_script`
3. Rust liest und **löscht** die Script-Datei
4. Runner führt Actions aus
5. `dadix_write_ui_result` schreibt `.dadix-ui-result.json`
6. Host wartet auf passende `id` und `ok`

`RouteErrorBoundary` schreibt bei Render-Crash ebenfalls ein Result (`ok: false`).

Der Runner hängt erst, **nachdem** `bootstrapStartHref()` aufgelöst ist. Ein Splash ohne Runner ist normal. Stale Locks (`PROJECT_LOCKED`) lassen Bootstrap hängen — dann kein Script.

## Action-Typen

Implementiert im Runner (`App.tsx`):

| `type` | Zweck |
| --- | --- |
| `click` | CSS-Selector |
| `clickName` / `hoverName` | Accessible Name |
| `contextmenu` | Rechtsklick auf Selector |
| `drag` | Drag zwischen Punkten |
| `fill` | Input füllen |
| `dispatch` | CustomEvent |
| `hash` | Hash setzen |
| `wait` | Pause |
| `dump` | DOM/State-Introspektion |
| `api` | Bridge-Aufruf |
| `open` | Projektpfad öffnen |
| `aux` / `auxDispatch` | Aux-Fenster |

`dump` nutzt Sichtbarkeit über Breite/Höhe > 0. `WindowControls` sind `position: fixed`, bleiben also sichtbar, wenn der Rest 0 Höhe hat — das hat leere-Fenster-Debug schon einmal gerettet.

## Scripts unter `dadix-desktop/qa/`

| Datei | Zweck | Report |
| --- | --- | --- |
| `run-matrix.mjs` | große Matrix (u. a. große CSV) | `~/.dadix-qa-report.json` bzw. Repo-Root-Variante |
| `run-grid-flow.mjs` | Greenfield Tabelle→Felder→View→Grid | `.dadix-grid-flow-report.json` |
| `run-ui-flows.mjs` | UI-Flows gegen `QA Matrix.dadix` | Konsole |
| `run-remaining.mjs` | Feldtypen, Delete, Relation | Konsole + sqlite3 |

Die `.dadix`-Fixtures selbst sind lokal und gitignored. Scripts und Erwartungen gehören ins Repo.

## Core-Tests

```bash
cargo test -p dadix-core
```

Live-DB-Tests (`tests/postgres_live.rs` usw.) nur mit erreichbarem Host und ohne Secret-Logs.

## Was QA schon gebrochen hat (Regressionen)

Beim nächsten Refactor diese Fälle mitdenken:

- Feld anlegen: Name wird zu „Field“, Create schlägt fehl
- Delete + Refetch überschreibt frischen State
- Grid bei 0 Records leer/kaputt
- Spalten-Resize schreibt bei jedem Pixel
- Sort überlebt Reload nicht
- Open URL öffnet Record-Sheet oder nichts (Tauri `window.open`)
- View-Tabs crashen mit `locale is not defined`
- Open bindet 100k-CSV synchron → weiße Fenster
- Ampeln tanzen oder ganze Chrome verschwindet
- `tauri build --config` ohne `frontendDist` → leere App

Siehe [conventions.md](./conventions.md).
