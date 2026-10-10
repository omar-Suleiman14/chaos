/** Only decode explicit, strictly shaped connector references. Parsing never grants access. */
export type ResourceRefKind = "form" | "quiz" | "lesson" | "collection" | "source";

const PREFIXED_RESOURCE = /^(form|quiz|lesson|collection|source)_([A-Za-z0-9]+)$/;

/** Return a raw Convex ID after validating the prefix; the caller still normalizes and authorizes it. */
export function parseResourceRef(ref: string, expected: ResourceRefKind): string | null {
  const match = PREFIXED_RESOURCE.exec(ref);
  return match?.[1] === expected ? match[2] : null;
}
