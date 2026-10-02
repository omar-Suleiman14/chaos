import type { ThemePresetId } from "@/convex/formLogic";
import { emptyDefinition } from "@/convex/formLogic";
import { themeFromPreset } from "@/components/forms/formThemes";
import type { Locale } from "@/lib/locale";

/** A blank quiz (scored; any published quiz can be hosted live). Pass to useCreateForm's create(). */
export function newQuizArgs(locale: Locale) {
  const title = locale === "ar" ? "اختبار بلا عنوان" : "Untitled quiz";
  const definition = { ...emptyDefinition(title), quiz: { enabled: true }, defaultLanguage: locale, languages: [locale] };
  return { definition, quizMode: true, title };
}

/** A blank live-game quiz: one question at a time, quiz scoring on. Pass to useCreateForm's create(). */
export function newGameArgs(locale: Locale, preset: ThemePresetId = "paper") {
  const title = locale === "ar" ? "لعبة بلا عنوان" : "Untitled game";
  const definition = {
    ...emptyDefinition(title), theme: themeFromPreset(preset),
    quiz: { enabled: true }, defaultLanguage: locale, languages: [locale], presentation: "conversational" as const,
  };
  return { definition, quizMode: true, title };
}
