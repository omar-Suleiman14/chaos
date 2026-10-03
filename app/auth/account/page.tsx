"use client";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth/better-client";
import { useLocale } from "@/lib/i18n";
import Link from "next/link";

export default function AccountPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const { data, isPending } = authClient.useSession();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function change(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = event.currentTarget;
    const values = new FormData(form);
    try {
      const result = await authClient.changePassword({
        currentPassword: String(values.get("current")),
        newPassword: String(values.get("next")),
        revokeOtherSessions: true,
      });
      setMessage(
        result.error
          ? ar
            ? "تعذر تغيير كلمة المرور."
            : "Unable to change password."
          : ar
            ? "تم تغيير كلمة المرور وتسجيل خروج الجلسات الأخرى."
            : "Password changed. Other sessions have been signed out.",
      );
      if (!result.error) form.reset();
    } catch {
      setMessage(ar ? "تعذر الاتصال." : "Unable to connect.");
    } finally {
      setBusy(false);
    }
  }
  if (process.env.NEXT_PUBLIC_AUTH_PROVIDER !== "betterauth")
    return (
      <main className="p-12">
        <Link href="/dashboard">{ar ? "العودة" : "Back to dashboard"}</Link>
      </main>
    );
  if (isPending)
    return (
      <main className="p-12" aria-busy="true">
        {ar ? "جارٍ التحميل…" : "Loading…"}
      </main>
    );
  if (!data)
    return (
      <main className="p-12">
        <Link href="/sign-in?callbackUrl=%2Fauth%2Faccount">
          {ar ? "تسجيل الدخول" : "Sign in"}
        </Link>
      </main>
    );
  return (
    <main className="mx-auto max-w-md px-6 py-20">
      <h1 className="text-3xl font-semibold">
        {ar ? "حسابك" : "Your account"}
      </h1>
      <p className="my-6">{data.user.email}</p>
      <form onSubmit={change} className="space-y-5">
        <label className="block">
          {ar ? "كلمة المرور الحالية" : "Current password"}
          <input
            name="current"
            type="password"
            autoComplete="current-password"
            required
            className="mt-2 w-full rounded border p-3"
          />
        </label>
        <label className="block">
          {ar ? "كلمة المرور الجديدة" : "New password"}
          <input
            name="next"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
            className="mt-2 w-full rounded border p-3"
          />
        </label>
        <button
          disabled={busy}
          className="rounded bg-foreground p-3 text-background disabled:opacity-50"
        >
          {ar ? "تغيير كلمة المرور" : "Change password"}
        </button>
        {message && <p role="status">{message}</p>}
      </form>
    </main>
  );
}
