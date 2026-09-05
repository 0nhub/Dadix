/**
 * Lokale Demo-Daten für localhost/Development (Test-Account).
 * Nur aktiv wenn NODE_ENV === 'development'.
 */

import type { Table, Field } from '@/types';
import type { IDadixView, IDadixGridView } from '@/types';

export const DEV_DEMO_PROJECT_ID = 'dev-demo-project';
export const DEV_DEMO_TABLE_ID = 'dev-demo-table';
export const DEV_DEMO_VIEW_ID = 1;

export const DEV_DEMO_TABLE_2_ID = 'dev-demo-table-2';
export const DEV_DEMO_VIEW_2_ID = 2;

export const DEV_DEMO_TABLE_3_ID = 'dev-demo-table-3';
export const DEV_DEMO_VIEW_3_ID = 3;

export const DEV_DEMO_TABLE_4_ID = 'dev-demo-table-4';
export const DEV_DEMO_VIEW_4_ID = 4;

export const DEV_DEMO_PROJECT = {
  id: DEV_DEMO_PROJECT_ID,
  title: 'Demo Projekt',
  icon: 'FolderClosed',
  order: 0,
  role: 'Owner' as const,
};

const now = new Date().toISOString();

export const DEV_DEMO_TABLE: Table = {
  id: DEV_DEMO_TABLE_ID,
  name: 'Demo Tabelle',
  icon: 'Table',
  userId: 'dev-user',
  projectId: DEV_DEMO_PROJECT_ID,
  order: 0,
  createdAt: now,
  updatedAt: now,
  fields: [
    {
      id: 1,
      name: 'Name',
      type: 'TEXT',
      size: 255,
      order: 0,
      isVisible: true,
      contentAlign: 'left',
      action: null,
    },
    {
      id: 2,
      name: 'Status',
      type: 'CHOICE',
      size: 0,
      order: 1,
      options: [
        { id: 1, value: 'Offen', color: '#22c55e', order: 0 },
        { id: 2, value: 'In Arbeit', color: '#eab308', order: 1 },
        { id: 3, value: 'Erledigt', color: '#3b82f6', order: 2 },
      ],
      isVisible: true,
      contentAlign: 'left',
      action: null,
    },
    {
      id: 3,
      name: 'Notizen',
      type: 'TEXT',
      size: 1000,
      order: 2,
      isVisible: true,
      contentAlign: 'left',
      action: null,
    },
  ],
};

export const DEV_DEMO_VIEW: IDadixGridView = {
  id: DEV_DEMO_VIEW_ID,
  tableId: DEV_DEMO_TABLE_ID,
  name: 'Alle Einträge',
  icon: 'LayoutGrid',
  order: 0,
  filter: '',
  sort: '',
  type: 'gridView',
  fields: DEV_DEMO_TABLE.fields!.map((f, i) => ({
    ...f,
    fieldId: f.id,
    fieldName: f.name,
    fieldOrder: i,
  })),
};

/** Zweite Demo-Tabelle: einfache Liste (Titel, Kategorie, Priorität). */
export const DEV_DEMO_TABLE_2: Table = {
  id: DEV_DEMO_TABLE_2_ID,
  name: 'Test-Liste',
  icon: 'Tags',
  userId: 'dev-user',
  projectId: DEV_DEMO_PROJECT_ID,
  order: 1,
  createdAt: now,
  updatedAt: now,
  fields: [
    { id: 1, name: 'Titel', type: 'TEXT', size: 255, order: 0, isVisible: true, contentAlign: 'left', action: null },
    {
      id: 2,
      name: 'Kategorie',
      type: 'CHOICE',
      size: 0,
      order: 1,
      options: [
        { id: 1, value: 'Bug', color: '#ef4444', order: 0 },
        { id: 2, value: 'Feature', color: '#22c55e', order: 1 },
        { id: 3, value: 'Dokumentation', color: '#3b82f6', order: 2 },
      ],
      isVisible: true,
      contentAlign: 'left',
      action: null,
    },
    {
      id: 3,
      name: 'Priorität',
      type: 'CHOICE',
      size: 0,
      order: 2,
      options: [
        { id: 1, value: 'Niedrig', color: '#6b7280', order: 0 },
        { id: 2, value: 'Mittel', color: '#eab308', order: 1 },
        { id: 3, value: 'Hoch', color: '#f97316', order: 2 },
      ],
      isVisible: true,
      contentAlign: 'left',
      action: null,
    },
  ],
};

