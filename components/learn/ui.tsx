"use client";

import MemberAvatar from "@/components/MemberAvatar";
import { avatarSeed } from "@/lib/avatarSeed";
import Link from "next/link";
import { AlertTriangle, Award, BadgeCheck, BookOpen, Bookmark, CheckCircle2, Circle, CircleDot, Clock, Eye, GitFork, GraduationCap, Info, Layers, ShieldAlert, ThumbsUp } from "lucide-react";
import { formatNumber, pluralForm, useCopy, useLocale } from "@/lib/i18n";
import { timeAgo } from "@/lib/timeAgo";
import { readingMinutes } from "@/lib/learn/doc";
import { hasUnpublishedChanges, readerView } from "@/lib/learn/data";
import type { CurriculumRef, ExternalRef, Lesson, LessonProgress, ModerationState, Person, Provenance, QualityStatus, Verification } from "@/lib/learn/types";

const copy = {
  en: {
    untitled: "Untitled lesson", draft: "Draft", published: "Published", changes: "Unpublished changes", privateLabel: "Private", unlisted: "Unlisted", archived: "Archived",
    minutes: (n: number) => `${n} min read`, views: (n: number) => `${n} ${n === 1 ? "view" : "views"}`, saves: (n: number) => `${n} ${n === 1 ? "save" : "saves"}`,
    helpful: (pct: number, n: number) => `${pct}% found it helpful (${n})`, forks: (n: number) => `${n} ${n === 1 ? "copy" : "copies"}`,
    by: (name: string) => `By ${name}`, updated: (ago: string) => `Updated ${ago}`, version: (n: number) => `v${n}`,
    progress: { not_started: "Not started", in_progress: "In progress", completed: "Completed" },
    forkedFrom: "Copied from", originally: "originally", by2: "by", openOriginal: "Open original",
    curricula: (n: number) => `Applies to ${n} ${n === 1 ? "course" : "courses"}`, oldSyllabus: "older syllabus",
    moderation: {
      under_review: "Under review. Readers can still open it while moderators check a report.",
      restricted: "Restricted. It is hidden from Explore and search while moderators review it.",
      removed: "Removed by moderators. Only you can see it. Edit and ask for a review to republish.",
      unavailable: "This lesson is unavailable.",
    } as Record<Exclude<ModerationState, "ok">, string>,
    quality: { reviewed: "Reviewed", featured: "Featured" },
    qualityTip: {
      reviewed: "A Chaos reviewer checked this lesson for structure, sources and clarity. It is not a guarantee of accuracy.",
      featured: "Picked by the Chaos team as a strong example. Check sources for anything you rely on.",
    },
    verif: { student: "Verified student", educator: "Verified educator" },
    verifTip: {
      student: "Chaos confirmed this person is enrolled at the institution shown. It says nothing about whether their content is correct.",
      educator: "Chaos confirmed this person teaches at the institution shown. It is about identity, not a review of this lesson.",
    },
    fromApp: (app: string, title: string) => `Created from ${app}: ${title}`, openIn: (app: string) => `Open in ${app}`,
  },
  ar: {
    untitled: "درس بلا عنوان", draft: "مسودة", published: "منشور", changes: "تعديلات غير منشورة", privateLabel: "خاص", unlisted: "غير مدرج", archived: "مؤرشف",
    minutes: (n: number) => `${n} د قراءة`, views: (n: number) => `${n} مشاهدة`, saves: (n: number) => `${n} حفظ`,
    helpful: (pct: number, n: number) => `${pct}٪ وجدوه مفيدًا (${n})`, forks: (n: number) => `${n} نسخة`,
    by: (name: string) => `بقلم ${name}`, updated: (ago: string) => `حُدّث ${ago}`, version: (n: number) => `إصدار ${n}`,
    progress: { not_started: "لم يبدأ", in_progress: "قيد الدراسة", completed: "مكتمل" },
    forkedFrom: "منسوخ من", originally: "الأصل", by2: "بقلم", openOriginal: "افتح الأصل",
    curricula: (n: number) => `ينطبق على ${n} مقرر`, oldSyllabus: "منهج أقدم",
    moderation: {
      under_review: "قيد المراجعة. ما زال بإمكان القرّاء فتحه بينما يراجع المشرفون بلاغًا.",
      restricted: "مقيّد. مخفي من الاستكشاف والبحث أثناء المراجعة.",
      removed: "أزاله المشرفون. لا يراه غيرك. عدّله واطلب مراجعة لإعادة نشره.",
      unavailable: "هذا الدرس غير متاح.",
    } as Record<Exclude<ModerationState, "ok">, string>,
    quality: { reviewed: "تمت مراجعته", featured: "مميّز" },
    qualityTip: {
      reviewed: "راجع أحد مراجعي Chaos هذا الدرس من حيث البنية والمصادر والوضوح. وهذا ليس ضمانًا للدقة.",
      featured: "اختاره فريق Chaos كمثال جيد. تحقّق من المصادر فيما تعتمد عليه.",
    },
    verif: { student: "طالب موثّق", educator: "معلّم موثّق" },
    verifTip: {
      student: "أكّد Chaos أن هذا الشخص مسجّل في المؤسسة الظاهرة. ولا يعني ذلك أن محتواه صحيح.",
      educator: "أكّد Chaos أن هذا الشخص يدرّس في المؤسسة الظاهرة. هذا تحقق من الهوية وليس مراجعة لهذا الدرس.",
    },
    fromApp: (app: string, title: string) => `أُنشئ من ${app}: ${title}`, openIn: (app: string) => `افتح في ${app}`,
  },
};

