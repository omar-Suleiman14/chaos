"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, Check, ChevronRight, Play, Maximize2, Monitor, RotateCcw, Shuffle, Smartphone, Trash2, Volume2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { themeClass, themeStyle } from "@/components/forms/FormRenderer";
import {
  backdropOptions, buttonOptions, contrastIssues, coverOptions, customTheme, fontOptions, isHex, isThemeEdited, randomPalette, resetTheme, soundOptions, themeFromPreset, themePresets,
} from "@/components/forms/formThemes";
import type { FormDefinition, FormTheme, Language, Presentation } from "@/convex/formLogic";
import { errorMessage } from "@/lib/errors";
import { useBuilderLabels } from "@/components/forms/formThemeLabels";
import { useCopy, useLocale } from "@/lib/i18n";
import { sfx } from "@/lib/sfx";
import { PreviewSurface } from "./FormPreview";
import { useIsPhone } from "@/components/workspace/useIsPhone";
import { WsSwitch } from "@/components/workspace/primitives";

const copy = {
  en: {
    straight: "Straight to question 1", mode: "Mode", theme: "Theme", custom: "Custom", edited: " · edited", resetTo: (name?: string) => `Reset to ${name}`,
    resetDone: (name?: string) => `Reset to ${name}`, themeChanged: (name?: string) => `Theme changed to ${name}`, ownColours: "Your own colours and styles.",
    startScreen: "Start screen", sounds: "Sounds", playSounds: "Play sounds", soundsOff: "Off. Turn on for gentle taps and chimes while people answer. They can always mute.",
    customize: "Customize colours, fonts and more", colours: "Colours", light: "Light", dark: "Dark",
    accent: "Accent", page: "Page", surface: "Surface", text: "Text", picker: (l: string) => `${l} picker`, hex: (l: string) => `${l} hex`,
    lowContrast: (items: string) => `Low contrast: ${items}. Some people may struggle to read it.`,
    contrast: { "Text on page": "text on page", "Text on form surface": "text on form surface", "Accent on page": "accent on page", "Button label on accent": "button label on accent" } as Record<string, string>,
    darkMode: "Dark mode", asDesigned: "Always as designed", followDevice: "Follow device", font: "Font", buttons: "Buttons and corners", next: "Next", corners: "Corners",
    square: "Square", soft: "Soft", round: "Round", pageLayout: "Page layout", open: "Open", card: "Card", spacious: "Spacious", background: "Background",
    logo: "Logo", logoHint: "https://… (HTTPS image address)", logoAddress: "Logo address", savedThemes: "Saved themes", applied: (n: string) => `Applied ${n}`,
    deleteSaved: (n: string) => `Delete saved theme ${n}`, saveHint: "Save this design to reuse it on another form or quiz.", themeName: "Theme name", themeSaved: "Theme saved.", save: "Save",
    preview: "Preview", previewLanguage: "Preview language", device: "Device", desktop: "Desktop", phone: "Phone", restartPreview: "Restart preview", fullScreen: "Full-screen preview",
  },
  ar: {
    straight: "مباشرة إلى السؤال 1", mode: "النمط", theme: "المظهر", custom: "مخصص", edited: " · معدّل", resetTo: (name?: string) => `أعد إلى ${name}`,
    resetDone: (name?: string) => `أُعيد المظهر إلى ${name}`, themeChanged: (name?: string) => `تغيّر المظهر إلى ${name}`, ownColours: "ألوانك وأنماطك الخاصة.",
    startScreen: "شاشة البداية", sounds: "الأصوات", playSounds: "شغّل الأصوات", soundsOff: "متوقفة. شغّلها لتسمع نقرات ونغمات خفيفة أثناء الإجابة. يستطيع المجيبون كتمها دائمًا.",
    customize: "خصّص الألوان والخطوط وغيرها", colours: "الألوان", light: "فاتح", dark: "داكن",
    accent: "لون التمييز", page: "الصفحة", surface: "السطح", text: "النص", picker: (l: string) => `منتقي ${l}`, hex: (l: string) => `رمز ${l}`,
    lowContrast: (items: string) => `تباين منخفض: ${items}. قد يجد بعض الناس صعوبة في القراءة.`,
    contrast: { "Text on page": "النص على الصفحة", "Text on form surface": "النص على سطح النموذج", "Accent on page": "لون التمييز على الصفحة", "Button label on accent": "نص الزر على لون التمييز" } as Record<string, string>,
    darkMode: "الوضع الداكن", asDesigned: "كما صُمم دائمًا", followDevice: "حسب الجهاز", font: "الخط", buttons: "الأزرار والزوايا", next: "التالي", corners: "الزوايا",
    square: "حادة", soft: "ناعمة", round: "مستديرة", pageLayout: "تخطيط الصفحة", open: "مفتوح", card: "بطاقة", spacious: "واسع", background: "الخلفية",
    logo: "الشعار", logoHint: "https://… (رابط صورة HTTPS)", logoAddress: "رابط الشعار", savedThemes: "المظاهر المحفوظة", applied: (n: string) => `طُبّق ${n}`,
    deleteSaved: (n: string) => `احذف المظهر المحفوظ ${n}`, saveHint: "احفظ هذا التصميم لتستخدمه في نموذج أو اختبار آخر.", themeName: "اسم المظهر", themeSaved: "حُفظ المظهر.", save: "احفظ",
    preview: "معاينة", previewLanguage: "لغة المعاينة", device: "الجهاز", desktop: "الحاسوب", phone: "الهاتف", restartPreview: "أعد تشغيل المعاينة", fullScreen: "معاينة بملء الشاشة",
  },
};

