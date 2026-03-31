import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Deduplicate strings case-insensitively, keeping the first occurrence's casing */
export function uniqueCaseInsensitive(values: string[]): string[] {
  const seen = new Map<string, string>();
  for (const v of values) {
    const lower = v.toLowerCase();
    if (!seen.has(lower)) seen.set(lower, v);
  }
  return [...seen.values()].sort((a, b) => {
    const na = Number(a), nb = Number(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });
}

/** Case-insensitive string comparison */
export function eqCI(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** Normalize coating: "80 gsm" → "80gsm", "120 GSM" → "120gsm" etc. */
export function normalizeCoating(val: string | null | undefined): string {
  if (!val) return '';
  return val.replace(/(\d+)\s+gsm/gi, '$1gsm');
}
