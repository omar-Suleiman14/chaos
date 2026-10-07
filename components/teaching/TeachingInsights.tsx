"use client";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLocale, formatNumber } from "@/lib/i18n";
import { Select } from "@/components/workspace/Select";
import { WsTabs } from "@/components/workspace/primitives";
import { SearchCheck, History } from "lucide-react";
import "./teaching.css";

type Target =
  | { formId: Id<"forms">; quizId?: never }
  | { quizId: Id<"quizzes">; formId?: never };
const tabs = ["quality", "versions"] as const;
/** Queries mount on demand so these tools do not add work to the results inbox. */
export default function TeachingInsights(target: Target) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [open, setOpen] = useState(false);
  return (
    <details
      className="teaching-tools"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        <SearchCheck size={18} aria-hidden="true" />
        <span>
          {ar
            ? "جودة الأسئلة وسجل النسخ"
            : "Question quality & version history"}
        </span>
      </summary>
      {open && <Report {...target} />}
    </details>
  );
}
function Report(target: Target) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const form = useQuery(
    api.formResults.getTeachingInsights,
    target.formId ? { formId: target.formId } : "skip",
  );
  const quiz = useQuery(
    api.quizFunctions.getTeachingInsights,
    target.quizId ? { quizId: target.quizId } : "skip",
  );
  const report = target.formId ? form : quiz;
  const [tab, setTab] = useState<(typeof tabs)[number]>("quality");
  const [beforeKey, setBeforeKey] = useState(""),
    [afterKey, setAfterKey] = useState("");
  if (report === undefined)
    return (
      <p role="status" className="teaching-note">
        {ar ? "جارٍ تحميل أدوات التدريس…" : "Loading teaching insights…"}
      </p>
    );
  if (report === null)
    return (
      <p className="teaching-note">
        {ar ? "غير متاح." : "Insights unavailable."}
      </p>
    );
  const versions = report.versions;
  const before =
    versions.find((v) => v.key === beforeKey) ?? versions[1] ?? versions[0];
  const after = versions.find((v) => v.key === afterKey) ?? versions[0];
  const versionOptions = versions.map((v, i) => ({
    value: v.key,
    label: `${target.formId ? (ar ? "نسخة" : "Version") + " " + v.key : (ar ? "لقطة" : "Snapshot") + " " + (versions.length - i)} · ${new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(v.at)}`,
  }));
  const beforeQuestions = new Map(
    before?.questions.map((q) => [q.id, q]) ?? [],
  );
  const afterQuestions = new Map(after?.questions.map((q) => [q.id, q]) ?? []);
  const ids = [
    ...new Set([...beforeQuestions.keys(), ...afterQuestions.keys()]),
  ];
  const flags = {
    small_sample: ar
      ? "اجمع مزيدًا من الإجابات قبل الاستنتاج"
      : "Collect more answers before drawing conclusions",
    difficult: ar
      ? "راجع الصياغة والمفهوم الذي يحتاج إلى تدريس"
      : "Review wording and concepts that need teaching",
    easy: ar ? "قد يصلح للتحقق من الأساسيات" : "May suit a check of the basics",
    negative_discrimination: ar
      ? "راجع مفتاح الإجابة: أصحاب الدرجات الأعلى أخطأوا أكثر"
      : "Check the answer key: higher scorers missed this more often",
  };
  return (
    <div className="teaching-body">
      <p className="teaching-note">
        {ar
          ? `استنادًا إلى ${formatNumber(locale, report.sampleCount)} محاولة مكتملة حديثة. تُحلل النسخ المختلفة منفصلة.`
          : `Based on ${formatNumber(locale, report.sampleCount)} recent completed attempts. Different question editions are analysed separately.`}
        {report.capped &&
          (ar
            ? " هذه عينة من أحدث ٢٠٠ محاولة."
            : " This is a sample of the latest 200 attempts.")}
      </p>
      {report.missingSnapshots > 0 && (
        <p className="teaching-note">
          {ar
            ? "بعض المحاولات القديمة بلا لقطة محفوظة ولا تدخل في المقارنة."
            : "Some older attempts have no saved snapshot and are excluded from comparison."}
        </p>
      )}
      <WsTabs
        tabs={tabs}
        value={tab}
        onChange={setTab}
        label={ar ? "أدوات التدريس" : "Teaching tools"}
        labels={{
          quality: ar ? "جودة الأسئلة" : "Question detective",
          versions: ar ? "سجل النسخ" : "Version history",
        }}
        icons={{ quality: SearchCheck, versions: History }}
      />
      {tab === "quality" ? (
        <>
          <p className="teaching-note">
            {ar
              ? "راجع الإشارات مع سياق الفصل. زمن الإجابة متاح فقط عندما سجله الخادم."
              : "Review these signals alongside classroom context. Answer times appear only where the server recorded them."}
          </p>
          {!report.questions.length && (
            <p className="teaching-note">
              {ar
                ? "تظهر الإشارات بعد وصول إجابات على أسئلة مُصححة."
                : "Insights appear when graded questions receive answers."}
            </p>
          )}
          <div className="teaching-question-grid">
            {report.questions.map((q) => (
              <article className="teaching-question" key={q.id}>
                <h3>{q.text}</h3>
                <dl className="teaching-metrics">
                  <div>
                    <dt>{ar ? "أُجيب عنه" : "Asked"}</dt>
                    <dd>{formatNumber(locale, q.answered)}</dd>
                  </div>
                  <div>
                    <dt>{ar ? "صحيحة" : "Correct"}</dt>
                    <dd>
                      {q.correctRate === null
                        ? "—"
                        : `${formatNumber(locale, q.correctRate)}%`}
                    </dd>
                  </div>
                  <div>
                    <dt>{ar ? "الزمن الوسيط" : "Median time"}</dt>
                    <dd>
                      {q.medianSeconds === null
                        ? "—"
                        : `${formatNumber(locale, Math.round(q.medianSeconds * 10) / 10)} ${ar ? "ث" : "s"}`}
                    </dd>
                  </div>
                </dl>
                {q.commonWrong && (
                  <p>
                    {ar ? "الخطأ الأكثر شيوعًا" : "Most common wrong choice"}:{" "}
                    <strong>{q.commonWrong.label}</strong> ·{" "}
                    {formatNumber(locale, q.commonWrong.count)}
                  </p>
                )}
                {q.timingCount > 0 && (
                  <p>
                    {ar ? "إجابات ذات زمن مسجل" : "Answers with recorded time"}:{" "}
                    {formatNumber(locale, q.timingCount)}
                  </p>
                )}
                {q.reviewCount > 0 && (
                  <p>
                    {ar
                      ? "أسرع من الحد الأدنى للقراءة؛ راجع السياق"
                      : "Below the minimum reading time; review the context"}
                    : {formatNumber(locale, q.reviewCount)}
                  </p>
                )}
                <ul>
                  {q.flags.map((flag) => (
                    <li key={flag}>{flags[flag]}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="teaching-note">
            {target.formId
              ? ar
                ? "قارن النص والاختيارات ومفتاح الإجابة والنقاط بين النسخ المنشورة."
                : "Compare prompts, choices, answer keys and marks across published versions."
              : ar
                ? "لقطات الأسئلة المحفوظة في المحاولات. قد تختلف السحوبات من بنك الأسئلة؛ ليست كل لقطة إصدارًا منشورًا."
                : "Question snapshots saved with attempts. Pool draws can differ; a snapshot does not always represent a new publication."}
          </p>
          {versions.length < 2 && (
            <p className="teaching-note">
              {ar
                ? "تحتاج إلى نسختين محفوظتين لإظهار التغييرات."
                : "Two saved editions are needed to show changes."}
            </p>
          )}
          {versions.length > 0 && (
            <>
              <div className="teaching-version-controls">
                <Select
                  label={ar ? "قبل" : "Before"}
                  value={before?.key ?? ""}
                  onChange={setBeforeKey}
                  options={versionOptions}
                />
                <Select
                  label={ar ? "بعد" : "After"}
                  value={after?.key ?? ""}
                  onChange={setAfterKey}
                  options={versionOptions}
                />
              </div>
              <div className="teaching-comparison">
                {ids.map((id) => {
                  const a = beforeQuestions.get(id),
                    b = afterQuestions.get(id);
                  const changed = JSON.stringify(a) !== JSON.stringify(b);
                  const status = !a
                    ? ar
                      ? "أُضيف"
                      : "Added"
                    : !b
                      ? ar
                        ? "أُزيل"
                        : "Removed"
                      : changed
                        ? ar
                          ? "تغيّر"
                          : "Changed"
                        : ar
                          ? "لم يتغيّر"
                          : "Unchanged";
                  return (
                    <article key={id} className="teaching-change">
                      <p className="teaching-change-label">{status}</p>
                      <div className="teaching-change-columns">
                        {[a, b].map((q, i) => (
                          <section
                            key={i}
                            aria-label={
                              i ? (ar ? "بعد" : "After") : ar ? "قبل" : "Before"
                            }
                          >
                            <h3>
                              {i
                                ? ar
                                  ? "بعد"
                                  : "After"
                                : ar
                                  ? "قبل"
                                  : "Before"}
                            </h3>
                            {q ? (
                              <>
                                <p>{q.text}</p>
                                <p>{q.options.join(" · ")}</p>
                                <p>
                                  {ar ? "مفتاح التصحيح" : "Answer key"}:{" "}
                                  {q.answerKey.join(" · ") || "—"}
                                </p>
                                <p>
                                  {formatNumber(locale, q.points)}{" "}
                                  {ar ? "نقاط" : "marks"}
                                  {q.timeLimit !== null
                                    ? ` · ${formatNumber(locale, q.timeLimit)} ${ar ? "ث" : "s"}`
                                    : ""}
                                </p>
                              </>
                            ) : (
                              <p>—</p>
                            )}
                          </section>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