const presentations: Presentation[] = ["page", "conversational", "swipe", "sections"];

function Tile({ selected, onClick, label, hint, children, tall, disabled }: {
  selected: boolean; onClick: () => void; label: string; hint?: string; children: React.ReactNode; tall?: boolean; disabled?: boolean;
}) {
  return (
    <button type="button" className={`ws-tile ${tall ? "ws-tile--tall" : ""}`} aria-pressed={selected} onClick={onClick} disabled={disabled}>
      <span className="ws-tile__art" aria-hidden="true">{children}</span>
      <span className="ws-tile__label">{label}</span>
      {hint && <span className="ws-tile__hint">{hint}</span>}
      {selected && <span className="ws-tile__check" aria-hidden="true"><Check size={11} strokeWidth={3} /></span>}
    </button>
  );
}

function ModeArt({ mode }: { mode: Presentation }) {
  const bar = (w: string, o = 0.22) => <span className="block h-[4px] rounded-full bg-current" style={{ width: w, opacity: o }} />;
  if (mode === "swipe") {
    return (
      <span className="relative w-[34px] h-[52px] rounded-[7px] border-[1.5px] border-current/40 overflow-hidden text-[var(--primary)]">
        <span className="absolute inset-x-0 top-0 h-full bg-[var(--primary)]/15" />
        <span className="absolute inset-x-1.5 top-4 grid gap-1">{bar("100%", 0.6)}{bar("70%", 0.35)}</span>
      </span>
    );
  }
  if (mode === "conversational") {
    return (
      <span className="grid gap-1.5 w-[70%] text-[var(--on-background)]">
        <span className="flex items-center gap-1 text-[8px] font-bold text-[var(--primary)]">1 →{bar("70%", 0.5)}</span>
        {["A", "B"].map((k) => <span key={k} className="flex items-center gap-1 rounded-[3px] border border-[var(--primary)]/40 px-1 py-[2px]"><span className="text-[7px] font-bold text-[var(--primary)]">{k}</span>{bar("60%")}</span>)}
      </span>
    );
  }
  if (mode === "sections") {
    return (
      <span className="flex gap-1.5 text-[var(--on-background)]">
        {[0, 1].map((i) => <span key={i} className={`grid gap-1 w-[30px] p-1.5 rounded-[3px] border border-current/20 ${i ? "opacity-40" : ""}`}>{bar("100%", 0.5)}{bar("70%")}{bar("85%")}</span>)}
      </span>
    );
  }
  return <span className="grid gap-1 w-[60%] text-[var(--on-background)]">{bar("80%", 0.5)}{bar("100%")}{bar("100%")}{bar("60%")}{bar("100%")}</span>;
}

