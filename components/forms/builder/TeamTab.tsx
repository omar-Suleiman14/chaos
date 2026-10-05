"use client";

import { useState } from "react";
import Link from "next/link";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import posthog from "@/lib/analytics";
import { Check, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { FormDefinition } from "@/convex/formLogic";
import { errorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useCopy, useLocale } from "@/lib/i18n";
import { localizeActivityAction, localizeActivityDetail, localizeMessage } from "@/lib/messages";
import { timeAgo } from "@/lib/timeAgo";
import { Select } from "@/components/workspace/Select";
import DocHint from "@/components/forms/DocHint";

const copy = {
  en: {
    people: "People", peopleHelp: "Editors can change and publish. Viewers can only look.", approvalsHint: "To review before editors publish, turn on approvals in Settings.",
    activityHelp: "Edits, publishing, sharing and settings changes, newest first.", commentsHelp: "Notes for collaborators. Respondents never see them.",
    emailAddress: "Email address", role: "Role", editor: "Editor", viewer: "Viewer", invite: "Invite",
    inviteNote: "No email is sent. Tell them to sign in with this address.",
    invitedToast: (email: string) => `Invited ${email}`, roleChanged: "Role changed", removedToast: "Collaborator removed",
    invited: " · invited", makeViewer: "Make viewer", makeEditor: "Make editor", remove: (email: string) => `Remove ${email}`, onlyYou: "Only you.",
    activity: "Activity", comments: "Comments", showResolved: "Show resolved", leaveNote: "Leave a note for collaborators", comment: "Comment",
    aboutQuestion: "About question", wholeForm: "Whole form", on: (label: string) => ` · on “${label}”`, reopen: "Reopen", resolve: "Resolve",
  },
  ar: {
    people: "الأشخاص", peopleHelp: "يعدّل المحررون وينشرون. يطّلع المشاهدون فقط.", approvalsHint: "لمراجعة التغييرات قبل نشر المحررين، فعّل الموافقة من الإعدادات.",
    activityHelp: "التعديلات والنشر والمشاركة وتغييرات الإعدادات، الأحدث أولًا.", commentsHelp: "ملاحظات للمتعاونين. لا يراها المجيبون أبدًا.",
    emailAddress: "البريد الإلكتروني", role: "الدور", editor: "محرر", viewer: "مشاهد", invite: "ادعُ",
    inviteNote: "لا تُرسل رسالة. أخبرهم أن يسجلوا الدخول بهذا البريد.",
    invitedToast: (email: string) => `تمت دعوة ${email}`, roleChanged: "تغيّر الدور", removedToast: "أُزيل المتعاون",
    invited: " · مدعو", makeViewer: "اجعله مشاهدًا", makeEditor: "اجعله محررًا", remove: (email: string) => `أزل ${email}`, onlyYou: "أنت فقط.",
    activity: "النشاط", comments: "التعليقات", showResolved: "أظهر المحلولة", leaveNote: "اترك ملاحظة للمتعاونين", comment: "علّق",
    aboutQuestion: "عن السؤال", wholeForm: "النموذج كله", on: (label: string) => ` · على «${label}»`, reopen: "أعد الفتح", resolve: "علّم كمحلول",
  },
};

export default function TeamTab({ formId, role, def }: { formId: Id<"forms">; role: "owner" | "editor" | "viewer"; def: FormDefinition }) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const collaborators = useQuery(api.forms.listCollaborators, { formId });
  const { isAuthenticated } = useConvexAuth();
  const teams = useQuery(api.businessTeams.list, isAuthenticated ? {} : "skip");
  const comments = useQuery(api.forms.listComments, { formId });
  const activity = useQuery(api.forms.listActivity, { formId });
  const invite = useMutation(api.forms.inviteCollaborator);
  const removeCollaborator = useMutation(api.forms.removeCollaborator);
  const addComment = useMutation(api.forms.addComment);
  const resolveComment = useMutation(api.forms.resolveComment);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [body, setBody] = useState("");
  const [fieldId, setFieldId] = useState("");
  const [error, setError] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const fieldLabel = (id?: string) => (id ? def.fields.find((f) => f.id === id)?.label || id : null);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-6">
        <section className="chaos-card bg-card p-5 space-y-3" aria-label={t.people}>
          <h2 className="chaos-heading text-sm">{t.people}</h2>
          <DocHint slug="team">{t.peopleHelp} {t.approvalsHint}</DocHint>
          <Link className="text-sm underline" href="/dashboard/teams">{locale === "ar" ? "الفرق ومساحات العمل · الأعمال مجانية لفترة محدودة" : "Teams & workspaces · Business is free for a limited time"}</Link>
          {role === "owner" && !!teams?.length && (
            <form className="flex gap-2 flex-wrap" onSubmit={(e) => {
              e.preventDefault();
              setError("");
              invite({ formId, email, role: inviteRole }).then(() => { posthog.capture("collaborator_invited", { role: inviteRole }); toast.success(t.invitedToast(email)); setEmail(""); }).catch((err) => setError(localizeMessage(locale, errorMessage(err))));
            }}>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@example.com" className="kb-input flex-1 min-w-48" aria-label={t.emailAddress} />
              <Select label={t.role} value={inviteRole} onChange={setInviteRole}
                options={[{ value: "editor", label: t.editor }, { value: "viewer", label: t.viewer }]} />
              <button className="kb-btn kb-btn-primary text-xs">{t.invite}</button>
            </form>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <p className="text-[11px] text-muted-foreground">{t.inviteNote}</p>
          <ul className="divide-y divide-foreground/10">
            {collaborators?.map((c) => (
              <li key={c._id} className="py-2 flex items-center gap-3 text-sm">
                <span className="flex-1 truncate">{c.email}</span>
                <span className="text-xs text-muted-foreground">{c.role === "editor" ? t.editor : t.viewer}{c.joined ? "" : t.invited}</span>
                {role === "owner" && (
                  <>
                    <button type="button" className="text-xs underline" onClick={() => invite({ formId, email: c.email, role: c.role === "editor" ? "viewer" : "editor" }).then(() => toast.success(t.roleChanged), (e) => toast.error(e))}>
                      {c.role === "editor" ? t.makeViewer : t.makeEditor}
                    </button>
                    <button type="button" onClick={() => removeCollaborator({ collaboratorId: c._id }).then(() => toast.success(t.removedToast), (e) => toast.error(e))} aria-label={t.remove(c.email)}><Trash2 size={14} /></button>
                  </>
                )}
              </li>
            ))}
            {collaborators?.length === 0 && <li className="py-2 text-sm text-muted-foreground">{t.onlyYou}</li>}
          </ul>
        </section>

        <section className="chaos-card bg-card p-5 space-y-3" aria-label={t.activity}>
          <h2 className="chaos-heading text-sm">{t.activity}</h2>
          <p className="text-xs text-muted-foreground">{t.activityHelp}</p>
          <ul className="space-y-2 text-sm max-h-96 overflow-y-auto">
            {activity?.map((a) => (
              <li key={a._id}>
                <span className="font-medium">{a.actorName}</span> {localizeActivityAction(locale, a.action)}{a.detail ? ` — ${localizeActivityDetail(locale, a.detail)}` : ""}
                <span className="block text-[11px] text-muted-foreground">{timeAgo(locale, a.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="chaos-card bg-card p-5 space-y-3 h-fit" aria-label={t.comments}>
        <div className="flex items-center justify-between">
          <h2 className="chaos-heading text-sm">{t.comments}</h2>
          <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> {t.showResolved}</label>
        </div>
        <p className="text-xs text-muted-foreground">{t.commentsHelp}</p>
        <form className="space-y-2" onSubmit={(e) => {
          e.preventDefault();
          if (!body.trim()) return;
          addComment({ formId, body, fieldId: fieldId || undefined }).then(() => setBody("")).catch((err) => toast.error(err));
        }}>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} className="kb-input text-sm" placeholder={t.leaveNote} aria-label={t.comment} maxLength={5000} />
          <div className="flex gap-2">
            <Select size="sm" label={t.aboutQuestion} value={fieldId} onChange={setFieldId} className="flex-1"
              options={[{ value: "", label: t.wholeForm }, ...def.fields.map((f, i) => ({ value: f.id, label: `${i + 1}. ${f.label || f.type}` }))]} />
            <button className="kb-btn kb-btn-primary text-xs">{t.comment}</button>
          </div>
        </form>
        <ul className="space-y-3">
          {comments?.filter((c) => showResolved || !c.resolved).map((c) => (
            <li key={c._id} className={`border-s-4 ps-3 ${c.resolved ? "border-foreground/10 text-muted-foreground" : "border-primary"}`}>
              <p className="text-xs"><span className="font-medium">{c.authorName}</span> · {timeAgo(locale, c.createdAt)}{fieldLabel(c.fieldId) && t.on(fieldLabel(c.fieldId)!)}</p>
              <p className="text-sm whitespace-pre-line">{c.body}</p>
              {role !== "viewer" && (
                <button type="button" className="text-xs underline flex items-center gap-1 mt-1" onClick={() => resolveComment({ commentId: c._id, resolved: !c.resolved })}>
                  <Check size={12} /> {c.resolved ? t.reopen : t.resolve}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
