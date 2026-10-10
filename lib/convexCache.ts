"use client";

import { useContext, useEffect } from "react";
import { CacheZone } from "@/lib/workspaceQueryAuth";
import { useQuery as useConvexQuery } from "convex/react";
import type { FunctionReference } from "convex/server";
import { getFunctionName } from "convex/server";
import { convexToJson, jsonToConvex } from "convex/values";
import type { Value } from "convex/values";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { convex } from "@/lib/convexClient";

/** How long a query stays subscribed after the last component using it unmounts. */
export const KEEP_ALIVE_MS = 5 * 60_000;
/** How long an intent prefetch (hover, touch, focus) keeps a query warm if nothing mounts it. */
const INTENT_MS = 30_000;
const retained = new Map<string, { users: number; release: () => void; timer?: ReturnType<typeof setTimeout> }>();

/**
 * `useQuery` from convex/react, plus: when the component unmounts, the subscription is kept
 * for a few minutes. Coming back to a page then renders from the
 * live local result in the same frame instead of showing a loader and waiting on the network.
 * The same idea as convex-helpers' ConvexQueryCacheProvider, without the extra dependency.
 */
export const useQuery = ((query: FunctionReference<"query">, ...rest: [Record<string, Value> | "skip"] | []) => {
  const zone = useContext(CacheZone);
  // Workspace-only: direct refresh can precede Convex token restoration.
  // Skip private reads until authenticated; public queries outside the workspace stay unchanged.
  const args = zone && !zone.authenticated ? "skip" : rest[0];
  const effective = args === undefined ? [] : [args];
  const result = useConvexQuery(query, ...(effective as [Record<string, Value>]));
  const key = args === "skip" ? null : JSON.stringify(convexToJson(args ?? {}));
  useEffect(() => {
    if (key === null || !convex) return;
    const cacheKey = `${getFunctionName(query)}:${key}`;
    let entry = retained.get(cacheKey);
    if (!entry) {
      entry = { users: 0, release: convex.watchQuery(query, jsonToConvex(JSON.parse(key)) as Record<string, Value>).onUpdate(() => {}) };
      retained.set(cacheKey, entry);
    }
    clearTimeout(entry.timer);
    entry.users++;
    const held = entry;
    return () => {
      if (--held.users !== 0) return;
      held.timer = setTimeout(() => { held.release(); retained.delete(cacheKey); }, KEEP_ALIVE_MS);
    };
  }, [query, key]);
  return result;
}) as typeof useConvexQuery;

/** Starts loading a query ahead of a likely navigation; a no-op without a Convex client. */
export function warmQuery<Q extends FunctionReference<"query">>(query: Q, args: Q["_args"], ms = INTENT_MS) {
  convex?.prewarmQuery({ query, args, extendSubscriptionFor: ms });
}

const warmed = new Map<string, number>();
function markWarm(key: string, now: number) {
  for (const [seen, time] of warmed) if (time <= now - 10_000) warmed.delete(seen);
  if (warmed.has(key)) return false;
  // Bound bookkeeping even if a long list generates thousands of intent events.
  if (warmed.size >= 500) warmed.delete(warmed.keys().next().value!);
  warmed.set(key, now);
  return true;
}

/** Warms the builder's data for a form, at most once every few seconds per form. */
export function warmForm(formId: Id<"forms"> | string) {
  const now = Date.now();
  if (!markWarm(formId, now)) return;
  warmQuery(api.forms.getFormForEditor, { formId: formId as Id<"forms"> });
}

/** Pointer/touch/focus handlers that warm a form's data when someone shows intent to open it. */
export function formIntentHandlers(formId: Id<"forms"> | string) {
  const warm = () => warmForm(formId);
  return { onPointerEnter: warm, onTouchStart: warm, onFocus: warm };
}

/**
 * Warms the first query of the page an in-app link opens: form builder,
 * course builder, lesson editor, public lesson or public course. Next's Link
 * prefetch fetches the route's code; this fetches its data. At most once
 * every few seconds per page.
 */
export function warmHref(href: string) {
  // Links may be absolute, on another section's host (learn.chaos.fail): only the path and query matter.
  const local = href.replace(/^https?:\/\/[^/]+/i, "").replace(/^\/(?:en|ar)(?=\/)/, "");
  const path = local.split(/[?#]/)[0];
  const course = /[?&]course=([a-z0-9]+)/i.exec(local)?.[1];
  const now = Date.now();
  const seen = course ? `${path}?course=${course}` : path;
  if (!markWarm(seen, now)) return;
  let m: RegExpExecArray | null;
  // A lesson opened from a course reads the course's copy of it (app/[lang]/(app)/learn/[id]/LessonPage.tsx).
  if (course && (m = /^\/learn\/([a-z0-9]+)$/i.exec(path))) { warmQuery(api.courses.lesson, { courseId: course, lessonId: m[1] }); return; }
  if ((m = /^\/dashboard\/forms\/([a-z0-9]+)$/i.exec(path))) warmQuery(api.forms.getFormForEditor, { formId: m[1] as Id<"forms"> });
  else if ((m = /^\/dashboard\/courses\/([a-z0-9]+)$/i.exec(path))) warmQuery(api.courses.get, { courseId: m[1] as Id<"learnCollections"> });
  else if ((m = /^\/dashboard\/learn\/lessons\/([a-z0-9]+)$/i.exec(path))) warmQuery(api.learnFrontend.editableLesson, { id: m[1] });
  else if ((m = /^\/learn\/courses\/([a-z0-9]+)$/i.exec(path))) warmQuery(api.courses.getPublic, { courseId: m[1] });
  else if ((m = /^\/learn\/([a-z0-9]+)$/i.exec(path))) warmQuery(api.learnFrontend.publicLesson, { id: m[1] });
  else if ((m = /^\/card\/([a-z0-9_.-]+)$/i.exec(path))) warmQuery(api.memberCards.byUsername, { username: decodeURIComponent(m[1]).toLowerCase() });
}

/** Intent handlers for any in-app link; see warmHref. */
export function hrefIntentHandlers(href: string) {
  const warm = () => warmHref(href);
  return { onPointerEnter: warm, onTouchStart: warm, onFocus: warm };
}
