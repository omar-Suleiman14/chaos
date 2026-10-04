"use client";

import Link from "@/components/site/SiteLink";
import { ArrowLeft, FolderOpen } from "lucide-react";
import { EmptyState, LessonCard } from "@/components/learn/ui";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import { useCollectionSnapshotLessons, usePublishedCollection, useProgress } from "@/lib/learn/data";
import { useCopy } from "@/lib/i18n";

const copy = {
  en: { loading: "Loading collection…", missing: "Collection unavailable", missingBody: "It may be private or no longer published.", lessons: (n: number) => `${n} ${n === 1 ? "lesson" : "lessons"}`, empty: "No published lessons in this collection yet.", back: "Back", collection: "Collection" },
  ar: { loading: "جارٍ تحميل المجموعة…", missing: "المجموعة غير متاحة", missingBody: "ربما صارت خاصة أو لم تعد منشورة.", lessons: (n: number) => `${n} درس`, empty: "لا دروس منشورة في هذه المجموعة بعد.", back: "رجوع", collection: "مجموعة" },
};

export default function CollectionView({ id }: { id: string }) {
  const t = useCopy(copy);
  const snapshot = usePublishedCollection(id);
  const lessons = useCollectionSnapshotLessons(id);
  const progress = useProgress() ?? {};
  if (snapshot === undefined || !lessons) return <PageSkeleton label={t.loading} />;
  if (snapshot === null) return <div className="lx-page lx-page--narrow" style={{ padding: "48px 16px" }}><EmptyState title={t.missing} body={t.missingBody} /></div>;
  const shown = lessons;
  return (
    <div className="lx-page" style={{ padding: "32px 16px 64px" }}>
      <Link href="/learn" className="lx-link" style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><ArrowLeft size={14} className="lx-flip" aria-hidden />{t.back}</Link>
      <header className="lx-hero">
        <div>
          <span className="lx-badge"><FolderOpen size={12} aria-hidden />{t.collection}</span>
          <h1 className="ws-page-title" style={{ marginTop: 8 }}>{snapshot.metadata.title}</h1>
          {snapshot.metadata.description && <p className="lx-help">{snapshot.metadata.description}</p>}
          <p className="lx-muted">{t.lessons(shown.length)}</p>
        </div>
      </header>
      {shown.length ? <div className="lx-grid">{shown.map((l) => <LessonCard key={l.id} lesson={l} href={`/learn/${l.id}`} progress={progress[l.id]} />)}</div> : <p className="lx-muted">{t.empty}</p>}
    </div>
  );
}
