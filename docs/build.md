# Build, Install, Ports

## Voraussetzungen

- Node.js 18+ (LTS). In manchen Cursor-Umgebungen liegt Node unter  
  `/Applications/Cursor.app/Contents/Resources/app/resources/helpers/node`
- Rust (stable) + [Tauri 2 Prerequisites](https://v2.tauri.app/start/prerequisites/)
- Web: zusätzlich PostgreSQL, wenn die echte API genutzt wird
- Desktop-Build: Xcode Command Line Tools (macOS) bzw. WebView2 (Windows)

## Ports

| Dienst | Port | Wo |
| --- | --- | --- |
| Next.js | 3000 | `app/` `next dev` |
| Express | 6127 | `app/server` |
| Vite (nur `tauri dev`) | 1420 | `dadix-desktop` |
| Vite HMR | 1421 | wenn `TAURI_DEV_HOST` gesetzt |

Die gebaute App lädt **kein** localhost. Webview-URL ist `tauri://localhost` (Assets im Binary, nicht unter `Contents/Resources` als lose Next-App).

## Web starten

```bash
cd app
cp .env.example .env.local
cp server/.env.example server/.env
npm install
npm run dev
```

UI: http://localhost:3000 — API: http://localhost:6127

## Desktop entwickeln (`tauri dev` ≠ Produkt)

```bash
cd dadix-desktop
npm install
npm run tauri dev
```

Das ist Hot-Reload gegen Vite. Layout, Ampeln, Startup-Timing und eingebettete Assets weichen von der `.app` ab. UI-Arbeit, die „fertig“ sein soll, immer an der **gebauten** App prüfen.

## Produkt bauen (macOS)

Node oft nicht in `PATH`. Explizites Muster, das `frontendDist` nicht verliert:

```bash
NODE="/Applications/Cursor.app/Contents/Resources/app/resources/helpers/node"
export PATH="$(dirname "$NODE"):$PATH"
cd dadix-desktop
"$NODE" ./node_modules/vite/bin/vite.js build
"$NODE" ./node_modules/.bin/tauri build --bundles app --no-sign \
  --ignore-version-mismatches \
  --config '{"build":{"beforeBuildCommand":"","frontendDist":"../dist"}}'
```

Wenn `--config` nur `beforeBuildCommand` setzt, **muss** `frontendDist` trotzdem `"../dist"` bleiben. Ein stilles Deep-Merge ohne Dist erzeugt eine leere App.

Standard ohne Overrides:

```bash
cd dadix-desktop
npm install
npm run tauri build
```

`tauri.conf.json`:

- `beforeBuildCommand`: `npm run build` (Vite → `dadix-desktop/dist`)
- `frontendDist`: `../dist`
- Fenster 1280×800, min 960×640, Overlay-Titlebar

Ausgabe typisch:

`dadix-desktop/src-tauri/target/release/bundle/macos/Dadix.app`

In Cursor-Sandboxes kann das Bundle im Cache landen. Dann mit `ditto` nach `/Users/gabriel/Applications/Dadix.app` und optional `/Users/gabriel/Dadix/Dadix.app` kopieren. `/Dadix.app` im Repo-Root ist gitignored.

Nicht-signierter lokaler Build (`--no-sign`) ist für Entwicklung üblich.

## Rust-Core ohne GUI

Im Repo-Root:

```bash
cargo test -p dadix-core
cargo bench -p dadix-core --bench duckdb_query
```

Workspace: `Cargo.toml` Mitglieder `crates/dadix-core` und `dadix-desktop/src-tauri`.

## Identifier und Version

- Tauri identifier: `net.dadix.desktop`
- Produktname: `Dadix`
- Version derzeit `0.1.0` (Workspace + `tauri.conf.json`)
- Credential-Service: `dev.dadix.app`

## Checkliste „UI-Änderung ist fertig“

1. Geteilten Code in `app/src` geändert (nicht eine Parallel-UI).
2. Kein `@tauri-apps/api` in `app/src`.
3. Vite-Build + `tauri build` (nicht nur `tauri dev`).
4. Gebaute App installiert/geöffnet.
5. Hauptfluss + betroffene Nachbarflüsse (Grid, Editor, Aux) geprüft.
6. Stale `.dadix.lock` im Kopf haben, falls Open hängt.

## Was nicht ins Release-Bundle gehört

`.env`, lokale `.dadix`, QA-JSON, Debug-Dumps, `node_modules`. Das Frontend kommt aus `dist/`; der Core wird statisch in das Rust-Binary gelinkt (DuckDB/SQLite bundled).
