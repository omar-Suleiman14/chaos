"use client";

import { useEffect, useMemo, useState } from "react";
import { copyText } from "@/lib/clipboard";
import { toast } from "@/lib/toast";
import { useMutation, useQuery } from "convex/react";
import { Check, Code2, Copy, ExternalLink, Link2, Mail, QrCode, Share2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { WsDialog, WsSwitch } from "@/components/workspace/primitives";
import { embedSnippet } from "@/lib/embed";
import { useCopy } from "@/lib/i18n";
import { shortShareUrl } from "@/lib/site";
import QrShare from "./QrShare";
import { linkOrigin } from "@/lib/hosts";

const copy = {
  en: {
    liveForm: "Your form is live", liveQuiz: "Your quiz is live", share: "Share",
    intro: "Send the link, show the QR code or put it on your website.",
    tabs: { link: "Link", qr: "QR code", embed: "Embed" },
    copy: "Copy", copied: "Copied", open: "Open", more: "More…",
    email: "Email", whatsapp: "WhatsApp", x: "X", linkedin: "LinkedIn",
    embedIntro: "Paste this code into any web page to show the form there. It resizes to fit.",
    allowAny: "Allow it on any website", allowHelp: "To limit it to your own sites, use Share → Embed in the builder.",
    embedOff: "Turn this on to get the embed code.", limited: "Embedding is limited to the sites you listed in Share → Embed.",
    done: "Done",
  },
  ar: {
    liveForm: "نموذجك منشور", liveQuiz: "اختبارك منشور", share: "مشاركة",
    intro: "أرسل الرابط أو اعرض رمز QR أو ضعه في موقعك.",
    tabs: { link: "الرابط", qr: "رمز QR", embed: "تضمين" },
    copy: "انسخ", copied: "نُسخ", open: "افتح", more: "المزيد…",
    email: "البريد", whatsapp: "واتساب", x: "X", linkedin: "LinkedIn",
    embedIntro: "الصق هذا الرمز في أي صفحة ويب لعرض النموذج فيها. يتغير ارتفاعه ليناسبها.",
    allowAny: "اسمح به على أي موقع", allowHelp: "لحصره في مواقعك، استخدم مشاركة ← تضمين في المحرر.",
    embedOff: "فعّل هذا لتحصل على رمز التضمين.", limited: "التضمين محصور في المواقع التي حددتها في مشاركة ← تضمين.",
    done: "تم",
  },
};

type Tab = "link" | "qr" | "embed";

function CopyField({ value, multiline, label }: { value: string; multiline?: boolean; label: string }) {
  const t = useCopy(copy);
  const [copied, setCopied] = useState(false);
  const doCopy = () => copyText(value).then((ok) => { if (!ok) return; setCopied(true); setTimeout(() => setCopied(false), 1500); });
  return (
    <div className="ws-share__copy">
      {multiline
        ? <textarea readOnly value={value} rows={4} dir="ltr" aria-label={label} onFocus={(e) => e.target.select()} />
        : <input readOnly value={value} dir="ltr" aria-label={label} onFocus={(e) => e.target.select()} />}
      <button type="button" className="ws-btn ws-btn--primary" onClick={() => void doCopy()}>{copied ? <Check size={16} /> : <Copy size={16} />} {copied ? t.copied : t.copy}</button>
    </div>
  );
}

/** Share a published form or quiz: link with quick share targets, QR code, and website embed. A bottom sheet on phones (WsDialog). */
export default function SharePopup({ formId, shareId, slug, title, quiz, onClose }: { formId: Id<"forms">; shareId: string; slug?: string | null; title: string; quiz: boolean; onClose: () => void }) {
  const t = useCopy(copy);
  const [tab, setTab] = useState<Tab>("link");
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(linkOrigin("main")), []);
  const me = useQuery(api.links.getMyLinkIdentity, slug ? {} : "skip");
  const path = slug && me ? `/${me.username}/${slug}` : `/f/${shareId}`;
  const link = `${origin}${path}`;
  const shareLink = shortShareUrl(path) ?? link;
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const enc = encodeURIComponent;
  const targets = useMemo(() => [
    { label: t.email, icon: Mail, href: `mailto:?subject=${enc(title)}&body=${enc(shareLink)}` },
    { label: t.whatsapp, icon: Share2, href: `https://wa.me/?text=${enc(`${title} ${shareLink}`)}` },
    { label: t.x, icon: Share2, href: `https://x.com/intent/post?text=${enc(title)}&url=${enc(shareLink)}` },
    { label: t.linkedin, icon: Share2, href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(shareLink)}` },
  ], [t, title, shareLink]); // eslint-disable-line react-hooks/exhaustive-deps -- enc is stable

  return (
    <WsDialog title={quiz ? t.liveQuiz : t.liveForm} description={t.intro} onClose={onClose}>
      <div className="ws-share">
        <div className="ws-share__tabs" role="tablist" aria-label={t.share}>
          {(["link", "qr", "embed"] as const).map((id) => {
            const Icon = id === "link" ? Link2 : id === "qr" ? QrCode : Code2;
            return <button key={id} type="button" role="tab" aria-selected={tab === id} className="ws-share__tab" onClick={() => setTab(id)}><Icon size={16} aria-hidden />{t.tabs[id]}</button>;
          })}
        </div>

        {tab === "link" && origin && (
          <div className="grid gap-4" role="tabpanel">
            <CopyField value={shareLink} label={t.tabs.link} />
            <div className="ws-share__targets">
              {canNativeShare && <button type="button" className="ws-share__target" onClick={() => void navigator.share({ title, url: shareLink }).catch(() => {})}><Share2 size={18} aria-hidden />{t.more}</button>}
              {targets.map(({ label, icon: Icon, href }) => <a key={label} className="ws-share__target" href={href} target="_blank" rel="noreferrer"><Icon size={18} aria-hidden />{label}</a>)}
              <a className="ws-share__target" href={path} target="_blank" rel="noreferrer"><ExternalLink size={18} aria-hidden />{t.open}</a>
            </div>
          </div>
        )}
        {tab === "qr" && origin && <div role="tabpanel"><QrShare link={shareLink} title={title} published /></div>}
        {tab === "embed" && origin && <EmbedTab formId={formId} link={link} title={title} appOrigin={origin} />}

        <div className="flex justify-end"><button type="button" className="ws-btn" onClick={onClose}>{t.done}</button></div>
      </div>
    </WsDialog>
  );
}

function EmbedTab({ formId, link, title, appOrigin }: { formId: Id<"forms">; link: string; title: string; appOrigin: string }) {
  const t = useCopy(copy);
  const current = useQuery(api.embed.getEmbedSettings, { formId });
  const save = useMutation(api.embed.setEmbedSettings);
  const [busy, setBusy] = useState(false);
  if (!current) return null;
  const on = current.enabled && (current.anyOrigin || current.origins.length > 0);
  const toggle = async (next: boolean) => {
    setBusy(true);
    try { await save({ formId, enabled: next, anyOrigin: next ? true : current.anyOrigin, origins: current.origins }); }
    catch (e) { toast.error(e); }
    finally { setBusy(false); }
  };
  const src = `${link}${link.includes("?") ? "&" : "?"}embed=1`;
  return (
    <div className="grid gap-3" role="tabpanel">
      <p className="text-sm text-[var(--on-surface-variant)]">{t.embedIntro}</p>
      {current.canEdit && (!on || current.anyOrigin) && <WsSwitch label={t.allowAny} checked={on && current.anyOrigin} disabled={busy} onChange={(v) => void toggle(v)} />}
      {on && !current.anyOrigin && <p className="text-xs text-[var(--on-surface-variant)]">{t.limited}</p>}
      {on ? <CopyField multiline value={embedSnippet({ src, title, appOrigin, autoResize: true })} label={t.tabs.embed} /> : <p className="text-sm">{t.embedOff}</p>}
      {current.canEdit && <p className="text-xs text-[var(--on-surface-variant)]">{t.allowHelp}</p>}
    </div>
  );
}