export const DEV_DEMO_VIEW_2: IDadixGridView = {
  id: DEV_DEMO_VIEW_2_ID,
  tableId: DEV_DEMO_TABLE_2_ID,
  name: 'Alle Einträge',
  icon: 'LayoutGrid',
  order: 0,
  filter: '',
  sort: '',
  type: 'gridView',
  fields: DEV_DEMO_TABLE_2.fields!.map((f, i) => ({
    ...f,
    fieldId: f.id,
    fieldName: f.name,
    fieldOrder: i,
  })),
};

/** Drittes Demo-Table: 15 Spalten, 3 Datensätze – zum Testen von horizontalem Scroll / Fix-Spalten. */
export const DEV_DEMO_TABLE_3: Table = {
  id: DEV_DEMO_TABLE_3_ID,
  name: 'Breite Demo',
  icon: 'LayoutGrid',
  userId: 'dev-user',
  projectId: DEV_DEMO_PROJECT_ID,
  order: 2,
  createdAt: now,
  updatedAt: now,
  fields: [
    { id: 1, name: 'Name', type: 'TEXT', size: 200, order: 0, isVisible: true, contentAlign: 'left', action: null },
    {
      id: 2,
      name: 'Status',
      type: 'CHOICE',
      size: 0,
      order: 1,
      options: [
        { id: 1, value: 'Offen', color: '#22c55e', order: 0 },
        { id: 2, value: 'In Arbeit', color: '#eab308', order: 1 },
        { id: 3, value: 'Erledigt', color: '#3b82f6', order: 2 },
      ],
      isVisible: true,
      contentAlign: 'left',
      action: null,
    },
    { id: 3, name: 'Notizen', type: 'TEXT', size: 220, order: 2, isVisible: true, contentAlign: 'left', action: null },
    { id: 4, name: 'Datum', type: 'DATE', size: 0, order: 3, isVisible: true, contentAlign: 'left', action: null },
    {
      id: 5,
      name: 'Priorität',
      type: 'CHOICE',
      size: 0,
      order: 4,
      options: [
        { id: 1, value: 'Niedrig', color: '#6b7280', order: 0 },
        { id: 2, value: 'Mittel', color: '#eab308', order: 1 },
        { id: 3, value: 'Hoch', color: '#f97316', order: 2 },
      ],
      isVisible: true,
      contentAlign: 'left',
      action: null,
    },
    { id: 6, name: 'Verantwortlich', type: 'TEXT', size: 180, order: 5, isVisible: true, contentAlign: 'left', action: null },
    { id: 7, name: 'Fortschritt', type: 'INTEGER', size: 0, order: 6, isVisible: true, contentAlign: 'right', action: null },
    {
      id: 8,
      name: 'Typ',
      type: 'CHOICE',
      size: 0,
      order: 7,
      options: [
        { id: 1, value: 'Aufgabe', color: '#3b82f6', order: 0 },
        { id: 2, value: 'Bug', color: '#ef4444', order: 1 },
        { id: 3, value: 'Feature', color: '#22c55e', order: 2 },
      ],
      isVisible: true,
      contentAlign: 'left',
      action: null,
    },
    { id: 9, name: 'Quelle', type: 'TEXT', size: 160, order: 8, isVisible: true, contentAlign: 'left', action: null },
    { id: 10, name: 'Bemerkung', type: 'TEXT', size: 200, order: 9, isVisible: true, contentAlign: 'left', action: null },
    { id: 11, name: 'Kunde', type: 'TEXT', size: 180, order: 10, isVisible: true, contentAlign: 'left', action: null },
    { id: 12, name: 'Deadline', type: 'DATE', size: 0, order: 11, isVisible: true, contentAlign: 'left', action: null },
    { id: 13, name: 'Aufwand', type: 'INTEGER', size: 0, order: 12, isVisible: true, contentAlign: 'right', action: null },
    { id: 14, name: 'Link', type: 'TEXT', size: 300, order: 13, isVisible: true, contentAlign: 'left', action: null },
    { id: 15, name: 'Tags', type: 'TEXT', size: 200, order: 14, isVisible: true, contentAlign: 'left', action: null },
  ],
};

