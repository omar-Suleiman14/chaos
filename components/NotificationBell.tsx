"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { markNotificationsReadLocally, useOptimisticMutation } from "@/lib/optimistic";
import { Bell } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { formatNumber, useCopy, useLocale } from "@/lib/i18n";
import { timeAgo } from "@/lib/timeAgo";
import { hostHref } from "@/lib/hosts";

const copy = {
  en: {
    title: "Notifications", withUnread: (n: number) => `Notifications, ${n} unread`, markAll: "Mark all read",
    empty: "Nothing yet. New responses, limits and approvals appear here.",
  },
  ar: {
    title: "الإشعارات", withUnread: (n: number) => `الإشعارات، ${n} غير مقروء`, markAll: "علّم الكل كمقروء",
    empty: "لا شيء حتى الآن. تظهر هنا الردود الجديدة والحدود وطلبات الموافقة.",
  },
};

/* oxlint-disable jsx-a11y/prefer-tag-over-role -- This custom dialog uses the existing focus, Escape and dismissal lifecycle; a native dialog would require a different open and top-layer lifecycle. */
export default function NotificationBell() {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const data = useQuery(api.notifications.listNotifications);
  const markRead = useOptimisticMutation(api.notifications.markNotificationsRead, markNotificationsReadLocally);
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !panel.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const unread = data?.unread ?? 0;
  return (
    <div className="relative" ref={panel}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 text-muted-foreground hover:text-foreground"
        aria-label={unread ? t.withUnread(unread) : t.title}
        aria-expanded={open}
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -end-0.5 min-w-4 h-4 px-1 rounded-full bg-primary text-on-primary text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : formatNumber(locale, unread)}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute end-0 mt-2 w-80 max-h-[70vh] overflow-y-auto chaos-card ws-glass z-50 text-start" role="dialog" aria-label={t.title}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-foreground/10">
            <p className="chaos-heading text-xs">{t.title}</p>
            {unread > 0 && (
              <button type="button" className="text-xs underline text-muted-foreground hover:text-foreground" onClick={() => markRead({})}>
                {t.markAll}
              </button>
            )}
          </div>
          {!data?.items.length ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">{t.empty}</p>
          ) : (
            <ul>
              {data.items.map((n) => (
                <li key={n._id} className={`px-4 py-3 border-b border-foreground/5 text-sm ${n.read ? "text-muted-foreground" : ""}`}>
                  {n.kind === "webhook" ? (
                    <Link href={hostHref("/dashboard/connections")} onClick={() => { if (!n.read) markRead({ ids: [n._id] }); setOpen(false); }} className="hover:underline">{n.message}</Link>
                  ) : n.formId ? (
                    <Link href={n.kind === "response" || n.kind === "limit" ? `/dashboard/forms/${n.formId}/responses` : `/dashboard/forms/${n.formId}`}
                      onClick={() => { if (!n.read) markRead({ ids: [n._id] }); setOpen(false); }} className="hover:underline">
                      {n.message}
                    </Link>
                  ) : n.message}
                  <p className="text-[11px] text-muted-foreground mt-1">{timeAgo(locale, n.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
/* oxlint-enable jsx-a11y/prefer-tag-over-role */
