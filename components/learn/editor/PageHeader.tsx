"use client";

import { useEffect, useRef, useState } from "react";
import { ImageIcon, MoveVertical, SmilePlus, Trash2 } from "lucide-react";
import { coverCategories, coverGallery, isCoverUrl } from "@/lib/learn/covers";
import type { LessonMeta } from "@/lib/learn/types";

/** The page-look fields shared by lessons and courses. */
export type PageLook = Pick<LessonMeta, "coverUrl" | "coverY" | "icon">;
import { useCopy, useLocale } from "@/lib/i18n";

/* A Notion-style page top: full-width cover with change/reposition/remove, a page icon, and
   "Add icon" / "Add cover" that appear on hover above the title. */

const copy = {
  en: {
    addIcon: "Add icon", addCover: "Add cover", change: "Change cover", reposition: "Reposition", save: "Save position", remove: "Remove",
    gallery: "Gallery", link: "Link", linkPh: "Paste an image link…", submit: "Submit", linkHelp: "Works with any https image on the web.",
    linkInvalid: "Use a full https:// image link.", dragHint: "Drag image to reposition", icon: "Page icon", removeIcon: "Remove icon", random: "Random",
    credit: (title: string, license: string) => `${title} · ${license}`,
  },
  ar: {
    addIcon: "أضف أيقونة", addCover: "أضف غلافًا", change: "غيّر الغلاف", reposition: "غيّر الموضع", save: "احفظ الموضع", remove: "إزالة",
    gallery: "المعرض", link: "رابط", linkPh: "الصق رابط صورة…", submit: "إرسال", linkHelp: "يعمل مع أي صورة https على الويب.",
    linkInvalid: "استخدم رابط صورة كاملًا يبدأ بـ https://.", dragHint: "اسحب الصورة لتغيير موضعها", icon: "أيقونة الصفحة", removeIcon: "أزل الأيقونة", random: "عشوائي",
    credit: (title: string, license: string) => `${title} · ${license}`,
  },
};

import { CourseOrLessonIcon, LEARN_ICON_NAMES, LUCIDE_LEARN_ICONS, NOTION_ICON_COLORS, type NotionIconColorId, parseIconWithColor } from "../icons";

const pickRandom = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

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

