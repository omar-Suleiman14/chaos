"use client";

import { ChaosSelect } from "@/components/workspace/ChaosSelect";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCopy } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { WsTabs } from "./primitives";
import TeamFolder from "./TeamFolder";
import { linkOrigin } from "@/lib/hosts";
import { useConfirmed, useConfirmedQuery } from "@/lib/confirmedQuery";
import { LibrarySkeleton, PageSkeleton } from "./Skeletons";

const copy = {
  en: { back: "All teams", settings: "Team settings", resources: "Shared workspace", members: "Members", invites: "Invitations", activity: "Team activity", name: "Team name", save: "Save name", invite: "Create invitation", email: "Email (leave blank for a link)", inviteHelp: "Email invitations appear in the recipient’s Chaos account after email verification. You can also send them the link. Every link is single-use and expires in seven days.", link: "Invitation link", copy: "Copy link", copied: "Copied", revoke: "Revoke", admin: "Admin", member: "Member", owner: "Owner", transfer: "Transfer ownership", remove: "Remove", leave: "Leave team", share: "Share a resource", shareHelp: "Everyone on this team can edit shared content. Courses include their lessons; folders include supported content and subfolders. Publishing courses and lessons stays with the resource owner.", choose: "Choose one of your resources", shareButton: "Share with team", unshare: "Stop sharing", empty: "No shared resources yet.", loading: "Loading team…", unavailable: "This team is no longer available to you.", manage: "Settings", workspace: "Workspace", open: "Open folder", rename: "Rename", leaving: "Leave this team?", removal: "Remove this member and their shared resources from this team?", ownership: "Transfer ownership? You will become an administrator.", confirm: "Confirm", cancel: "Cancel", expired: "Expired", recent: "Recent resources (up to 200 of each type)", seats: "Active members", formerMember: "Former member", savedToast: "Saved", failedToast: "Could not save this change.", unsharedToast: "Stopped sharing", renamedToast: "Team renamed", revokedToast: "Invitation revoked", sharedToast: "Shared with the team" },
  ar: { back: "كل الفرق", settings: "إعدادات الفريق", resources: "مساحة العمل المشتركة", members: "الأعضاء", invites: "الدعوات", activity: "نشاط الفريق", name: "اسم الفريق", save: "احفظ الاسم", invite: "أنشئ دعوة", email: "البريد (اتركه فارغًا لإنشاء رابط)", inviteHelp: "تظهر دعوات البريد في حساب المستلم على Chaos بعد التحقق من بريده. يمكنك أيضًا إرسال الرابط إليه. يُستخدم كل رابط مرة واحدة وينتهي بعد سبعة أيام.", link: "رابط الدعوة", copy: "انسخ الرابط", copied: "تم النسخ", revoke: "ألغِ الدعوة", admin: "مسؤول", member: "عضو", owner: "مالك", transfer: "انقل الملكية", remove: "إزالة", leave: "غادر الفريق", share: "شارك محتوى", shareHelp: "يمكن لكل أعضاء الفريق تعديل المحتوى المشترك. تشمل الدورات دروسها؛ وتشمل المجلدات المحتوى المدعوم والمجلدات الفرعية. يظل نشر الدورات والدروس بيد مالك المحتوى.", choose: "اختر من محتواك", shareButton: "شارك مع الفريق", unshare: "أوقف المشاركة", empty: "لا يوجد محتوى مشترك بعد.", loading: "جارٍ تحميل الفريق…", unavailable: "لم يعد هذا الفريق متاحًا لك.", manage: "الإعدادات", workspace: "مساحة العمل", open: "افتح المجلد", rename: "أعد التسمية", leaving: "هل تريد مغادرة هذا الفريق؟", removal: "هل تريد إزالة هذا العضو والمحتوى الذي شاركه من الفريق؟", ownership: "هل تريد نقل الملكية؟ ستصبح مسؤولًا.", confirm: "تأكيد", cancel: "إلغاء", expired: "منتهية", recent: "المحتوى الأخير (حتى ٢٠٠ من كل نوع)", seats: "الأعضاء النشطون", formerMember: "عضو سابق", savedToast: "تم الحفظ", failedToast: "تعذّر حفظ هذا التغيير.", unsharedToast: "أُوقفت المشاركة", renamedToast: "أُعيدت تسمية الفريق", revokedToast: "أُلغيت الدعوة", sharedToast: "تمت المشاركة مع الفريق" },
};
type Action = { title: string; run: () => Promise<unknown> };
export default function TeamWorkspace({ teamId }: { teamId: Id<"businessTeams"> }) {
  const { isAuthenticated } = useConvexAuth();
  const t = useCopy(copy), teams = useConfirmed("businessTeams.list", useQuery(api.businessTeams.list, isAuthenticated ? {} : "skip")).data;
  const current = teams?.find(row => row.team._id === teamId);
  if (teams === undefined) return <PageSkeleton label={t.loading} />;
  if (!current) return <div className="ws-page ws-teams-page"><p role="status">{t.unavailable}</p><Link href="/dashboard/teams">{t.back}</Link></div>;
  return <TeamContents key={teamId} teamId={teamId} name={current.team.name} role={current.role} />;
}
function TeamContents({ teamId, name, role }: { teamId: Id<"businessTeams">; name: string; role: "owner" | "admin" | "member" }) {
  const t = useCopy(copy), router = useRouter(), manage = role !== "member";
  const members = useConfirmedQuery(api.businessTeams.members, { teamId }).data, resources = useConfirmedQuery(api.businessTeams.resources, { teamId }).data;
  const candidates = useConfirmedQuery(api.businessTeams.ownedResources).data;
  const invites = useConfirmedQuery(api.businessTeams.invitations, manage ? { teamId } : "skip").data;
  const activity = useConfirmedQuery(api.businessTeams.activity, { teamId }).data;
  const me = useConfirmedQuery(api.quizFunctions.getCurrentUser).data;
  const rename = useMutation(api.businessTeams.rename), invite = useMutation(api.businessTeams.invite), revoke = useMutation(api.businessTeams.revokeInvite);
  const changeRole = useMutation(api.businessTeams.changeRole), remove = useMutation(api.businessTeams.removeMember);
  const share = useMutation(api.businessTeams.share), unshare = useMutation(api.businessTeams.unshare);
  // The workspace menu links straight to settings with ?tab=settings.
  const wanted = useSearchParams().get("tab") === "settings" ? "settings" : "workspace";
  const [tab, setTab] = useState<string>(wanted), [teamName, setTeamName] = useState(name);
  useEffect(() => setTab(wanted), [wanted]);
  const [email, setEmail] = useState(""), [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [link, setLink] = useState(""), [copied, setCopied] = useState(false);
  const [assetId, setAssetId] = useState(""), [folderId, setFolderId] = useState<Id<"folders"> | null>(null);
  const [busy, setBusy] = useState(false), [action, setAction] = useState<Action | null>(null);
  /** Runs a team change; the outcome shows as a toast. */
  async function run(action: () => Promise<unknown>, done: string = t.savedToast) {
    setBusy(true);
    try { await action(); setAction(null); toast.success(done); }
    catch (error) { toast.error(error, { fallback: t.failedToast }); }
    finally { setBusy(false); }
  }
  return <div className="ws-page ws-teams-page">
    <header><Link className="text-sm text-muted-foreground" href="/dashboard/teams">{t.back}</Link><h1 className="ws-page-title">{name}</h1><p className="ws-page-subtitle">Business · {members?.length ?? "…"} {t.seats} · {t[role]}</p></header>
    <WsTabs label={t.settings} tabs={["workspace", "settings"]} labels={{ workspace: t.workspace, settings: t.manage }} value={tab} onChange={setTab} />
    {action && <section className="ws-team-card" role="alertdialog" aria-label={action.title} aria-modal="false"><h2>{action.title}</h2><div className="ws-team-actions"><button className="ws-btn ws-btn--primary" disabled={busy} onClick={() => void run(action.run)}>{t.confirm}</button><button className="ws-btn" disabled={busy} onClick={() => setAction(null)}>{t.cancel}</button></div></section>}
    {tab === "workspace" ? <>
      <section className="ws-team-card"><h2>{t.resources}</h2><p>{t.shareHelp}</p>{resources === undefined ? <LibrarySkeleton label={t.loading} view="list" count={3} /> : resources.length === 0 ? <p>{t.empty}</p> : resources.map(resource => <div className="ws-team-row" key={resource.shareId}><div>{resource.asset.kind === "folder" ? <button className="ws-btn ws-btn--ghost" onClick={() => setFolderId(resource.asset.id as Id<"folders">)}>{resource.title}</button> : <Link href={resource.href}>{resource.title}</Link>}<small>{resource.asset.kind}</small></div>{(manage || resource.ownerId === me?.clerkId) && <button className="ws-btn ws-btn--ghost" disabled={busy} onClick={() => void run(() => unshare({ shareId: resource.shareId }), t.unsharedToast)}>{t.unshare}</button>}</div>)}</section>
      {folderId && <TeamFolder key={folderId} folderId={folderId} onClose={() => setFolderId(null)} />}
      <section className="ws-team-card"><h2>{t.share}</h2><p>{t.recent}</p><form onSubmit={event => { event.preventDefault(); const selected = candidates?.find(row => `${row.asset.kind}:${row.asset.id}` === assetId); if (selected) void run(async () => { await share({ teamId, asset: selected.asset }); setAssetId(""); }, t.sharedToast); }}><ChaosSelect aria-label={t.choose} value={assetId} required disabled={busy} onChange={event => setAssetId(event.target.value)}><option value="">{t.choose}</option>{candidates?.filter(row => !resources?.some(resource => resource.asset.id === row.asset.id && resource.asset.kind === row.asset.kind)).map(row => <option key={`${row.asset.kind}:${row.asset.id}`} value={`${row.asset.kind}:${row.asset.id}`}>{row.title} ({row.asset.kind})</option>)}</ChaosSelect><button className="ws-btn ws-btn--primary" disabled={busy || !assetId}>{t.shareButton}</button></form></section>
    </> : <>
      {manage && <section className="ws-team-card"><h2>{t.settings}</h2><form onSubmit={event => { event.preventDefault(); void run(() => rename({ teamId, name: teamName }), t.renamedToast); }}><label>{t.name}<input className="kb-input" value={teamName} onChange={event => setTeamName(event.target.value)} required maxLength={120} disabled={busy} /></label><button className="ws-btn" disabled={busy}>{t.save}</button></form></section>}
      <section className="ws-team-card"><h2>{t.members}</h2>{members?.map(member => <div key={member.id} className="ws-team-row"><div><strong>{member.name}</strong><small>{member.email} · {t[member.role]}</small></div><div className="ws-team-actions">{role === "owner" && member.role !== "owner" && <><ChaosSelect aria-label={`${member.name}: ${t.member}`} value={member.role} disabled={busy} onChange={event => void run(() => changeRole({ teamId, userId: member.userId, role: event.target.value as "member" | "admin" }))}><option value="member">{t.member}</option><option value="admin">{t.admin}</option></ChaosSelect><button className="ws-btn ws-btn--ghost" disabled={busy} onClick={() => setAction({ title: t.ownership, run: () => changeRole({ teamId, userId: member.userId, role: "owner" }) })}>{t.transfer}</button></>}{member.role !== "owner" && (member.userId === me?.clerkId || role === "owner" || (role === "admin" && member.role === "member")) && <button className="ws-btn ws-btn--ghost" disabled={busy} onClick={() => setAction({ title: member.userId === me?.clerkId ? t.leaving : t.removal, run: async () => { await remove({ teamId, userId: member.userId }); if (member.userId === me?.clerkId) router.push("/dashboard/teams"); } })}>{member.userId === me?.clerkId ? t.leave : t.remove}</button>}</div></div>)}</section>
      {manage && <section className="ws-team-card"><h2>{t.invites}</h2><p>{t.inviteHelp}</p><form onSubmit={event => { event.preventDefault(); void run(async () => { const result = await invite({ teamId, email: email || undefined, role: inviteRole }); setLink(`${linkOrigin("dashboard")}/dashboard/teams#invite=${result.token}`); setCopied(false); setEmail(""); }); }}><label>{t.email}<input type="email" className="kb-input" value={email} onChange={event => setEmail(event.target.value)} maxLength={254} disabled={busy} /></label><ChaosSelect aria-label={t.member} value={inviteRole} disabled={busy} onChange={event => setInviteRole(event.target.value as "member" | "admin")}><option value="member">{t.member}</option>{role === "owner" && <option value="admin">{t.admin}</option>}</ChaosSelect><button className="ws-btn" disabled={busy}>{t.invite}</button></form>{link && <div className="ws-team-invite-link"><label>{t.link}<input className="kb-input w-full" readOnly value={link} onFocus={event => event.target.select()} /></label><button className="ws-btn" onClick={() => void run(async () => { await navigator.clipboard.writeText(link); setCopied(true); }, t.copied)}>{copied ? t.copied : t.copy}</button></div>}{invites?.map(row => <div className="ws-team-row" key={row.id}><div><strong>{row.email || t.link}</strong><small>{t[row.role]} · {new Date(row.expiresAt).toLocaleDateString()}{row.expiresAt <= Date.now() ? ` · ${t.expired}` : ""}</small></div><button className="ws-btn ws-btn--ghost" disabled={busy} onClick={() => void run(() => revoke({ inviteId: row.id }), t.revokedToast)}>{t.revoke}</button></div>)}</section>}
      <section className="ws-team-card"><h2>{t.activity}</h2>{activity?.map(row => <div key={row._id} className="ws-team-row"><div><strong>{row.action.replaceAll("_", " ")}</strong><p>{row.detail}</p><small>{new Date(row.createdAt).toLocaleString()} · {members?.find(member => member.userId === row.actorId)?.name ?? t.formerMember}</small></div></div>)}</section>
    </>}
  </div>;
}
