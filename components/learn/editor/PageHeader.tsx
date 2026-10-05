"use client";

import { useEffect, useRef, useState } from "react";
import { ImageIcon, MoveVertical, Shuffle } from "lucide-react";
import { coverCategories, coverGallery, defaultCover, isCoverUrl, randomCover } from "@/lib/learn/covers";
import type { LessonMeta } from "@/lib/learn/types";
import { useCopy, useLocale } from "@/lib/i18n";

/** The page-look fields shared by lessons and courses. */
export type PageLook = Pick<LessonMeta, "coverUrl" | "coverY">;

/* A Notion-style page top: every lesson and course has a full-width cover (a stable default until one is
   chosen) that can be changed, shuffled or repositioned, but not removed. */

const copy = {
  en: {
    change: "Change cover", reposition: "Reposition", save: "Save position", random: "Random",
    gallery: "Gallery", link: "Link", linkPh: "Paste an image link…", submit: "Submit", linkHelp: "Works with any https image on the web.",
    linkInvalid: "Use a full https:// image link.", dragHint: "Drag image to reposition",
    credit: (title: string, license: string) => `${title} · ${license}`,
  },
  ar: {
    change: "غيّر الغلاف", reposition: "غيّر الموضع", save: "احفظ الموضع", random: "عشوائي",
    gallery: "المعرض", link: "رابط", linkPh: "الصق رابط صورة…", submit: "إرسال", linkHelp: "يعمل مع أي صورة https على الويب.",
    linkInvalid: "استخدم رابط صورة كاملًا يبدأ بـ https://.", dragHint: "اسحب الصورة لتغيير موضعها",
    credit: (title: string, license: string) => `${title} · ${license}`,
  },
};

/** Closes a popover on outside click or Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("pointerdown", down); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", down); document.removeEventListener("keydown", key); };
  }, [open, close]);
  return ref;
}

function CoverPicker({ current, onPick, onClose }: { current: string; onPick: (url: string) => void; onClose: () => void }) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const [tab, setTab] = useState<"gallery" | "link">("gallery");
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const ref = useDismiss(true, onClose);
  return (
    <div ref={ref} className="lx-cover-picker ws-glass" role="dialog" aria-label={t.change}>
      <div className="lx-cover-picker__tabs" role="tablist">
        {(["gallery", "link"] as const).map((id) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{t[id]}</button>)}
        <button type="button" className="lx-cover-picker__random" onClick={() => { onPick(randomCover([current])); onClose(); }}><Shuffle size={13} aria-hidden /> {t.random}</button>
      </div>
      {tab === "gallery" ? (
        <div className="lx-cover-picker__body">
          {coverCategories.map((cat) => (
            <section key={cat.id}>
              <h4>{locale === "ar" ? cat.ar : cat.en}</h4>
              <div className="lx-cover-picker__grid">
                {coverGallery.filter((c) => c.category === cat.id).map((c) => (
                  <button key={c.src} type="button" title={c.license ? t.credit(c.title, c.license) : c.title} aria-label={c.title} aria-pressed={c.src === current} onClick={() => { onPick(c.src); onClose(); }}
                    style={{ backgroundImage: `url("${c.src}")` }} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <form className="lx-cover-picker__body lx-cover-picker__link" onSubmit={(e) => {
          e.preventDefault();
          const v = link.trim();
          if (!isCoverUrl(v) || !v.startsWith("https://")) { setError(t.linkInvalid); return; }
          onPick(v); onClose();
        }}>
          <input className="lx-input" type="url" inputMode="url" value={link} placeholder={t.linkPh} aria-label={t.link} autoFocus onChange={(e) => { setLink(e.target.value); setError(""); }} />
          <button type="submit" className="ws-btn ws-btn--primary ws-btn--sm">{t.submit}</button>
          {error ? <small className="lx-error" role="alert">{error}</small> : <small>{t.linkHelp}</small>}
        </form>
      )}
    </div>
  );
}

/** Full-width cover band. Without a saved cover it shows the item's default one, so no page is bare. */
export function LessonCover({ id, meta, editable, onChange }: { id: string; meta: PageLook; editable: boolean; onChange: (patch: Partial<PageLook>) => void }) {
  const t = useCopy(copy);
  const [picker, setPicker] = useState(false);
  const [moving, setMoving] = useState(false);
  const [y, setY] = useState(meta.coverY ?? 50);
  const drag = useRef<{ startY: number; startPos: number; height: number } | null>(null);
  useEffect(() => { if (!moving) setY(meta.coverY ?? 50); }, [meta.coverY, moving]);
  const src = isCoverUrl(meta.coverUrl) ? meta.coverUrl : defaultCover(id);
  return (
    <div className="lx-cover" data-moving={moving}>
      <img src={src} alt="" draggable={false} style={{ objectPosition: `center ${y}%` }}
        onPointerDown={(e) => { if (!moving) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = { startY: e.clientY, startPos: y, height: e.currentTarget.getBoundingClientRect().height }; }}
        onPointerMove={(e) => { const d = drag.current; if (!d) return; setY(Math.max(0, Math.min(100, d.startPos - ((e.clientY - d.startY) / d.height) * 100))); }}
        onPointerUp={() => { drag.current = null; }} />
      {moving && <span className="lx-cover__hint">{t.dragHint}</span>}
      {editable && (
        <div className="lx-cover__actions">
          {/* Saving a position also saves the default cover, so the position belongs to that picture. */}
          {moving ? <button type="button" onClick={() => { onChange({ coverUrl: src, coverY: Math.round(y) }); setMoving(false); }}>{t.save}</button> : <>
            <button type="button" onClick={() => setPicker(true)}><ImageIcon size={14} aria-hidden />{t.change}</button>
            <button type="button" aria-label={t.random} title={t.random} onClick={() => onChange({ coverUrl: randomCover([src]), coverY: 50 })}><Shuffle size={14} aria-hidden /></button>
            <button type="button" onClick={() => setMoving(true)}><MoveVertical size={14} aria-hidden />{t.reposition}</button>
          </>}
        </div>
      )}
      {picker && <CoverPicker current={src} onPick={(coverUrl) => onChange({ coverUrl, coverY: 50 })} onClose={() => setPicker(false)} />}
    </div>
  );
}
