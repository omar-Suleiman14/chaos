"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useLocale } from "@/lib/i18n";
import { parseError } from "@/lib/errors";

export default function UsernameEditor({ username }: { username: string }) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [value, setValue] = useState(username);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const choose = useMutation(api.links.chooseUsername);
  return <form className="mc-settings" onSubmit={async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setStatus("");
    try {
      const saved = await choose({ username: value });
      setValue(saved); setStatus(ar ? "تم حفظ اسم المستخدم." : "Username saved.");
    } catch (error) {
      const parsed = parseError(error);
      const messages: Record<string, string> = {
        INVALID_USERNAME: "استخدم من ٣ إلى ٣٠ حرفًا إنجليزيًا أو رقمًا أو نقطة أو شرطة. الأسماء المحجوزة غير متاحة.",
        USERNAME_TAKEN: "اسم المستخدم محجوز. اختر اسمًا آخر.",
      };
      setStatus(ar ? messages[parsed.code] || "تعذر الحفظ. حاول مجددًا." : parsed.message);
    } finally { setBusy(false); }
  }}>
    <label htmlFor="card-username">{ar ? "اسم المستخدم" : "Username"}</label>
    <p className="mc-help" id="card-username-help">{ar ? "٣–٣٠ حرفًا. يبقى اسم روابط الاختبارات القديمة كما هو. روابط النماذج المخصصة تمنع تغيير الاسم لحمايتها." : "3–30 characters. Existing quiz URLs keep their original username. Custom form links currently prevent renaming to protect their addresses."}</p>
    <div className="mc-field">
      <input id="card-username" className="mc-input" dir="ltr" autoComplete="username" autoCapitalize="none" spellCheck={false} value={value} onChange={(e) => { setValue(e.target.value); setStatus(""); }} minLength={3} maxLength={30} pattern="[a-zA-Z0-9][a-zA-Z0-9_.\-]{2,29}" required disabled={busy} aria-describedby="card-username-help card-username-status" />
      <button className="mc-btn" type="submit" disabled={busy || value.trim().toLowerCase() === username}>{busy ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "حفظ" : "Save")}</button>
    </div>
    <p id="card-username-status" className="mc-help" role="status">{status}</p>
  </form>;
}
