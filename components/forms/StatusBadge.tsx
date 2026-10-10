"use client";

import { useCopy } from "@/lib/i18n";
import { formStatusLabels, type FormStatus } from "@/lib/formStatusLabels";

type Status = FormStatus;

const copy = {
  en: { labels: formStatusLabels.en, edited: " · unpublished changes" },
  ar: { labels: formStatusLabels.ar, edited: " · تغييرات غير منشورة" },
};

export default function StatusBadge({ status, edited }: { status: Status; edited?: boolean }) {
  const t = useCopy(copy);
  return (
    <span className="ws-status" data-status={status}>
      {t.labels[status]}{edited && status !== "draft" ? t.edited : ""}
    </span>
  );
}
