"use client";

import { PageSkeleton } from "@/components/workspace/Skeletons";
import { useCopy } from "@/lib/i18n";

const copy = { en: { loading: "Loading Learn…" }, ar: { loading: "جارٍ تحميل Learn…" } };

export default function LearnLoading() {
  const t = useCopy(copy);
  return <PageSkeleton label={t.loading} />;
}
