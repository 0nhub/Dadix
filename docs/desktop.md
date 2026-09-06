# Desktop (Tauri)

Pfad: [`dadix-desktop`](../dadix-desktop)

Die Desktop-App ist eine **dünne Schale** um die geteilte UI und `dadix-core`. Sie ist kein zweites Produkt-Frontend.

**Produkt** = gebaute native App (`Dadix.app` / Windows-/Linux-Bundle) mit eingebettetem Frontend (`frontendDist`).  
**Nicht das Produkt** = `npm run tauri dev` (Vite auf `http://localhost:1420`, Hot Reload).

## Start und Routing

`src/main.tsx` ruft `installDesktopGuards()` und rendert `App.tsx`.

`App.tsx`:

1. `dataset.dadixOs` = `macos` | `windows` | `linux`
2. `installAuxWindowOpener`, `installWindowEventBridge`, `installAuxWindowNavigation`
3. `__dadixOpenExternalUrl` aus `@tauri-apps/plugin-opener`
4. `listen("dadix-open-file")` für Doppelklick / argv
5. `bootstrapStartHref()` — ein Promise für den ganzen Prozess
6. Bis der Href da ist: Splash (sofort sichtbar, kein 1,5s-Delay) + `WindowControls` + „Projekt wird geöffnet…“
7. `HashRouter` — Pfade wie `#/dashboard/:projectId?tableId=`

`resolveStartHref`:

- Aux-Hash (`/edit-table`, `/documents-editor`, `/aux/`) → nicht nochmal öffnen
- sonst `takePendingOpenPath` → Recents → Demo-Projekt
- Meta + Tabellen → Hash mit `tableId`
- Timeouts (Open ~8s, Meta/Tables ~4s) und Fallback auf `/dashboard` oder schon offenes Projekt
- `RouteErrorBoundary` um `<Routes>`: deutscher Fehlertext, schreibt QA-Result

`index.html` setzt früh `document.title = "DADIX_HTML_OK"` und zeigt „Dadix wird geladen…“.

### Produkt-Routen

| Hash | Komponente | Quelle |
| --- | --- | --- |
| `/dashboard` | Dashboard-Home | `app/src/app/(dashboard)/dashboard/page.tsx` |
| `/dashboard/:projectId` | Projekt + Grid | `…/[projectId]/page.tsx` |
| `/dashboard/:projectId/edit-table` | Table-Editor Aux | `TableEditorAuxPage` |
| `/dashboard/:projectId/documents-editor` | Documents Aux | `DocumentEditorAuxPage` |
| `/dashboard/:projectId/documents` | Documents-Seite | Web-Pendant |
| `/share/…` | Share-Seiten | existieren, auf Desktop wenig sinnvoll |

Der Ordner `src/components/workspace/` (`Workspace.tsx`, `DataGrid.tsx`, `QueryPanel.tsx`) wird **nicht** von `App.tsx` gemountet. Nicht erweitern, als wäre er die App.

## Vite-Aliases (`vite.config.ts`)

`@` → `../app/src`, danach gezielte Overrides:

| Import | Wird zu |
| --- | --- |
| `@/lib/api` | `src/bridge/callApi.ts` |
| `@/constants` | `src/bridge/constants.ts` (`apiBase = ""`) |
| `@/context/AuthContext` | Stub-User |
| `@/context/DashboardContext` | Recents + Meta |
| `@/hooks/useRequireRole` | immer erlaubt |
| `@/components/dashboard/NewProjectDialog` | nativer Dateidialog + `createNamedProject` |
| `@/components/dashboard/ConnectDialog` | Datei öffnen |
| `next/navigation`, `next/link`, `next/image`, `next/server` | Shims |

Plugin `dadixDesktopAliases` fängt relative `./api`-Imports in `app/src` ab und ersetzt `document.location.pathname` / `href =` durch `__dadixPathname` / `__dadixAssignHref`.

`process.env.NEXT_PUBLIC_API_URL` ist im Desktop `""`. Dev-Server: Port **1420** (strict), HMR 1421.

## Bridge

Siehe Inventar in [bridge-and-commands.md](./bridge-and-commands.md). Kurz:

- UI spricht weiter HTTP-förmig (`callApi.get/post/patch/delete`)
- `networkGuard.ts` fängt `fetch`/`XHR`/`window.open` ab
- `callApi.ts` mappt Pfade auf `lib/dadix.ts`
- `map.ts` macht Core-Zeilen zu Web-DTOs (`columnToField`, `tableToWeb`, …)
- Localhost-URLs werden geblockt (kein versehentliches Treffen der Web-API)

