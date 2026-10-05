"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useLocale } from "@/lib/i18n";
import { parseError } from "@/lib/errors";
import { toast } from "@/lib/toast";

/** `onDraft` lets the card preview the typed username (and its avatar) before saving. */
export default function UsernameEditor({ username, onDraft }: { username: string; onDraft?: (value: string) => void }) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [value, setValue] = useState(username);
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const choose = useMutation(api.links.chooseUsername);
  return <form className="mc-settings" onSubmit={async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setInvalid(false);
    try {
      const saved = await choose({ username: value });
      setValue(saved); toast.success(ar ? "تم حفظ اسم المستخدم" : "Username saved", { description: `@${saved}` });
    } catch (error) {
      const parsed = parseError(error);
      const messages: Record<string, string> = {
        INVALID_USERNAME: "استخدم من ٣ إلى ٣٠ حرفًا إنجليزيًا أو رقمًا أو نقطة أو شرطة. الأسماء المحجوزة غير متاحة.",
        USERNAME_TAKEN: "اسم المستخدم محجوز. اختر اسمًا آخر.",
      };
      setInvalid(parsed.code in messages);
      toast.error(ar ? messages[parsed.code] || "تعذر حفظ اسم المستخدم. حاول مجددًا." : parsed.message, { id: "username" });
    } finally { setBusy(false); }
  }}>
    <label htmlFor="card-username">{ar ? "اسم المستخدم" : "Username"}</label>
    <p className="mc-help" id="card-username-help">{ar ? "٣–٣٠ حرفًا. يبقى اسم روابط الاختبارات القديمة كما هو. روابط النماذج المخصصة تمنع تغيير الاسم لحمايتها." : "3–30 characters. Existing quiz URLs keep their original username. Custom form links currently prevent renaming to protect their addresses."}</p>
    <div className="mc-field">
      <input id="card-username" className="mc-input" dir="ltr" autoComplete="username" autoCapitalize="none" spellCheck={false} value={value} onChange={(e) => { setValue(e.target.value); onDraft?.(e.target.value); setInvalid(false); }} aria-invalid={invalid || undefined} minLength={3} maxLength={30} pattern="[a-zA-Z0-9][a-zA-Z0-9_.\-]{2,29}" required disabled={busy} aria-describedby="card-username-help" />
      <button className="mc-btn" type="submit" disabled={busy || value.trim().toLowerCase() === username}>{busy ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "حفظ" : "Save")}</button>
    </div>
  </form>;
}
