# PROMPT FÜR DIE KI (oben einfügen)

```
Du bist ein technischer Experte für das Projekt "Dadix". Nutze ausschließlich die folgende technische Spezifikation, um Fragen zu Architektur, Dateien, Abläufen und Implementierungsdetails zu beantworten. Zitiere bei Antworten konkrete Pfade, Typen und Event-Namen. Wenn etwas in der Spezifikation nicht vorkommt, sage das explizit und schlage nur Änderungen vor, die zum beschriebenen Stack und zu den Konventionen passen. Sprache der Antwort: nach Wunsch des Nutzers (z.B. Deutsch oder Englisch).
```

---

# TECHNISCHE SPEZIFIKATION: DADIX

## 1. Projektüberblick

- **Name:** Dadix
- **Beschreibung:** Business-/Datenbank-Tool (Ninox-ähnlich): Projekte, Tabellen, Felder, Datensätze, Views, AI-Felder, Dokumentenvorlagen.
- **Monorepo-Struktur:** Ein Repo mit **zwei Laufzeit-Umgebungen**:
  - **Frontend:** Next.js 15 (React 19), Port 3000 (dev), TypeScript.
  - **Backend:** Express 5 (Node), Port 6127 (dev), JavaScript (CommonJS).

## 2. Repository-Layout (relevant für KI)

- **`app/`** – Root des gesamten Projekts (Frontend + Backend unter einem Dach).
  - **`app/package.json`** – Scripts und Dependencies für **Frontend und gemeinsame Nutzung** (Next.js, React, Axios, TipTap, CodeMirror, TanStack Table, Radix UI, Tailwind, etc.). Enthält auch Scripts, die den Server starten (`dev:server`).
  - **`app/server/`** – Eigenständiges **Express-Backend**:
    - **`app/server/package.json`** – Nur Server-Dependencies (Express, Sequelize, pg, OpenAI, Anthropic, bcrypt, JWT, etc.).
    - **`app/server/server.js`** – Einstieg: startet Express auf `process.env.PORT || 6127`.
    - **`app/server/src/`** – Quelle: Routes, Controller, Services, Config, Middlewares.
  - **`app/src/`** – **Next.js-/React-Quelle**:
    - **`app/src/app/`** – Next.js App Router (Dateibasiertes Routing).
    - **`app/src/components/`** – React-Komponenten.
    - **`app/src/context/`** – React Context Provider (Auth, Dashboard, Table, Views, Language, etc.).
    - **`app/src/lib/`** – Hilfsfunktionen, API-Client, Geschäftslogik (table, record, view, aiComplete, documentTemplates, etc.).
    - **`app/src/hooks/`** – Custom React Hooks.
    - **`app/src/constants/`** – Konstanten (API-Base-URL, Feldtypen, Event-Namen).
    - **`app/src/types/`** – Zentrale TypeScript-Interfaces/ Typen.
  - **`app/public/`** – Statische Assets (inkl. Web Worker für Filter).
  - **`app/.env.local`** (nicht im Repo) – Frontend-Umgebung; wichtig: **`NEXT_PUBLIC_API_URL`** (z.B. `http://localhost:6127` für lokales Backend).

- **`app/server/.env`** (nicht im Repo) – Backend-Umgebung: DB, JWT-Secret, optional API-Keys für AI.

## 3. Tech-Stack (präzise)

**Frontend (Next.js/React):**
- **Next.js 15** mit App Router, Turbopack im Dev.
- **React 19**, TypeScript.
- **Tailwind CSS 4**, **Radix UI** (Dialog, Select, Sheet, Tabs, Dropdown, etc.), **shadcn/ui**-ähnliche UI in `app/src/components/ui/`.
- **State:** React Context (kein Redux); **Event-System** über `window.dispatchEvent` + `CustomEvent` mit Namen aus `app/src/constants/events.ts` (dadixEvents).
- **Tabellen:** `@tanstack/react-table`; Grid-View mit virtuellen Rows/Kontext (`GridViewContext`, `GridViewRowsContext`).
- **Drag & Drop:** `@dnd-kit/core` (und sortable).
- **Editoren:** **CodeMirror 6** (AI-Prompt-Feld), **TipTap** (Dokumenten-Editor); TipTap mit `immediatelyRender: false` wegen SSR.
- **HTTP:** Axios-Instance in `app/src/lib/api.ts`, `baseURL`: `process.env.NEXT_PUBLIC_API_URL || 'https://api.dadix.net'`.
- **i18n:** `app/src/context/LanguageContext.tsx`, `app/src/lib/i18n.ts`.

**Backend (Express):**
- **Express 5**, CORS-Middleware (in Dev oft `origin: true`).
- **Datenbank:** PostgreSQL über **Sequelize**; Verbindung in `app/server/src/config/database.js` (bei DB-Fehler in Nicht-Production wird nicht `process.exit(1)` ausgeführt).
- **Auth:** JWT, Cookies, Middlewares in `app/server/src/` (z.B. Auth-Routes).
- **AI:** `app/server/src/routes/AI/index.js` (z.B. `POST /ai/complete`), Controller + Service; optional Auth in Dev deaktivierbar; OpenAI + Anthropic SDK.

