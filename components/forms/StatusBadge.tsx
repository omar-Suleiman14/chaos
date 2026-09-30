"use client";

import { useCopy } from "@/lib/i18n";

type Status = "draft" | "live" | "closed" | "archived";

const copy = {
  en: { labels: { draft: "Draft", live: "Live", closed: "Closed", archived: "Archived" } as Record<Status, string>, edited: " · unpublished changes" },
  ar: { labels: { draft: "مسودة", live: "منشور", closed: "مغلق", archived: "مؤرشف" } as Record<Status, string>, edited: " · تغييرات غير منشورة" },
};

export default function StatusBadge({ status, edited }: { status: Status; edited?: boolean }) {
  const t = useCopy(copy);
  return (
    <span className="ws-status" data-status={status}>
      {t.labels[status]}{edited && status !== "draft" ? t.edited : ""}
    </span>
  );
}
