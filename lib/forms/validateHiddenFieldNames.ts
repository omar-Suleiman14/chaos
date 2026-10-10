import { HIDDEN_FIELD_LIMITS, hiddenFieldNameError } from "../../convex/formRespondent";

/** Validation only: the server remains authoritative for hidden-field admission. */
export function validateHiddenFieldNames(names: string[]): { kind: "too-many" } | { kind: "invalid" | "duplicate"; name: string } | null {
  if (names.length > HIDDEN_FIELD_LIMITS.count) return { kind: "too-many" };
  const bad = names.find(name => hiddenFieldNameError(name));
  if (bad) return { kind: "invalid", name: bad };
  const dupe = names.find((name, i) => names.findIndex(other => other.toLowerCase() === name.toLowerCase()) !== i);
  return dupe ? { kind: "duplicate", name: dupe } : null;
}
