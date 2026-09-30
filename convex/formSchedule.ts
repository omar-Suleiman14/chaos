// Pure schedule helpers shared by the Convex backend and the Next.js client.
// No Convex imports. A schedule is stored as two UTC epoch-millisecond
// instants (`opensAt`, `closesAt`) plus the IANA time zone the creator chose
// (`timezone`). The instants are what the server enforces, so the zone never
// changes when a form opens or closes; it only decides how the times are
// entered and shown. Schedules saved before zones existed have no `timezone`
// and keep working: their instants are unchanged.

export interface ScheduleSettings { opensAt?: number; closesAt?: number; timezone?: string }
export type ScheduleState = "not_open" | "open" | "closed";

/** Server rule: open from `opensAt` (inclusive) until `closesAt` (exclusive), compared in UTC. */
export function scheduleState(s: ScheduleSettings, now: number): ScheduleState {
  if (s.opensAt !== undefined && now < s.opensAt) return "not_open";
  if (s.closesAt !== undefined && now >= s.closesAt) return "closed";
  return "open";
}

export function isValidTimeZone(zone: string): boolean {
  if (!zone || zone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** The zone's offset from UTC, in milliseconds, at the given instant. */
export function zoneOffsetMs(instant: number, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * Convert a wall-clock time ("2026-03-08T09:30", as a datetime-local input
 * gives it) in `zone` to a UTC instant. Around daylight saving changes:
 * a wall time that does not exist (clocks jump forward) resolves to the
 * moment just after the jump; a wall time that happens twice (clocks go
 * back) resolves to the first occurrence.
 */
export function localToUtc(local: string, zone: string): number | undefined {
  const m = LOCAL.exec(local);
  if (!m || !isValidTimeZone(zone)) return undefined;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  if (Number.isNaN(wall) || new Date(wall).getUTCMonth() !== mo - 1) return undefined;
  const candidates = new Set<number>();
  for (const probe of [wall - 86_400_000, wall, wall + 86_400_000]) candidates.add(wall - zoneOffsetMs(probe, zone));
  // A candidate is valid when the zone shows the requested wall time at that instant.
  const valid = [...candidates].filter((t) => t + zoneOffsetMs(t, zone) === wall).sort((a, b) => a - b);
  if (valid.length) return valid[0];
  // Nonexistent wall time: use the offset that applies before the jump, which lands just after it.
  return wall - zoneOffsetMs(wall - 86_400_000, zone);
}

/** The wall-clock value a datetime-local input needs for `instant` in `zone`. */
export function utcToLocal(instant: number, zone: string): string {
  return new Date(instant + zoneOffsetMs(instant, zone)).toISOString().slice(0, 16);
}

/** "UTC+03:00" style offset label for a zone at an instant. */
export function offsetLabel(instant: number, zone: string): string {
  const off = Math.round(zoneOffsetMs(instant, zone) / 60_000);
  const sign = off < 0 ? "-" : "+";
  const abs = Math.abs(off);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/** "29 Sep 2026, 14:30 (Asia/Riyadh, UTC+03:00)". Falls back to the viewer's zone when the schedule has none. */
export function formatScheduleTime(instant: number, zone: string | undefined, locale = "en"): string {
  const tz = zone && isValidTimeZone(zone) ? zone : undefined;
  const text = new Intl.DateTimeFormat(locale, { timeZone: tz, dateStyle: "medium", timeStyle: "short", hourCycle: "h23", numberingSystem: "latn" }).format(new Date(instant));
  const name = tz ?? new Intl.DateTimeFormat("en-US").resolvedOptions().timeZone;
  return `${text} (${name}, ${offsetLabel(instant, name)})`;
}
