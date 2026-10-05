"use client";
import { useMutation } from "convex/react";
import { Select } from "@/components/workspace/Select";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLocale } from "@/lib/i18n";
import { toast } from "@/lib/toast";
type Details = { outcomes: string[]; level: "all" | "beginner" | "intermediate" | "advanced"; estimatedMinutes?: number };
export default function CourseDetailsEditor({ courseId, details }: { courseId: Id<"learnCollections">; details?: Details }) {
  const { locale } = useLocale(), ar = locale === "ar", save = useMutation(api.courses.update);
  const value = details ?? { outcomes: [], level: "all" as const };
  // Saves on blur or choice; only a failure needs saying.
  const change = async (patch: Partial<Details>) => { try { await save({ courseId, details: { ...value, ...patch } }); } catch (err) { toast.error(err, { id: "course-details" }); } };
  return <section className="cb-section lx-form"><h2>{ar ? "نظرة عامة" : "Course overview"}</h2>
    <label>{ar ? "ماذا سيتعلم الطالب؟ سطر لكل نتيجة" : "What will learners achieve? One outcome per line"}<textarea className="kb-input" dir="auto" rows={4} defaultValue={value.outcomes.join("\n")} maxLength={10000} onBlur={e => void change({ outcomes: e.target.value.split("\n").map(o => o.trim()).filter(Boolean) })} /></label>
    <div className="grid gap-1"><span id="cb-level-label">{ar ? "المستوى" : "Level"}</span><Select labelledBy="cb-level-label" value={value.level} onChange={level => void change({ level })} options={[{ value: "all" as const, label: ar ? "كل المستويات" : "All levels" }, { value: "beginner" as const, label: ar ? "مبتدئ" : "Beginner" }, { value: "intermediate" as const, label: ar ? "متوسط" : "Intermediate" }, { value: "advanced" as const, label: ar ? "متقدم" : "Advanced" }]} /></div>
    <label>{ar ? "المدة التقديرية بالدقائق (اختياري)" : "Estimated minutes (optional)"}<input className="kb-input" type="number" min={1} max={10000} defaultValue={value.estimatedMinutes ?? ""} onBlur={e => void change({ estimatedMinutes: e.target.value ? Number(e.target.value) : undefined })} /></label>
  </section>;
}