function CoverArt({ cover, straight }: { cover: string; straight: string }) {
  const accent = "var(--primary)";
  const b = (w: string, h = 4, o = 0.28, c = "currentColor") => <span className="block rounded-full" style={{ width: w, height: h, background: c, opacity: o }} />;
  switch (cover) {
    case "scroll": return <span className="grid justify-items-center gap-1 w-full h-full content-center bg-[#131110] text-[#f3eee8]"><span className="font-serif text-[13px] leading-none">Title</span><span className="text-[9px] opacity-60">⌄</span><span className="text-[6px] tracking-[0.2em] opacity-60">SCROLL TO START</span></span>;
    case "none": return <span className="text-[10px] text-[var(--on-surface-variant)]">{straight}</span>;
    case "split": return <span className="grid grid-cols-2 w-full h-full"><span className="grid content-center gap-1 px-2">{b("90%", 5, 0.6)}{b("60%")}</span><span style={{ background: accent }} className="grid place-items-center text-white text-[14px] font-extrabold">12</span></span>;
    case "poster": return <span className="flex flex-col justify-between w-full h-full pt-2"><span className="px-2 text-[11px] font-black leading-none uppercase">Big<br />title</span><span className="h-[9px]" style={{ background: accent }} /></span>;
    case "minimal": return <span className="grid gap-1 w-[80%]">{b("40%", 3, 0.4, accent)}{b("90%", 5, 0.6)}<span className="h-px bg-current opacity-20" />{b("50%")}</span>;
    case "terminal": return <span className="w-[86%] rounded-[4px] bg-[#0b120c] p-1.5 grid gap-1 font-mono text-[7px] text-[#39ff88]"><span>$ open form</span><span>&gt; 12 questions</span></span>;
    case "arcade": return <span className="grid justify-items-center gap-0.5 w-full h-full content-center bg-[#1a0b3d] text-[#ffcc00]"><span className="text-[11px] font-black" style={{ textShadow: "2px 2px 0 #ff3d7f" }}>QUIZ</span><span className="text-[6px] tracking-widest">PRESS START</span></span>;
    case "editorial": return <span className="grid gap-1 w-[84%]"><span className="border-y-[3px] border-double border-current opacity-50 h-[6px]" /><span className="font-serif text-[12px] leading-none">The Title</span>{b("100%", 3)}{b("80%", 3)}</span>;
    default: return <span className="grid justify-items-center gap-1 w-[70%]">{b("80%", 5, 0.6)}{b("50%")}<span className="mt-1 h-[8px] w-[40%] rounded-[3px]" style={{ background: accent }} /></span>;
  }
}

