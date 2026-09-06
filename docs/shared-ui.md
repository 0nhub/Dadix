# Geteilte React-UI

Alles unter [`app/src`](../app/src) außer Next-spezifischen Pages/Layouts ist die Produkt-UI **beider** Linien. Änderungen hier immer gegen Web **und** Desktop denken.

## Schichten auf einer Projektseite

```
CurrentProjectContext     Tabellenliste, aktuelle projectId
        ↓
TableContext              Schema + Felder der aktuellen Tabelle
TableViewsContext         View-Tabs
TableRowsContext          Seite der Records
        ↓
ViewsSwitch               Tabs, ruft useLanguage() selbst
        ↓
GridView
  GridViewContext         View-Schema, Sort, Filter
  GridViewRowsContext     gefilterte/sortierte Zeilen
        ↓
TableView
  TableHeaderCell         Resize + dnd-kit Sortable
  TableRowCell            data-field-* Attribute
```

`data-table.tsx` verdrahtet Header, Grid, Record-Manager.

## Contexts

| Datei | Besitz |
| --- | --- |
| `AuthContext` | Web: Session. Desktop: Bridge-Stub |
| `DashboardContext` | Projektliste. Desktop: Recents |
| `CurrentProjectContext` | `projectId`, `tables[]`, soft-deleted IDs |
| `TableContext` | aktuelle `Table` + `fields`, Filter pro View, Cache `projectId-tableId` |
| `TableRowsContext` | `data`, Paging, `loadMoreRecords`, Hidden-Row-Puffer |
| `TableViewsContext` | Views sortiert nach `order` |
| `SidebarStateContext` | Gruppen/Links, localStorage |
| `LanguageContext` | `en` / `de` |
| `TableStyleContext` | Grid-Theme |
| `FindInViewContext` | Find-in-view |

State-Races: nach Create/Delete nicht mit älteren Reloads neuere Daten überschreiben. Events (`onRefetchTable`, `onRefetchTables`) sind die Absprache, nicht „blind GET und setState“.

## Event-System

Definiert in `app/src/constants/events.ts` als `dadixEvents`.  
Abonnieren: `useEventHandler` (`app/src/hooks/useEventHandler.ts`).  
Senden: `window.dispatchEvent(new CustomEvent(name, { detail }))`.

| Gruppe | Events (Namen) |
| --- | --- |
| `projectEvents` | `dadix-project-created/patched/deleted` |
| `tableEvents` | Table CRUD, `dadix-tables-refetch-request`, `dadix-table-refetch-request`, Field CRUD, Option/Formula/Text/Number/Relation-Patches |
| `recordEvents` | create/change/delete, `dadix-record-opened/closed`, `dadix-record-cell-edit`, Selection, Relative/FirstLast |
| `viewEvents` | view CRUD, open/close search |
| `sourceEvents` | `dadix-source-relinked` |
| `gridViewEvents` | `dadix-gridView-fields-patched`, `dadix-gridView-refetch-view`, find-in-view |

Zusätzlich (nicht in `dadixEvents`): z. B. `dadix-open-document-editor`, Table-Editor-Dialog-Events.

Record öffnen: `openTableRecord({ tableId, tableFields, record })` → `recordEvents.onOpen` → `TableRecordEditorsManager` in `table-cell-viewer.tsx`.

Auf Desktop werden dieselben CustomEvents zwischen Main- und Aux-Fenster über Tauri weitergereicht (`windowEvents.ts`). Neue Events, die Aux braucht, dort nicht vergessen.

## Grid — Verhalten, das schon teuer war

### Leeres Grid

0 Records ist ein gültiger Zustand. Default-View-Spalten müssen trotzdem gemerged werden. Nicht „keine Felder ⇒ nichts rendern“ als Absturzpfad.

### Spaltenbreite

`TableHeaderCell`: Fenster-weite Pointer-Listener während des Drags. **Persistenz nur bei `pointerup`** (`onColumnResizeEnd` → `patchGridViewColumn({ size })`). Nicht bei jedem `pointermove` schreiben.

### Spalten-Reorder

Ganze Header-Zelle ist `useSortable` (Grab-Cursor). Resize-Handle `stopPropagation`. `TableView`: `PointerSensor` distance 8. `handleColumnReorder` optimistisch, dann Orders persistieren.

### Zeilen-Reorder

optional, Order in localStorage `dadix-view-record-order-{tableId}-{viewId}` — das ist View-Kosmetik, nicht Core-Wahrheit.

### Zellmenü