function CoverPicker({ onPick, onRemove, onClose }: { onPick: (url: string) => void; onRemove?: () => void; onClose: () => void }) {
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
        {onRemove && <button type="button" className="lx-cover-picker__remove" onClick={() => { onRemove(); onClose(); }}>{t.remove}</button>}
      </div>
      {tab === "gallery" ? (
        <div className="lx-cover-picker__body">
          {coverCategories.map((cat) => (
            <section key={cat.id}>
              <h4>{locale === "ar" ? cat.ar : cat.en}</h4>
              <div className="lx-cover-picker__grid">
                {coverGallery.filter((c) => c.category === cat.id).map((c) => (
                  <button key={c.src} type="button" title={c.license ? t.credit(c.title, c.license) : c.title} aria-label={c.title} onClick={() => { onPick(c.src); onClose(); }}
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

function IconPicker({ currentIcon, onPick, onRemove, onClose }: { currentIcon?: string; onPick: (icon: string) => void; onRemove?: () => void; onClose: () => void }) {
  const t = useCopy(copy);
  const ref = useDismiss(true, onClose);
  const parsed = parseIconWithColor(currentIcon);
  const [selectedColor, setSelectedColor] = useState<NotionIconColorId>(parsed.colorId ?? "default");
  const colorHex = NOTION_ICON_COLORS.find((c) => c.id === selectedColor)?.color;

  return (
    <div ref={ref} className="lx-emoji-picker ws-glass" role="dialog" aria-label={t.icon}>
      <div className="lx-cover-picker__tabs">
        <button type="button" onClick={() => { onPick(selectedColor !== "default" ? `${pickRandom(LEARN_ICON_NAMES)}:${selectedColor}` : pickRandom(LEARN_ICON_NAMES)); onClose(); }}>{t.random}</button>
        {onRemove && <button type="button" className="lx-cover-picker__remove" onClick={() => { onRemove(); onClose(); }}>{t.remove}</button>}
      </div>
      <div className="lx-color-swatches" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "8px", padding: "10px 14px", borderBottom: "1px solid var(--ws-line)" }}>
        {NOTION_ICON_COLORS.map((c) => {
          const isSelected = selectedColor === c.id;
          return (
            <button
              key={c.id}
              type="button"
              aria-label={c.label}
              title={c.label}
              onClick={() => setSelectedColor(c.id)}
              style={{
                width: "22px",
                height: "22px",
                borderRadius: "50%",
                backgroundColor: c.color,
                border: isSelected ? "2px solid #ffffff" : "1px solid rgba(255,255,255,0.2)",
                boxShadow: isSelected ? "0 0 0 2px var(--primary, #3b82f6)" : "none",
                cursor: "pointer",
                justifySelf: "center",
                transition: "transform 0.1s ease",
              }}
            />
          );
        })}
      </div>
      <div className="lx-emoji-picker__grid">
        {LEARN_ICON_NAMES.map((name) => {
          const Icon = LUCIDE_LEARN_ICONS[name];
          return (
            <button
              key={name}
              type="button"
              aria-label={name}
              title={name}
              onClick={() => {
                onPick(selectedColor !== "default" ? `${name}:${selectedColor}` : name);
                onClose();
              }}
            >
              <Icon size={20} style={selectedColor !== "default" ? { color: colorHex } : undefined} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Full-width cover band. Renders nothing without a cover. */
export function LessonCover({ meta, editable, onChange }: { meta: PageLook; editable: boolean; onChange: (patch: Partial<PageLook>) => void }) {
  const t = useCopy(copy);
  const [picker, setPicker] = useState(false);
  const [moving, setMoving] = useState(false);
  const [y, setY] = useState(meta.coverY ?? 50);
  const drag = useRef<{ startY: number; startPos: number; height: number } | null>(null);
  useEffect(() => { if (!moving) setY(meta.coverY ?? 50); }, [meta.coverY, moving]);
  if (!isCoverUrl(meta.coverUrl)) return null;
  return (
    <div className="lx-cover" data-moving={moving}>
      <img src={meta.coverUrl} alt="" draggable={false} style={{ objectPosition: `center ${y}%` }}
        onPointerDown={(e) => { if (!moving) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = { startY: e.clientY, startPos: y, height: e.currentTarget.getBoundingClientRect().height }; }}
        onPointerMove={(e) => { const d = drag.current; if (!d) return; setY(Math.max(0, Math.min(100, d.startPos - ((e.clientY - d.startY) / d.height) * 100))); }}
        onPointerUp={() => { drag.current = null; }} />
      {moving && <span className="lx-cover__hint">{t.dragHint}</span>}
      {editable && (
        <div className="lx-cover__actions">
          {moving ? <button type="button" onClick={() => { onChange({ coverY: Math.round(y) }); setMoving(false); }}>{t.save}</button> : <>
            <button type="button" onClick={() => setPicker(true)}><ImageIcon size={14} aria-hidden />{t.change}</button>
            <button type="button" onClick={() => setMoving(true)}><MoveVertical size={14} aria-hidden />{t.reposition}</button>
            <button type="button" aria-label={t.remove} title={t.remove} onClick={() => onChange({ coverUrl: undefined, coverY: undefined })}><Trash2 size={14} aria-hidden /></button>
          </>}
        </div>
      )}
      {picker && <CoverPicker onPick={(coverUrl) => onChange({ coverUrl, coverY: 50 })} onRemove={() => onChange({ coverUrl: undefined, coverY: undefined })} onClose={() => setPicker(false)} />}
    </div>
  );
}

/** The page icon and the hover row of "Add icon" / "Add cover", placed above the title. */
export function PageIconControls({ meta, editable, onChange }: { meta: PageLook; editable: boolean; onChange: (patch: Partial<PageLook>) => void }) {
  const t = useCopy(copy);
  const [picker, setPicker] = useState(false);
  const hasCover = isCoverUrl(meta.coverUrl);
  return (
    <div className="lx-page-top" data-cover={hasCover} data-icon={!!meta.icon}>
      {meta.icon && (
        <div className="lx-page-icon-wrap">
          <button type="button" className="lx-page-icon" aria-label={t.icon} disabled={!editable} onClick={() => setPicker(true)}>
            <CourseOrLessonIcon icon={meta.icon} size={48} />
          </button>
          {picker && <IconPicker currentIcon={meta.icon} onPick={(icon) => onChange({ icon })} onRemove={() => onChange({ icon: undefined })} onClose={() => setPicker(false)} />}
        </div>
      )}
      {editable && (!meta.icon || !hasCover) && (
        <div className="lx-page-add">
          {!meta.icon && <button type="button" onClick={() => onChange({ icon: pickRandom(LEARN_ICON_NAMES) })}><SmilePlus size={15} aria-hidden />{t.addIcon}</button>}
          {!hasCover && <button type="button" onClick={() => onChange({ coverUrl: pickRandom(coverGallery.filter((c) => c.category !== "color")).src, coverY: 50 })}><ImageIcon size={15} aria-hidden />{t.addCover}</button>}
        </div>
      )}
    </div>
  );
}
