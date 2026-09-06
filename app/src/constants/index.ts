function getApiBase(): string {
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (typeof window !== 'undefined' && window.location?.hostname === 'localhost') {
    return 'http://localhost:6127';
  }
  return 'https://api.dadix.net';
}

export const apiBase = getApiBase();

export const availableDadixFieldsDataTypes = {
  TEXT: 'TEXT',
  INTEGER: 'INTEGER',
  CHOICE: 'CHOICE',
  BOOLEAN: 'BOOLEAN',
  DATE: 'DATE',
  FORMULA: 'FORMULA',
  CODE: 'CODE',
  RELATION: 'RELATION',
  AI: 'AI',
  FILE: 'FILE',
};

/** Special type for view-only buttons (not a table column). */
export const VIEW_BUTTON_TYPE = 'VIEW_BUTTON';

export const dadixFieldsDataTypes: {
  id: number;
  name: string;
  icon: string;
  value: string;
}[] = [
  { id: 1, icon: 'LucideType', name: 'Text', value: 'TEXT' },
  { id: 2, icon: 'LucideBinary', name: 'Number', value: 'INTEGER' },
  {
    id: 3,
    icon: 'LucideLibrary',
    name: 'Choice',
    value: 'CHOICE',
  },
  { id: 4, icon: 'LucideToggleLeft', name: 'Switch', value: 'BOOLEAN' },
  { id: 5, icon: 'LucideCalendar', name: 'Date', value: 'DATE' },
  { id: 6, icon: 'LucideCode', name: 'JavaScript', value: 'FORMULA' },
  { id: 7, icon: 'LucideCurlyBraces', name: 'Code', value: 'CODE' },
  { id: 8, icon: 'LucideWorkflow', name: 'Connect', value: 'RELATION' },
  { id: 9, icon: 'LucideBot', name: 'AI', value: 'AI' },
  { id: 10, icon: 'LucideImage', name: 'File', value: 'FILE' },
  { id: 11, icon: 'LucideMousePointerClick', name: 'Button', value: 'VIEW_BUTTON' },
];