Custom Menu, optisch wie `DropdownMenuItem`. Delete: `data-variant='destructive'` — Icon **grau bis Hover** (nicht dauerhaft rot). Edit feuert `recordEvents.onEditCell`.

### Inline-Edit

`useTableColumnsRenderer`: TEXT/INTEGER/DATE direkt; CHOICE/BOOLEAN/FILE in `OpenOnCellEditRequest`. Edit nur wenn `action === 'edit'`.

### Open URL vs. Record öffnen

Wenn `data-field-action="openUrl"`: URL öffnen, **kein** `openRecord`. Cursor pointer auf openUrl/copy.

`openExternalUrl` / `resolveExternalHref` in `desktopShell.ts`. Niemals `@tauri-apps/api` hier.

### Sticky / virtuell

`tableStickyStyles.ts`, `@tanstack/react-virtual` in GridView. Nur sichtbare Zeilen plus Overscan in den DOM.

Worker unter `app/public/js/workers/` und `dadix-desktop/public/js/workers/`: Filter, Sort, Formula. Beide Kopien konsistent halten.

## ViewsSwitch und locale

`ViewsSwitch` **muss** `useLanguage()` selbst aufrufen und `localizeSystemName(locale, view.name)` nutzen.

```ts
// Pflicht im Komponenten-Body, nicht „locale aus Parent-Closure ohne Hook“
const { locale } = useLanguage();
```

WebKit (Tauri) wirft sonst `Can't find variable: locale` — weiße Fläche, React ist trotzdem „gelaufen“ (Hash ändert sich).

`SYSTEM_NAME_KEYS` (`i18n.ts`): `All entries` / `Alle Einträge`, `New view` / `Neue Ansicht` / `Ansicht`, `New table` / `Neue Tabelle`.  
Ein View-Name `File` wird **nicht** übersetzt (steht nicht in der Map). Der Feldtyp heißt in der Palette ebenfalls `File`.

## Table-Editor und Documents

| | Web | Desktop |
| --- | --- | --- |
| Table-Editor | `TableEditorDialog` Overlay oder `/edit-table`-Seite | Aux-Fenster `TableEditorAuxPage` → `TableEditorWindow` |
| Documents | `DocumentEditorDialog` / `/documents` | Aux `DocumentEditorAuxPage` |

Erkennung: `isDadixDesktopShell()` = `document.documentElement.dataset.dadixOs`.

Platzhalter: `document-editor/documentPlaceholders.ts` (`#Feldname` in TipTap-JSON).

## Feldnamen

`lib/fieldNames.ts`: `isGenericFieldName`, `preferRealFieldName`, `renameRecordFieldKey`.  
Create-Feld darf den eingegebenen Namen nicht durch „Field“ verlieren. Delete/Create-Races nicht mit stale Table-State heilen.

## Header auf Desktop

`site-header.tsx`: Share, Webform, API, AI Keys ausblenden wenn Desktop-Shell. Documents bleibt.

Titlebar-Klassen: `dadix-app-titlebar`, Slot `#dadix-window-controls-slot`. Shared CSS in `app/src/app/globals.css` (`--dadix-titlebar-height: 44px`).

## Destructive-Hover

`DropdownMenuItem` `variant='destructive'`: Farbe erst auf Hover. Gilt für Record-Löschen, Feld-Löschen, View-Löschen. Nicht fest rot zeichnen.

## Dateien, die man zuerst öffnet

| Thema | Pfad |
| --- | --- |
| Typen | `app/src/types/index.ts` |
| Feldpalette | `app/src/constants/index.ts` |
| Events | `app/src/constants/events.ts` |
| Desktop ohne Tauri | `app/src/lib/desktopShell.ts` |
| Tabellen-API | `app/src/lib/table.ts` |
| Records | `app/src/lib/record.ts` |
| Views | `app/src/lib/view.ts` |
| Grid persist | `app/src/lib/views/gridView.ts` |
| Spalten-Renderer | `app/src/hooks/useTableColumnsRenderer.tsx` |
| Grid-Fläche | `app/src/components/table-view/TableView.tsx` |
| Header/Resize/DnD | `app/src/components/table-view/TableHeaderCell.tsx` |
| Zelle | `app/src/components/table-view/TableRowCell.tsx` |
| View-Tabs | `app/src/components/views-switch/ViewsSwitch.tsx` |
| Neue Tabelle / JSON-Source | `app/src/components/create-table-dialog.tsx` |
| Record-Sheet | `app/src/components/table-cell-viewer.tsx` |
