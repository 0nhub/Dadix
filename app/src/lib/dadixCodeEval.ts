/**
 * Dadix Code – eigene Syntax für Formeln in Dadix.
 * Zahlen: +, -, *, /, %, (), .feld oder #feld.
 * Variablen: name = 10  oder  name = "text"  oder  name = .feld.
 * Strings: Literaltext nur in Anführungszeichen. Konkatenation: "Text " .feld " mehr " variable
 * Datum/Zeit: today(), now(), today(-1), today(year), today(month), today(week), today(time), today(hour), today(min)
 */

import type { Field } from '@/types';
import { UserLocalStorage } from '@/lib/userLocalStorage';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Format a date using user's date format (DD.MM.YYYY etc.). */
function formatDateWithUserFormat(d: Date): string {
  const format = typeof window !== 'undefined' ? UserLocalStorage.getDateFormat() : 'DD.MM.YYYY';
  const dd = d.getDate();
  const mm = d.getMonth() + 1;
  const yyyy = d.getFullYear();
  return format
    .replace('DD', pad2(dd))
    .replace('MM', pad2(mm))
    .replace('YYYY', String(yyyy));
}

/** Format time hh:mm (24h) or h:mm AM/PM (12h) from user setting. */
function formatTimeWithUserFormat(d: Date): string {
  const mode = typeof window !== 'undefined' ? UserLocalStorage.getTimeFormat() : '24h';
  const h = d.getHours();
  const min = d.getMinutes();
  if (mode === '12h') {
    const h12 = h % 12 || 12;
    const ampm = h < 12 ? 'AM' : 'PM';
    return `${h12}:${pad2(min)} ${ampm}`;
  }
  return `${pad2(h)}:${pad2(min)}`;
}

/** ISO-like week number (week 1 = week containing Jan 1). */
function getWeekNumber(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  const diff = (d.getTime() - start.getTime()) / 86400000;
  return Math.ceil((diff + start.getDay() + 1) / 7);
}

export class DadixSyntaxError extends Error {
  constructor(message = 'Syntax error') {
    super(message);
    this.name = 'DadixSyntaxError';
  }
}

/**
 * Ersetzt #fieldName im Ausdruck durch den aktuellen Zellwert (für Legacy/parseFormula).
 */
export function substituteCodeFields({
  code,
  record,
  fields,
}: {
  code: string;
  record: Record<string, unknown>;
  fields: Field[];
}): string {
  let result = code;
  const sorted = [...fields].sort(
    (a, b) => b.name.length - a.name.length
  );
  for (const field of sorted) {
    const placeholder = `#${field.name}`;
    const raw = record[field.name];
    const value =
      raw === null || raw === undefined
        ? 0
        : typeof raw === 'number' && !Number.isNaN(raw)
          ? raw
          : Number(raw);
    const num = Number.isNaN(value) ? 0 : value;
    result = result.split(placeholder).join(String(num));
  }
  return result;
}

const TOKEN = {
  NUMBER: 'NUMBER',
  STRING: 'STRING',
  IDENTIFIER: 'IDENTIFIER',
  FIELD_REF: 'FIELD_REF',
  SPACE: 'SPACE',
  NEWLINE: 'NEWLINE',
  RAW: 'RAW',
  EQUALS: 'EQUALS',
  PLUS: 'PLUS',
  MINUS: 'MINUS',
  STAR: 'STAR',
  SLASH: 'SLASH',
  PERCENT: 'PERCENT',
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',
  EOF: 'EOF',
} as const;

type TokenType = (typeof TOKEN)[keyof typeof TOKEN];

interface Token {
  type: TokenType;
  value?: number | string;
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = expr.length;

