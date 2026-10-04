"use client";

import Link from "@/components/site/SiteLink";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useFlashcardSet } from "@/lib/learn/data";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import FlashcardStudy from "@/components/learn/study/FlashcardStudy";
import { useCopy } from "@/lib/i18n";

const copy = {
  en: { loading: "Opening flashcards…", back: "Back to Learn", unavailable: "Flashcards unavailable", unavailableBody: "This set may be private or no longer published." },
  ar: { loading: "جارٍ فتح البطاقات…", back: "العودة إلى التعلّم", unavailable: "البطاقات غير متاحة", unavailableBody: "قد تكون المجموعة خاصة أو لم تعد منشورة." },
};

export default function PublicFlashcardsPage() {
  const t = useCopy(copy);
  const { id } = useParams<{ id: string }>();
  const set = useFlashcardSet(id);
  if (set === undefined) return <PageSkeleton label={t.loading} />;
  return <main className="lx-page lx-page--narrow" style={{ paddingBlock: 32 }}>
    <Link className="lx-link" href={set?.lessonId ? `/learn/${set.lessonId}` : "/learn"}><ArrowLeft size={14} aria-hidden /> {t.back}</Link>
    {set ? <><header className="lx-hero"><h1 className="ws-page-title">{set.title}</h1></header><FlashcardStudy setId={set.id} /></> : <div className="lx-empty"><h1>{t.unavailable}</h1><p>{t.unavailableBody}</p></div>}
  </main>;
}
