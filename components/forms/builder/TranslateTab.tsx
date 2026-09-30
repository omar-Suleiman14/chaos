"use client";

import { languageNames, languages, missingTranslations } from "@/convex/formLogic";
import type { FormDefinition, FormField, Language, Translation } from "@/convex/formLogic";
import { pluralForm } from "@/lib/locale";
import { useCopy } from "@/lib/i18n";
import { Select } from "@/components/workspace/Select";

const copy = {
  en: {
    empty: "(empty)", languages: "Languages",
    help: "Respondents can switch language at any time. Untranslated text shows in the main language.",
    main: "Main language", mainNote: "This doesn’t translate existing text.",
    enable: "Enable a second language to translate this form.", translation: (name: string) => `${name} translation`,
    missing: (n: number) => `${n} item${n === 1 ? "" : "s"} missing`, complete: "Complete", title: "Title", intro: "Introduction",
    field: (n: number) => `Field ${n}`, fieldLabel: (n: number) => `Field ${n} label`, fieldDescription: (n: number) => `Field ${n} description`, fieldPlaceholder: (n: number) => `Field ${n} placeholder`,
    low: "Low label", high: "High label", option: (l: string) => `Option ${l}`, row: (l: string) => `Row ${l}`,
    ending: (n: number) => `Ending ${n}`, endingTitle: (n: number) => `Ending ${n} title`, endingMessage: (n: number) => `Ending ${n} message`,
  },
  ar: {
    empty: "(فارغ)", languages: "اللغات",
    help: "يبدّل المجيب اللغة متى شاء. ويظهر النص غير المترجم باللغة الرئيسية.",
    main: "اللغة الرئيسية", mainNote: "لا يترجم هذا النص الموجود.",
    enable: "فعّل لغة ثانية لترجمة هذا النموذج.", translation: (name: string) => `ترجمة ${name}`,
    missing: (n: number) => pluralForm("ar", n, { one: "عنصر واحد ناقص", two: "عنصران ناقصان", few: `${n} عناصر ناقصة`, other: `${n} عنصرًا ناقصًا` }), complete: "مكتملة", title: "العنوان", intro: "المقدمة",
    field: (n: number) => `الحقل ${n}`, fieldLabel: (n: number) => `تسمية الحقل ${n}`, fieldDescription: (n: number) => `وصف الحقل ${n}`, fieldPlaceholder: (n: number) => `النص التوضيحي للحقل ${n}`,
    low: "تسمية الحد الأدنى", high: "تسمية الحد الأقصى", option: (l: string) => `الخيار ${l}`, row: (l: string) => `الصف ${l}`,
    ending: (n: number) => `شاشة النهاية ${n}`, endingTitle: (n: number) => `عنوان شاشة النهاية ${n}`, endingMessage: (n: number) => `رسالة شاشة النهاية ${n}`,
  },
};

function Pair({ source, value, onChange, multiline, label, dir, empty }: { empty: string; source: string; value: string; onChange: (v: string) => void; multiline?: boolean; label: string; dir: "rtl" | "ltr" }) {
  const missing = source.trim() && !value.trim();
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-start">
      <p className="text-sm text-muted-foreground whitespace-pre-line py-2">{source || <em>{empty}</em>}</p>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} dir={dir} rows={2} aria-label={label} className={`kb-input text-sm ${missing ? "border-primary/60" : ""}`} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} dir={dir} aria-label={label} className={`kb-input text-sm ${missing ? "border-primary/60" : ""}`} />
      )}
    </div>
  );
}

