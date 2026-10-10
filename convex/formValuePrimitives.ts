// ── Number, date and time helpers ───────────────────────────────────────────
// Numbers are stored as plain JSON numbers (dot decimal, no grouping), dates as
// "YYYY-MM-DD" and times as "HH:mm". None of them depend on the respondent's
// locale or time zone; a date or time is exactly what the person picked.

export function isIsoDate(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(text)) && new Date(text).toISOString().slice(0, 10) === text;
}
export function isClockTime(text: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text);
}

function decimalPlaces(n: number): number {
  const [mantissa, exponent] = String(n).toLowerCase().split("e");
  const fraction = mantissa.split(".")[1]?.length ?? 0;
  return Math.max(0, fraction - Number(exponent ?? 0));
}

/** True when `value - base` is a whole multiple of `step`, computed on scaled integers so 0.3 passes a 0.1 step. */
export function isOnStep(value: number, step: number, base = 0): boolean {
  if (!(step > 0) || !Number.isFinite(value) || !Number.isFinite(base)) return false;
  const places = Math.max(decimalPlaces(value), decimalPlaces(step), decimalPlaces(base));
  if (places > 12) return false;
  const scale = 10 ** places;
  const diff = Math.round(value * scale) - Math.round(base * scale);
  return diff % Math.round(step * scale) === 0;
}

/**
 * Parse what someone typed into a number field. Accepts Western and Arabic-Indic
 * digits, "." or the Arabic decimal mark as the decimal mark and a single ","
 * as a decimal comma (when there is no "."). Returns undefined for empty text
 * and null for anything that is not a finite number, so invalid input is never
 * coerced to 0.
 */
export function parseNumberInput(input: string): number | undefined | null {
  let text = input.trim();
  if (!text) return undefined;
  text = text
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\u066B/g, ".")
    .replace(/\u2212/g, "-");
  if (!text.includes(".") && (text.match(/,/g)?.length ?? 0) === 1) text = text.replace(",", ".");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

