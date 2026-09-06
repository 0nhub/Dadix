export type MemberRole = 'Owner' | 'Admin' | 'Editor' | 'Viewer';

export type DadixFieldDataTypes =
  | 'UUID'
  | 'SERIAL'
  | 'TEXT'
  | 'INTEGER'
  | 'BOOLEAN'
  | 'CHOICE'
  | 'DATE'
  | 'FORMULA'
  | 'CODE'
  | 'RELATION'
  | 'AI'
  | 'FILE';

/** Output type for AI field results. */
export type AIFieldOutputType = 'TEXT' | 'INTEGER' | 'DATE' | 'BOOLEAN';

export interface AIFieldOptions {
  prompt: string;
  outputType: AIFieldOutputType;
  /** Id of the API key to use for this field (selected in field setup). */
  apiKeyId: string;
}

export type TableSourceKind = 'local' | 'linked_file' | 'external_database';

export interface Table {
  id: number | string; // Accept UUID (string) or numeric IDs
  name: string;
  icon: string;
  userId: number | string;
  projectId: string | number;
  order: number;
  fields?: Field[];
  createdAt: string;
  updatedAt: string;
  /** Desktop adapter: where the table's data lives. Not a column type. */
  sourceKind?: TableSourceKind;
  sourceId?: number;
  defaultViewId?: number | string;
}

/** For CHOICE fields: single = one option, multi = multiple options (checkboxes in dropdown). */
export type ChoiceMode = 'single' | 'multi';

export interface Field {
  id: number;
  name: string;
  type: DadixFieldDataTypes;
  size: number;
  order: number;
  options?: ChoiceFieldOption[];
  /** CHOICE only: 'single' | 'multi'. Default 'single'. */
  choiceMode?: ChoiceMode;
  formula?: string;
  textOptions?: TextFieldOptions;
  numberOptions?: NumberFieldOptions;
  relationOptions?: RelationFieldOptions;
  isVisible: boolean;
  contentAlign: FieldContentAlign;
  action: FieldActions;
  /** Placeholder text when the field is empty */
  placeholder?: string;
  /** Default value for new records. For DATE use "TODAY" for today's date. */
  defaultValue?: string;
  /** Options for AI field type (prompt, output type, API key). */
  aiOptions?: AIFieldOptions;
}

export type FieldContentAlign = 'right' | 'center' | 'left';
export type FieldActions = null | 'copy' | 'edit' | 'openUrl';

export interface ChoiceFieldOption {
  value: string;
  color: string;
  id: string | number;
  order: number;
}

export interface TextFieldOptions {
  multiLines: boolean;
  minLines: number;
  maxLines: number;
}

/** INTEGER field display options. */
export type ThousandsSeparator = 'none' | 'point' | 'comma' | 'space';
export type DecimalSeparator = 'point' | 'comma';

export interface NumberFieldOptions {
  thousandsSeparator?: ThousandsSeparator;
  decimalPlaces?: number;
  decimalSeparator?: DecimalSeparator;
  prefix?: string;
  suffix?: string;
}


export interface RelationFieldOptions {
  id: number;
  allowMultipleRelations: boolean;
  showAddNewButton: boolean;
  relatedToTableWithId: string | undefined;
}

export type IDadixViewTypes =
  | 'gridView'
  | 'formView'
  | 'kanbanView'
  | 'pivotTableView'
  | 'chartView'
  | 'calendarView'
  | 'timelineView'
  | 'mapView'
  | 'dashboardView';

export interface IDadixView {
  id: number;
  tableId: string;
  name: string;
  icon: string;
  order: number;
  filter: string;
  sort: string;
  type: IDadixViewTypes;
}

export interface IDadixGridViewField extends Field {
  fieldId: number;
  fieldName: string;
  fieldOrder: number;
  /** When true, column stays visible (sticky) at left viewport edge when scrolling horizontally. */
  fixed?: boolean;
}

export interface IDadixViewButton {
  id: number;
  viewId: number;
  label: string;
  order: number;
}

export interface IDadixGridView extends IDadixView {
  fields: IDadixGridViewField[];
  /** Buttons shown only in this view (not in table editor, record editor, or other views) */
  buttons?: IDadixViewButton[];
}

export type FilterOperations =
  | 'eq'
  | 'neq'
  | 'lte'
  | 'gte'
  | 'like'
  | 'nlike'
  | 'in'
  | 'isnull'
  | 'notnull';

export type FilterRelations = 'or' | 'and' | 'where';

export interface IFilter {
  id: string;
  operation: FilterOperations;
  fieldId: number;
  relation: FilterRelations;
  value: string;
}

export interface ISortingRule {
  fieldId: number | undefined;
  direction: 'ASC' | 'DESC' | undefined;
}

/** Array of sorting rules (first rule has highest priority). */
export type ISortingRules = ISortingRule[];

/** Document template for record-based documents. Content is TipTap JSON. */
export interface DocumentTemplate {
  id: string;
  name: string;
  /** Optional icon name (e.g. for list display). */
  icon?: string;
  tableId: string | number;
  /** TipTap/ProseMirror JSON document. */
  content: Record<string, unknown>;
  updatedAt: string;
}