export const DEV_DEMO_VIEW_3: IDadixGridView = {
  id: DEV_DEMO_VIEW_3_ID,
  tableId: DEV_DEMO_TABLE_3_ID,
  name: 'Alle Einträge',
  icon: 'LayoutGrid',
  order: 0,
  filter: '',
  sort: '',
  type: 'gridView',
  fields: DEV_DEMO_TABLE_3.fields!.map((f, i) => ({
    ...f,
    fieldId: f.id,
    fieldName: f.name,
    fieldOrder: i,
  })),
};

export const DEV_DEMO_RECORDS_3: Record<string, unknown>[] = [
  {
    id: 1,
    Name: 'Design-Review abschließen',
    Status: 'Offen',
    Notizen: 'UI-Mockups prüfen und Feedback einarbeiten.',
    Datum: '2025-03-01',
    Priorität: 'Hoch',
    Verantwortlich: 'Anna M.',
    Fortschritt: 20,
    Typ: 'Aufgabe',
    Quelle: 'Kunde',
    Bemerkung: 'Bis Freitag.',
    Kunde: 'Acme GmbH',
    Deadline: '2025-03-15',
    Aufwand: 8,
    Link: 'https://example.com/design',
    Tags: 'UI, Review',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 2,
    Name: 'API-Dokumentation aktualisieren',
    Status: 'In Arbeit',
    Notizen: 'Endpoints für Projekt und Tabellen ergänzen.',
    Datum: '2025-03-05',
    Priorität: 'Mittel',
    Verantwortlich: 'Ben K.',
    Fortschritt: 65,
    Typ: 'Feature',
    Quelle: 'Intern',
    Bemerkung: 'OpenAPI 3.0',
    Kunde: '–',
    Deadline: '2025-03-20',
    Aufwand: 16,
    Link: 'https://docs.example.com',
    Tags: 'API, Docs',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 3,
    Name: 'Login-Flow testen',
    Status: 'Erledigt',
    Notizen: 'Test-Account und Cookie-Handling verifiziert.',
    Datum: '2025-02-28',
    Priorität: 'Niedrig',
    Verantwortlich: 'Clara S.',
    Fortschritt: 100,
    Typ: 'Bug',
    Quelle: 'Support',
    Bemerkung: 'Abgeschlossen.',
    Kunde: 'Beta AG',
    Deadline: '2025-03-01',
    Aufwand: 4,
    Link: '',
    Tags: 'Auth, QA',
    createdAt: now,
    updatedAt: now,
  },
];

export const DEV_DEMO_RECORDS_2: Record<string, unknown>[] = [
  { id: 1, Titel: 'Login-Button reagiert nicht', Kategorie: 'Bug', Priorität: 'Hoch', createdAt: now, updatedAt: now },
  { id: 2, Titel: 'Dark Mode hinzufügen', Kategorie: 'Feature', Priorität: 'Mittel', createdAt: now, updatedAt: now },
  { id: 3, Titel: 'API-Readme aktualisieren', Kategorie: 'Dokumentation', Priorität: 'Niedrig', createdAt: now, updatedAt: now },
  { id: 4, Titel: 'Validierung der E-Mail-Adresse', Kategorie: 'Bug', Priorität: 'Mittel', createdAt: now, updatedAt: now },
  { id: 5, Titel: 'Export als PDF', Kategorie: 'Feature', Priorität: 'Niedrig', createdAt: now, updatedAt: now   },
];

/** Vierte Tabelle im Demo-Projekt: "AI Test" – ein Feld "Land", drei Werte. */
export const DEV_DEMO_TABLE_4: Table = {
  id: DEV_DEMO_TABLE_4_ID,
  name: 'AI Test',
  icon: 'Table',
  userId: 'dev-user',
  projectId: DEV_DEMO_PROJECT_ID,
  order: 3,
  createdAt: now,
  updatedAt: now,
  fields: [
    {
      id: 1,
      name: 'Land',
      type: 'CHOICE',
      size: 0,
      order: 0,
      options: [
        { id: 1, value: 'Deutschland', color: '#22c55e', order: 0 },
        { id: 2, value: 'Frankreich', color: '#3b82f6', order: 1 },
        { id: 3, value: 'USA', color: '#eab308', order: 2 },
      ],
      isVisible: true,
      contentAlign: 'left',
      action: null,
    },
  ],
};

