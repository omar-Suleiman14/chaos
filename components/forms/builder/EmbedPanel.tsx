"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Copy } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { WsSwitch } from "@/components/workspace/primitives";
import { errorMessage } from "@/lib/errors";
import { useCopy } from "@/lib/i18n";
import { EMBED_HEIGHT_MESSAGE, MAX_EMBED_ORIGINS, embedSnippet, normalizeEmbedOrigins } from "@/lib/embed";

const copy = {
  en: {
    title: "Embed on a website",
    intro: "Show this form inside a page on your own site. Only the sites you list here can show it. Chaos pages you are signed in to can never be shown inside another site.",
    allow: "Allow embedding",
    sites: "Sites allowed to embed",
    sitesHelp: `One address per line, for example https://example.com or https://*.example.com for every subdomain. Up to ${MAX_EMBED_ORIGINS}.`,
    any: "Any site",
    anyHelp: "Any website can show this form. Fine for a public form that anyone may answer; list sites instead if you want to control where it appears.",
    save: "Save", saving: "Saving…", saved: "Saved.",
    invalid: (v: string) => `"${v}" is not a website address like https://example.com.`,
    tooMany: `List at most ${MAX_EMBED_ORIGINS} sites.`,
    needSites: "Add at least one site, or choose Any site.",
    unpublished: "Publish the form first. Drafts can never be embedded.",
    signedIn: "This form asks respondents to sign in, so it cannot be embedded. Change who can respond in Settings to embed it.",
    viewer: "Only the owner and editors can change embedding.",
    code: "Embed code",
    autoResize: "Resize to fit the form (adds a short script)",
    copy: "Copy", copied: "Copied",
    offHint: "Turn on embedding to get the embed code. Until then, browsers refuse to show this form inside other sites.",
    preview: "Live preview",
    previewNote: "This is the live form. Answers you send here count as real responses.",
  },
  ar: {
    title: "التضمين في موقع",
    intro: "اعرض هذا النموذج داخل صفحة في موقعك. لا يعرضه إلا المواقع التي تضيفها هنا. لا يمكن أبدًا عرض صفحات Chaos التي سجّلت الدخول إليها داخل موقع آخر.",
    allow: "السماح بالتضمين",
    sites: "المواقع المسموح لها بالتضمين",
    sitesHelp: `عنوان واحد في كل سطر، مثل https://example.com أو https://*.example.com لكل النطاقات الفرعية. حتى ${MAX_EMBED_ORIGINS} موقعًا.`,
    any: "أي موقع",
    anyHelp: "يمكن لأي موقع عرض هذا النموذج. مناسب لنموذج عام يجيب عنه أي شخص، وإن أردت التحكم في مكان ظهوره فأضف المواقع بدلًا من ذلك.",
    save: "حفظ", saving: "جارٍ الحفظ…", saved: "تم الحفظ.",
    invalid: (v: string) => `"${v}" ليس عنوان موقع مثل https://example.com.`,
    tooMany: `أضف ${MAX_EMBED_ORIGINS} موقعًا على الأكثر.`,
    needSites: "أضف موقعًا واحدًا على الأقل، أو اختر أي موقع.",
    unpublished: "انشر النموذج أولًا. لا يمكن تضمين المسودات.",
    signedIn: "يطلب هذا النموذج تسجيل الدخول للإجابة، لذلك لا يمكن تضمينه. غيّر «من يستطيع الرد» في الإعدادات لتضمينه.",
    viewer: "يمكن للمالك والمحررين فقط تغيير التضمين.",
    code: "كود التضمين",
    autoResize: "تغيير الحجم ليناسب النموذج (يضيف نصًا برمجيًا قصيرًا)",
    copy: "انسخ", copied: "تم النسخ",
    offHint: "فعّل التضمين لتحصل على كود التضمين. حتى ذلك الحين ترفض المتصفحات عرض هذا النموذج داخل مواقع أخرى.",
    preview: "معاينة مباشرة",
    previewNote: "هذا هو النموذج المنشور. الإجابات التي ترسلها هنا تُحسب ردودًا حقيقية.",
  },
};

