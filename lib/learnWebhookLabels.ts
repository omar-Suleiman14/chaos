import type { LearnWebhookEventType } from "../convex/webhookModel";
export const learnWebhookLabels = {
  en: { "lesson.updated": "Lesson updated", "lesson.published": "Lesson published", "lesson.forked": "Lesson forked", "lesson.archived": "Lesson archived", "lesson.unpublished": "Lesson unpublished", "collection.updated": "Collection updated", "collection.published": "Collection published", "curriculum.mapping_changed": "Curriculum mapping changed" },
  ar: { "lesson.updated": "تحديث درس", "lesson.published": "نشر درس", "lesson.forked": "نسخة مشتقة من درس", "lesson.archived": "أرشفة درس", "lesson.unpublished": "إلغاء نشر درس", "collection.updated": "تحديث مجموعة", "collection.published": "نشر مجموعة", "curriculum.mapping_changed": "تغيير ارتباط بالمنهج" },
} satisfies Record<"en" | "ar", Record<LearnWebhookEventType, string>>;
export function learnWebhookLabel(locale: string, event: string): string {
  return learnWebhookLabels[locale === "ar" ? "ar" : "en"][event as LearnWebhookEventType] ?? event;
}
