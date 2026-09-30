"use client";

import { useMemo, useState } from "react";
import { GraduationCap, Tags, X } from "lucide-react";
import { Select } from "@/components/workspace/Select";
import { useCurriculumNodes } from "@/lib/learn/data";
import { ancestors } from "@/lib/learn/search";
import type { CurriculumRef, LessonMeta } from "@/lib/learn/types";
import { useCopy } from "@/lib/i18n";

const copy = {
  en: {
    details: "Details", tags: "Tags", tagsHelp: "Press Enter to add. Up to 12.", tagPh: "e.g. hepatology", removeTag: (t: string) => `Remove tag ${t}`,
    language: "Lesson language", languageHelp: "Sets reading direction and search language.", langs: { en: "English", ar: "العربية (Arabic)", other: "Other" },
    cover: "Cover image link", coverHelp: "An https image link. Used on cards and when the lesson is shared.", coverInvalid: "Use a full https:// link.",
    author: "Author name shown", authorHelp: "Leave empty to use your account name.", license: "Licence", licenses: { "": "Not specified", "CC BY 4.0": "CC BY 4.0 (others can reuse with credit)", "CC BY-SA 4.0": "CC BY-SA 4.0", "CC BY-NC 4.0": "CC BY-NC 4.0 (no commercial use)", "All rights reserved": "All rights reserved" } as Record<string, string>,
    curricula: "Courses this lesson applies to", curriculaHelp: "A lesson can apply to several courses without belonging to any one of them.",
    pickModule: "Add a course module", noCurricula: "No courses in the directory yet. Add them under Learn → My courses.", remove: "Remove",
    otherLang: "Language code (e.g. fr)",
  },
  ar: {
    details: "التفاصيل", tags: "الوسوم", tagsHelp: "اضغط Enter للإضافة. حتى 12 وسمًا.", tagPh: "مثل: أمراض الكبد", removeTag: (t: string) => `أزل الوسم ${t}`,
    language: "لغة الدرس", languageHelp: "تحدد اتجاه القراءة ولغة البحث.", langs: { en: "English (الإنجليزية)", ar: "العربية", other: "لغة أخرى" },
    cover: "رابط صورة الغلاف", coverHelp: "رابط صورة https. يُستخدم في البطاقات وعند مشاركة الدرس.", coverInvalid: "استخدم رابطًا كاملًا يبدأ بـ https://.",
    author: "اسم الكاتب الظاهر", authorHelp: "اتركه فارغًا لاستخدام اسم حسابك.", license: "الترخيص", licenses: { "": "غير محدد", "CC BY 4.0": "CC BY 4.0 (يمكن إعادة الاستخدام مع النسبة)", "CC BY-SA 4.0": "CC BY-SA 4.0", "CC BY-NC 4.0": "CC BY-NC 4.0 (دون استخدام تجاري)", "All rights reserved": "جميع الحقوق محفوظة" } as Record<string, string>,
    curricula: "المقررات التي ينطبق عليها الدرس", curriculaHelp: "يمكن أن ينطبق الدرس على عدة مقررات دون أن ينتمي إلى أحدها.",
    pickModule: "أضف وحدة مقرر", noCurricula: "لا مقررات في الدليل بعد. أضفها من Learn ← مقرراتي.", remove: "إزالة",
    otherLang: "رمز اللغة (مثل fr)",
  },
};

