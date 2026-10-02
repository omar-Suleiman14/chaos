import type React from "react";

export const courseCopy = {
  en: {
    title: "Courses", subtitle: "Write lessons, put them in order, publish. Public courses are free for everyone to take.",
    new: "New course", creating: "Creating…", loading: "Loading courses…", lessons: (n: number) => `${n} ${n === 1 ? "lesson" : "lessons"}`,
    draft: "Draft", live: "Published", privateLive: "Private", archived: "Archived", explore: "Browse public courses", failed: "Couldn't create the course.", empty: "No courses yet. Choose New → Course to make one.",
  },
  ar: {
    title: "الدورات", subtitle: "اكتب الدروس ورتّبها ثم انشرها. الدورات العامة مجانية للجميع.",
    new: "دورة جديدة", creating: "جارٍ الإنشاء…", loading: "جارٍ تحميل الدورات…", lessons: (n: number) => `${n} ${n === 1 ? "درس" : "دروس"}`,
    draft: "مسودة", live: "منشورة", privateLive: "خاصة", archived: "مؤرشفة", explore: "تصفح الدورات العامة", failed: "تعذر إنشاء الدورة.", empty: "لا دورات بعد. اختر جديد ← دورة لإنشاء واحدة.",
  },
};

/** Deterministic cover gradient when a course has no image. */
export function coverStyle(id: string, url?: string): React.CSSProperties {
  if (url) return { ["--cx-cover" as string]: `url("${url.replace(/"/g, "")}")` };
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const a = h % 360, b = (a + 70) % 360;
  return { ["--cx-cover" as string]: `linear-gradient(135deg, hsl(${a} 70% 55%), hsl(${b} 75% 45%))` };
}

