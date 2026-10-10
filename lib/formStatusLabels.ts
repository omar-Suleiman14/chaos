/** Canonical, context-identical form lifecycle labels used by status badges and filters. */
export type FormStatus = "draft" | "live" | "closed" | "archived";

export const formStatusLabels: Record<"en" | "ar", Record<FormStatus, string>> = {
  en: { draft: "Draft", live: "Live", closed: "Closed", archived: "Archived" },
  ar: { draft: "مسودة", live: "منشور", closed: "مغلق", archived: "مؤرشف" },
};