export const useUiCopy = () => useCopy(copy);

export function LessonStatus({ lesson }: { lesson: Lesson }) {
  const t = useCopy(copy);
  if (lesson.archived) return <span className="lx-badge">{t.archived}</span>;
  if (!lesson.published) return <span className="lx-badge">{t.draft}</span>;
  if (hasUnpublishedChanges(lesson)) return <span className="lx-badge" data-tone="amber">{t.changes}</span>;
  return <span className="lx-badge" data-tone="green">{t.published}{lesson.visibility === "unlisted" ? ` · ${t.unlisted}` : lesson.visibility === "private" ? ` · ${t.privateLabel}` : ""}</span>;
}

export function ProgressPill({ progress }: { progress?: LessonProgress }) {
  const t = useCopy(copy);
  const state = progress?.state ?? "not_started";
  const Icon = state === "completed" ? CheckCircle2 : state === "in_progress" ? CircleDot : Circle;
  return (
    <span className="lx-progress" data-state={state}>
      <Icon size={14} aria-hidden style={{ color: state === "completed" ? "var(--ws-success)" : undefined }} />
      {t.progress[state]}
      {state === "in_progress" && <span className="lx-progress__bar" aria-hidden><span style={{ width: `${progress?.percent ?? 0}%` }} /></span>}
    </span>
  );
}

/** Usage signals, deliberately quiet: counts in muted text, no like-bait. Helpfulness only shows with enough votes to mean something. */
export function StatsLine({ lesson, compact }: { lesson: Lesson; compact?: boolean }) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const votes = lesson.stats.helpful + lesson.stats.notHelpful;
  const pct = votes ? Math.round((lesson.stats.helpful / votes) * 100) : 0;
  return (
    <span className="lx-card__meta">
      <span><Eye size={13} aria-hidden />{t.views(lesson.stats.views).replace(String(lesson.stats.views), formatNumber(locale, lesson.stats.views))}</span>
      {lesson.stats.saves > 0 && <span><Bookmark size={13} aria-hidden />{t.saves(lesson.stats.saves)}</span>}
      {votes >= 3 && <span><ThumbsUp size={13} aria-hidden />{t.helpful(pct, votes)}</span>}
      {!compact && lesson.stats.forks > 0 && <span><GitFork size={13} aria-hidden />{t.forks(lesson.stats.forks)}</span>}
    </span>
  );
}

