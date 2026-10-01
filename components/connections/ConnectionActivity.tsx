"use client";

import { useState } from "react";
import { formatDateTime, useCopy, useLocale } from "@/lib/i18n";
import { timeAgo } from "@/lib/timeAgo";
import { WsSwitch } from "@/components/workspace/primitives";
import { formatActivity } from "./activityText";
import type { ActivityRow } from "./activityText";

const copy = {
  en: { title: "Recent activity", none: "No activity yet.", noChanges: "No changes yet. Turn on “Show reads” to see what it looked at.", reads: "Show reads", kept: "The last 10 events are shown." },
  ar: { title: "النشاط الأخير", none: "لا نشاط بعد.", noChanges: "لا تغييرات بعد. فعّل «اعرض القراءات» لترى ما اطّلع عليه.", reads: "اعرض القراءات", kept: "تظهر آخر 10 أحداث." },
};

/** Human-readable connection history. Reads are hidden by default so changes stand out. */
export default function ConnectionActivity({ rows, appName, titles }: { rows: ActivityRow[]; appName: string; titles: ReadonlyMap<string, string> }) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const [reads, setReads] = useState(false);
  const events = formatActivity(rows, { appName, titles, locale });
  const shown = reads ? events : events.filter((e) => e.category !== "read");
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-muted-foreground">{t.title}</summary>
      <div className="mt-2 space-y-2">
        {events.length > 0 && <WsSwitch checked={reads} onChange={setReads} label={t.reads} />}
        {events.length === 0 ? <p className="text-muted-foreground">{t.none}</p> : shown.length === 0 ? <p className="text-muted-foreground">{t.noChanges}</p> : (
          <ul className="space-y-1">
            {shown.map((e) => (
              <li key={e.key} className="flex gap-3">
                <time dateTime={new Date(e.at).toISOString()} title={formatDateTime(locale, e.at)} className="text-muted-foreground shrink-0 w-28">{timeAgo(locale, e.at)}</time>
                <span className={e.category === "change" ? "font-medium" : ""}>{e.text}</span>
              </li>
            ))}
          </ul>
        )}
        {events.length > 0 && <p className="text-[11px] text-muted-foreground">{t.kept}</p>}
      </div>
    </details>
  );
}
