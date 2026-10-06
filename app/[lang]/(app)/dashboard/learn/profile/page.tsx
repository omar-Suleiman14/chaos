"use client";

import Link from "next/link";
import { toast } from "@/lib/toast";
import { useState } from "react";
import { BadgeCheck, Clock, ExternalLink, ShieldCheck, XCircle } from "lucide-react";
import { Select } from "@/components/workspace/Select";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import { useLearnActions, useLearnViewer, usePerson } from "@/lib/learn/data";
import { effectiveClaimStatus, useIdentityClaims, useStudyActions } from "@/lib/learn/studyClient";
import { useConvexAuth } from "convex/react";
import type { VerificationKind, VerificationStatus } from "@/lib/learn/types";
import { errorMessage } from "@/lib/errors";
import { formatDate, useCopy, useLocale } from "@/lib/i18n";
import { hostHref } from "@/lib/hosts";

const copy = {
  en: {
    title: "Your Learn profile", lead: "What readers see next to your lessons.", view: "View public profile", loading: "Loading…",
    name: "Display name", bio: "About you", bioPh: "e.g. 4th-year medical student at Cairo University. I write GIT and hepatology notes.", save: "Save profile", saved: "Saved",
    verify: "Verification", verifyLead: "Verification confirms who you are, not whether your lessons are correct. Readers see exactly what was checked.",
    kinds: { student: "Student", educator: "Educator" } as Record<VerificationKind, string>,
    kindHelp: { student: "Confirms you are enrolled at a university or school.", educator: "Confirms you teach at an institution." } as Record<VerificationKind, string>,
    institution: "Institution", institutionPh: "e.g. Cairo University, Faculty of Medicine", evidence: "How to confirm",
    evidenceKinds: { email: "Institution email address", document: "Student or staff card (photo)" }, email: "Institution email", emailPh: "name@university.edu",
    privacy: "Submit only your role and institution. Do not send identity documents or email evidence here. A pending claim is not a verified badge; verified roles may appear publicly after review.",
    requested: "Affiliation claim submitted for review.",
    weakAreas: "Weak areas",
    submit: "Request verification", unavailable: "Verification requests open when the review service is connected. Nothing is collected until then.",
    status: { none: "Not verified", pending: "Under review", verified: "Verified", rejected: "Not approved", expired: "Expired" } as Record<VerificationStatus, string>,
    submittedOn: (d: string) => `Submitted ${d}`, decidedOn: (d: string) => `Decided ${d}`,
  },
  ar: {
    title: "ملفك في Learn", lead: "ما يراه القرّاء بجوار دروسك.", view: "اعرض الملف العام", loading: "جارٍ التحميل…",
    name: "الاسم الظاهر", bio: "عنك", bioPh: "مثل: طالب طب في السنة الرابعة بجامعة القاهرة. أكتب ملاحظات الهضمي والكبد.", save: "احفظ الملف", saved: "حُفظ",
    verify: "التوثيق", verifyLead: "يؤكد التوثيق هويتك، لا صحة دروسك. يرى القرّاء ما تم التحقق منه بالضبط.",
    kinds: { student: "طالب", educator: "معلّم" } as Record<VerificationKind, string>,
    kindHelp: { student: "يؤكد أنك مسجّل في جامعة أو مدرسة.", educator: "يؤكد أنك تدرّس في مؤسسة." } as Record<VerificationKind, string>,
    institution: "المؤسسة", institutionPh: "مثل: جامعة القاهرة، كلية الطب", evidence: "طريقة التأكيد",
    evidenceKinds: { email: "بريد المؤسسة", document: "بطاقة طالب أو موظف (صورة)" }, email: "بريد المؤسسة", emailPh: "name@university.edu",
    privacy: "أرسل الدور والمؤسسة فقط. لا ترسل وثائق الهوية أو أدلة البريد هنا. الطلب المعلّق ليس شارة موثّقة؛ قد تظهر الأدوار الموثّقة للعامة بعد المراجعة.",
    requested: "أُرسل طلب الانتماء للمراجعة.",
    weakAreas: "نقاط الضعف",
    submit: "اطلب التوثيق", unavailable: "تُفتح طلبات التوثيق عندما تُربط خدمة المراجعة. لا يُجمع شيء قبل ذلك.",
    status: { none: "غير موثّق", pending: "قيد المراجعة", verified: "موثّق", rejected: "لم يُعتمد", expired: "منتهي" } as Record<VerificationStatus, string>,
    submittedOn: (d: string) => `أُرسل ${d}`, decidedOn: (d: string) => `تقرر ${d}`,
  },
};

const statusIcon = { none: ShieldCheck, pending: Clock, verified: BadgeCheck, rejected: XCircle, expired: Clock } as const;

