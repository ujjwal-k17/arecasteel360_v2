/**
 * Field-level input validation for inventory fields.
 *
 * Rules:
 *  - thickness: numeric, max 3 decimal places
 *  - length: either the letter "C" (case-insensitive) or a numeric value
 *  - gross_weight / net_weight: integers only (no decimals)
 */

/** Returns true if the value is acceptable for the given field. */
export function isFieldValueValid(field: string, value: string): boolean {
  if (value === '') return true; // allow clearing

  switch (field) {
    case 'thickness': {
      // Must be a valid number with at most 3 decimal places
      if (!/^-?\d*\.?\d{0,3}$/.test(value)) return false;
      return !isNaN(Number(value));
    }
    case 'length':
      return true;
    case 'gross_weight':
    case 'net_weight': {
      // Integer only – no decimal point allowed
      return /^\d*$/.test(value);
    }
    default:
      return true;
  }
}

/** Sanitise / coerce a raw string to the right DB-ready value for insert/update. */
export function coerceFieldValue(field: string, raw: string): string | number | null {
  if (raw === '' || raw === null || raw === undefined) return null;

  switch (field) {
    case 'thickness':
      return raw ? Number(Number(raw).toFixed(3)) : null;
    case 'length':
      return /^[cC]$/.test(raw) ? raw.toUpperCase() : raw ? Number(raw) : null;
    case 'gross_weight':
    case 'net_weight':
      return raw ? Math.round(Number(raw)) : null;
    default:
      return raw;
  }
}

/** Fields that need special validation (used to decide input type). */
export const VALIDATED_FIELDS = ['thickness', 'length', 'gross_weight', 'net_weight'];
