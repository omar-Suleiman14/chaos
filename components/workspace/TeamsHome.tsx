"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { Plus, Users } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useCopy } from "@/lib/i18n";
import { errorMessage } from "@/lib/errors";
import BusinessPromo from "./BusinessPromo";

const copy = {
  en: { title: "Teams & workspaces", lead: "Personal is a workspace for one user. Create or join a Business team to edit forms, lessons, courses and folders together.", name: "Team name", create: "Create free Business team", creating: "Creating…", invites: "Your email invitations", accept: "Join team", link: "Join with an invitation link", linkHelp: "Paste your invitation link. Email invitations require the invited address to be verified. Links expire after seven days and can be used once.", join: "Join", empty: "No Business teams yet.", loading: "Loading teams…", verified: "Email invitations appear here after you sign in with the invited, verified address.", role: "Role", roles: { owner: "Owner", admin: "Admin", member: "Member" } },
  ar: { title: "الفرق ومساحات العمل", lead: "المساحة الشخصية لمستخدم واحد. أنشئ فريق أعمال أو انضم إليه لتعديل النماذج والدروس والدورات والمجلدات معًا.", name: "اسم الفريق", create: "أنشئ فريق أعمال مجانًا", creating: "جارٍ الإنشاء…", invites: "دعوات بريدك الإلكتروني", accept: "انضم للفريق", link: "انضم برابط دعوة", linkHelp: "الصق رابط الدعوة. تتطلب دعوات البريد التحقق من العنوان المدعو. تنتهي الروابط بعد سبعة أيام وتُستخدم مرة واحدة.", join: "انضم", empty: "لا توجد فرق أعمال بعد.", loading: "جارٍ تحميل الفرق…", verified: "تظهر دعوات البريد هنا عند تسجيل الدخول بالعنوان المدعو بعد التحقق منه.", role: "الدور", roles: { owner: "مالك", admin: "مسؤول", member: "عضو" } },
};
export default function TeamsHome() {
  const t = useCopy(copy), router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const teams = useQuery(api.businessTeams.list, isAuthenticated ? {} : "skip"), invites = useQuery(api.businessTeams.inbox, isAuthenticated ? {} : "skip");
  const create = useMutation(api.businessTeams.create), accept = useMutation(api.businessTeams.accept);
  const [name, setName] = useState(""), [link, setLink] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("invite");
    if (token) { setLink(token); window.history.replaceState(null, "", window.location.pathname + window.location.search); }
  }, []);
  async function run(action: () => Promise<string>) {
    setBusy(true); setError("");
    try { router.push(`/dashboard/teams/${await action()}`); }
    catch (error) { setError(errorMessage(error, "Could not join this team.")); }
    finally { setBusy(false); }
  }
  if (!isAuthenticated) return <p role="status">{t.loading}</p>;
  return <div className="ws-page ws-teams-page">
    <header><h1 className="ws-page-title">{t.title}</h1><p className="ws-page-subtitle">{t.lead}</p></header>
    <BusinessPromo />
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <section className="ws-team-card"><h2><Plus size={18} aria-hidden />{t.create}</h2><form onSubmit={event => { event.preventDefault(); void run(() => create({ name })); }}><label>{t.name}<input className="kb-input" value={name} onChange={event => setName(event.target.value)} required maxLength={120} disabled={busy} /></label><button className="ws-btn ws-btn--primary" disabled={busy}>{busy ? t.creating : t.create}</button></form></section>
    <div className="ws-team-grid">{teams?.map(row => <Link key={row.team._id} href={`/dashboard/teams/${row.team._id}`} className="ws-team-card"><Users size={20} aria-hidden /><h2>{row.team.name}</h2><p>{t.role}: {t.roles[row.role]}</p></Link>)}</div>
    {!teams?.length && <p role="status">{teams === undefined ? t.loading : t.empty}</p>}
    <section className="ws-team-card"><h2>{t.invites}</h2><p>{t.verified}</p>{invites?.map(row => <div key={row.invite.id} className="ws-team-row"><span>{row.teamName} · {t.roles[row.invite.role]}</span><button className="ws-btn" disabled={busy} onClick={() => void run(() => accept({ inviteId: row.invite.id }))}>{t.accept}</button></div>)}</section>
    <section className="ws-team-card"><h2>{t.link}</h2><p>{t.linkHelp}</p><form onSubmit={event => { event.preventDefault(); let token = link.trim(); try { token = new URLSearchParams(new URL(token).hash.slice(1)).get("invite") ?? ""; } catch {} void run(() => accept({ token })); }}><input className="kb-input" aria-label={t.link} value={link} onChange={event => setLink(event.target.value)} required disabled={busy} autoComplete="off" /><button className="ws-btn" disabled={busy}>{t.join}</button></form></section>
  </div>;
}
