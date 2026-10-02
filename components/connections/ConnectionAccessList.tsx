"use client";

import { Check, Clock, X } from "lucide-react";
import { useCopy, useLocale } from "@/lib/i18n";
import { describeConnectionAccess } from "./permissionText";
import type { ConnectionAccessInput } from "./permissionText";

const copy = {
  en: { can: "Can", cannot: "Cannot", learn: "Lessons and study", notSaved: "Not saved yet" },
  ar: { can: "يستطيع", cannot: "لا يستطيع", learn: "الدروس والدراسة", notSaved: "لا يُحفظ بعد" },
};

/** Plain-language "can / cannot" list for one connection, built from its scopes. */
export default function ConnectionAccessList(props: ConnectionAccessInput) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const { can, cannot, learn } = describeConnectionAccess(props, locale);
  return (
    <div className="grid gap-3 sm:grid-cols-2 text-[13px]">
      {can.length > 0 && (
        <div>
          <h4 className="ws-section-label mb-1">{t.can}</h4>
          <ul className="space-y-1">
            {can.map((s) => <li key={s.key} className="flex gap-2"><Check size={14} className="mt-0.5 shrink-0 text-green-700 dark:text-green-400" aria-hidden="true" /><span>{s.text}</span></li>)}
          </ul>
        </div>
      )}
      <div>
        <h4 className="ws-section-label mb-1">{t.cannot}</h4>
        <ul className="space-y-1 text-muted-foreground">
          {cannot.map((s) => <li key={s.key} className="flex gap-2"><X size={14} className="mt-0.5 shrink-0" aria-hidden="true" /><span>{s.text}</span></li>)}
        </ul>
      </div>
      {learn.length > 0 && (
        <div className="sm:col-span-2">
          <h4 className="ws-section-label mb-1">{t.learn}</h4>
          <ul className="space-y-1">
            {learn.map((s) => s.pending ? (
              <li key={s.key} className="flex gap-2 text-muted-foreground"><Clock size={14} className="mt-0.5 shrink-0" aria-hidden="true" /><span><span className="ws-pill ws-pill--purple me-1">{t.notSaved}</span>{s.text}</span></li>
            ) : (
              <li key={s.key} className="flex gap-2"><Check size={14} className="mt-0.5 shrink-0 text-green-700 dark:text-green-400" aria-hidden="true" /><span>{s.text}</span></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