export const DEV_DEMO_VIEW_4: IDadixGridView = {
  id: DEV_DEMO_VIEW_4_ID,
  tableId: DEV_DEMO_TABLE_4_ID,
  name: 'Alle Einträge',
  icon: 'LayoutGrid',
  order: 0,
  filter: '',
  sort: '',
  type: 'gridView',
  fields: DEV_DEMO_TABLE_4.fields!.map((f, i) => ({
    ...f,
    fieldId: f.id,
    fieldName: f.name,
    fieldOrder: i,
  })),
};

const DEV_DEMO_4_STORAGE_KEY = 'dadix-dev-demo-records-4';

export const DEV_DEMO_RECORDS_4: Record<string, unknown>[] = [
  { id: 1, Land: 'Deutschland', createdAt: now, updatedAt: now },
  { id: 2, Land: 'Frankreich', createdAt: now, updatedAt: now },
  { id: 3, Land: 'USA', createdAt: now, updatedAt: now },
];

export function getDevDemo4Records(): Record<string, unknown>[] {
  if (process.env.NODE_ENV !== 'development') return [...DEV_DEMO_RECORDS_4];
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(DEV_DEMO_4_STORAGE_KEY) : null;
    if (!raw) return [...DEV_DEMO_RECORDS_4];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEV_DEMO_RECORDS_4];
    return (parsed as Record<string, unknown>[]).length > 0 ? (parsed as Record<string, unknown>[]) : [...DEV_DEMO_RECORDS_4];
  } catch {
    return [...DEV_DEMO_RECORDS_4];
  }
}

export function setDevDemo4Records(records: Record<string, unknown>[]): void {
  if (process.env.NODE_ENV !== 'development' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(DEV_DEMO_4_STORAGE_KEY, JSON.stringify(records));
  } catch {}
}

/** Zellen nutzen Feldnamen (Name, Status, Notizen) als accessorKey. */
export const DEV_DEMO_RECORDS: Record<string, unknown>[] = [
  { id: 1, Name: 'Design-Review abschließen', Status: 'Offen', Notizen: 'UI-Mockups für die neue Ansicht prüfen und Feedback geben.', createdAt: now, updatedAt: now },
  { id: 2, Name: 'API-Dokumentation aktualisieren', Status: 'In Arbeit', Notizen: 'Endpoints für Projekt und Tabellen ergänzen.', createdAt: now, updatedAt: now },
  { id: 3, Name: 'Login-Flow testen', Status: 'Erledigt', Notizen: 'Test-Account und Cookie-Handling verifiziert.', createdAt: now, updatedAt: now },
  { id: 4, Name: 'Datenbank-Migration vorbereiten', Status: 'Offen', Notizen: 'Schema-Änderungen für neue Spalte „Priorität“ planen.', createdAt: now, updatedAt: now },
  { id: 5, Name: 'Fehlerbehandlung verbessern', Status: 'In Arbeit', Notizen: 'Toast-Meldungen und Fallbacks bei API-Fehlern einbauen.', createdAt: now, updatedAt: now },
  { id: 6, Name: 'Demo-Daten für Localhost', Status: 'Erledigt', Notizen: 'Vollständiges Demo-Projekt mit Beispieldatensätzen angelegt.', createdAt: now, updatedAt: now },
  { id: 7, Name: 'Performance-Check Grid-View', Status: 'Offen', Notizen: 'Rendering bei vielen Zeilen prüfen, ggf. virtualisieren.', createdAt: now, updatedAt: now },
  { id: 8, Name: 'Export nach CSV', Status: 'Offen', Notizen: 'Funktion zum Export der aktuellen Tabelle/Filterung.', createdAt: now, updatedAt: now },
  { id: 9, Name: 'Benachrichtigungen einrichten', Status: 'In Arbeit', Notizen: 'E-Mail-Hinweise bei Einladungen und Änderungen.', createdAt: now, updatedAt: now },
  { id: 10, Name: 'Rollen und Rechte prüfen', Status: 'Erledigt', Notizen: 'Owner/Admin/Editor/Viewer für alle Routen getestet.', createdAt: now, updatedAt: now },
  { id: 11, Name: 'Mobile Ansicht optimieren', Status: 'Offen', Notizen: 'Sidebar und Tabellen auf kleinen Screens anpassen.', createdAt: now, updatedAt: now },
  { id: 12, Name: 'Backup-Strategie dokumentieren', Status: 'Offen', Notizen: 'Anleitung für DB-Backup und Wiederherstellung.', createdAt: now, updatedAt: now },
];