## 4. Datenmodell (Typen aus `app/src/types/index.ts`)

- **MemberRole:** 'Owner' | 'Admin' | 'Editor' | 'Viewer'.
- **DadixFieldDataTypes:** 'UUID' | 'SERIAL' | 'TEXT' | 'INTEGER' | 'BOOLEAN' | 'CHOICE' | 'DATE' | 'FORMULA' | 'RELATION' | 'AI'.
- **Field:** id, name, type, size, order, options (Choice), formula, textOptions, relationOptions, isVisible, contentAlign, action, placeholder, defaultValue, aiOptions (für AI-Felder).
- **AIFieldOptions:** prompt, outputType (TEXT | INTEGER | DATE | BOOLEAN), apiKeyId.
- **Table:** id (number | string), name, icon, userId, projectId, order, fields?, createdAt, updatedAt.
- **IDadixViewTypes:** gridView, formView, kanbanView, chartView, calendarView, etc.
- **IDadixGridView:** erweitert IDadixView um `fields: IDadixGridViewField[]` (Spaltenkonfiguration).
- **DocumentTemplate:** id, name, tableId, content (TipTap-JSON), updatedAt; Speicherung clientseitig in `app/src/lib/documentTemplates.ts` (localStorage, Key-Präfix `dadix-document-templates`).

## 5. Event-System (Frontend)

- **Definiert in:** `app/src/constants/events.ts` als `dadixEvents`.
- **Nutzung:** `window.dispatchEvent(new CustomEvent(dadixEvents.<bereich>.<event>, { detail: { ... } }))` und in Komponenten `useEventHandler(dadixEvents.<...>, handler)` (Hook in `app/src/hooks/useEventHandler.ts`).
- **Wichtige Bereiche:**
  - **recordEvents:** onOpen, onClose, onChange, onRequestRelativeRecord, etc.
  - **tableEvents:** onCreate, onPatch, onDelete, onCreateField, onPatchField, etc.
  - **viewEvents:** onCreate, onPatch, onDelete, openSearch, closeSearch.
  - **gridViewEvents:** onPatchField, openFindInView, closeSearch.
- **Record öffnen:** `openTableRecord({ tableId, tableFields, record })` feuert `recordEvents.onOpen`; `TableRecordEditorsManager` (in `app/src/components/table-cell-viewer.tsx`) lauscht und öffnet den Record-Editor (Sheet).

## 6. Frontend-Architektur (kurz)

