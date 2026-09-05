/**
 * Injects record values into TipTap document JSON: replaces mention nodes
 * (#FieldName) with text nodes containing record[fieldName].
 */
export function injectRecordIntoDocumentContent(
  doc: Record<string, unknown>,
  record: Record<string, unknown>
): Record<string, unknown> {
  const clone = (node: Record<string, unknown>): Record<string, unknown> => {
    const type = node.type as string;
    if (type === 'mention') {
      const attrs = (node.attrs as Record<string, unknown>) ?? {};
      const fieldName = (attrs.id as string) ?? (attrs.label as string) ?? '';
      const value = record[fieldName];
      const text =
        value !== null && value !== undefined && value !== ''
          ? String(value)
          : '';
      return { type: 'text', text };
    }
    const content = (node.content as Record<string, unknown>[]) ?? [];
    return {
      ...node,
      content: content.map(clone),
    };
  };
  return clone(doc) as Record<string, unknown>;
}

/**
 * Renders TipTap/ProseMirror JSON document to HTML string.
 */
export function renderDocumentToHtml(content: Record<string, unknown>): string {
  const simpleWalk = (
    node: Record<string, unknown>,
    depth: number
  ): string => {
    const type = node.type as string;
    const content = (node.content as Record<string, unknown>[]) ?? [];
    const childHtml = content.map((c) => simpleWalk(c, depth + 1)).join('');
    if (type === 'doc') return childHtml;
    if (type === 'paragraph') return `<p>${childHtml || '<br>'}</p>`;
    if (type === 'heading') {
      const level =
        ((node.attrs as Record<string, unknown>)?.level as number) ?? 1;
      return `<h${level}>${childHtml}</h${level}>`;
    }
    if (type === 'text') {
      let t = (node.text as string) ?? '';
      const marks = (node.marks as { type: string }[]) ?? [];
      for (const m of marks) {
        if (m.type === 'bold') t = `<strong>${t}</strong>`;
        else if (m.type === 'italic') t = `<em>${t}</em>`;
        else if (m.type === 'underline') t = `<u>${t}</u>`;
      }
      return t;
    }
    if (type === 'mention') {
      const a = node.attrs as Record<string, unknown>;
      return `<span class="rounded bg-muted px-1 font-medium text-primary">#${a?.label ?? a?.id ?? ''}</span>`;
    }
    return childHtml;
  };
  return simpleWalk(content, 0);
}