export function CurriculumBadges({ refs, max = 3, currentVersionIds }: { refs: CurriculumRef[]; max?: number; currentVersionIds?: Set<string> }) {
  const t = useCopy(copy);
  if (!refs.length) return null;
  return (
    <span className="lx-badges" aria-label={t.curricula(refs.length)}>
      {refs.slice(0, max).map((r) => {
        const old = currentVersionIds && !currentVersionIds.has(r.versionId);
        return (
          <span key={`${r.versionId}:${r.moduleId}`} className="lx-badge" data-tone={old ? undefined : "blue"} title={`${r.path.join(" › ")} · ${r.versionLabel}${old ? ` (${t.oldSyllabus})` : ""}`}>
            <GraduationCap size={12} aria-hidden />{r.path.at(-1)} · {r.path[0]} {r.versionLabel}
          </span>
        );
      })}
      {refs.length > max && <span className="lx-badge">+{refs.length - max}</span>}
    </span>
  );
}

export function QualityBadge({ quality, note }: { quality: QualityStatus; note?: string }) {
  const t = useCopy(copy);
  if (quality === "none") return null;
  const Icon = quality === "featured" ? Award : BadgeCheck;
  const tip = note || t.qualityTip[quality];
  return <span className="lx-badge" data-tone="purple" title={tip} aria-label={`${t.quality[quality]}. ${tip}`}><Icon size={12} aria-hidden />{t.quality[quality]}</span>;
}

/** Identity badges. The tooltip always says what was verified, so "verified student" never reads as "medically correct". */
export function VerificationBadges({ verifications }: { verifications: Verification[] }) {
  const t = useCopy(copy);
  const verified = verifications.filter((v) => v.status === "verified");
  if (!verified.length) return null;
  return (
    <>
      {verified.map((v) => {
        const tip = t.verifTip[v.kind];
        return <span key={v.kind} className="lx-badge" data-tone="green" title={tip} aria-label={`${t.verif[v.kind]}${v.institution ? `, ${v.institution}` : ""}. ${tip}`}><BadgeCheck size={12} aria-hidden />{t.verif[v.kind]}{v.institution ? ` · ${v.institution}` : ""}</span>;
      })}
    </>
  );
}

export function ModerationNotice({ state, note, owner }: { state: ModerationState; note?: string; owner?: boolean }) {
  const t = useCopy(copy);
  if (state === "ok") return null;
  if (state === "unavailable" && !owner) return null;
  const tone = state === "under_review" ? "info" : state === "restricted" ? "warn" : "danger";
  return (
    <div className="lx-notice" data-tone={tone} role="status">
      {state === "under_review" ? <Info size={16} aria-hidden /> : state === "restricted" ? <AlertTriangle size={16} aria-hidden /> : <ShieldAlert size={16} aria-hidden />}
      <span>{t.moderation[state]}{note ? ` ${note}` : ""}</span>
    </div>
  );
}

export function ProvenanceLine({ provenance, hrefFor }: { provenance: Provenance; hrefFor: (id: string) => string }) {
  const t = useCopy(copy);
  return (
    <span className="lx-card__meta" style={{ fontSize: 12.5 }}>
      <GitFork size={13} aria-hidden />
      <span>{t.forkedFrom} <Link className="lx-link" href={hrefFor(provenance.sourceId)}>“{provenance.sourceTitle}”</Link> {t.by2} {provenance.authorName}{provenance.sourceVersion ? ` · v${provenance.sourceVersion}` : ""}</span>
      {provenance.originId && provenance.originId !== provenance.sourceId && (
        <span>({t.originally} <Link className="lx-link" href={hrefFor(provenance.originId)}>“{provenance.originTitle}”</Link>)</span>
      )}
    </span>
  );
}

