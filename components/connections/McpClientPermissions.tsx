"use client";

import { useEffect, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useLocale } from "@/lib/i18n";
import { errorMessage } from "@/lib/errors";

const LABELS = {
  en: {
    title: "AI assistant permissions",
    intro: "Control what each signed-in ChatGPT, Claude or other OAuth assistant can do. Permissions apply to this app only, not your whole account.",
    empty: "No OAuth assistants have connected yet. Connect one from ChatGPT or Claude, then return here to review access.",
    saving: "Saving…", save: "Save permissions", saved: "Permissions saved", revoke: "Revoke tool access", confirm: "Allow this assistant to read private responses, publish, change collaborators or perform destructive actions?",
    id: "OAuth client ID", lastSeen: "Last connected", denied: "No tool access; sign-in remains connected. Choose permissions to restore access.",
    notes: "Changes take effect for backend tool calls immediately. An assistant may need to refresh its tool list. These are Chaos permissions, not identity-provider OAuth scopes.",
    categories: {
      read_content: ["Read content", "Read accessible lessons and forms."],
      edit_content: ["Edit drafts", "Create or change drafts and content."],
      publish_content: ["Publish and go live", "Publish content or open live game rooms."],
      aggregate_analytics: ["Aggregate results", "Read summary statistics."],
      individual_responses: ["Individual answers", "Read or export identifiable answers."],
      collaborators: ["Sharing and people", "Invite/remove people and change sharing."],
      destructive: ["Destructive actions", "Unpublish, archive, remove blocks or stop games."],
      admin_crm: ["Private admin CRM", "Admin-only contact records and notes."],
      admin_operations: ["Platform administration", "Admin-only moderation and platform operations."],
    },
  },
  ar: {
    title: "صلاحيات مساعدي الذكاء الاصطناعي",
    intro: "حدد ما يستطيع كل مساعد متصل بحسابك عبر OAuth، مثل ChatGPT أو Claude، فعله. الإعدادات خاصة بكل تطبيق.",
    empty: "لم يتصل أي مساعد بعد. اربط ChatGPT أو Claude أولًا ثم ارجع إلى هنا لتحديد الصلاحيات.",
    saving: "جارٍ الحفظ…", save: "حفظ الصلاحيات", saved: "اتحفظت الصلاحيات", revoke: "إيقاف وصول المساعد", confirm: "تسمح للمساعد بقراءة الإجابات الخاصة أو النشر أو تغيير أعضاء الفريق أو تنفيذ إجراءات لا يمكن التراجع عنها بسهولة؟",
    id: "معرّف تطبيق OAuth", lastSeen: "آخر اتصال", denied: "المساعد ليس له أي صلاحية حاليًا. تقدر ترجع تختار الصلاحيات من هنا.",
    notes: "التغييرات بتتطبق فورًا على أوامر المساعد في السيرفر. ممكن يحتاج يحدّث قائمة الأدوات. دي صلاحيات Chaos مش OAuth scopes بتاعة تسجيل الدخول.",
    categories: {
      read_content: ["قراءة المحتوى", "قراءة الدروس والنماذج المسموح بها."],
      edit_content: ["تعديل المسودات", "إنشاء المحتوى والمسودات وتعديلها."],
      publish_content: ["النشر", "نشر المحتوى وتشغيل الألعاب المباشرة."],
      aggregate_analytics: ["ملخصات النتائج", "عرض إحصائيات مجمعة."],
      individual_responses: ["إجابات الأفراد", "قراءة الإجابات الفردية أو تصديرها."],
      collaborators: ["المشاركة والأعضاء", "إضافة الأعضاء وتغيير صلاحياتهم."],
      destructive: ["إجراءات مؤثرة", "إلغاء النشر أو الأرشفة أو حذف كتل من الدروس."],
      admin_crm: ["إدارة العملاء الخاصة", "بيانات العملاء والملاحظات الخاصة بالإدارة."],
      admin_operations: ["إدارة المنصة", "أدوات الإشراف والإدارة الخاصة."],
    },
  },
} as const;

const SENSITIVE = new Set(["individual_responses", "publish_content", "collaborators", "destructive", "admin_crm", "admin_operations"]);

function GrantCard({ grant, available, ar }: { grant: { clientId: string; label: string; permissions: string[]; lastSeenAt: number }; available: string[]; ar: boolean }) {
  const t = ar ? LABELS.ar : LABELS.en;
  const [chosen, setChosen] = useState<string[]>(grant.permissions);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const update = useMutation(api.mcpClientGrants.updateMine);
  useEffect(() => { setChosen(grant.permissions); }, [grant.permissions]);
  const modified = [...chosen].sort().join("|") !== [...grant.permissions].sort().join("|");

  async function save(next: string[]) {
    const addedSensitive = next.some(p => SENSITIVE.has(p) && !grant.permissions.includes(p));
    if (addedSensitive && !window.confirm(t.confirm)) return;
    setBusy(true); setMessage("");
    try {
      await update({ clientId: grant.clientId, permissions: next });
      setChosen(next);
      setMessage(t.saved);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return <article className="rounded-xl border p-4 space-y-3">
    <header>
      <h3 className="font-semibold">{grant.label}</h3>
      <p className="text-xs text-muted-foreground break-all">{t.id}: {grant.clientId}</p>
      <p className="text-xs text-muted-foreground">{t.lastSeen}: {new Date(grant.lastSeenAt).toLocaleString(ar ? "ar-EG" : "en-GB")}</p>
    </header>
    <div className="grid gap-3 sm:grid-cols-2">
      {available.map(category => {
        const label = t.categories[category as keyof typeof t.categories];
        if (!label) return null;
        return <label key={category} className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 accent-current" checked={chosen.includes(category)}
            onChange={event => setChosen(current => event.target.checked ? [...current, category] : current.filter(p => p !== category))} />
          <span><strong className="block">{label[0]}</strong><span className="text-muted-foreground">{label[1]}</span></span>
        </label>;
      })}
    </div>
    {chosen.length === 0 && <p className="text-sm text-muted-foreground">{t.denied}</p>}
    <div className="flex flex-wrap gap-3">
      <button type="button" className="ws-btn ws-btn--primary ws-btn--sm" disabled={busy || !modified} onClick={() => void save(chosen)}>{busy ? t.saving : t.save}</button>
      <button type="button" className="ws-btn ws-btn--sm" disabled={busy || grant.permissions.length === 0} onClick={() => void save([])}>{t.revoke}</button>
    </div>
    {message && <output className="block text-sm">{message}</output>}
  </article>;
}

export default function McpClientPermissions() {
  const { locale } = useLocale();
  const ar = locale === "ar", t = ar ? LABELS.ar : LABELS.en;
  const { isAuthenticated } = useConvexAuth();
  const grants = useQuery(api.mcpClientGrants.listMine, isAuthenticated ? {} : "skip");
  const capability = useQuery(api.mcpClientGrants.myCapabilities, isAuthenticated ? {} : "skip");
  return <section className="my-6 space-y-4" aria-label={t.title}>
    <div><h2 className="text-xl font-semibold">{t.title}</h2><p className="text-sm text-muted-foreground">{t.intro}</p></div>
    {grants && grants.length === 0 && <p className="text-sm">{t.empty}</p>}
    {grants?.map(grant => <GrantCard key={grant.clientId} grant={grant} available={capability?.permissions ?? []} ar={ar} />)}
    <p className="text-xs text-muted-foreground">{t.notes}</p>
  </section>;
}
