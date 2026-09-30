"use client";

import { PageSkeleton } from "@/components/workspace/Skeletons";
import { useCopy } from "@/lib/i18n";

const copy = { en: { loading: "Loading…" }, ar: { loading: "جارٍ التحميل…" } };

/**
 * The loading boundary for workspace pages. With it, <Link> prefetches every workspace route up to
 * here (dynamic routes are otherwise not prefetched), so a tap swaps to this skeleton inside the
 * sidebar shell at once instead of waiting on the server.
 */
export default function DashboardLoading() {
  const t = useCopy(copy);
  return <PageSkeleton label={t.loading} />;
}
