(function () {
  self.onmessage = function (e) {
    let { formula, fieldId, record, fields } = e.data;
    let result = '';
    try {
      result = eval(formula);
    } catch (err) {
      console.log('formulaEvalWorker.js:', err);
      // TODO: return error
    }

    postMessage({ recordId: record.id, fieldId, result });
  };
})();
