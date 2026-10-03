"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/better-client";
import { safeAuthReturn } from "@/lib/auth/redirect";
import { useLocale } from "@/lib/i18n";

export default function LocalAuthForm({
  signUp = false,
}: {
  signUp?: boolean;
}) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email"));
    const password = String(data.get("password"));
    try {
      const result = signUp
        ? await authClient.signUp.email({
            email,
            password,
            name: String(data.get("name")),
          })
        : await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(
          ar
            ? "تعذر تسجيل الدخول. تحقق من بياناتك وحاول مجددًا."
            : "Unable to sign in. Check your details and try again.",
        );
        return;
      }
      // The OAuth client plugin handles the signed authorization query and redirect.
      if (!new URLSearchParams(window.location.search).has("sig"))
        window.location.assign(
          safeAuthReturn(
            new URLSearchParams(window.location.search).get("callbackUrl") ??
              "/dashboard",
          ),
        );
    } catch {
      setError(
        ar ? "تعذر الاتصال. حاول مجددًا." : "Unable to connect. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-md px-6 py-20">
      <h1 className="mb-8 text-3xl font-semibold">
        {signUp
          ? ar
            ? "إنشاء حساب"
            : "Create an account"
          : ar
            ? "تسجيل الدخول"
            : "Sign in"}
      </h1>
      <form onSubmit={submit} className="space-y-5">
        {signUp && (
          <label className="block">
            {ar ? "الاسم" : "Name"}
            <input
              name="name"
              autoComplete="name"
              required
              maxLength={100}
              className="mt-2 w-full rounded border p-3"
            />
          </label>
        )}
        <label className="block">
          {ar ? "البريد الإلكتروني" : "Email"}
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className="mt-2 w-full rounded border p-3"
          />
        </label>
        <label className="block">
          {ar ? "كلمة المرور" : "Password"}
          <input
            name="password"
            type="password"
            autoComplete={signUp ? "new-password" : "current-password"}
            minLength={signUp ? 12 : undefined}
            required
            className="mt-2 w-full rounded border p-3"
          />
        </label>
        {signUp && (
          <p className="text-sm">
            {ar ? "استخدم ١٢ حرفًا على الأقل." : "Use at least 12 characters."}
          </p>
        )}
        {error && (
          <p role="alert" className="text-red-600">
            {error}
          </p>
        )}
        <button
          disabled={busy}
          className="w-full rounded bg-foreground p-3 text-background disabled:opacity-50"
        >
          {busy
            ? ar
              ? "جارٍ المتابعة…"
              : "Continuing…"
            : ar
              ? "متابعة"
              : "Continue"}
        </button>
      </form>
      <Link
        className="mt-6 inline-block underline"
        href={signUp ? "/sign-in" : "/sign-up"}
        onClick={(event) => {
          event.preventDefault();
          router.push(
            `${signUp ? "/sign-in" : "/sign-up"}${window.location.search}`,
          );
        }}
      >
        {signUp
          ? ar
            ? "لديك حساب؟ سجّل الدخول"
            : "Already have an account? Sign in"
          : ar
            ? "إنشاء حساب"
            : "Create an account"}
      </Link>
    </main>
  );
}