export default function LearnProfilePage() {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const viewer = useLearnViewer();
  const person = usePerson(viewer?.id);
  const auth = useConvexAuth();
  const claims = useIdentityClaims();
  const study = useStudyActions();
  const actions = useLearnActions();
  const [name, setName] = useState<string>();
  const [bio, setBio] = useState<string>();
  const [kind, setKind] = useState<VerificationKind>("student");
  const [institution, setInstitution] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [claimMessage, setClaimMessage] = useState("");
  const [claimError, setClaimError] = useState("");
  if (!viewer || person === undefined) return <PageSkeleton label={t.loading} />;
  const current = { name: person?.name ?? viewer.name, bio: person?.bio ?? "" };

  return (
    <div className="lx-page lx-page--narrow">
      <header className="lx-hero">
        <div><h1 className="ws-page-title">{t.title}</h1><p className="lx-help">{t.lead}</p></div>
        <div className="lx-actions"><Link className="ws-btn" href="/dashboard/learn/weak-areas">{t.weakAreas}</Link><Link className="ws-btn" href={hostHref(`/learn/people/${encodeURIComponent(viewer.id)}`)}><ExternalLink size={15} aria-hidden />{t.view}</Link></div>
      </header>
      <form className="lx-form lx-panel" onSubmit={async (e) => { e.preventDefault(); try { await actions.updateProfile({ name: (name ?? current.name).trim() || current.name, bio: bio ?? current.bio }); toast.success(t.saved); } catch (err) { toast.error(err); } }}>
        <label className="lx-field">{t.name}<input className="lx-input" value={name ?? current.name} maxLength={80} onChange={(e) => setName(e.target.value)} /></label>
        <label className="lx-field">{t.bio}<textarea className="lx-textarea" rows={3} value={bio ?? current.bio} placeholder={t.bioPh} maxLength={600} onChange={(e) => setBio(e.target.value)} /></label>
        <div className="lx-actions" style={{ justifyContent: "flex-end" }}><button type="submit" className="ws-btn ws-btn--primary">{t.save}</button></div>
      </form>

      <section className="lx-section" aria-labelledby="verify-title">
        <header><h2 id="verify-title">{t.verify}</h2></header>
        <p className="lx-help">{t.verifyLead}</p>
        <div className="lx-list">
          {(["student", "educator"] as const).map((k) => {
            const v = claims?.find((x) => x.role === k);
            const status = (v ? effectiveClaimStatus(v) : "none") as VerificationStatus;
            const Icon = statusIcon[status];
            return (
              <div key={k} className="lx-row">
                <span className="lx-row__icon" aria-hidden><Icon size={16} /></span>
                <span className="lx-row__main"><span className="lx-row__title">{t.kinds[k]}{v?.institution ? ` · ${v.institution}` : ""}</span><span className="lx-row__sub">{t.kindHelp[k]}</span></span>
                <span className="lx-badge" data-tone={status === "verified" ? "green" : status === "pending" ? "amber" : status === "rejected" ? "red" : undefined}>{t.status[status]}</span>
                {v && <small className="lx-muted">{t.submittedOn(formatDate(locale, v.createdAt))}</small>}
              </div>
            );
          })}
        </div>
        {claims === undefined && auth.isAuthenticated && <p className="lx-muted" role="status">{t.loading}</p>}
        <form className="lx-form lx-panel" onSubmit={async (e) => {
          e.preventDefault(); if (!auth.isAuthenticated || submitting || !institution.trim()) return;
          setSubmitting(true); setClaimError(""); setClaimMessage("");
          try { await study.claimIdentity(kind, institution); setClaimMessage(t.requested); setInstitution(""); }
          catch (err) { setClaimError(errorMessage(err)); }
          finally { setSubmitting(false); }
        }}>
          <div className="lx-form__row">
            <label className="lx-field">{t.verify}<Select label={t.verify} value={kind} onChange={(v) => setKind(v as VerificationKind)} options={(["student", "educator"] as const).map((k) => ({ value: k, label: t.kinds[k], description: t.kindHelp[k] }))} /></label>
            <label className="lx-field">{t.institution}<input className="lx-input" value={institution} placeholder={t.institutionPh} required maxLength={200} onChange={(e) => setInstitution(e.target.value)} /></label>
          </div>
          <p className="lx-notice"><ShieldCheck size={15} aria-hidden /><span>{t.privacy}</span></p>
          {claimError && <p className="lx-error" role="alert">{claimError}</p>}
          {claimMessage && <p className="lx-muted" role="status">{claimMessage}</p>}
          <div className="lx-actions" style={{ justifyContent: "flex-end" }}><button type="submit" className="ws-btn ws-btn--primary" disabled={!auth.isAuthenticated || claims === undefined || submitting || !institution.trim()}>{t.submit}</button></div>
        </form>
      </section>
    </div>
  );
}