export default function DesignTab({ def, change, readOnly, onFullPreview, announce }: {
  def: FormDefinition;
  change: (updater: (d: FormDefinition) => FormDefinition, options?: { checkpoint?: boolean }) => void;
  readOnly: boolean;
  onFullPreview?: () => void;
  announce?: (text: string) => void;
}) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const labels = useBuilderLabels();
  const phone = useIsPhone();
  const [language, setLanguage] = useState<Language>(def.defaultLanguage);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [run, setRun] = useState(0);
  const savedThemes = useQuery(api.forms.listMyThemes);
  const saveTheme = useMutation(api.forms.saveTheme);
  const deleteTheme = useMutation(api.forms.deleteTheme);
  const [themeName, setThemeName] = useState("");
  const [themeMessage, setThemeMessage] = useState("");
  const theme = def.theme;
  const v1 = theme.version === 1;
  const issues = contrastIssues(theme);

  const presetName = themePresets.some((p) => p.id === theme.preset) ? labels.themeName(theme.preset ?? "") : undefined;
  const edited = isThemeEdited(theme);
  /** Typed colours merge into one undo step; clicks (tiles, shuffles) are one step each. */
  const setTheme = (patch: Partial<FormTheme>, checkpoint = false) => change((d) => {
    const next = customTheme({ ...d.theme, ...patch });
    if (!next.logoUrl) delete next.logoUrl;
    return { ...d, theme: next };
  }, { checkpoint });
  const setStyle = (patch: Partial<FormTheme>) => change((d) => {
    const base = d.theme.version === 1 ? d.theme : customTheme(d.theme);
    return { ...d, theme: { ...base, ...patch } };
  }, { checkpoint: true });
  const reset = () => {
    change((d) => ({ ...d, theme: resetTheme(d.theme) }), { checkpoint: true });
    setRun((n) => n + 1);
    announce?.(t.resetDone(presetName));
  };
  const choosePreset = (id: (typeof themePresets)[number]["id"]) => {
    if (id === theme.preset && !edited) return;
    // A new look never switches sound back on; that stays the creator's choice.
    change((d) => ({ ...d, theme: { ...themeFromPreset(id, d.theme.logoUrl), ...(d.theme.sound === "off" ? { sound: "off" as const } : {}) } }), { checkpoint: true });
    setRun((n) => n + 1);
    announce?.(t.themeChanged(labels.themeName(id)));
  };

  const colorInput = (label: string, key: "accent" | "pageColor" | "surfaceColor" | "textColor", fallback: string) => {
    const value = theme[key] ?? fallback;
    return (
      <label key={key} className="flex items-center gap-2.5">
        <span className="ws-swatch" style={{ background: isHex(value) ? value : fallback }}>
          <input type="color" value={isHex(value) ? value : fallback} onChange={(e) => setTheme({ [key]: e.target.value })} aria-label={t.picker(label)} className="opacity-0" />
        </span>
        <span className="grid flex-1 min-w-0">
          <span className="text-[12px] font-semibold">{label}</span>
          <input value={value} onChange={(e) => setTheme({ [key]: e.target.value })} className="bg-transparent font-mono text-[12px] text-muted-foreground outline-none focus:text-[var(--on-background)]"
            aria-label={t.hex(label)} maxLength={7} spellCheck={false} />
        </span>
      </label>
    );
  };

  const previewHeight = device === "mobile" ? "640px" : "600px";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(320px,390px)_1fr] gap-8">
      <fieldset disabled={readOnly} className="min-w-0">
        <section className="ws-studio-section !pt-0">
          <h3>{t.mode}</h3>
          <div className="ws-tiles ws-tiles--wide">
            {presentations.map((p) => (
              <Tile key={p} tall selected={def.presentation === p} label={labels.presentation(p)} hint={labels.presentationHint(p)}
                onClick={() => { change((d) => ({ ...d, presentation: p }), { checkpoint: true }); setRun((n) => n + 1); }}>
                <ModeArt mode={p} />
              </Tile>
            ))}
          </div>
        </section>

        <section className="ws-studio-section">
          <h3>
            <span>{t.theme} <span className="font-normal">{v1 && theme.preset === "custom" ? t.custom : presetName ?? ""}{edited && t.edited}</span></span>
            {edited && !readOnly && <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" onClick={reset}><RotateCcw size={13} /> {t.resetTo(presetName)}</button>}
          </h3>
          <div className="ws-tiles">
            {themePresets.map((preset) => {
              const sample: FormDefinition = { ...def, theme: { version: 1, preset: preset.id, ...preset.theme } };
              return (
                <Tile key={preset.id} selected={theme.preset === preset.id} label={labels.themeName(preset.id)} onClick={() => choosePreset(preset.id)}>
                  <span className="absolute inset-0"><span className={`grid h-full w-full place-items-center ${themeClass(sample)}`} style={themeStyle(sample)}>
                    <span className="grid justify-items-center gap-1">
                      <span className="form-heading text-[17px] font-bold leading-none" style={{ color: "var(--form-text)" }}>Aa</span>
                      <span className="form-btn !min-h-0 !h-[11px] !w-[34px] !p-0 !border-[1.5px]" style={{ boxShadow: preset.theme.buttons === "brutal" ? "2px 2px 0 var(--form-text)" : undefined }} />
                    </span>
                  </span></span>
                </Tile>
              );
            })}
          </div>
          <p className="text-[13px] text-muted-foreground">{(themePresets.some((p) => p.id === theme.preset) ? labels.themeNote(theme.preset ?? "") : "") || t.ownColours}</p>
        </section>

        <section className="ws-studio-section">
          <h3>{t.startScreen}</h3>
          <div className="ws-tiles">
            {coverOptions.map((c) => (
              <Tile key={c.id} selected={(v1 ? theme.cover ?? "none" : "none") === c.id} label={labels.cover(c.id)} onClick={() => { setStyle({ cover: c.id }); setRun((n) => n + 1); }}>
                <CoverArt cover={c.id} straight={t.straight} />
              </Tile>
            ))}
          </div>
        </section>
        <section className="ws-studio-section">
          <h3>
            {t.sounds}
            <WsSwitch checked={(theme.sound ?? "soft") !== "off"} label={t.playSounds}
              onChange={(on) => {
                const presetPack = themePresets.find((p) => p.id === theme.preset)?.theme.sound;
                const pack = !on ? "off" : presetPack && presetPack !== "off" ? presetPack : "soft";
                setStyle({ sound: pack });
                if (on) sfx.play("start", pack);
              }} />
          </h3>
          {(theme.sound ?? "soft") === "off" ? (
            <p className="text-[13px] text-muted-foreground">{t.soundsOff}</p>
          ) : (
            <div className="ws-tiles">
              {soundOptions.filter((s) => s.id !== "off").map((s) => (
                <Tile key={s.id} selected={(theme.sound ?? "soft") === s.id} label={labels.sound(s.id)} hint={labels.soundHint(s.id)}
                  onClick={() => { setStyle({ sound: s.id }); sfx.play("start", s.id); setTimeout(() => sfx.play("correct", s.id), 420); }}>
                  <Volume2 size={18} className="text-[var(--primary)]" />
                </Tile>
              ))}
            </div>
          )}
        </section>

        <details className="ws-disclosure">
          <summary><ChevronRight size={18} className="rtl:rotate-180" /> {t.customize}</summary>
          <section className="ws-studio-section">
            <h3>
              {t.colours}
              <span className="flex gap-1">
                <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" onClick={() => { setTheme(randomPalette(false), true); }}><Shuffle size={13} /> {t.light}</button>
                <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" onClick={() => { setTheme({ ...randomPalette(true), background: "dark" }, true); }}><Shuffle size={13} /> {t.dark}</button>
              </span>
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {colorInput(t.accent, "accent", "#3595e3")}
              {colorInput(t.page, "pageColor", theme.background === "dark" ? "#171717" : "#f5f4f0")}
              {colorInput(t.surface, "surfaceColor", theme.background === "dark" ? "#242424" : "#ffffff")}
              {colorInput(t.text, "textColor", theme.background === "dark" ? "#f5f5f5" : "#202020")}
            </div>
            {issues.length > 0 && (
              <div className="ws-contrast" role="status">
                <AlertTriangle size={14} className="shrink-0 text-[var(--ws-warning)]" />
                <span>{t.lowContrast(issues.map((i) => `${t.contrast[i.label] ?? i.label.toLowerCase()} (${i.ratio}:1)`).join(locale === "ar" ? "، " : ", "))}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12px] font-semibold">{t.darkMode}</span>
              <div className="ws-segmented" role="group" aria-label={t.darkMode}>
                <button type="button" aria-pressed={theme.appearance !== "auto"} onClick={() => setStyle({ appearance: "fixed" })}>{t.asDesigned}</button>
                <button type="button" aria-pressed={theme.appearance === "auto"} onClick={() => setStyle({ appearance: "auto" })}>{t.followDevice}</button>
              </div>
            </div>
          </section>

          <section className="ws-studio-section">
            <h3>{t.font}</h3>
            <div className="ws-tiles">
              {fontOptions.map((f) => (
                <Tile key={f.id} selected={theme.font === f.id} label={labels.font(f.id)} onClick={() => setStyle({ font: f.id })}>
                  <span className={`form-font-${f.id} form-heading text-[22px] font-semibold`}>Aa</span>
                </Tile>
              ))}
            </div>
          </section>

          <section className="ws-studio-section">
            <h3>{t.buttons}</h3>
            <div className="ws-tiles">
              {buttonOptions.map((b) => {
                const sample: FormDefinition = { ...def, theme: { ...customTheme(theme), buttons: b.id } };
                return (
                  <Tile key={b.id} selected={(theme.buttons ?? "solid") === b.id} label={labels.button(b.id)} onClick={() => setStyle({ buttons: b.id })}>
                    <span className="absolute inset-0"><span className={`grid h-full w-full place-items-center ${themeClass(sample)}`} style={themeStyle(sample)}>
                      <span className="form-btn form-btn-sm !min-h-[24px] !text-[10px] !px-2.5">{t.next}</span>
                    </span></span>
                  </Tile>
                );
              })}
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12px] font-semibold">{t.corners}</span>
              <div className="ws-segmented" role="group" aria-label={t.corners}>
                {(["none", "small", "large"] as const).map((r) => (
                  <button key={r} type="button" aria-pressed={theme.radius === r} onClick={() => setStyle({ radius: r })}>{r === "none" ? t.square : r === "small" ? t.soft : t.round}</button>
                ))}
              </div>
            </div>
            {(def.presentation === "page" || def.presentation === "sections") && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12px] font-semibold">{t.pageLayout}</span>
                <div className="ws-segmented" role="group" aria-label={t.pageLayout}>
                  {(["flat", "card", "focus"] as const).map((l) => (
                    <button key={l} type="button" aria-pressed={(theme.layout ?? "flat") === l} onClick={() => setStyle({ layout: l })}>{l === "flat" ? t.open : l === "card" ? t.card : t.spacious}</button>
                  ))}
                </div>
              </div>
            )}
          </section>


          <section className="ws-studio-section">
            <h3>{t.background}</h3>
            <div className="ws-tiles">
              {backdropOptions.map((b) => {
                const sample: FormDefinition = { ...def, theme: { ...customTheme(theme), backdrop: b.id } };
                return (
                  <Tile key={b.id} selected={(theme.backdrop ?? "none") === b.id} label={labels.backdrop(b.id)} onClick={() => setStyle({ backdrop: b.id })}>
                    <span className="absolute inset-0"><span className={`block h-full w-full ${themeClass(sample)}`} style={themeStyle(sample)} /></span>
                  </Tile>
                );
              })}
            </div>
          </section>

          <section className="ws-studio-section">
            <h3>{t.logo}</h3>
            <input value={theme.logoUrl ?? ""} onChange={(e) => setTheme({ logoUrl: e.target.value || undefined })} className="kb-input" placeholder={t.logoHint} aria-label={t.logoAddress} />
          </section>

          <section className="ws-studio-section">
            <h3>{t.savedThemes}</h3>
            {savedThemes?.length ? (
              <ul className="grid gap-1">
                {savedThemes.map((saved) => (
                  <li key={saved._id} className="flex items-center gap-1">
                    <button type="button" className="ws-nav-item !min-h-[34px] flex-1" onClick={() => { change((d) => ({ ...d, theme: { ...saved.theme } }), { checkpoint: true }); announce?.(t.applied(saved.name)); }}>
                      <span className="h-4 w-4 rounded-full border border-[var(--ws-line-strong)]" style={{ background: `linear-gradient(135deg, ${saved.theme.pageColor ?? "#fff"} 50%, ${saved.theme.accent} 50%)` }} />
                      <span>{saved.name}</span>
                    </button>
                    <button type="button" className="ws-icon-button" aria-label={t.deleteSaved(saved.name)}
                      onClick={() => deleteTheme({ themeId: saved._id }).catch((error) => setThemeMessage(errorMessage(error)))}><Trash2 size={14} /></button>
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-muted-foreground">{t.saveHint}</p>}
            <div className="flex gap-2">
              <input className="kb-input" value={themeName} maxLength={80} placeholder={t.themeName} aria-label={t.themeName} onChange={(event) => setThemeName(event.target.value)} />
              <button type="button" className="ws-btn shrink-0" disabled={!themeName.trim()}
                onClick={() => saveTheme({ name: themeName, theme: customTheme(def.theme) })
                  .then(() => { setThemeName(""); setThemeMessage(t.themeSaved); })
                  .catch((error) => setThemeMessage(errorMessage(error)))}>{t.save}</button>
            </div>
            {themeMessage && <p role="status" className="text-xs">{themeMessage}</p>}
          </section>
        </details>
      </fieldset>

      {phone ? (
        onFullPreview && (
          <button type="button" className="ws-btn ws-btn--primary ws-fab" onClick={onFullPreview}><Play size={18} /> {t.preview}</button>
        )
      ) : (
        <section aria-label={t.preview} className="min-w-0 lg:sticky lg:top-16 h-fit space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[13px] font-semibold">{t.preview}</p>
            <div className="flex items-center gap-1.5">
              {def.languages.length > 1 && (
                <div className="ws-segmented" role="group" aria-label={t.previewLanguage}>
                  {def.languages.map((l) => <button key={l} type="button" aria-pressed={language === l} onClick={() => setLanguage(l)}>{l === "ar" ? "العربية" : "English"}</button>)}
                </div>
              )}
              <div className="ws-segmented" role="group" aria-label={t.device}>
                <button type="button" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")} aria-label={t.desktop}><Monitor size={14} /></button>
                <button type="button" aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")} aria-label={t.phone}><Smartphone size={14} /></button>
              </div>
              <button type="button" className="ws-btn ws-btn--ghost ws-btn--icon" onClick={() => setRun((n) => n + 1)} aria-label={t.restartPreview} title={t.restartPreview}><RotateCcw size={14} /></button>
              {onFullPreview && <button type="button" className="ws-btn ws-btn--ghost ws-btn--icon" onClick={onFullPreview} aria-label={t.fullScreen} title={t.fullScreen}><Maximize2 size={14} /></button>}
            </div>
          </div>
          <div className={`ws-preview-frame ${device === "mobile" ? "ws-preview-frame--mobile" : "w-full"}`}>
            <PreviewSurface def={def} language={language} height={previewHeight} runKey={run} />
          </div>
        </section>
      )}
    </div>
  );
}
