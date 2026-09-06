export const dadixEvents = {
  projectEvents: {
    onCreate: 'dadix-project-created',
    onPatch: 'dadix-project-patched',
    onDelete: 'dadix-project-deleted',
  },
  tableEvents: {
    onCreate: 'dadix-table-created',
    onPatch: 'dadix-table-patched',
    onDelete: 'dadix-table-deleted',
    /** Reload the project table list from the adapter/core. */
    onRefetchTables: 'dadix-tables-refetch-request',
    /** Request TableContext to refetch current table (e.g. after adding field from Hidden fields). */
    onRefetchTable: 'dadix-table-refetch-request',
    // ----------------------------------------
    onCreateField: 'dadix-table-field-created',
    onPatchField: 'dadix-table-field-patched',
    onDeleteField: 'dadix-table-field-deleted',
    // ----------------------------------------
    onCreateFieldOption: 'dadix-table-field-option-created',
    onPatchFieldOption: 'dadix-table-field-option-patched',
    onDeleteFieldOption: 'dadix-table-field-option-deleted',
    // ----------------------------------------
    onPatchFieldFormula: 'dadix-table-field-formula-patched',
    // ----------------------------------------
    onPatchTextFieldOptions: 'dadix-table-text-field-options-patched',
    onPatchNumberFieldOptions: 'dadix-table-number-field-options-patched',
    // ----------------------------------------
    onPatchRelationFieldOptions: 'dadix-table-relation-field-options-patched',
    onPatchRelationTableViewField:
      'dadix-table-relation-tableview-field-patched',
  },
  recordEvents: {
    onCreate: 'dadix-record-created',
    onChange: 'dadix-record-changed',
    onDelete: 'dadix-record-deleted',
    // ----------------------------------------
    onOpen: 'dadix-record-opened',
    onClose: 'dadix-record-closed',
    onEditCell: 'dadix-record-cell-edit',
    // ----------------------------------------
    onSelectionChange: 'dadix-records-selection-changed',
    onRequestRelativeRecord: 'dadix-request-relative-record-evnt',
    onRequestFirstOrLastRecord: 'dadix-request-first-or-last-record-evnt',
  },
  viewEvents: {
    onCreate: 'dadix-view-created',
    onPatch: 'dadix-view-patched',
    onDelete: 'dadix-view-deleted',
    // ----------------------------------------
    openSearch: 'dadix-view-open-search',
    closeSearch: 'dadix-view-close-search',
  },
  sourceEvents: {
    onRelinked: 'dadix-source-relinked',
  },
  gridViewEvents: {
    onPatchField: 'dadix-gridView-fields-patched',
    /** Ask GridViewContext to refetch view (e.g. after adding column from hidden). */
    onRefetchView: 'dadix-gridView-refetch-view',
    openFindInView: 'dadix-gridView-open-find-in-view',
    closeSearch: 'dadix-gridView-close-search',
  },
};
