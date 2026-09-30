import type { IntegrationScope } from "@/convex/integrationModel";
import type { Locale } from "./locale";
const labels = {
  "lessons:read": "Read selected lessons", "lessons:create": "Create lesson drafts", "lessons:update": "Edit lesson drafts",
  "sources:read": "Read selected source metadata", "folders:read": "Read folders", "folders:update": "Organize folders",
  "curricula:read": "Browse curricula", "curricula:map": "Map lessons to curricula", "community:read": "Browse community lessons",
  "community:save": "Save community lessons", "progress:read": "Read study progress", "progress:write": "Update study progress",
};
const arabic: Record<keyof typeof labels, string> = {
  "lessons:read": "\u0642\u0631\u0627\u0621\u0629 \u0627\u0644\u062f\u0631\u0648\u0633 \u0627\u0644\u0645\u062d\u062f\u062f\u0629",
  "lessons:create": "\u0625\u0646\u0634\u0627\u0621 \u0645\u0633\u0648\u062f\u0627\u062a \u062f\u0631\u0648\u0633",
  "lessons:update": "\u062a\u0639\u062f\u064a\u0644 \u0645\u0633\u0648\u062f\u0627\u062a \u0627\u0644\u062f\u0631\u0648\u0633",
  "sources:read": "\u0642\u0631\u0627\u0621\u0629 \u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0645\u0635\u0627\u062f\u0631",
  "folders:read": "\u0642\u0631\u0627\u0621\u0629 \u0627\u0644\u0645\u062c\u0644\u062f\u0627\u062a", "folders:update": "\u062a\u0646\u0638\u064a\u0645 \u0627\u0644\u0645\u062c\u0644\u062f\u0627\u062a",
  "curricula:read": "\u062a\u0635\u0641\u062d \u0627\u0644\u0645\u0646\u0627\u0647\u062c", "curricula:map": "\u0631\u0628\u0637 \u0627\u0644\u062f\u0631\u0648\u0633 \u0628\u0627\u0644\u0645\u0646\u0627\u0647\u062c",
  "community:read": "\u062a\u0635\u0641\u062d \u062f\u0631\u0648\u0633 \u0627\u0644\u0645\u062c\u062a\u0645\u0639", "community:save": "\u062d\u0641\u0638 \u062f\u0631\u0648\u0633 \u0627\u0644\u0645\u062c\u062a\u0645\u0639",
  "progress:read": "\u0642\u0631\u0627\u0621\u0629 \u062a\u0642\u062f\u0645 \u0627\u0644\u062f\u0631\u0627\u0633\u0629", "progress:write": "\u062a\u062d\u062f\u064a\u062b \u062a\u0642\u062f\u0645 \u0627\u0644\u062f\u0631\u0627\u0633\u0629",
};
export function learnScopeLabel(scope: IntegrationScope, locale: Locale): string {
  return scope in labels ? (locale === "ar" ? arabic : labels)[scope as keyof typeof labels] : (locale === "ar" ? "\u0635\u0644\u0627\u062d\u064a\u0629" : "Permission");
}
