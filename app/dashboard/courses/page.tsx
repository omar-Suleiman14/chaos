"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useCopy, useLocale } from "@/lib/i18n";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import { courseCopy, coverStyle } from "@/components/courses/shared";
import "@/components/courses/courses.css";

export default function CoursesPage() {
  const t = useCopy(courseCopy);
  const { locale } = useLocale();
  const router = useRouter();
  const courses = useQuery(api.courses.listMine);
  const create = useMutation(api.courses.create);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const newCourse = async () => {
    setBusy(true); setError("");
    try { const id = await create({ language: locale }); router.push(`/dashboard/courses/${id}`); }
    catch { setError(t.failed); setBusy(false); }
  };
  if (courses === undefined) return <PageSkeleton label={t.loading} />;
  const shown = courses.filter((c) => !c.archived);
  return (
    <div>
      <header className="ws-page-header">
        <div><h1 className="ws-page-title">{t.title}</h1><p className="ws-page-subtitle">{t.subtitle}</p></div>
        <div className="flex gap-2">
          <Link className="ws-btn ws-btn--ghost" href="/dashboard/learn/explore">{t.explore}</Link>
          <button type="button" className="ws-btn ws-btn--primary" onClick={() => void newCourse()} disabled={busy}><Plus size={16} aria-hidden /> {busy ? t.creating : t.new}</button>
        </div>
      </header>
      {error && <p role="alert" className="ws-error mb-4">{error}</p>}
      <div className="cx-grid">
        <button type="button" className="cx-new" onClick={() => void newCourse()} disabled={busy}><Plus size={24} aria-hidden /><span>{t.new}</span></button>
        {shown.map((c) => (
          <Link key={c.id} href={`/dashboard/courses/${c.id}`} className="cx-card">
            <div className="cx-cover" style={coverStyle(c.id, c.coverUrl)}><span className="cx-cover__badge">{!c.published ? t.draft : c.visibility === "public" ? t.live : t.privateLive}</span></div>
            <div className="cx-body"><span className="cx-title">{c.title}</span><span className="cx-meta">{t.lessons(c.lessons)}</span></div>
          </Link>
        ))}
      </div>
    </div>
  );
}
