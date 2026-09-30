/**
 * Every row of App Settings (app/dashboard/settings/page.tsx), for the Ctrl+K palette.
 * Each `id` is the id of that row on the page, so the link scrolls to it.
 */
export interface SettingsEntry {
  id: string;
  label: string;
  section: string;
  /** Extra words people might type, searched like the body text. */
  keywords: string;
  href: string;
}

const entry = (id: string, section: string, label: string, keywords: string): SettingsEntry => ({
  id, section, label, keywords, href: `/dashboard/settings#${id}`,
});

const english: SettingsEntry[] = [
  entry("settings-account", "Account", "Manage account", "profile name email photo avatar picture clerk"),
  entry("settings-username", "Account", "Username", "custom link url handle name slug address share"),
  entry("settings-password", "Account", "Password and security", "sign in login two factor 2fa devices sessions passkey"),
  entry("settings-appearance", "Appearance", "Appearance", "dark mode light mode theme night auto system colors color scheme"),
  entry("settings-glass", "Appearance", "Glass", "opacity transparency translucent blur see-through menus popups frosted"),
  entry("settings-reduce-motion", "Appearance", "Reduce motion", "animations animation accessibility motion transitions"),
  entry("settings-new-theme", "New forms", "Theme for new forms", "default look style preset colors swatch"),
  entry("settings-new-layout", "New forms", "Layout for new forms", "presentation page sections conversational typeform one question at a time swipe"),
  entry("settings-new-language", "New forms", "Language for new forms", "english arabic عربي rtl default language"),
  entry("settings-new-sounds", "New forms", "Sounds for new forms", "sound audio music chime tap mute"),
  entry("settings-library-view", "Library", "Library view", "gallery list grid cards layout"),
  entry("settings-library-sort", "Library", "Sort library by", "order last edited name responses status"),
  entry("settings-archive", "Library", "Archive", "archived deleted restore delete trash bin"),
  entry("settings-connections", "Library", "Connections", "max chatgpt mcp apps integrations api access token webhooks webhook"),
  entry("settings-shortcuts", "Keyboard shortcuts", "Keyboard shortcuts", "keys hotkeys undo redo ctrl k ctrl b sidebar search"),
  entry("settings-quiz-timers", "Old quiz editor", "Quiz timers and points", "legacy old quiz editor timer seconds points per question shuffle randomize pass mark half marks explanations correct answers"),
  entry("settings-help", "Help", "Help and feedback", "support contact email bug report feedback"),
  entry("settings-privacy", "Help", "Privacy policy", "data privacy legal gdpr"),
  entry("settings-terms", "Help", "Terms", "terms of service legal conditions"),
  entry("settings-sign-out", "Help", "Sign out", "log out logout leave switch account"),
];

export const settingsIndex: SettingsEntry[] = english;

/** Arabic label, section and keywords per row. English keywords are kept so either language finds the row. */
const arabic: Record<string, { section: string; label: string; keywords: string }> = {
  "settings-account": { section: "الحساب", label: "إدارة الحساب", keywords: "الملف الشخصي الاسم البريد الإلكتروني الصورة profile name email photo avatar clerk" },
  "settings-username": { section: "الحساب", label: "اسم المستخدم", keywords: "الرابط المخصص عنوان مشاركة username custom link url handle slug" },
  "settings-password": { section: "الحساب", label: "كلمة المرور والأمان", keywords: "تسجيل الدخول التحقق بخطوتين الأجهزة الجلسات مفتاح المرور password security sign in 2fa devices sessions passkey" },
  "settings-appearance": { section: "المظهر", label: "المظهر", keywords: "الوضع الداكن الوضع الفاتح ليلي تلقائي النظام الألوان dark mode light mode theme appearance" },
  "settings-glass": { section: "المظهر", label: "الزجاج", keywords: "الشفافية التمويه القوائم النوافذ glass opacity transparency blur menus popups" },
  "settings-reduce-motion": { section: "المظهر", label: "تقليل الحركة", keywords: "الرسوم المتحركة إمكانية الوصول الانتقالات reduce motion animations accessibility transitions" },
  "settings-new-theme": { section: "النماذج الجديدة", label: "مظهر النماذج الجديدة", keywords: "الشكل الافتراضي النمط الألوان theme default look style preset colors" },
  "settings-new-layout": { section: "النماذج الجديدة", label: "تخطيط النماذج الجديدة", keywords: "العرض صفحة أقسام محادثة سؤال واحد في كل مرة تمرير layout presentation sections conversational typeform swipe" },
  "settings-new-language": { section: "النماذج الجديدة", label: "لغة النماذج الجديدة", keywords: "عربي إنجليزي لغة افتراضية اتجاه english arabic rtl default language" },
  "settings-new-sounds": { section: "النماذج الجديدة", label: "أصوات النماذج الجديدة", keywords: "صوت نغمة كتم sounds sound audio chime mute" },
  "settings-library-view": { section: "المكتبة", label: "عرض المكتبة", keywords: "معرض قائمة شبكة بطاقات library view gallery list grid cards" },
  "settings-library-sort": { section: "المكتبة", label: "ترتيب المكتبة", keywords: "الترتيب آخر تعديل الاسم الردود الحالة sort order last edited name responses status" },
  "settings-archive": { section: "المكتبة", label: "الأرشيف", keywords: "مؤرشف محذوف استعادة حذف سلة archive archived restore delete trash" },
  "settings-connections": { section: "المكتبة", label: "الاتصالات", keywords: "تطبيقات تكامل رمز وصول connections max chatgpt mcp apps integrations api token webhooks webhook" },
  "settings-shortcuts": { section: "اختصارات لوحة المفاتيح", label: "اختصارات لوحة المفاتيح", keywords: "مفاتيح تراجع إعادة الشريط الجانبي بحث keyboard shortcuts hotkeys undo redo ctrl k sidebar search" },
  "settings-quiz-timers": { section: "محرر الاختبارات القديم", label: "مؤقتات الاختبار والنقاط", keywords: "اختبار قديم مؤقت ثوان نقاط لكل سؤال خلط درجة النجاح شرح الإجابات الصحيحة quiz timers points legacy old editor shuffle pass mark explanations correct answers" },
  "settings-help": { section: "المساعدة", label: "المساعدة والملاحظات", keywords: "الدعم تواصل البريد الإلكتروني الإبلاغ عن خطأ ملاحظات help feedback support contact email bug report" },
  "settings-privacy": { section: "المساعدة", label: "سياسة الخصوصية", keywords: "البيانات الخصوصية قانوني privacy policy data legal gdpr" },
  "settings-terms": { section: "المساعدة", label: "الشروط", keywords: "شروط الخدمة قانوني terms of service legal conditions" },
  "settings-sign-out": { section: "المساعدة", label: "تسجيل الخروج", keywords: "خروج تبديل الحساب sign out log out logout switch account" },
};

/** The settings rows in the given language. */
export function settingsIndexFor(locale: "en" | "ar"): SettingsEntry[] {
  if (locale !== "ar") return english;
  return english.map((e) => ({ ...e, ...arabic[e.id] }));
}