export function MetadataPanel({ meta, onChange }: { meta: LessonMeta; onChange: (patch: Partial<LessonMeta>) => void }) {
  const t = useCopy(copy);
  const loaded = useCurriculumNodes();
  const nodes = useMemo(() => loaded ?? [], [loaded]);
  const [tag, setTag] = useState("");
  const [cover, setCover] = useState(meta.coverUrl ?? "");
  const [coverError, setCoverError] = useState("");
  const byId = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);
  const modules = nodes.filter((n) => n.kind === "module");
  const langChoice = meta.language === "en" || meta.language === "ar" ? meta.language : "other";

  const addModule = (moduleId: string) => {
    const chain = ancestors(byId, moduleId).reverse();
    const version = chain.find((n) => n.kind === "version");
    if (!version || meta.curricula.some((c) => c.moduleId === moduleId)) return;
    const ref: CurriculumRef = { moduleId, versionId: version.id, versionLabel: version.name, path: chain.filter((n) => n.kind !== "version").map((n) => n.name) };
    onChange({ curricula: [...meta.curricula, ref] });
  };

  return (
    <div className="lx-form">
      <label className="lx-field">{t.language}
        <Select label={t.language} value={langChoice} onChange={(v) => onChange({ language: v === "other" ? "" : v })} options={(["en", "ar", "other"] as const).map((v) => ({ value: v, label: t.langs[v] }))} />
        {langChoice === "other" && <input className="lx-input" value={meta.language} placeholder={t.otherLang} aria-label={t.otherLang} maxLength={12} onChange={(e) => onChange({ language: e.target.value.trim().toLowerCase() })} />}
        <small>{t.languageHelp}</small>
      </label>

      <div className="lx-field">
        <span><Tags size={13} aria-hidden /> {t.tags}</span>
        <div className="lx-chips">
          {meta.tags.map((x) => <span key={x} className="lx-chip" data-on="true">#{x}<button type="button" aria-label={t.removeTag(x)} onClick={() => onChange({ tags: meta.tags.filter((y) => y !== x) })}><X size={12} /></button></span>)}
        </div>
        <input className="lx-input" value={tag} placeholder={t.tagPh} aria-label={t.tags} maxLength={40} disabled={meta.tags.length >= 12}
          onChange={(e) => setTag(e.target.value)}
          onKeyDown={(e) => { if ((e.key === "Enter" || e.key === ",") && tag.trim()) { e.preventDefault(); onChange({ tags: [...meta.tags, tag] }); setTag(""); } }} />
        <small>{t.tagsHelp}</small>
      </div>

      <div className="lx-field">
        <span><GraduationCap size={13} aria-hidden /> {t.curricula}</span>
        {meta.curricula.map((c) => (
          <div key={c.moduleId} className="lx-panel__row lx-badge" data-tone="blue" style={{ borderRadius: 8, padding: "6px 8px", whiteSpace: "normal" }}>
            <span>{c.path.join(" › ")} · {c.versionLabel}</span>
            <button type="button" className="ws-icon-button" aria-label={`${t.remove}: ${c.path.at(-1)}`} onClick={() => onChange({ curricula: meta.curricula.filter((x) => x.moduleId !== c.moduleId) })}><X size={12} /></button>
          </div>
        ))}
        {modules.length ? (
          <Select label={t.pickModule} value="" placeholder={t.pickModule} onChange={(v) => addModule(v)}
            options={modules.filter((m) => !meta.curricula.some((c) => c.moduleId === m.id)).map((m) => {
              const chain = ancestors(byId, m.id).reverse();
              return { value: m.id, label: chain.map((n) => n.name).join(" › ") };
            })} />
        ) : <small>{t.noCurricula}</small>}
        <small>{t.curriculaHelp}</small>
      </div>

      <label className="lx-field">{t.cover}
        <input className="lx-input" type="url" inputMode="url" value={cover} placeholder="https://…" aria-invalid={!!coverError}
          onChange={(e) => { setCover(e.target.value); setCoverError(""); }}
          onBlur={() => {
            const v = cover.trim();
            if (!v) { onChange({ coverUrl: undefined }); return; }
            try { if (new URL(v).protocol !== "https:") throw new Error(); onChange({ coverUrl: v }); } catch { setCoverError(t.coverInvalid); }
          }} />
        {coverError ? <small className="lx-error" role="alert">{coverError}</small> : <small>{t.coverHelp}</small>}
      </label>

      <label className="lx-field">{t.author}<input className="lx-input" value={meta.authorDisplay ?? ""} maxLength={120} onChange={(e) => onChange({ authorDisplay: e.target.value || undefined })} /><small>{t.authorHelp}</small></label>

      <label className="lx-field">{t.license}
        <Select label={t.license} value={meta.license ?? ""} onChange={(v) => onChange({ license: v || undefined })} options={Object.entries(t.licenses).map(([value, label]) => ({ value, label }))} />
      </label>
    </div>
  );
}

