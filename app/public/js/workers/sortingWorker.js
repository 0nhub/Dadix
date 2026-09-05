(function () {
  self.onmessage = function (e) {
    const { id, sortingRule, record, records, tableFields } = e.data;
    let newRecordIndex = -1;
    try {
      const fieldId = sortingRule?.fieldId;
      const direction = sortingRule?.direction || 'ASC';

      const sortingField = tableFields.find((f) => f.id === fieldId);
      if (!sortingField) {
        newRecordIndex = records.findIndex((r) => r.id === record.id);
      } else {
        const fieldName = sortingField.name;
        const fieldType = sortingField.type;

        function getValue(rec) {
          const val = rec[fieldName];
          if (fieldType === 'DATE') {
            return val ? new Date(val).getTime() : 0;
          } else if (fieldType === 'INTEGER' || fieldType === 'SERIAL') {
            return typeof val === 'number' ? val : 0;
          }
          return (val ?? null) !== null ? String(val) : '';
        }

        function compare(a, b) {
          const valA = getValue(a);
          const valB = getValue(b);
          if (valA < valB) return direction === 'ASC' ? -1 : 1;
          if (valA > valB) return direction === 'ASC' ? 1 : -1;
          return 0;
        }

        const sortedRecords = [...records].sort(compare);
        newRecordIndex = sortedRecords.findIndex((r) => r.id === record.id);
      }
    } catch (err) {
      console.warn('sortingWorker.js:', err);
    }
    postMessage({ id, recordId: record.id, newRecordIndex });
  };
})();
