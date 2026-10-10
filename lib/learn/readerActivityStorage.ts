/** Existing per-viewer, per-version reader activity format. No migration is required. */
export function readReaderActivities<T>(storage: Pick<Storage, "getItem">, key: string): Record<string, T> {
  try { return JSON.parse(storage.getItem(key) ?? "{}") as Record<string, T>; }
  catch { return {}; }
}

/** Persist best-effort: completion is still recorded in memory when storage is unavailable. */
export function saveReaderActivity<T extends { kind: string; id: string }>(
  storage: Pick<Storage, "setItem">, key: string, current: Record<string, T>, activity: T,
): Record<string, T> {
  const next = { ...current, [`${activity.kind}:${activity.id}`]: activity };
  try { storage.setItem(key, JSON.stringify(next)); } catch { /* device storage unavailable */ }
  return next;
}
