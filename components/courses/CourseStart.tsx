"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "@/lib/toast";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { useCourseProgress } from "@/lib/learn/courseProgress";
import { useCourseEnrollment } from "@/lib/learn/courseEnrollment";
import { useLocale } from "@/lib/i18n";
import Link from "@/components/site/SiteLink";
import { prefetchLesson } from "@/lib/learn/prefetch";
import { ArrowRight } from "lucide-react";

const copy = {
  en: {
    review: "Review course", continue: "Continue course", start: "Start course",
    done: (n: number, total: number) => `${n} / ${total} lessons completed`,
    progress: "Course progress", signIn: "Sign in to request access",
    locked: "Course lessons open only after the teacher approves your request.",
    request: "Request to join", requesting: "Sending request…", requested: "Request sent to the teacher.",
    pending: "Waiting for teacher approval. We'll show the course here when your request is accepted.",
    withdraw: "Withdraw request", withdrawing: "Withdrawing…",
    rejected: "Your request wasn't approved. You can request again if the teacher permits it.",
    approvedPending: "Your request was approved. Your course access is being updated.",
    loading: "Checking course access…",
    suspended: "Your course access is temporarily suspended. Contact the teacher.",
    removed: "You have been removed from this course. Only the teacher can readmit you.",
    invited: "Your teacher invited you to join this course.",
    accept: "Accept invitation", decline: "Decline invitation",
  },
  ar: {
    review: "راجع الدورة", continue: "تابع الدورة", start: "ابدأ الدورة",
    done: (n: number, total: number) => `${n} / ${total} دروس مكتملة`,
    progress: "تقدم الدورة", signIn: "سجّل الدخول لطلب الانضمام",
    locked: "لا تُفتح دروس الدورة إلا بعد موافقة المدرّس على طلبك.",
    request: "طلب الانضمام", requesting: "جارٍ إرسال الطلب…", requested: "أُرسل الطلب إلى المدرّس.",
    pending: "طلبك قيد المراجعة. ستظهر لك دروس الدورة بعد موافقة المدرّس.",
    withdraw: "سحب الطلب", withdrawing: "جارٍ سحب الطلب…",
    rejected: "لم يوافق المدرّس على طلبك. يمكنك طلب الانضمام مجددًا إذا سمح بذلك.",
    approvedPending: "تمت الموافقة على طلبك. جارٍ تحديث صلاحية دخول الدورة.",
    loading: "جارٍ التحقق من صلاحية الدخول…",
    suspended: "تم إيقاف دخولك إلى الدورة مؤقتًا. تواصل مع المدرّس.",
    removed: "تمت إزالتك من الدورة. يستطيع المدرّس فقط إعادة قبولك.",
    invited: "دعاك المدرّس للانضمام إلى هذه الدورة.",
    accept: "قبول الدعوة", decline: "رفض الدعوة",
  },
};

/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Custom nested progress track exposes its values. */
export default function CourseStart({ course }: { course: NonNullable<FunctionReturnType<typeof api.courses.getPublic>> }) {
  const progress = useCourseProgress(course.id);
  const { locale } = useLocale();
  const t = copy[locale === "ar" ? "ar" : "en"];
  const { state, requestStatus, signedIn, requestJoin, withdraw } = useCourseEnrollment(course.id);
  const invitation = useQuery(api.courseCohorts.myInvitation, { courseId: course.id });
  const respondToInvitation = useMutation(api.courseCohorts.respondToInvitation);
  const [busy, setBusy] = useState<"request" | "withdraw" | "invite" | null>(null);
  const count = course.lessons.filter(l => progress[l.id]?.completed).length;
  const active = course.lessons.find(l => !progress[l.id]?.completed && (progress[l.id]?.percent ?? 0) > 0);
  const target = active ?? course.lessons.find(l => !progress[l.id]?.completed) ?? course.lessons[0];
  const targetId = state?.enrolled ? target?.id : undefined;
  useEffect(() => { if (targetId) prefetchLesson(targetId, course.id); }, [targetId, course.id]);

  if (!target) return null;
  const href = `/learn/${target.id}?course=${course.id}`;
  const meter = <><p aria-live="polite">{t.done(count, course.lessons.length)}</p><div className="lx-course-meter" role="progressbar" aria-label={t.progress} aria-valuemin={0} aria-valuemax={course.lessons.length} aria-valuenow={count}><span style={{ width: `${count / course.lessons.length * 100}%` }} /></div></>;

  if (state?.enrolled) {
    const started = count > 0 || !!active, finished = count === course.lessons.length;
    return <div className="cp-continue"><Link className="cp-start site-btn site-btn--primary" href={href}>{finished ? t.review : started ? t.continue : t.start}<ArrowRight size={18} className="cp-arrow" aria-hidden /></Link>{meter}</div>;
  }

  const onRequest = async () => {
    setBusy("request");
    try { await requestJoin(); toast(t.requested); }
    catch (err) { toast.error(err); }
    finally { setBusy(null); }
  };
  const onWithdraw = async () => {
    setBusy("withdraw");
    try { await withdraw(); }
    catch (err) { toast.error(err); }
    finally { setBusy(null); }
  };
  const onInvite = async (accept: boolean) => {
    setBusy("invite");
    try { await respondToInvitation({ courseId: course.id, accept }); }
    catch (err) { toast.error(err); }
    finally { setBusy(null); }
  };
  const pending = requestStatus === "pending";
  const blocked = requestStatus === "suspended" || requestStatus === "removed";
  const invited = invitation === "pending";
  const accepted = requestStatus === "approved";
  const waiting = state === undefined || requestStatus === undefined || invitation === undefined;
  return <div className="cp-continue cp-enroll" aria-live="polite">
    <p>{!signedIn ? t.locked : waiting ? t.loading : blocked ? (requestStatus === "suspended" ? t.suspended : t.removed) : pending ? t.pending : accepted ? t.approvedPending : invited ? t.invited : requestStatus === "rejected" ? t.rejected : t.locked}</p>
    <div className="cp-enroll__actions">
      {!signedIn
        ? <Link className="cp-start site-btn site-btn--primary" href={`/sign-in?callbackUrl=${encodeURIComponent(`/learn/courses/${course.id}`)}`}>{t.signIn}<ArrowRight size={18} className="cp-arrow" aria-hidden /></Link>
        : blocked ? null
        : invited && !accepted && !pending ? <>
            <button type="button" className="cp-start site-btn site-btn--primary" disabled={!!busy || waiting} onClick={() => void onInvite(true)}>{t.accept}</button>
            <button type="button" className="site-btn" disabled={!!busy || waiting} onClick={() => void onInvite(false)}>{t.decline}</button>
          </>
        : pending
          ? <button type="button" className="site-btn" disabled={!!busy} onClick={() => void onWithdraw()}>{busy === "withdraw" ? t.withdrawing : t.withdraw}</button>
          : !accepted
            ? <button type="button" className="cp-start site-btn site-btn--primary" disabled={!!busy || waiting} onClick={() => void onRequest()}>{busy === "request" ? t.requesting : t.request}<ArrowRight size={18} className="cp-arrow" aria-hidden /></button>
            : null}
    </div>
  </div>;
}
/* oxlint-enable jsx-a11y/prefer-tag-over-role */