export default function EmbedPanel({ formId, link, title }: { formId: Id<"forms">; link: string; title: string }) {
  const t = useCopy(copy);
  const current = useQuery(api.embed.getEmbedSettings, { formId });
  const save = useMutation(api.embed.setEmbedSettings);
  const [enabled, setEnabled] = useState(false);
  const [anyOrigin, setAnyOrigin] = useState(false);
  const [sites, setSites] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [autoResize, setAutoResize] = useState(true);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  // Load the saved values once; later server updates would overwrite what the person is typing.
  useEffect(() => {
    if (!current || loaded) return;
    setEnabled(current.enabled);
    setAnyOrigin(current.anyOrigin);
    setSites(current.origins.join("\n"));
    setLoaded(true);
  }, [current, loaded]);

  if (current === undefined || current === null) return null;
  const canEdit = current.canEdit;
  const savedOn = current.enabled && (current.anyOrigin || current.origins.length > 0);
  const live = savedOn && current.blockedBy === null;
  const dirty = loaded && (enabled !== current.enabled || anyOrigin !== current.anyOrigin || sites.split("\n").map((s) => s.trim()).filter(Boolean).join("\n") !== current.origins.join("\n"));

  const submit = async () => {
    setStatus(null);
    const lines = sites.split("\n");
    const result = normalizeEmbedOrigins(lines);
    if ("invalid" in result) return setStatus({ ok: false, text: t.invalid(result.invalid.trim()) });
    if ("tooMany" in result) return setStatus({ ok: false, text: t.tooMany });
    if (enabled && !anyOrigin && result.origins.length === 0) return setStatus({ ok: false, text: t.needSites });
    setBusy(true);
    try {
      const saved = await save({ formId, enabled, anyOrigin, origins: result.origins });
      setSites((local) => local === sites ? saved.origins.join("\n") : local);
      setStatus({ ok: true, text: t.saved });
    } catch (e) {
      setStatus({ ok: false, text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const src = `${link}${link.includes("?") ? "&" : "?"}embed=1`;
  const snippet = origin ? embedSnippet({ src, title, appOrigin: origin, autoResize }) : "";

  return (
    <section className="chaos-card bg-card p-5 space-y-4" aria-label={t.title}>
      <h2 className="chaos-heading text-sm">{t.title}</h2>
      <p className="text-xs text-muted-foreground">{t.intro}</p>
      {current.blockedBy === "unpublished" && <p className="text-sm text-muted-foreground">{t.unpublished}</p>}
      {current.blockedBy === "signed_in" && <p className="text-sm text-muted-foreground">{t.signedIn}</p>}
      {!canEdit && <p className="text-xs text-muted-foreground">{t.viewer}</p>}

      <WsSwitch label={t.allow} checked={enabled} disabled={!canEdit} onChange={(v) => { setEnabled(v); setStatus(null); }} />

      {enabled && (
        <div className="space-y-3">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={anyOrigin} disabled={!canEdit} onChange={(e) => setAnyOrigin(e.target.checked)} className="mt-1" />
            <span>{t.any}<span className="block text-xs text-muted-foreground">{t.anyHelp}</span></span>
          </label>
          {!anyOrigin && (
            <label className="block text-sm">
              {t.sites}
              <textarea
                value={sites}
                onChange={(e) => setSites(e.target.value)}
                disabled={!canEdit}
                rows={Math.min(8, Math.max(3, sites.split("\n").length + 1))}
                placeholder="https://example.com"
                dir="ltr"
                spellCheck={false}
                className="kb-input font-mono text-xs mt-1 w-full"
              />
              <span className="block text-xs text-muted-foreground mt-1">{t.sitesHelp}</span>
            </label>
          )}
        </div>
      )}

      {canEdit && (dirty || status) && (
        <div className="flex items-center gap-3">
          {dirty && <button type="button" className="kb-btn text-xs" disabled={busy} onClick={() => void submit()}>{busy ? t.saving : t.save}</button>}
          {status && <p role={status.ok ? "status" : "alert"} className={`text-sm ${status.ok ? "" : "text-destructive"}`}>{status.text}</p>}
        </div>
      )}

      {savedOn ? (
        <div className="space-y-3 pt-2 border-t border-foreground/10">
          <div className="space-y-1">
            <p className="chaos-heading text-[10px] text-muted-foreground">{t.code}</p>
            <div className="flex gap-2 items-start">
              <textarea readOnly value={snippet} rows={autoResize ? 6 : 3} dir="ltr" className="kb-input font-mono text-xs flex-1" onFocus={(e) => e.target.select()} aria-label={t.code} />
              <button type="button" className="kb-btn kb-btn-ghost text-xs" onClick={() => navigator.clipboard?.writeText(snippet).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>
                <Copy size={14} /> {copied ? t.copied : t.copy}
              </button>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={autoResize} onChange={(e) => setAutoResize(e.target.checked)} />
            {t.autoResize}
          </label>
          {live && origin && <EmbedPreview src={src} title={title} label={t.preview} note={t.previewNote} appOrigin={origin} />}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t.offHint}</p>
      )}
    </section>
  );
}

/** The real embed, framed by this page (frame-ancestors includes 'self' once embedding is on). */
function EmbedPreview({ src, title, label, note, appOrigin }: { src: string; title: string; label: string; note: string; appOrigin: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(600);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== appOrigin || e.source !== frame.current?.contentWindow) return;
      const data = e.data as { type?: unknown; height?: unknown } | null;
      if (data?.type === EMBED_HEIGHT_MESSAGE && typeof data.height === "number") setHeight(Math.max(200, Math.min(Math.ceil(data.height), 20000)));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [appOrigin]);
  return (
    <div className="space-y-1">
      <p className="chaos-heading text-[10px] text-muted-foreground">{label}</p>
      <p className="text-xs text-muted-foreground">{note}</p>
      <div className="rounded-md border border-foreground/10 overflow-hidden">
        <iframe ref={frame} src={src} title={title || label} style={{ width: "100%", height, border: 0, display: "block" }} loading="lazy" />
      </div>
    </div>
  );
}