export const DEV_DEMO_RECORDS_RESPONSE = {
  records: DEV_DEMO_RECORDS,
  total: DEV_DEMO_RECORDS.length,
};

export function isDevDemoProject(projectId: string | undefined): boolean {
  return (
    process.env.NODE_ENV === 'development' &&
    (projectId ?? '') === DEV_DEMO_PROJECT_ID
  );
}

export function isDevDemoTable(tableId: string | number | undefined): boolean {
  if (process.env.NODE_ENV !== 'development') return false;
  const id = String(tableId ?? '');
  return id === DEV_DEMO_TABLE_ID || id === DEV_DEMO_TABLE_2_ID || id === DEV_DEMO_TABLE_3_ID || id === DEV_DEMO_TABLE_4_ID;
}

/** Persisted field order (array of field ids) for dev/demo tables. */
const DEV_FIELD_ORDER_PREFIX = 'dadix-dev-field-order-';

export function getDevDemoFieldOrder(
  tableId: string | number
): number[] | null {
  if (process.env.NODE_ENV !== 'development' || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DEV_FIELD_ORDER_PREFIX + tableId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as number[]) : null;
  } catch {
    return null;
  }
}

export function setDevDemoFieldOrder(
  tableId: string | number,
  fieldIdsInOrder: number[]
): void {
  if (process.env.NODE_ENV !== 'development' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(DEV_FIELD_ORDER_PREFIX + tableId, JSON.stringify(fieldIdsInOrder));
  } catch {
    // ignore
  }
}

/** Field overrides (placeholder, defaultValue, formula, aiOptions) per field id for dev/demo tables. */
const DEV_FIELD_OVERIDES_PREFIX = 'dadix-dev-field-overrides-';

export type DevFieldOverride = {
  placeholder?: string;
  defaultValue?: string;
  formula?: string;
  aiOptions?: { prompt: string; outputType: string; apiKeyId: string };
};

export function getDevDemoFieldOverrides(
  tableId: string | number
): Record<string, DevFieldOverride> {
  if (process.env.NODE_ENV !== 'development' || typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(DEV_FIELD_OVERIDES_PREFIX + tableId);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, DevFieldOverride>)
      : {};
  } catch {
    return {};
  }
}

export function setDevDemoFieldOverride(
  tableId: string | number,
  fieldId: number,
  data: DevFieldOverride
): void {
  if (process.env.NODE_ENV !== 'development' || typeof localStorage === 'undefined') return;
  try {
    const key = DEV_FIELD_OVERIDES_PREFIX + tableId;
    const current = getDevDemoFieldOverrides(tableId);
    const id = String(fieldId);
    const next = { ...current, [id]: { ...(current[id] ?? {}), ...data } };
    const o = next[id];
    if (o.placeholder === undefined && o.defaultValue === undefined && o.formula === undefined && o.aiOptions === undefined) {
      delete next[id];
    }
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // ignore
  }
}

/** Zusätzliche Felder (im Table-Editor hinzugefügt) für Dev-Demo-Tabellen – nur in localStorage, damit sie nach Schließen erhalten bleiben. */
const DEV_EXTRA_FIELDS_PREFIX = 'dadix-dev-extra-fields-';

export function getDevDemoExtraFields(tableId: string | number): Field[] {
  if (process.env.NODE_ENV !== 'development' || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DEV_EXTRA_FIELDS_PREFIX + tableId);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Field[]) : [];
  } catch {
    return [];
  }
}

export function setDevDemoExtraFields(tableId: string | number, fields: Field[]): void {
  if (process.env.NODE_ENV !== 'development' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(DEV_EXTRA_FIELDS_PREFIX + tableId, JSON.stringify(fields));
  } catch {
    // ignore
  }
}

const DEV_DEMO_STORAGE_KEY = 'dadix-dev-demo-records';
const DEV_DEMO_2_STORAGE_KEY = 'dadix-dev-demo-records-2';
const DEV_DEMO_3_STORAGE_KEY = 'dadix-dev-demo-records-3';

