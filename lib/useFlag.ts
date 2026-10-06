"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { FLAGS, type FlagKey } from "@/lib/flags";

/**
 * A feature flag's value for the signed-in person. Every caller shares one
 * `flags:mine` subscription; until it answers, the flag's default applies, so a
 * flag never blocks a render.
 */
export function useFlag(key: FlagKey): boolean {
  const flags = useQuery(api.flags.mine, {});
  return flags?.[key] ?? FLAGS[key].defaultValue;
}
