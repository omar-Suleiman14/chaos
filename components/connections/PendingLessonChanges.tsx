"use client";

import { useState } from "react";
import { toast } from "@/lib/toast";
import { useMutation } from "convex/react";
import { useConfirmedQuery } from "@/lib/confirmedQuery";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCopy } from "@/lib/i18n";
import type { LessonMeta } from "@/lib/learn/types";
import type { Doc } from "@/convex/_generated/dataModel";
import ChangePreview from "./ChangePreview";
import { diffDraftBlocks } from "./lessonChanges";

const copy = {
  en: {
    title: "Lesson changes waiting for you",
    lead: "These connections are set to ask first. Nothing changes until you accept.",
    stale: "You edited this lesson after the change was sent. Accepting applies it on top of your edits.",
    error: (m: string) => `Couldn't save: ${m}`,
    review: "Ask before applying lesson changes",
    reviewHelp: "Updates from this connection wait here for you to accept or reject.",
  },
  ar: {
    title: "تغييرات على الدروس بانتظارك",
    lead: "هذه الاتصالات مضبوطة على الاستئذان أولًا. لا يتغير شيء حتى توافق.",
    stale: "عدّلت هذا الدرس بعد إرسال التغيير. القبول يطبّقه فوق تعديلاتك.",
    error: (m: string) => `تعذّر الحفظ: ${m}`,
    review: "اسأل قبل تطبيق تغييرات الدروس",
    reviewHelp: "تنتظر التحديثات من هذا الاتصال هنا حتى تقبلها أو ترفضها.",
  },
};

const meta = (value: Doc<"lessons">["metadata"]): LessonMeta => ({ ...value, curricula: [], indexing: value.indexing ?? "noindex" });

/** Owner review queue for connected-app lesson updates (lessonProposals). Hidden when empty. */
export default function PendingLessonChanges() {
  const t = useCopy(copy);
  const pending = useConfirmedQuery(api.lessonProposals.listPending, {}).data;
  const accept = useMutation(api.lessonProposals.accept);
  const reject = useMutation(api.lessonProposals.reject);
  const [busy, setBusy] = useState<string | null>(null);
  if (!pending?.length) return null;
  const run = async (id: string, work: () => Promise<unknown>) => {
    setBusy(id);
    try { await work(); } catch (err) { toast.error(t.error(err instanceof Error ? err.message : String(err))); } finally { setBusy(null); }
  };
  return (
    <section className="space-y-3" aria-labelledby="pending-lesson-changes">
      <h2 id="pending-lesson-changes" className="text-base font-semibold">{t.title}</h2>
      <p className="text-sm text-muted-foreground">{t.lead}</p>
      {pending.map((p) => (
        <div key={p.id} className="space-y-2">
          {!p.current && <p className="text-xs text-muted-foreground">{t.stale}</p>}
          <ChangePreview
            mode={p.current ? "preview" : "conflict"}
            appName={p.connectionLabel}
            before={meta(p.draft.metadata)}
            after={meta(p.proposed.metadata)}
            changes={diffDraftBlocks(p.draft.document, p.proposed.document)}
            busy={busy === p.id}
            onTakeTheirs={() => void run(p.id, () => accept({ proposalId: p.id as Id<"lessonProposals">, onTop: !p.current }))}
            onKeepMine={() => void run(p.id, () => reject({ proposalId: p.id as Id<"lessonProposals"> }))}
          />
        </div>
      ))}
    </section>
  );
}

/** Per-connection switch: hold lesson updates for review instead of saving them to the draft. */
export function ReviewModeSwitch({ tokenId, value }: { tokenId: Id<"integrationTokens">; value: boolean }) {
  const t = useCopy(copy);
  const set = useMutation(api.lessonProposals.setReviewMode);
  const [saving, setSaving] = useState(false);
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-1" checked={value} disabled={saving} onChange={(e) => { setSaving(true); void set({ tokenId, review: e.target.checked }).finally(() => setSaving(false)); }} />
      <span><span className="block">{t.review}</span><span className="block text-xs text-muted-foreground">{t.reviewHelp}</span></span>
    </label>
  );
}
