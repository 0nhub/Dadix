import type { NumberFieldOptions } from '@/types';

/**
 * Format a number for display using field numberOptions.
 */
export function formatNumber(
  value: number | null | undefined,
  options?: NumberFieldOptions | null
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '';
  }
  const num = Number(value);
  const thousands = options?.thousandsSeparator ?? 'none';
  const decimalPlaces = Math.max(0, Math.min(20, options?.decimalPlaces ?? 0));
  const decimalSep = options?.decimalSeparator === 'comma' ? ',' : '.';
  const prefix = options?.prefix ?? '';
  const suffix = options?.suffix ?? '';

  const fixed = decimalPlaces === 0
    ? String(Math.round(num))
    : num.toFixed(decimalPlaces);
  const [intPart, decPart] = fixed.split('.');

  const thousandsChar =
    thousands === 'point'
      ? '.'
      : thousands === 'comma'
        ? ','
        : thousands === 'space'
          ? '\u00A0'
          : '';
  let formattedInt = intPart;
  if (thousandsChar && intPart.length > 3) {
    const neg = intPart.startsWith('-') ? '-' : '';
    const abs = neg ? intPart.slice(1) : intPart;
    const rest = abs.length % 3 || 3;
    const groups = [abs.slice(0, rest), ...abs.slice(rest).match(/.{1,3}/g ?? [])];
    formattedInt = neg + groups.join(thousandsChar);
  }

  const formattedDec =
    decimalPlaces > 0 && decPart != null
      ? decimalSep + decPart
      : '';

  return `${prefix}${formattedInt}${formattedDec}${suffix}`;
}