## Ein offenes Projekt

`src-tauri/src/state.rs`:

```text
AppState {
  session: Mutex<Option<Arc<ProjectHandle>>>,
  pending_open: Mutex<Option<PathBuf>>,
}
```

Ein Prozess = ein offenes `.dadix`. Aux-Webviews teilen dieselbe Session. Zweites Open derselben Datei → `PROJECT_LOCKED`.

Nach Kill der App kann ein stale Lock die nächste Öffnung blockieren. Lock-Datei löschen ist ein manueller Recovery-Schritt, kein Feature im UI-Happy-Path.

## Aux-Fenster

`app/src/lib/desktopShell.ts` → `openDesktopAuxWindow` → `window.__dadixOpenAuxWindow` → `bridge/auxWindows.ts`.

- Label `aux-{kind}`, URL `index.html#{hash}`
- Overlay-Titlebar, ~820×720
- existierendes Fenster: Event `dadix-aux-navigate` + Fokus
- Close: `__dadixNotifyAuxClosed` → Main refetcht Tabelle/View
- CustomEvents laufen über `windowEvents.ts` (`dadix-window-event`)

`auxWindows.ts` setzt **kein** `trafficLightPosition`.

## Titlebar und Ampeln (macOS) — nicht anfassen ohne diese Regeln

**Symptom, das schon gelöst ist:** native Ampeln „tanzen“, leeres Fenster, oder die ganze Chrome verschwindet.

Ursachen, die **nicht** zurückkommen dürfen:

1. Wry `trafficLightPosition` in `tauri.conf.json` oder Aux-Fenstern — kämpft gegen die 44px-CSS-Titlebar
2. Native Titlebar-Container per `setFrame` auf 44px ziehen
3. Superview der Close-Box verstecken — bei Overlay-Titlebar **ist das die ganze Window-Chrome**

Aktueller Stand:

- `tauri.conf.json`: `hiddenTitle: true`, `titleBarStyle: "Overlay"`, **kein** `trafficLightPosition`
- Rust `hide_macos_traffic_lights`: nur Buttons 0/1/2 `setHidden:true`
- CSS-Ampeln: `WindowControls.tsx`, `position: fixed`, sehr hoher z-index
- Titlebar-Höhe: `--dadix-titlebar-height: 44px`
- macOS-Padding links: `92px`
- Drag: `-webkit-app-region: drag` / `startDragging()`, Buttons `no-drag`

`dadix_pin_traffic_lights` wird vom Frontend aufgerufen; bei Resize werden die nativen Buttons weiter versteckt (nicht neu positioniert).

Windows/Linux: Controls in `#dadix-window-controls-slot` im `site-header`.

## Open URL

Zellen mit Action `openUrl` dürfen nicht das Record-Sheet öffnen.

Kette:

1. Zelle: `data-field-action="openUrl"` + `data-cell-value`
2. `TableView` Row-Click → `openExternalUrl`
3. Renderer für TEXT/FORMULA/CODE ebenfalls `openExternalUrl` statt `window.open`
4. `resolveExternalHref`: `http(s)`, `mailto`, `tel`, nackte Domains → `https://`
5. Desktop: `__dadixOpenExternalUrl` → plugin-opener
6. `installOpenGuard`: nicht-Hash-`window.open` denselben Weg

Capabilities: `opener:default` für `http://*`, `https://*`, `mailto:*`, `tel:*`.

## Höhe / leeres Fenster

Bekannte Fallen:

- `html`/`body`/`#root` brauchen `min-height: 100vh` / `100dvh`; `#root` flex-column, `min-height: 800px`
- `LoadingIndicator` mit `visibilityDelay` ließ den Splash unsichtbar — Delay ist aus
- `ViewsSwitch` muss `useLanguage()` **selbst** rufen. `locale` aus einem äußeren Scope ohne Hook → `ReferenceError: Can't find variable: locale` in WebKit, weiße Fläche trotz laufendem React
- Native Ampeln versteckt + CSS-Ampeln erst nach `startHref` = leere weiße Fläche beim Start (jetzt Splash inkl. Controls)

## Dateizuordnung

`tauri.conf.json` `fileAssociations`: Extension `dadix`, UTI `net.dadix.desktop.dadix`.

## State der Recents

`bridge/recents.ts`, localStorage-Key `dadix-recent-projects`. Das ist Navigation, keine Persistenz der Tabellendaten.
