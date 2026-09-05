'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

const FIELD_BLOCK_GAP_PX = 15;

function parseEncodedArray(param: string | null): string[] {
  if (!param || !param.trim()) return [];
  try {
    const decoded = decodeURIComponent(atob(param));
    const arr = JSON.parse(decoded);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

function WebformContent() {
  const searchParams = useSearchParams();
  const tableId = searchParams.get('tableId');
  const fieldsParam = searchParams.get('fields');
  const namesParam = searchParams.get('names');
  const placeholdersParam = searchParams.get('placeholders');
  const fieldIds = fieldsParam ? fieldsParam.split(',').filter(Boolean) : [];
  const fieldNames = parseEncodedArray(namesParam);
  const placeholders = parseEncodedArray(placeholdersParam);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  if (!tableId || fieldIds.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#f9f9f9] p-4">
        <p className="text-sm text-muted-foreground text-center max-w-md">
          No table or fields specified. Use the Webform editor to add fields and share the link.
        </p>
      </div>
    );
  }

  const getLabel = (index: number) =>
    fieldNames[index] != null && fieldNames[index] !== ''
      ? fieldNames[index]
      : `Field ${index + 1}`;

  const getPlaceholder = (index: number): string | undefined => {
    const p = placeholders[index];
    if (p == null || String(p).trim() === '') return undefined;
    return String(p).trim();
  };

  const handleChange = (id: string, value: string) => {
    setValues((prev) => ({ ...prev, [id]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    // Form submission would need a public API to persist
    console.log('Webform submit', { tableId, values });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#f9f9f9] p-4">
      <div className="w-full max-w-xl rounded-lg border bg-background p-6 shadow-sm">
        {submitted && (
          <div
            className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/30 dark:text-green-200"
            role="status"
          >
            Submitted successfully.
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex flex-col" style={{ gap: `${FIELD_BLOCK_GAP_PX}px` }}>
          {fieldIds.map((id, index) => (
            <div key={id} className="flex flex-col gap-1.5">
              <label htmlFor={`field-${id}`} className="text-sm font-medium leading-none">
                {getLabel(index)}
              </label>
              <input
                id={`field-${id}`}
                type="text"
                value={values[id] ?? ''}
                onChange={(e) => handleChange(id, e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder={getPlaceholder(index)}
              />
            </div>
          ))}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 bg-primary text-primary-foreground shadow hover:bg-primary/90"
            >
              Submit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function WebformPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#f9f9f9]">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      }
    >
      <WebformContent />
    </Suspense>
  );
}
