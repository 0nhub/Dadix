export type CsvParseOptions = {
  delimiter?: ',' | ';' | '\t';
  firstLineIsHeader?: boolean;
  quoteChar?: '"' | "'";
};

/**
 * Parse CSV text into headers and rows.
 * If options are provided, use them; otherwise auto-detect delimiter and assume first line is header.
 */
export function parseCsvText(
  text: string,
  options?: CsvParseOptions
): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) return { headers: [], rows: [] };

  const firstLine = lines[0];
  const delimiter =
    options?.delimiter ?? (detectDelimiter(firstLine) as ',' | ';' | '\t');
  const firstLineIsHeader = options?.firstLineIsHeader ?? true;

  let headers: string[];
  const rows: string[][] = [];

  const quoteChar = options?.quoteChar ?? '"';
  if (firstLineIsHeader && lines.length > 0) {
    headers = parseCsvLine(lines[0], delimiter, quoteChar);
    for (let i = 1; i < lines.length; i++) {
      rows.push(parseCsvLine(lines[i], delimiter, quoteChar));
    }
  } else {
    headers = lines[0]
      ? parseCsvLine(lines[0], delimiter, quoteChar).map((_, i) => `Column ${i + 1}`)
      : [];
    for (let i = 0; i < lines.length; i++) {
      rows.push(parseCsvLine(lines[i], delimiter, quoteChar));
    }
  }

  return { headers, rows };
}

function detectDelimiter(line: string): string {
  const comma = (line.match(/,/g) || []).length;
  const semicolon = (line.match(/;/g) || []).length;
  const tab = (line.match(/\t/g) || []).length;
  if (tab >= comma && tab >= semicolon && tab > 0) return '\t';
  if (semicolon >= comma && semicolon > 0) return ';';
  return ',';
}

function parseCsvLine(line: string, delimiter: string, quoteChar: string = '"'): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === quoteChar) {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && c === delimiter) {
      result.push(current.trim());
      current = '';
      continue;
    }
    current += c;
  }
  result.push(current.trim());
  return result;
}

/** Encoding label for FileReader.readAsText (e.g. UTF-8, windows-1252). */
export function readFileAsText(file: File, encoding: string = 'UTF-8'): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, encoding);
  });
}
