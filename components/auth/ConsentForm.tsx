"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth/better-client";
import { useLocale } from "@/lib/i18n";
export default function ConsentForm({
  clientId,
  scopes,
}: {
  clientId: string;
  scopes: string;
}) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function consent(accept: boolean) {
    setBusy(true);
    setError("");
    try {
      const result = await authClient.oauth2.consent({ accept });
      if (result.error)
        setError(
          ar ? "تعذر إكمال التفويض." : "Unable to complete authorization.",
        );
    } catch {
      setError(ar ? "تعذر الاتصال." : "Unable to connect.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-md px-6 py-20">
      <h1 className="text-3xl font-semibold">
        {ar ? "توصيل Chaos" : "Connect Chaos"}
      </h1>
      <p className="my-6">
        {ar
          ? "السماح لهذا التطبيق بالوصول إلى حسابك عبر أدوات Chaos؟ يمكن أن تتضمن الأدوات قراءة النماذج وتعديلها."
          : "Allow this application to access your account through Chaos tools? Tools can include reading and editing forms."}
      </p>
      <p className="mb-3 break-all">
        {ar ? "التطبيق:" : "Client:"} {clientId}
      </p>
      <p className="mb-6">
        {ar ? "الصلاحيات المطلوبة:" : "Requested scopes:"} {scopes}
      </p>
      <div className="flex gap-4">
        <button
          disabled={busy}
          onClick={() => void consent(true)}
          className="rounded bg-foreground p-3 text-background"
        >
          {ar ? "السماح" : "Allow"}
        </button>
        <button
          disabled={busy}
          onClick={() => void consent(false)}
          className="rounded border p-3"
        >
          {ar ? "رفض" : "Deny"}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