export default function TranslateTab({ def, change, readOnly }: {
  def: FormDefinition;
  change: (updater: (d: FormDefinition) => FormDefinition) => void;
  readOnly: boolean;
}) {
  const t = useCopy(copy);
  const others = def.languages.filter((l) => l !== def.defaultLanguage);
  const missing = missingTranslations(def);

  const setLanguages = (next: Language[], defaultLanguage = def.defaultLanguage) => change((d) => ({ ...d, languages: next, defaultLanguage }));
  const setFieldTranslation = (field: FormField, lang: Language, patch: Partial<Translation>) =>
    change((d) => ({
      ...d,
      fields: d.fields.map((f) => (f.id === field.id ? { ...f, translations: { ...f.translations, [lang]: { ...f.translations?.[lang], ...patch } } } : f)),
    }));

  return (
    <fieldset disabled={readOnly} className="space-y-6">
      <section className="chaos-card bg-card p-5 space-y-3" aria-label={t.languages}>
        <h2 className="chaos-heading text-sm">{t.languages}</h2>
        <p className="text-xs text-muted-foreground">{t.help}</p>
        <div className="flex flex-wrap gap-4">
          {languages.map((l) => (
            <label key={l} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={def.languages.includes(l)} disabled={l === def.defaultLanguage}
                onChange={(e) => setLanguages(e.target.checked ? [...def.languages, l] : def.languages.filter((x) => x !== l))} />
              {languageNames[l]}
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm ms-auto">
            {t.main}
            <Select size="sm" value={def.defaultLanguage} onChange={(lang: Language) => {
              setLanguages(def.languages.includes(lang) ? def.languages : [...def.languages, lang], lang);
            }} options={languages.map((l) => ({ value: l, label: languageNames[l] }))} />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">{t.mainNote}</p>
      </section>

      {others.length === 0 && <p className="text-sm text-muted-foreground">{t.enable}</p>}

      {others.map((lang) => {
        const dir = lang === "ar" ? "rtl" : "ltr";
        return (
          <section key={lang} className="chaos-card bg-card p-5 space-y-4" aria-label={t.translation(languageNames[lang])}>
            <div className="flex items-center justify-between">
              <h2 className="chaos-heading text-sm">{languageNames[lang].toUpperCase()}</h2>
              <p className={`text-xs ${missing[lang]?.length ? "text-primary" : "text-muted-foreground"}`}>
                {missing[lang]?.length ? t.missing(missing[lang].length) : t.complete}
              </p>
            </div>
            <Pair empty={t.empty} label={t.title} source={def.title} dir={dir} value={def.translations?.[lang]?.title ?? ""}
              onChange={(v) => change((d) => ({ ...d, translations: { ...d.translations, [lang]: { ...d.translations?.[lang], title: v } } }))} />
            <Pair empty={t.empty} label={t.intro} multiline source={def.description} dir={dir} value={def.translations?.[lang]?.description ?? ""}
              onChange={(v) => change((d) => ({ ...d, translations: { ...d.translations, [lang]: { ...d.translations?.[lang], description: v } } }))} />
            {def.fields.map((f, i) => {
              const ft = f.translations?.[lang] ?? {};
              return (
                <div key={f.id} className="border-t border-foreground/10 pt-3 space-y-2">
                  <p className="chaos-heading text-[10px] text-muted-foreground">{t.field(i + 1)}</p>
                  {f.label && <Pair empty={t.empty} label={t.fieldLabel(i + 1)} source={f.label} dir={dir} value={ft.label ?? ""} onChange={(v) => setFieldTranslation(f, lang, { label: v })} />}
                  {f.description && <Pair empty={t.empty} label={t.fieldDescription(i + 1)} multiline source={f.description} dir={dir} value={ft.description ?? ""} onChange={(v) => setFieldTranslation(f, lang, { description: v })} />}
                  {f.placeholder && <Pair empty={t.empty} label={t.fieldPlaceholder(i + 1)} source={f.placeholder} dir={dir} value={ft.placeholder ?? ""} onChange={(v) => setFieldTranslation(f, lang, { placeholder: v })} />}
                  {f.minLabel && <Pair empty={t.empty} label={t.low} source={f.minLabel} dir={dir} value={ft.minLabel ?? ""} onChange={(v) => setFieldTranslation(f, lang, { minLabel: v })} />}
                  {f.maxLabel && <Pair empty={t.empty} label={t.high} source={f.maxLabel} dir={dir} value={ft.maxLabel ?? ""} onChange={(v) => setFieldTranslation(f, lang, { maxLabel: v })} />}
                  {f.options?.map((o) => (
                    <Pair empty={t.empty} key={o.id} label={t.option(o.label)} source={o.label} dir={dir} value={ft.options?.[o.id] ?? ""}
                      onChange={(v) => setFieldTranslation(f, lang, { options: { ...ft.options, [o.id]: v } })} />
                  ))}
                  {f.rows?.map((r) => (
                    <Pair empty={t.empty} key={r.id} label={t.row(r.label)} source={r.label} dir={dir} value={ft.rows?.[r.id] ?? ""}
                      onChange={(v) => setFieldTranslation(f, lang, { rows: { ...ft.rows, [r.id]: v } })} />
                  ))}
                </div>
              );
            })}
            {def.endings.map((e, i) => (
              <div key={e.id} className="border-t border-foreground/10 pt-3 space-y-2">
                <p className="chaos-heading text-[10px] text-muted-foreground">{t.ending(i + 1)}</p>
                <Pair empty={t.empty} label={t.endingTitle(i + 1)} source={e.title} dir={dir} value={e.translations?.[lang]?.title ?? ""}
                  onChange={(v) => change((d) => ({ ...d, endings: d.endings.map((x) => (x.id === e.id ? { ...x, translations: { ...x.translations, [lang]: { ...x.translations?.[lang], title: v } } } : x)) }))} />
                <Pair empty={t.empty} label={t.endingMessage(i + 1)} multiline source={e.message} dir={dir} value={e.translations?.[lang]?.message ?? ""}
                  onChange={(v) => change((d) => ({ ...d, endings: d.endings.map((x) => (x.id === e.id ? { ...x, translations: { ...x.translations, [lang]: { ...x.translations?.[lang], message: v } } } : x)) }))} />
              </div>
            ))}
          </section>
        );
      })}
    </fieldset>
  );
}
