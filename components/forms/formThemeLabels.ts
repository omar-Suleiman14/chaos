"use client";

import { conditionOpLabels, fieldTypeLabels, presentationHints, presentationLabels } from "@/convex/formLogic";
import type { ConditionOp, FieldType, Presentation } from "@/convex/formLogic";
import { backdropOptions, buttonOptions, coverOptions, fontOptions, soundOptions, themePresets } from "./formThemes";
import { useLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";

/**
 * Arabic names for the English-only data in formThemes.ts and convex/formLogic.ts.
 * The builder reads labels through useBuilderLabels(); English falls back to the source data.
 */
const ar = {
  fieldTypes: {
    text: "نص قصير", textarea: "نص طويل", email: "بريد إلكتروني", phone: "هاتف", url: "موقع إلكتروني", number: "رقم", date: "تاريخ", time: "وقت",
    choice: "اختيار واحد", dropdown: "قائمة منسدلة", multi_choice: "خيارات متعددة", rating: "تقييم", scale: "مقياس", ranking: "ترتيب",
    matrix: "شبكة (ليكرت)", file: "رفع ملف", statement: "كتلة نص", section: "فاصل قسم",
  } as Record<FieldType, string>,
  presentations: { page: "كلاسيكي", sections: "أقسام", conversational: "نمط Typeform", swipe: "تمرير" } as Record<Presentation, string>,
  presentationHints: {
    page: "كل الأسئلة في صفحة واحدة قابلة للتمرير.",
    sections: "صفحة لكل فاصل قسم.",
    conversational: "سؤال واحد في كل مرة، مع دعم لوحة المفاتيح.",
    swipe: "بطاقات بملء الشاشة يمررها الناس كالفيديوهات القصيرة.",
  } as Record<Presentation, string>,
  ops: {
    equals: "يساوي", not_equals: "لا يساوي", includes: "يتضمن", not_includes: "لا يتضمن", answered: "تمت الإجابة عنه", not_answered: "لم تتم الإجابة عنه",
    gt: "أكبر من", gte: "لا يقل عن", lt: "أصغر من", lte: "لا يزيد على",
  } as Record<ConditionOp, string>,
  themes: {
    "google-forms": ["بأسلوب Google Forms", "يشبه Google Forms. غير تابع لشركة Google."],
    "microsoft-forms": ["بأسلوب Microsoft Forms", "يشبه Microsoft Forms. غير تابع لشركة Microsoft."],
    paper: ["ورق", "مستوحى من Google Forms"],
    chaos: ["أخضر داكن", "ملصق أخضر جريء، أول مظهر في Chaos"],
    "soft-grid": ["شبكة ناعمة", "مستوحى من Microsoft Forms"],
    spotlight: ["ضوء مسلط", "مستوحى من Typeform"],
    terracotta: ["تيراكوتا", "أسلوب تحريري دافئ"],
    ocean: ["محيط", "هادئ وواسع"],
    midnight: ["منتصف الليل", "تباين داكن"],
    garden: ["حديقة", "ألوان طبيعية هادئة"],
    neon: ["نيون", "أخضر ليموني على الأسود"],
    aurora: ["شفق", "توهج الشفق القطبي"],
    candy: ["حلوى", "مرح وحلو"],
    terminal: ["طرفية", "شاشة فسفورية خضراء"],
    newsprint: ["صحيفة", "صفحة أولى تحريرية"],
    arcade: ["أركيد", "ليلة ألعاب قديمة"],
    velvet: ["مخمل", "هادئ وداكن وأنيق"],
    sunset: ["غروب", "تدرج دافئ متوهج"],
  } as Record<string, [string, string]>,
  fonts: { sans: "عصري", display: "غروتسك", serif: "سيريف", editorial: "تحريري", elegant: "أنيق", rounded: "مستدير", mono: "أحادي", roboto: "Roboto", segoe: "Segoe UI" } as Record<string, string>,
  covers: {
    none: "بدون شاشة بداية", classic: "وسط", split: "مقسوم", poster: "ملصق", minimal: "بسيط", editorial: "تحريري", scroll: "تمرير", terminal: "طرفية", arcade: "أركيد",
  } as Record<string, string>,
  backdrops: { none: "سادة", dots: "نقاط", grid: "شبكة", gradient: "توهج", aurora: "شفق", noise: "حبيبات", stripes: "خطوط", scanlines: "خطوط مسح" } as Record<string, string>,
  buttons: { solid: "ممتلئ", soft: "ناعم", pill: "مستدير", outline: "إطار", brutal: "جريء" } as Record<string, string>,
  sounds: {
    soft: ["زجاج", "أجراس لطيفة"], pop: ["فقاعات", "مرح ومشرق"], wood: ["خشب", "ماريمبا دافئة"], arcade: ["أركيد", "نغمات 8 بت"], off: ["صامت", "بدون أصوات"],
  } as Record<string, [string, string]>,
};

export interface BuilderLabels {
  fieldType: (t: FieldType) => string;
  presentation: (p: Presentation) => string;
  presentationHint: (p: Presentation) => string;
  op: (o: ConditionOp) => string;
  themeName: (id: string) => string;
  themeNote: (id: string) => string;
  font: (id: string) => string;
  cover: (id: string) => string;
  backdrop: (id: string) => string;
  button: (id: string) => string;
  sound: (id: string) => string;
  soundHint: (id: string) => string;
}

export function builderLabels(locale: Locale): BuilderLabels {
  if (locale !== "ar") {
    return {
      fieldType: (t) => fieldTypeLabels[t],
      presentation: (p) => presentationLabels[p],
      presentationHint: (p) => presentationHints[p],
      op: (o) => conditionOpLabels[o],
      themeName: (id) => themePresets.find((p) => p.id === id)?.name ?? id,
      themeNote: (id) => themePresets.find((p) => p.id === id)?.inspiration ?? "",
      font: (id) => fontOptions.find((o) => o.id === id)?.label ?? id,
      cover: (id) => coverOptions.find((o) => o.id === id)?.label ?? id,
      backdrop: (id) => backdropOptions.find((o) => o.id === id)?.label ?? id,
      button: (id) => buttonOptions.find((o) => o.id === id)?.label ?? id,
      sound: (id) => soundOptions.find((o) => o.id === id)?.label ?? id,
      soundHint: (id) => soundOptions.find((o) => o.id === id)?.hint ?? "",
    };
  }
  return {
    fieldType: (t) => ar.fieldTypes[t] ?? fieldTypeLabels[t],
    presentation: (p) => ar.presentations[p],
    presentationHint: (p) => ar.presentationHints[p],
    op: (o) => ar.ops[o],
    themeName: (id) => ar.themes[id]?.[0] ?? id,
    themeNote: (id) => ar.themes[id]?.[1] ?? "",
    font: (id) => ar.fonts[id] ?? id,
    cover: (id) => ar.covers[id] ?? id,
    backdrop: (id) => ar.backdrops[id] ?? id,
    button: (id) => ar.buttons[id] ?? id,
    sound: (id) => ar.sounds[id]?.[0] ?? id,
    soundHint: (id) => ar.sounds[id]?.[1] ?? "",
  };
}

export function useBuilderLabels(): BuilderLabels {
  return builderLabels(useLocale().locale);
}