  while (i < n) {
    const c = expr[i];
    if (/\s/.test(c)) {
      while (i < n && /\s/.test(expr[i])) {
        if (expr[i] === '\n' || expr[i] === '\r') {
          tokens.push({ type: TOKEN.NEWLINE });
          if (expr[i] === '\r' && i + 1 < n && expr[i + 1] === '\n') i += 2;
          else i++;
        } else {
          let spaces = '';
          while (i < n && /\s/.test(expr[i]) && expr[i] !== '\n' && expr[i] !== '\r') {
            spaces += expr[i];
            i++;
          }
          if (spaces) tokens.push({ type: TOKEN.SPACE, value: spaces });
        }
      }
      continue;
    }
    if (c === '"') {
      let s = '';
      i++;
      while (i < n && expr[i] !== '"') {
        if (expr[i] === '\\') {
          i++;
          if (i < n) s += expr[i++];
        } else {
          s += expr[i++];
        }
      }
      if (i < n) i++;
      tokens.push({ type: TOKEN.STRING, value: s });
      continue;
    }
    if (c === '#') {
      i++;
      let name = '';
      while (i < n && /[a-zA-Z0-9_]/.test(expr[i])) {
        name += expr[i];
        i++;
      }
      tokens.push({ type: TOKEN.FIELD_REF, value: name });
      continue;
    }
    if (c === '=') {
      tokens.push({ type: TOKEN.EQUALS });
      i++;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let name = '';
      while (i < n && /[a-zA-Z0-9_]/.test(expr[i])) {
        name += expr[i];
        i++;
      }
      tokens.push({ type: TOKEN.IDENTIFIER, value: name });
      continue;
    }
    if (c === '+') {
      tokens.push({ type: TOKEN.PLUS });
      i++;
      continue;
    }
    if (c === '-') {
      tokens.push({ type: TOKEN.MINUS });
      i++;
      continue;
    }
    if (c === '*') {
      tokens.push({ type: TOKEN.STAR });
      i++;
      continue;
    }
    if (c === '/') {
      tokens.push({ type: TOKEN.SLASH });
      i++;
      continue;
    }
    if (c === '%') {
      tokens.push({ type: TOKEN.PERCENT });
      i++;
      continue;
    }
    if (c === '(') {
      tokens.push({ type: TOKEN.LPAREN });
      i++;
      continue;
    }
    if (c === ')') {
      tokens.push({ type: TOKEN.RPAREN });
      i++;
      continue;
    }
    if (c === '.' && i + 1 < n && /[a-zA-Z_]/.test(expr[i + 1])) {
      i++;
      let name = '';
      while (i < n && /[a-zA-Z0-9_]/.test(expr[i])) {
        name += expr[i];
        i++;
      }
      tokens.push({ type: TOKEN.FIELD_REF, value: name });
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let num = '';
      while (i < n && /[0-9.]/.test(expr[i])) {
        num += expr[i];
        i++;
      }
      const value = parseFloat(num);
      tokens.push({ type: TOKEN.NUMBER, value: Number.isNaN(value) ? 0 : value });
      continue;
    }
    if (!/[\s"#=a-zA-Z0-9_+\-*/%()]/.test(c)) {
      let raw = '';
      while (i < n && !/\s/.test(expr[i])) {
        raw += expr[i];
        i++;
      }
      tokens.push({ type: TOKEN.RAW, value: raw });
      continue;
    }
    i++;
  }
  tokens.push({ type: TOKEN.EOF });
  return tokens;
}

/** Nur Anführungszeichen-Strings, Variablen (IDENTIFIER), Zahlen, Feldreferenzen. Kein ungequoteter Text. */
function isStringPart(t: Token): boolean {
  return (
    t.type === TOKEN.STRING ||
    t.type === TOKEN.IDENTIFIER ||
    t.type === TOKEN.NUMBER ||
    t.type === TOKEN.FIELD_REF
  );
}

export type DadixButtonCallbacks = {
  onAlert?: (message: string) => void;
  onFieldSet?: (fieldName: string, value: string | number) => void;
};

export function evalDadixCode({
  code,
  record,
  fields,
  onAlert,
  onFieldSet,
}: {
  code: string;
  record: Record<string, unknown>;
  fields: Field[];
  onAlert?: (message: string) => void;
  onFieldSet?: (fieldName: string, value: string | number) => void;
}): string {
  try {
    const safeCode = typeof code === 'string' ? code : '';
    const rec = record != null && typeof record === 'object' ? record : {};
    const expr = safeCode.trim();
    if (!expr) return '';

    const tokens = tokenize(expr);
    let pos = 0;
    const variables = new Map<string, number | string>();

    function current(): Token {
      return tokens[pos] ?? { type: TOKEN.EOF };
    }

    function consume(): Token {
      const t = current();
      if (t.type !== TOKEN.EOF) pos++;
      return t;
    }

    /**
     * Parses today(...) or now(...). Call when current() is IDENTIFIER "today" or "now".
     * Consumes the full call. Returns string (formatted date/time) or number (year, month, week, hour, min).
     */
    function parseTodayNowCall(): string | number {
      const fn = current();
      if (fn.type !== TOKEN.IDENTIFIER || (fn.value !== 'today' && fn.value !== 'now')) {
        throw new DadixSyntaxError('Expected today or now');
      }
      consume();
      skipSpaces();
      if (current().type !== TOKEN.LPAREN) throw new DadixSyntaxError('Expected ( after today/now');
      consume();
      skipSpaces();
      const base = new Date();

      if (current().type === TOKEN.RPAREN) {
        consume();
        return formatDateWithUserFormat(base);
      }

      if (current().type === TOKEN.NUMBER || current().type === TOKEN.MINUS || current().type === TOKEN.PLUS) {
        const dayOffset = Math.round(parseExpression());
        if (current().type !== TOKEN.RPAREN) throw new DadixSyntaxError('Expected ) after today/now offset');
        consume();
        const d = new Date(base);
        d.setDate(d.getDate() + dayOffset);
        return formatDateWithUserFormat(d);
      }

      if (current().type === TOKEN.IDENTIFIER && typeof current().value === 'string') {
        const key = (current().value as string).toLowerCase();
        consume();
        skipSpaces();
        if (key === 'year') {
          if (current().type !== TOKEN.RPAREN) throw new DadixSyntaxError('Expected ) after today(year)');
          consume();
          return base.getFullYear();
        }
        if (key === 'month') {
          let offset = 0;
          if (current().type === TOKEN.PLUS || current().type === TOKEN.MINUS) {
            consume();
            offset = Math.round(parseExpression());
          }
          if (current().type !== TOKEN.RPAREN) throw new DadixSyntaxError('Expected ) after today(month)');
          consume();
          const month1Based = base.getMonth() + 1;
          return month1Based + offset;
        }
        if (key === 'week') {
          if (current().type !== TOKEN.RPAREN) throw new DadixSyntaxError('Expected ) after today(week)');
          consume();
          return getWeekNumber(base);
        }
        if (key === 'time') {
          if (current().type !== TOKEN.RPAREN) throw new DadixSyntaxError('Expected ) after today(time)');
          consume();
          return formatTimeWithUserFormat(base);
        }
        if (key === 'hour') {
          if (current().type !== TOKEN.RPAREN) throw new DadixSyntaxError('Expected ) after today(hour)');
          consume();
          return base.getHours();
        }
        if (key === 'min') {
          if (current().type !== TOKEN.RPAREN) throw new DadixSyntaxError('Expected ) after today(min)');
          consume();
          return base.getMinutes();
        }
        throw new DadixSyntaxError(`Unknown today/now argument: ${key}`);
      }

      throw new DadixSyntaxError('Invalid today/now argument');
    }

    /** String-Konkatenation: nur "..." für Literaltext, .feld und Variablen dazwischen. Stopp bei Zeilenumbruch. */
    function parseStringExpr(): string {
      let s = '';
      for (;;) {
        skipSpacesOnly();
        if (!isStringPart(current())) break;
        const t = current();
        if (t.type === TOKEN.IDENTIFIER && (t.value === 'today' || t.value === 'now')) {
          const v = parseTodayNowCall();
          s += String(v);
          continue;
        }
        consume();
        if (t.type === TOKEN.STRING && typeof t.value === 'string') {
          s += t.value;
        } else if (t.type === TOKEN.IDENTIFIER && typeof t.value === 'string') {
          // Bare identifier: first try record field (e.g. .fieldName), then variable
          const recordVal = rec[t.value];
          if (recordVal !== undefined && recordVal !== null) {
            s += String(recordVal);
          } else {
            const v = variables.get(t.value);
            s += v !== undefined && v !== null ? String(v) : '';
          }
        } else if (t.type === TOKEN.NUMBER && t.value !== undefined) {
          s += String(typeof t.value === 'number' ? t.value : 0);
        } else if (t.type === TOKEN.FIELD_REF && typeof t.value === 'string') {
          const raw = rec[t.value];
          s += raw !== undefined && raw !== null ? String(raw) : '';
        }
      }
      return s;
    }

    function parseExpression(): number {
      let left = parseTerm();
      for (;;) {
        skipSpaces();
        const t = current();
        if (t.type === TOKEN.PLUS) {
          consume();
          skipSpaces();
          left = left + parseTerm();
        } else if (t.type === TOKEN.MINUS) {
          consume();
          skipSpaces();
          left = left - parseTerm();
        } else break;
      }
      return left;
    }

    function parseTerm(): number {
      let left = parseFactor();
      for (;;) {
        skipSpaces();
        const t = current();
        if (t.type === TOKEN.STAR) {
          consume();
          skipSpaces();
          left = left * parseFactor();
        } else if (t.type === TOKEN.SLASH) {
          consume();
          skipSpaces();
          const right = parseFactor();
          left = right === 0 ? 0 : left / right;
        } else if (t.type === TOKEN.PERCENT) {
          consume();
          skipSpaces();
          const right = parseFactor();
          left = right === 0 ? 0 : left % right;
        } else break;
      }
      return left;
    }

    function parseFactor(): number {
      skipSpaces();
      const t = current();
      if (t.type === TOKEN.NUMBER && t.value !== undefined) {
        consume();
        return typeof t.value === 'number' ? t.value : 0;
      }
      if (t.type === TOKEN.IDENTIFIER && (t.value === 'today' || t.value === 'now')) {
        const v = parseTodayNowCall();
        return typeof v === 'number' ? v : 0;
      }
      if (t.type === TOKEN.IDENTIFIER && typeof t.value === 'string') {
        consume();
        const v = variables.get(t.value);
        if (typeof v === 'number') return v;
        const n = Number(v);
        return Number.isNaN(n) ? 0 : n;
      }
      if (t.type === TOKEN.FIELD_REF && typeof t.value === 'string') {
        consume();
        const raw = rec[t.value];
        const n = Number(raw);
        return Number.isNaN(n) ? 0 : n;
      }
      if (t.type === TOKEN.MINUS) {
        consume();
        return -parseFactor();
      }
      if (t.type === TOKEN.PLUS) {
        consume();
        return parseFactor();
      }
      if (t.type === TOKEN.LPAREN) {
        consume();
        const v = parseExpression();
        if (current().type === TOKEN.RPAREN) consume();
        return v;
      }
      if (t.type !== TOKEN.EOF) {
        throw new DadixSyntaxError('Unexpected token');
      }
      return 0;
    }

    function skipSpaces(): void {
      while (current().type === TOKEN.SPACE || current().type === TOKEN.NEWLINE) consume();
    }

    /** Nur Leerzeichen überspringen, keine Zeilenumbrüche – damit String-Ausdrücke bei Zeilenende stoppen. */
    function skipSpacesOnly(): void {
      while (current().type === TOKEN.SPACE) consume();
    }

    /** Prüft, ob die rechte Seite von = ein Zahlausdruck ist (z. B. 23*12 oder x+1). */
    function rhsLooksLikeNumberExpression(): boolean {
      const t = current();
      if (t.type === TOKEN.NUMBER || t.type === TOKEN.MINUS || t.type === TOKEN.LPAREN) return true;
      if (t.type === TOKEN.IDENTIFIER) {
        const save = pos;
        consume();
        skipSpaces();
        const next = current().type;
        pos = save;
        return [TOKEN.PLUS, TOKEN.MINUS, TOKEN.STAR, TOKEN.SLASH, TOKEN.PERCENT, TOKEN.LPAREN, TOKEN.NUMBER].includes(next);
      }
      return false;
    }

    /** Ein Statement: alert(), .field = value, Zuweisung (Zahl oder String) oder Ausdruck. */
    function parseStatement(): number | string {
      skipSpaces();
      const t = current();
      // alert( message )
      if (
        onAlert &&
        t.type === TOKEN.IDENTIFIER &&
        typeof t.value === 'string' &&
        t.value === 'alert'
      ) {
        consume();
        skipSpaces();
        if (current().type !== TOKEN.LPAREN) throw new DadixSyntaxError('Expected ( after alert');
        consume();
        skipSpaces();
        const msg = isStringPart(current()) ? parseStringExpr() : String(parseExpression());
        skipSpaces();
        if (current().type !== TOKEN.RPAREN) throw new DadixSyntaxError('Expected ) after alert argument');
        consume();
        onAlert(msg);
        return msg;
      }
      // .fieldName = value  (set record field)
      if (onFieldSet && t.type === TOKEN.FIELD_REF && typeof t.value === 'string') {
        const fieldName = t.value;
        consume();
        skipSpaces();
        if (current().type !== TOKEN.EQUALS) throw new DadixSyntaxError('Expected = after .field');
        consume();
        skipSpaces();
        let value: string | number;
        if (rhsLooksLikeNumberExpression()) {
          value = parseExpression();
        } else if (isStringPart(current())) {
          value = parseStringExpr();
        } else {
          value = parseExpression();
        }
        onFieldSet(fieldName, value);
        return value;
      }
      if (t.type === TOKEN.IDENTIFIER && typeof t.value === 'string') {
        const name = t.value;
        const posBeforeIdent = pos;
        consume();
        skipSpaces();
        if (current().type === TOKEN.EQUALS) {
          consume();
          skipSpaces();
          if (rhsLooksLikeNumberExpression()) {
            const value = parseExpression();
            variables.set(name, value);
            return value;
          }
          if (isStringPart(current())) {
            const value = parseStringExpr();
            variables.set(name, value);
            return value;
          }
          const value = parseExpression();
          variables.set(name, value);
          return value;
        }
        pos = posBeforeIdent;
        if (isStringPart(current())) return parseStringExpr();
        return parseExpression();
      }
      if (t.type === TOKEN.NUMBER || t.type === TOKEN.MINUS || t.type === TOKEN.LPAREN) return parseExpression();
      if (isStringPart(current())) return parseStringExpr();
      return parseExpression();
    }

    let result: number | string = 0;
    const maxStatements = 10000;
    let statements = 0;
    while (current().type !== TOKEN.EOF && statements < maxStatements) {
      result = parseStatement();
      statements++;
    }
    return String(result);
  } catch (e) {
    if (e instanceof DadixSyntaxError) throw e;
    return '';
  }
}

export type ValidateDadixCodeResult =
  | { valid: true; result: string }
  | { valid: false; result: ''; error?: string };

/**
 * Prüft, ob der Code syntaktisch sauber ist und ausgeführt werden kann.
 * Wenn valid: true → Ergebnis kann verwendet werden.
 * Wenn valid: false → Code wird nicht ausgeführt, bleibt in der Sandbox (result ist leer).
 */
export function validateDadixCode({
  code,
  record,
  fields,
}: {
  code: string;
  record: Record<string, unknown>;
  fields: Field[];
}): ValidateDadixCodeResult {
  try {
    const safeCode = typeof code === 'string' ? code : '';
    const safeRecord = record != null && typeof record === 'object' ? record : {};
    const safeFields = Array.isArray(fields) ? fields : [];
    const result = evalDadixCode({
      code: safeCode,
      record: safeRecord,
      fields: safeFields,
    });
    return { valid: true, result: typeof result === 'string' ? result : String(result) };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { valid: false, result: '', error };
  }
}