- **Routing:** Next.js App Router unter `app/src/app/`: z.B. `(auth)/login`, `(auth)/signup`, `(dashboard)/dashboard`, `(dashboard)/dashboard/[projectId]/page.tsx`, `[projectId]/edit-table/page.tsx`, **`[projectId]/documents/page.tsx`** (Vollbild Document-Editor), `share/[shareId]/page.tsx`, `invite/[token]/page.tsx`.
- **Layouts:** `app/src/app/(dashboard)/dashboard/layout.tsx` und `[projectId]/layout.tsx` (Projekt- und Tabellen-Context).
- **Context-Provider:** u.a. AuthContext, DashboardContext, CurrentProjectContext, TableContext, TableViewsContext, LanguageContext, FindInViewContext, SidebarStateContext, TableStyleContext. Meist in Layouts oder Root eingebunden.
- **Wichtige UI-Bereiche:**
  - **Dashboard/Projektliste:** `app/src/components/dashboard/`, `DashboardHome`, Sidebar (`dashboard-sidebar/`).
  - **Projektseite:** SiteHeader, ViewsSwitch, TableRecordEditorsManager, diverse Dialoge (CreateTable, ApiKeys, Share, ViewFilter, etc.).
  - **Grid-View:** `app/src/components/views-switch/views/grid-view/GridView.tsx`, DataTable, Spalten-Renderer (`useTableColumnsRenderer.tsx`).
  - **Record-Editor:** `table-cell-viewer.tsx` – Sheet mit Record-Inhalt, Feld-Editoren, Protokoll; unten Abschnitt **Documents** mit gerenderten Vorlagen (Record-Daten injiziert).
  - **Dokumenten-Editor:** Wird als **Vollbild-Seite** geöffnet (wie Table-Editor): Menü oben rechts → Documents → Navigation zu **`/dashboard/[projectId]/documents?tableId=...`**. Seite: `app/src/app/(dashboard)/dashboard/[projectId]/documents/page.tsx`; Inhalt: **`DocumentEditorScreen`** aus `app/src/components/document-editor/DocumentEditorModal.tsx` (TipTap, #-Platzhalter, Vorlagen in localStorage). Zusätzlich: `app/src/components/document-editor/documentPlaceholders.ts` (Einsetzen von Record-Werten in TipTap-JSON, `renderDocumentToHtml`).
  - **Tabellen-/Feld-Editor:** `table-editor/` (EditTableFieldPanel, EditTableAIField, ApiKeysDialog, etc.).

## 7. Backend-Architektur (kurz)

- **Einstieg:** `app/server/server.js` → lädt `app/server/src/index.js` (Express-App), hört auf PORT (default 6127).
- **Routes (Mount-Pfade):** Unter `app/server/src/routes/`: `/auth`, `/user`, `/project`, `/table`, `/column`, `/tag`, `/record`, `/view`, `/ai`, `/api`; CORS pro Route.
- **AI:** `POST /ai/complete` in `app/server/src/routes/AI/index.js`, Controller in `app/server/src/controllers/AI/index.js`, Logik in `app/server/src/services/AI/index.js` (OpenAI/Anthropic, Batch-Completion).
- **DB:** Sequelize; Verbindung/Config in `app/server/src/config/database.js`; bei Verbindungsfehler in Nicht-Production läuft der Server weiter (z.B. für AI ohne DB).

## 8. Wichtige Abläufe (für Verständnis)

- **Login/Auth:** AuthContext nutzt Backend-Auth-Routen; JWT/Cookies; Logout per Fetch auf `NEXT_PUBLIC_API_URL/auth/logout`.
- **Tabellen & Felder:** CRUD über Table-/Column-Routes; Frontend: `app/src/lib/table.ts`, Events für Feld-Create/Patch/Delete; TableContext hält aktuelle Tabelle inkl. Felder.
- **Datensätze:** CRUD in `app/src/lib/record.ts` (recordService); Grid lädt Records, Klick öffnet Record via Event; `table-cell-viewer` rendert Felder je Typ (TEXT, CHOICE, DATE, RELATION, AI, etc.).
- **AI-Felder:** Konfiguration in EditTableAIField (Prompt, API-Key pro Feld, Run); Ausführung: `app/src/lib/aiComplete.ts` (fillEmptyAICells, completeBatch), Backend `POST /ai/complete`; API-Keys clientseitig (localStorage) in `app/src/lib/aiApiKeys.ts`.
- **Dokumentenvorlagen:** Pro Tabelle; Speicherung in localStorage über `app/src/lib/documentTemplates.ts`; Editor als **Vollbild-Seite** unter `/dashboard/[projectId]/documents?tableId=...` (DocumentEditorScreen); #-Platzhalter für Feldnamen; in der Record-Ansicht werden fertige Dokumente mit injizierten Record-Werten angezeigt (`documentPlaceholders.ts`).

## 9. Wichtige Dateien (Referenz für KI)

| Rolle | Pfad |
|-------|------|
| API-Base-URL / Konstante | `app/src/constants/index.ts` (apiBase, availableDadixFieldsDataTypes) |
| Axios-Client | `app/src/lib/api.ts` |
| Zentrale Typen | `app/src/types/index.ts` |
| Event-Namen | `app/src/constants/events.ts` |
| Tabellen-API/Logik | `app/src/lib/table.ts` |
| Record-API/Logik | `app/src/lib/record.ts` (inkl. patchRecord-Alias) |
| Record-Editor + Manager | `app/src/components/table-cell-viewer.tsx` (TableRecordEditor, TableRecordEditorsManager, openTableRecord) |
| Dokumenten-Editor (Screen + Modal) | `app/src/components/document-editor/DocumentEditorModal.tsx` (DocumentEditorScreen, DocumentEditorModal) |
| Dokumenten-Editor-Seite | `app/src/app/(dashboard)/dashboard/[projectId]/documents/page.tsx` |
| Dokumenten-Vorlagen (localStorage) | `app/src/lib/documentTemplates.ts` |
| Dokumenten-Platzhalter / HTML-Render | `app/src/components/document-editor/documentPlaceholders.ts` (injectRecordIntoDocumentContent, renderDocumentToHtml) |
| AI-Completion (Frontend) | `app/src/lib/aiComplete.ts` |
| AI API-Keys (Frontend) | `app/src/lib/aiApiKeys.ts` |
| Dashboard-Seite (Projekt) | `app/src/app/(dashboard)/dashboard/[projectId]/page.tsx` |
| Server-Einstieg | `app/server/server.js` |
| Server-Routes | `app/server/src/routes/index.js` |
| AI-Route | `app/server/src/routes/AI/index.js` |
| DB-Config | `app/server/src/config/database.js` |

## 10. Konventionen (für konsistente Antworten)

- **Sprache Code/Kommentare:** Projekt ist auf Englisch; UI-Strings ebenfalls Englisch (LanguageContext/i18n).
- **Fokus/Outline:** Keine sichtbaren Focus-Ringe/Box-Shadows für Buttons/Inputs/Selects (globale Regeln in `app/src/app/globals.css`).
- **Env:** Frontend: `.env.local` mit `NEXT_PUBLIC_API_URL`. Backend: `server/.env` (DB, JWT, optional AI-Keys). Keine Secrets in Repo committen.

---

*Ende der technischen Spezifikation.*
