import type { FormField } from "./formLogic";

/** A scale's endpoints, for showing what the low and high ends of an answer mean. */
export function scaleInfo(f: FormField) {
  if (f.type !== "scale") return null;
  return { min: f.min ?? 1, max: f.max ?? 5, step: f.step ?? 1, minLabel: f.minLabel ?? null, maxLabel: f.maxLabel ?? null };
}

/** Export/column label; scales carry their endpoint labels, e.g. "How likely? (1 = Unlikely; 5 = Very likely)". */
export function columnLabel(f: FormField): string {
  const info = scaleInfo(f);
  if (!info || (!info.minLabel && !info.maxLabel)) return f.label;
  const ends = [info.minLabel ? `${info.min} = ${info.minLabel}` : "", info.maxLabel ? `${info.max} = ${info.maxLabel}` : ""].filter(Boolean).join("; ");
  return `${f.label} (${ends})`;
}

