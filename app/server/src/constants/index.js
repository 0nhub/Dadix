const roles = {
  OWNER: "Owner",
  ADMIN: "Admin",
  EDITOR: "Editor",
  VIEWER: "Viewer",
};

const availableDataTypes = {
  UUID: "UUID",
  SERIAL: "SERIAL",
  STRING: "STRING",
  TEXT: "TEXT",
  INTEGER: "INTEGER",
  REAL: "REAL",
  BOOLEAN: "BOOLEAN",
  DATE: "DATE",
  CHOICE: "CHOICE",
  RELATION: "RELATION",
  FORMULA: "FORMULA",
  CODE: "CODE",
};

const dataTypes = {
  [availableDataTypes.UUID]: {
    label: "UUID",
    mapToType: "UUID",
    defaultValue: "uuid_generate_v4()",
  },
  [availableDataTypes.SERIAL]: {
    label: "Serial",
    mapToType: "SERIAL",
    defaultValue: "",
  },
  [availableDataTypes.STRING]: {
    label: "String",
    mapToType: "VARCHAR(255)",
    defaultValue: "''",
  },
  [availableDataTypes.TEXT]: {
    label: "Text",
    mapToType: "TEXT",
    defaultValue: "''",
  },
  [availableDataTypes.INTEGER]: {
    label: "Number",
    mapToType: "INTEGER",
    defaultValue: 0,
  },
  [availableDataTypes.REAL]: {
    label: "Real",
    mapToType: "REAL",
    defaultValue: 0.0,
  },
  [availableDataTypes.BOOLEAN]: {
    label: "Boolean",
    mapToType: "BOOLEAN",
    defaultValue: false,
  },
  [availableDataTypes.DATE]: {
    label: "Date",
    mapToType: "TIMESTAMPTZ",
    defaultValue: "NOW()",
  },
  [availableDataTypes.CHOICE]: {
    label: "Choice",
    mapToType: "VARCHAR(255)",
    defaultValue: "''",
  },
  [availableDataTypes.RELATION]: {
    label: "Connect",
    mapToType: "INTEGER",
    defaultValue: null,
    isDadixOnlyType: true,
  },
  [availableDataTypes.FORMULA]: {
    label: "JavaScript",
    mapToType: "TEXT",
    defaultValue: "''",
    isDadixOnlyType: true,
  },
  [availableDataTypes.CODE]: {
    label: "Code",
    mapToType: "TEXT",
    defaultValue: "''",
    isDadixOnlyType: true,
  },
};

const Column = function ({
  name,
  type,
  order = -1,
  size = 200,
  contentAlign = null,
  isVisible = true,
  defaultValue,
  isNullable = true,
  isUnique = false,
  isPrimaryKey = false,
  options = [],
}) {
  this.name = name;
  this.type = type;
  this.order = order;
  this.size = size;
  this.contentAlign = contentAlign;
  this.isVisible = isVisible;
  this.action =
    [availableDataTypes.BOOLEAN, availableDataTypes.CHOICE].indexOf(type) >= 0
      ? columnActions.edit
      : columnActions.nothing;
  this.defaultValue = defaultValue || dataTypes[type].defaultValue;
  this.isNullable = isNullable;
  this.isUnique = isUnique;
  this.isPrimaryKey = isPrimaryKey;
  this.options = options;
  return this;
};

const availableViews = {
  gridView: "gridView",
  formView: "formView",
  kanbanView: "kanbanView",
  pivotTableView: "pivotTableView",
  chartView: "chartView",
  calendarView: "calendarView",
  timelineView: "timelineView",
  mapView: "mapView",
  dashboardView: "dashboardView",
};

const columnActions = {
  nothing: null,
  edit: "edit",
  copy: "copy",
  openUrl: "openUrl",
};

module.exports = {
  roles,
  availableDataTypes,
  dataTypes,
  Column,
  availableViews,
};