/** Liest Records der zweiten Demo-Tabelle aus localStorage. */
export function getDevDemo2Records(): Record<string, unknown>[] {
  if (process.env.NODE_ENV !== 'development') return [...DEV_DEMO_RECORDS_2];
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(DEV_DEMO_2_STORAGE_KEY) : null;
    if (!raw) return [...DEV_DEMO_RECORDS_2];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEV_DEMO_RECORDS_2];
    return (parsed as Record<string, unknown>[]).length > 0 ? (parsed as Record<string, unknown>[]) : [...DEV_DEMO_RECORDS_2];
  } catch {
    return [...DEV_DEMO_RECORDS_2];
  }
}

/** Speichert Records der zweiten Demo-Tabelle in localStorage. */
export function setDevDemo2Records(records: Record<string, unknown>[]): void {
  if (process.env.NODE_ENV !== 'development' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(DEV_DEMO_2_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // ignore
  }
}

/** Liest Records der dritten Demo-Tabelle (15 Spalten) aus localStorage. */
export function getDevDemo3Records(): Record<string, unknown>[] {
  if (process.env.NODE_ENV !== 'development') return [...DEV_DEMO_RECORDS_3];
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(DEV_DEMO_3_STORAGE_KEY) : null;
    if (!raw) return [...DEV_DEMO_RECORDS_3];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEV_DEMO_RECORDS_3];
    return (parsed as Record<string, unknown>[]).length > 0 ? (parsed as Record<string, unknown>[]) : [...DEV_DEMO_RECORDS_3];
  } catch {
    return [...DEV_DEMO_RECORDS_3];
  }
}

/** Speichert Records der dritten Demo-Tabelle in localStorage. */
export function setDevDemo3Records(records: Record<string, unknown>[]): void {
  if (process.env.NODE_ENV !== 'development' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(DEV_DEMO_3_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // ignore
  }
}

/** Liest gespeicherte Demo-Daten aus localStorage (nur Dev). Leer/ungültig = DEV_DEMO_RECORDS. */
export function getDevDemoRecords(): Record<string, unknown>[] {
  if (process.env.NODE_ENV !== 'development') return DEV_DEMO_RECORDS;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(DEV_DEMO_STORAGE_KEY) : null;
    if (!raw) return [...DEV_DEMO_RECORDS];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return [...DEV_DEMO_RECORDS];
    return parsed as Record<string, unknown>[];
  } catch {
    return [...DEV_DEMO_RECORDS];
  }
}

