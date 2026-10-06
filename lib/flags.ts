/**
 * Feature flags. Every flag is declared here with an owner and, unless it is an
 * operational kill switch, an expiry date: a flag is a temporary ramp, not a
 * permanent fork in the code. `pnpm flags:check` (weekly in CI) warns before a
 * flag expires and fails once it has, so ramps get cleaned up instead of
 * becoming flag debt (docs/feature-flags.md).
 *
 * Rollout state lives in Convex (`featureRollouts`, set by administrators with
 * `flags:setRollout`); this file decides which flags exist and their defaults.
 * Rows for flags removed from this file are swept by `maintenance:sweep`.
 */

export type FlagKind = "release" | "experiment" | "ops";

export type FlagDefinition = {
  description: string;
  owner: string;
  kind: FlagKind;
  /** ISO date the flag was added. */
  createdAt: string;
  /** ISO date by which the flag is removed. Required for release and experiment flags (90 days at most). */
  expiresAt?: string;
  /** Value when no rollout row exists, and for signed-out visitors unless the rollout is at 100%. */
  defaultValue: boolean;
};

export const FLAGS = {
  "editor.new": {
    description: "The new form editor.",
    owner: "Omar Suleiman",
    kind: "release",
    createdAt: "2026-10-06",
    expiresAt: "2027-01-04",
    defaultValue: false,
  },
  "dashboard.redesign": {
    description: "The redesigned dashboard library.",
    owner: "Omar Suleiman",
    kind: "release",
    createdAt: "2026-10-06",
    expiresAt: "2027-01-04",
    defaultValue: false,
  },
  "live.changes": {
    description: "Changes to Live game hosting and the player screen.",
    owner: "Omar Suleiman",
    kind: "release",
    createdAt: "2026-10-06",
    expiresAt: "2027-01-04",
    defaultValue: false,
  },
  "caching.changes": {
    description: "Changes to the confirmed-query workspace cache (lib/confirmedQuery.ts).",
    owner: "Omar Suleiman",
    kind: "release",
    createdAt: "2026-10-06",
    expiresAt: "2027-01-04",
    defaultValue: false,
  },
  "learn.architecture": {
    description: "The next Learn data architecture for lessons and courses.",
    owner: "Omar Suleiman",
    kind: "release",
    createdAt: "2026-10-06",
    expiresAt: "2027-01-04",
    defaultValue: false,
  },
  "mcp.changes": {
    description: "MCP tool behaviour changes, checked in the Convex MCP handlers.",
    owner: "Omar Suleiman",
    kind: "release",
    createdAt: "2026-10-06",
    expiresAt: "2027-01-04",
    defaultValue: false,
  },
} as const satisfies Record<string, FlagDefinition>;

export type FlagKey = keyof typeof FLAGS;
export const FLAG_KEYS = Object.keys(FLAGS) as FlagKey[];
export const isFlagKey = (key: string): key is FlagKey => Object.hasOwn(FLAGS, key);

export type Rollout = { percent: number; allow: string[] };

/** Stable 0–99 bucket for a person and flag (FNV-1a), so a ramp from 10% to 20% keeps the first 10%. */
export function flagBucket(key: string, userId: string): number {
  let hash = 0x811c9dc5;
  for (const char of `${key}:${userId}`) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 100;
}

/** A flag's value for one person (null when signed out). */
export function evaluateFlag(key: FlagKey, rollout: Rollout | null, userId: string | null): boolean {
  if (!rollout) return FLAGS[key].defaultValue;
  if (rollout.percent >= 100) return true;
  if (!userId) return FLAGS[key].defaultValue;
  if (rollout.allow.includes(userId)) return true;
  return flagBucket(key, userId) < rollout.percent;
}

export const defaultFlags = (): Record<FlagKey, boolean> =>
  Object.fromEntries(FLAG_KEYS.map((key) => [key, FLAGS[key].defaultValue])) as Record<FlagKey, boolean>;

const DAY_MS = 86_400_000;
export const MAX_RAMP_DAYS = 90;
export const EXPIRY_WARNING_DAYS = 14;

export type FlagFinding = { key: string; level: "error" | "warning"; message: string };

/** Expiry policy, as a pure function of the registry and today's date. */
export function auditFlags(flags: Record<string, FlagDefinition>, today: Date): FlagFinding[] {
  const findings: FlagFinding[] = [];
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  for (const [key, flag] of Object.entries(flags)) {
    const created = Date.parse(flag.createdAt);
    if (Number.isNaN(created)) findings.push({ key, level: "error", message: `createdAt "${flag.createdAt}" is not a date` });
    if (flag.kind === "ops") continue;
    if (!flag.expiresAt) { findings.push({ key, level: "error", message: `${flag.kind} flags need an expiresAt date` }); continue; }
    const expires = Date.parse(flag.expiresAt);
    if (Number.isNaN(expires)) { findings.push({ key, level: "error", message: `expiresAt "${flag.expiresAt}" is not a date` }); continue; }
    if (expires - created > MAX_RAMP_DAYS * DAY_MS) findings.push({ key, level: "error", message: `lives longer than ${MAX_RAMP_DAYS} days; ship it or make it an ops flag` });
    const days = Math.round((expires - now) / DAY_MS);
    if (days < 0) findings.push({ key, level: "error", message: `expired ${-days} day${days === -1 ? "" : "s"} ago (${flag.expiresAt}); remove the flag and the losing code path` });
    else if (days <= EXPIRY_WARNING_DAYS) findings.push({ key, level: "warning", message: `expires in ${days} day${days === 1 ? "" : "s"} (${flag.expiresAt}); owner: ${flag.owner}` });
  }
  return findings;
}
