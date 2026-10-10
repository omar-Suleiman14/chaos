"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConvexAuth, useQueries } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { useConfirmed } from "@/lib/confirmedQuery";

const SOURCES = ["owned", "account", "email"] as const;
type Source = (typeof SOURCES)[number];
type Page = FunctionReturnType<typeof api.forms.listMyFormsPage>;
type CursorPages = Record<Source, (string | null)[]>;
const INITIAL: CursorPages = { owned: [null], account: [null], email: [null] };
const PAGE_SIZE = 50;

/**
 * The existing inventory endpoint pages each ownership source separately and
 * returns a structured page object (not the array usePaginatedQuery expects).
 * Keep all requested pages reactive with useQueries; older rows are loaded on
 * demand instead of subscribing to the legacy 500/200 capped snapshot.
 */
export function useFormInventoryPages() {
  const { isAuthenticated } = useConvexAuth();
  const [cursors, setCursors] = useState<CursorPages>(INITIAL);
  useEffect(() => { if (!isAuthenticated) setCursors(INITIAL); }, [isAuthenticated]);

  const requests = useMemo(() => {
    const next: Record<string, { query: typeof api.forms.listMyFormsPage; args: { source: Source; paginationOpts: { numItems: number; cursor: string | null } } }> = {};
    if (isAuthenticated) {
      for (const source of SOURCES) {
        cursors[source].forEach((cursor, i) => {
          next[`${source}:${i}`] = { query: api.forms.listMyFormsPage, args: { source, paginationOpts: { numItems: PAGE_SIZE, cursor } } };
        });
      }
    }
    return next;
  }, [isAuthenticated, cursors]);
  const responses = useQueries(requests);

  const live = useMemo(() => {
    if (!isAuthenticated || Object.keys(requests).some(key => responses[key] === undefined)) return undefined;
    const owned: Page["page"]["owned"] = [];
    const shared: Page["page"]["shared"] = [];
    const invites: Page["page"]["invites"] = [];
    const ownedIds = new Set<string>(), sharedIds = new Set<string>(), inviteIds = new Set<string>();
    // Account grants take priority over email grants; omit duplicates even
    // when the same form appears on different pages of one index.
    for (const source of SOURCES) {
      for (let i = 0; i < cursors[source].length; i++) {
        const response = responses[`${source}:${i}`] as Page;
        for (const form of response.page.owned) {
          if (ownedIds.has(form._id)) continue;
          ownedIds.add(form._id);
          owned.push(form);
        }
        for (const form of response.page.shared) {
          if (ownedIds.has(form._id) || sharedIds.has(form._id)) continue;
          sharedIds.add(form._id);
          shared.push(form);
        }
        for (const invite of response.page.invites) {
          const id = String(invite.collaboratorId);
          if (inviteIds.has(id)) continue;
          inviteIds.add(id);
          invites.push(invite);
        }
      }
    }
    return { owned, shared, invites };
  }, [isAuthenticated, requests, responses, cursors]);

  const confirmed = useConfirmed("forms.cursorInventory", live);
  const hasMore = isAuthenticated && Object.keys(requests).every(key => responses[key] !== undefined)
    && SOURCES.some(source => {
      const last = responses[`${source}:${cursors[source].length - 1}`] as Page | undefined;
      return !!last && !last.isDone;
    });

  const loadMore = useCallback(() => {
    setCursors(current => {
      let changed = false;
      const next: CursorPages = { owned: current.owned, account: current.account, email: current.email };
      for (const source of SOURCES) {
        const last = responses[`${source}:${current[source].length - 1}`] as Page | undefined;
        if (!last || last.isDone || !last.continueCursor || current[source].includes(last.continueCursor)) continue;
        next[source] = [...current[source], last.continueCursor];
        changed = true;
      }
      return changed ? next : current;
    });
  }, [responses]);
  return { forms: confirmed.data, confirmed: confirmed.confirmed, hasMore, loadMore };
}
