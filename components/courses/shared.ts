import { defaultCover, isCoverUrl } from "@/lib/learn/covers";
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
  // No saved cover: the item's stable default picture, so no course or lesson card is bare.
  const src = isCoverUrl(url) ? url : defaultCover(id);
  return { ["--cx-cover" as string]: `url("${src.replace(/"/g, "")}")` };
}