/** Product-neutral: names the connected app from the reference itself; the link only appears when the app gave one. */
export function ExternalRefLine({ externalRef }: { externalRef: ExternalRef }) {
  const t = useCopy(copy);
  let safeUrl: string | undefined;
  try { safeUrl = externalRef.url && new URL(externalRef.url).protocol === "https:" ? externalRef.url : undefined; } catch { safeUrl = undefined; }
  return (
    <span className="lx-card__meta" style={{ fontSize: 12.5 }}>
      <Layers size={13} aria-hidden />
      <span>{t.fromApp(externalRef.appName, externalRef.title)}</span>
      {safeUrl && <a className="lx-link" href={safeUrl} target="_blank" rel="noopener noreferrer">{t.openIn(externalRef.appName)}</a>}
    </span>
  );
}

export function LessonCard({ lesson, href, progress, footer, showStatus, currentVersionIds, level = 3 }: {
  lesson: Lesson; href: string; progress?: LessonProgress; footer?: React.ReactNode; showStatus?: boolean; currentVersionIds?: Set<string>; level?: 2 | 3;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  const t = useCopy(copy);
  const { locale } = useLocale();
  const view = showStatus ? { meta: lesson.draft.meta, content: lesson.draft.content } : readerView(lesson);
  const meta = view.meta;
  return (
    <article className="lx-card">
      {meta.coverUrl?.startsWith("https://") && <div className="lx-card__cover" style={{ backgroundImage: `url("${meta.coverUrl.replace(/"/g, "%22")}")` }} aria-hidden />}
      <div className="lx-card__meta">
        <span><BookOpen size={13} aria-hidden />{t.minutes(readingMinutes(view.content))}</span>
        {showStatus ? <LessonStatus lesson={lesson} /> : <span>{t.by(meta.authorDisplay || lesson.ownerName)}</span>}
        <QualityBadge quality={lesson.quality} note={lesson.qualityNote} />
      </div>
      <Heading><Link href={href} className="lx-card__link">{meta.title || t.untitled}</Link></Heading>
      {meta.description && <p>{meta.description}</p>}
      <CurriculumBadges refs={meta.curricula} max={2} currentVersionIds={currentVersionIds} />
      {lesson.forkedFrom && <span className="lx-card__meta"><GitFork size={13} aria-hidden />{t.forkedFrom} “{lesson.forkedFrom.sourceTitle}” · {lesson.forkedFrom.authorName}</span>}
      <div className="lx-card__foot">
        {progress ? <ProgressPill progress={progress} /> : showStatus ? <span className="lx-card__meta"><Clock size={13} aria-hidden />{t.updated(timeAgo(locale, lesson.updatedAt))}</span> : <StatsLine lesson={lesson} compact />}
        {footer && <div className="lx-card__menu">{footer}</div>}
      </div>
    </article>
  );
}

/** `level` keeps the outline continuous: 2 directly under a page title, 3 inside a section. */
export function EmptyState({ icon: Icon = BookOpen, title, body, children, level = 3 }: { icon?: typeof BookOpen; title: string; body?: string; children?: React.ReactNode; level?: 2 | 3 }) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <div className="lx-empty">
      <Icon size={28} aria-hidden />
      <Heading>{title}</Heading>
      {body && <p>{body}</p>}
      {children && <div className="lx-actions" style={{ justifyContent: "center" }}>{children}</div>}
    </div>
  );
}

export function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join("") || "?";
}

/** People are drawn as their blobatar (seeded from their account), never an uploaded photo. */
export function Avatar({ person, size = 72 }: { person: Pick<Person, "name" | "avatarUrl"> & { id?: string }; size?: number }) {
  if (person.id) return <MemberAvatar seed={avatarSeed(person.id)} size={size} />;
  return (
    <span className="lx-avatar" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden>
      {initials(person.name)}
    </span>
  );
}

export const lessonsCount = (locale: "en" | "ar", n: number) => `${n} ${pluralForm(locale, n, { one: locale === "ar" ? "درس" : "lesson", two: "درسان", few: "دروس", other: locale === "ar" ? "درسًا" : "lessons" })}`;
