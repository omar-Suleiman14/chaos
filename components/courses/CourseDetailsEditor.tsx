"use client";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLocale } from "@/lib/i18n";
import { useState } from "react";
type Details = { outcomes: string[]; level: "all" | "beginner" | "intermediate" | "advanced"; estimatedMinutes?: number };
export default function CourseDetailsEditor({ courseId, details }: { courseId: Id<"learnCollections">; details?: Details }) {
  const { locale } = useLocale(), ar = locale === "ar", save = useMutation(api.courses.update), [error, setError] = useState("");
  const value = details ?? { outcomes: [], level: "all" as const };
  const change = async (patch: Partial<Details>) => { setError(""); try { await save({ courseId, details: { ...value, ...patch } }); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } };
  return <section className="cb-section lx-form"><h2>{ar ? "نظرة عامة" : "Course overview"}</h2>{error && <p role="alert">{error}</p>}
    <label>{ar ? "ماذا سيتعلم الطالب؟ سطر لكل نتيجة" : "What will learners achieve? One outcome per line"}<textarea className="kb-input" dir="auto" rows={4} defaultValue={value.outcomes.join("\n")} maxLength={10000} onBlur={e => void change({ outcomes: e.target.value.split("\n").map(o => o.trim()).filter(Boolean) })} /></label>
    <label>{ar ? "المستوى" : "Level"}<select className="kb-input" value={value.level} onChange={e => void change({ level: e.target.value as Details["level"] })}>{[["all", ar ? "كل المستويات" : "All levels"], ["beginner", ar ? "مبتدئ" : "Beginner"], ["intermediate", ar ? "متوسط" : "Intermediate"], ["advanced", ar ? "متقدم" : "Advanced"]].map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
    <label>{ar ? "المدة التقديرية بالدقائق (اختياري)" : "Estimated minutes (optional)"}<input className="kb-input" type="number" min={1} max={10000} defaultValue={value.estimatedMinutes ?? ""} onBlur={e => void change({ estimatedMinutes: e.target.value ? Number(e.target.value) : undefined })} /></label>
  </section>;
}
