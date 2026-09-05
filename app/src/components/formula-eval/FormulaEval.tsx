import { evalFormula } from '@/lib/utils';
import { validateDadixCode } from '@/lib/dadixCodeEval';
import { availableDadixFieldsDataTypes } from '@/constants';
import type { Field } from '@/types';
import { useEffect, useMemo, useState } from 'react';

/** Stable dependency string for record so effect doesn't run on every parent re-render. */
function recordDeps(record: Record<string, unknown>): string {
  try {
    return JSON.stringify(record);
  } catch {
    return String(record?.id ?? '');
  }
}

function FormulaEval({
  field,
  record,
  fields,
  forceCode,
}: {
  field: Field;
  record: Record<string, unknown>;
  fields: Field[];
  /** When true, always evaluate as Dadix CODE (used when parent already knows this is a CODE column). */
  forceCode?: boolean;
}) {
  const [asyncResult, setAsyncResult] = useState<string>('');
  const fieldId = field?.id;
  const fieldType = field?.type;
  // CODE/FORMULA: ensure we have formula from field or from fields list (e.g. resolvedColumns)
  const formula = String(
    field?.formula ??
    fields?.find((f) => f.id === field?.id)?.formula ??
    ''
  );
  const fieldsKey = fields?.length ? fields.map((f) => f.id).join(',') : '';
  const safeRecord = record != null && typeof record === 'object' ? record : {};
  const safeFields = Array.isArray(fields) ? fields : [];
  const isCode = forceCode || fieldType === availableDadixFieldsDataTypes.CODE;

  const codeResult = useMemo(() => {
    if (!isCode) return null;
    try {
      const out = validateDadixCode({
        code: formula,
        record: safeRecord,
        fields: safeFields,
      });
      return out.valid ? String(out.result ?? '') : '';
    } catch {
      return '';
    }
  }, [isCode, formula, recordDeps(safeRecord), fieldsKey]);

  useEffect(() => {
    if (isCode) return;
    let valid = true;
    (async () => {
      const result = await evalFormula({
        formula,
        record,
        fieldId,
        fields,
      });
      if (!valid) return;
      setAsyncResult(result ?? '');
    })();
    return () => {
      valid = false;
    };
  }, [fieldId, fieldType, formula, recordDeps(record), fieldsKey]);

  if (isCode) {
    return <>{codeResult ?? ''}</>;
  }
  return <>{asyncResult}</>;
}

export { FormulaEval };