/** Speichert Demo-Daten in localStorage (nur Dev). */
export function setDevDemoRecords(records: Record<string, unknown>[]): void {
  if (process.env.NODE_ENV !== 'development' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(DEV_DEMO_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // ignore
  }
}

/** Prüft, ob tableId eine lokale Dev-Tabelle ist (dev-table-*). */
export function isDevTable(tableId: string | number | undefined): boolean {
  return (
    process.env.NODE_ENV === 'development' &&
    String(tableId ?? '').startsWith('dev-table-')
  );
}

export function isLocalDevProject(projectId: string | undefined): boolean {
  if (process.env.NODE_ENV !== 'development') return false;
  const id = String(projectId ?? '');
  return id === DEV_DEMO_PROJECT_ID || id.startsWith('dev-');
}

export type LocalProject = {
  id: string;
  title: string;
  icon: string;
  order: number;
  role: 'Owner';
};

const LOCAL_PROJECTS_KEY = 'dadix-dev-local-projects';
const LOCAL_TABLES_PREFIX = 'dadix-dev-local-tables-';

export function getLocalProjects(): LocalProject[] {
  if (process.env.NODE_ENV !== 'development' || typeof localStorage === 'undefined') {
    return [];
  }
  try {
    const raw = localStorage.getItem(LOCAL_PROJECTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as LocalProject[]) : [];
  } catch {
    return [];
  }
}

export function saveLocalProject(project: LocalProject): void {
  if (process.env.NODE_ENV !== 'development' || typeof localStorage === 'undefined') return;
  try {
    const next = getLocalProjects().filter((p) => p.id !== project.id);
    next.push(project);
    localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function createLocalProject(title: string, icon: string): LocalProject {
  const project: LocalProject = {
    id: `dev-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    title,
    icon,
    order: getLocalProjects().length,
    role: 'Owner',
  };
  saveLocalProject(project);
  return project;
}

export function getLocalProjectTables(projectId: string): Table[] {
  if (process.env.NODE_ENV !== 'development' || typeof localStorage === 'undefined') {
    return [];
  }
  try {
    const raw = localStorage.getItem(LOCAL_TABLES_PREFIX + projectId);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Table[]) : [];
  } catch {
    return [];
  }
}

export function saveLocalProjectTables(projectId: string, tables: Table[]): void {
  if (process.env.NODE_ENV !== 'development' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_TABLES_PREFIX + projectId, JSON.stringify(tables));
  } catch {
    // ignore
  }
}

export function createLocalTable(projectId: string, name: string, icon: string): Table {
  const now = new Date().toISOString();
  const existing = getLocalProjectTables(projectId);
  const table: Table = {
    id: `dev-table-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name: name.trim(),
    icon,
    userId: 'dev-user',
    projectId,
    order: existing.length,
    createdAt: now,
    updatedAt: now,
    fields: [
      {
        id: 1,
        name: 'Name',
        type: 'TEXT',
        size: 255,
        order: 0,
        isVisible: true,
        contentAlign: 'left',
        action: 'edit',
      },
    ],
  };
  saveLocalProjectTables(projectId, [...existing, table]);
  setDevTableRecords(table.id, [
    { id: 1, Name: '', createdAt: now, updatedAt: now },
  ]);
  return table;
}

export function findLocalTableById(tableId: string | number): Table | undefined {
  const id = String(tableId ?? '');
  if (id === DEV_DEMO_TABLE_4_ID) return DEV_DEMO_TABLE_4;
  if (id === DEV_DEMO_TABLE_3_ID) return DEV_DEMO_TABLE_3;
  if (id === DEV_DEMO_TABLE_2_ID) return DEV_DEMO_TABLE_2;
  if (id === DEV_DEMO_TABLE_ID) return DEV_DEMO_TABLE;
  for (const project of getLocalProjects()) {
    const table = getLocalProjectTables(project.id).find((item) => `${item.id}` === id);
    if (table) return table;
  }
  return undefined;
}

export function upsertLocalTable(table: Table): void {
  if (!table.projectId) return;
  const tables = getLocalProjectTables(table.projectId);
  const index = tables.findIndex((item) => `${item.id}` === `${table.id}`);
  if (index >= 0) tables[index] = table;
  else tables.push(table);
  saveLocalProjectTables(table.projectId, tables);
}

export function tableFieldsToGridViewFields(fields: Field[] | undefined) {
  return (fields ?? []).map((field, index) => ({
    ...field,
    fieldId: Number(field.id),
    fieldName: field.name,
    fieldOrder: typeof field.order === 'number' ? field.order : index,
    isVisible: field.isVisible !== false,
    action: field.action ?? 'edit',
  }));
}

export function findLocalTable(projectId: string, tableId: string | number): Table | undefined {
  if (isDevDemoProject(projectId)) {
    if (`${tableId}` === DEV_DEMO_TABLE_4_ID) return DEV_DEMO_TABLE_4;
    if (`${tableId}` === DEV_DEMO_TABLE_3_ID) return DEV_DEMO_TABLE_3;
    if (`${tableId}` === DEV_DEMO_TABLE_2_ID) return DEV_DEMO_TABLE_2;
    return DEV_DEMO_TABLE;
  }
  return getLocalProjectTables(projectId).find((table) => `${table.id}` === `${tableId}`);
}

const DEV_TABLE_RECORDS_PREFIX = 'dadix-dev-records-';

/** Liest Records einer Dev-Tabelle aus localStorage. */
export function getDevTableRecords(tableId: string | number): Record<string, unknown>[] {
  if (process.env.NODE_ENV !== 'development' || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DEV_TABLE_RECORDS_PREFIX + tableId);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
  } catch {
    return [];
  }
}

/** Speichert Records einer Dev-Tabelle in localStorage. */
export function setDevTableRecords(tableId: string | number, records: Record<string, unknown>[]): void {
  if (process.env.NODE_ENV !== 'development' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(DEV_TABLE_RECORDS_PREFIX + tableId, JSON.stringify(records));
  } catch {
    // ignore
  }
}
