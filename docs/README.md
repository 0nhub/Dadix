# Dadix-Dokumentation

Dieses Verzeichnis ist die verbindliche Beschreibung des Repos [github.com/0nhub/Dadix](https://github.com/0nhub/Dadix).  
Sie gilt für Menschen **und** für AI-Systeme. Vor dem Ändern von Code zuerst hier lesen.

Stand der Beschreibung: September 2026, Commit-Linie `main` nach dem Desktop-Core-/Adapter-Stand.

## In welcher Reihenfolge lesen

| Wenn du … | Lies zuerst |
| --- | --- |
| neu im Projekt bist | [overview.md](./overview.md) → [architecture.md](./ARCHITECTURE.md) → [conventions.md](./conventions.md) |
| eine Datei suchst | [repository.md](./repository.md) |
| am `.dadix`-Format oder an Queries arbeitest | [core.md](./core.md) + [data-model.md](./data-model.md) |
| an der nativen App arbeitest | [desktop.md](./desktop.md) + [bridge-and-commands.md](./bridge-and-commands.md) |
| an der Browser-App arbeitest | [web.md](./web.md) |
| Grid, Felder, Views, Events anfasst | [shared-ui.md](./shared-ui.md) |
| baust oder installierst | [build.md](./build.md) |
| QA / UI-Skripte fährst | [qa.md](./qa.md) |
| ein AI-System / Agent bist | [../AGENTS.md](../AGENTS.md) + [TECHNICAL_SPEC_AI.md](./TECHNICAL_SPEC_AI.md) |
| einen Begriff nicht kennst | [glossary.md](./glossary.md) |

## Zwei Produkte, ein UI-Baum

Dadix ist **kein** einzelnes Next.js-Projekt mehr. Im Repo leben zwei auslieferbare Produkte, die sich die React-Oberfläche in `app/src` teilen:

```
bestehende Dadix-React-UI (app/src)
        │
        ├─ Web: Next.js + Axios → Express :6127 → PostgreSQL
        │
        └─ Desktop: Vite-Aliases + Bridge
                    → callApi (HTTP-Form)
                    → dadix.ts (invoke)
                    → Tauri dadix_* 
                    → crates/dadix-core
                    → SQLite (.dadix) + DuckDB (:memory:)
```

Die Desktop-Produktlinie **ersetzt die 3000er-Oberfläche nicht**. Es gibt keine zweite Sidebar, keinen Welcome-Screen und kein Desktop-only Workspace als Produktpfad. Der Ordner `dadix-desktop/src/components/workspace/` ist Altbestand und wird von `App.tsx` nicht gemountet.

## Verbindliche Kurzregeln

Die ausführliche Fassung steht in [conventions.md](./conventions.md) und [COMPATIBILITY.md](./COMPATIBILITY.md).

1. Projektlogik gehört nach `crates/dadix-core`. Tauri-Commands sind dünne Adapter.
2. `app/src` importiert **niemals** `@tauri-apps/api` oder Tauri-Plugins.
3. Das Produkt Desktop ist die **gebaute** `Dadix.app`, nicht `tauri dev`.
4. Secrets gehören in den OS-Credential-Store, nicht in die `.dadix`-Datei.
5. Große Dateien werden verlinkt und in-place gescannt, nicht ins Projekt importiert.
6. Native macOS-Ampeln: nur die drei System-Buttons verstecken, nie den Superview; kein `trafficLightPosition`; Titlebar-Container nicht per `setFrame` auf 44px ziehen.

## Bestehende Kurztexte

- [ARCHITECTURE.md](./ARCHITECTURE.md) — Zielarchitektur (verbindlich)
- [COMPATIBILITY.md](./COMPATIBILITY.md) — PR-Checkliste
- [TECHNICAL_SPEC_AI.md](./TECHNICAL_SPEC_AI.md) — kompakter AI-Prompt plus Verweise

Die älteren READMEs unter `app/` und `dadix-desktop/` bleiben Einstiege für das jeweilige Verzeichnis. Bei Widerspruch gelten **dieses `docs/`-Verzeichnis** und `AGENTS.md`.
