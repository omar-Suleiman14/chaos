"use client";

/* eslint-disable @next/next/no-img-element -- account photos come from the auth provider's CDN */
import { usePathname, useRouter } from "next/navigation";
import { useConvexAuth, useQuery } from "convex/react";
import { Archive, BookOpen, Check, ChevronsUpDown, IdCard, Link2, LogOut, Plus, Settings, Shield, SlidersHorizontal, UserCog, UserPlus, Users } from "lucide-react";
import { api } from "@/convex/_generated/api";
import MemberAvatar from "@/components/MemberAvatar";
import { useCopy } from "@/lib/i18n";
import { WsMenu } from "./primitives";

const copy = {
  en: {
    label: "Account", personal: "Personal", personalHelp: "Just you", business: "Business", switchTo: "Workspaces",
    roles: { owner: "Owner", admin: "Admin", member: "Member" }, create: "Create a Business team",
    workspaceSettings: "Workspace settings", teams: "Teams & invitations", profile: "Profile and card", settings: "Settings",
    archive: "Archive", manage: "Manage account", signOut: "Sign out", connections: "Connections", docs: "Docs", admin: "Admin",
  },
  ar: {
    label: "الحساب", personal: "شخصي", personalHelp: "لك وحدك", business: "أعمال", switchTo: "مساحات العمل",
    roles: { owner: "مالك", admin: "مسؤول", member: "عضو" }, create: "أنشئ فريق أعمال",
    workspaceSettings: "إعدادات مساحة العمل", teams: "الفرق والدعوات", profile: "الملف الشخصي والبطاقة", settings: "الإعدادات",
    archive: "الأرشيف", manage: "إدارة الحساب", signOut: "تسجيل الخروج", connections: "الاتصالات", docs: "الدليل", admin: "الإدارة",
  },
};

export type AccountMenuUser = { name: string; email?: string; imageUrl?: string; avatarSeed?: string };

/** The person's photo from their sign-in, or their Chaos avatar when there is none. */
function Avatar({ user, size }: { user: AccountMenuUser; size: number }) {
  if (user.imageUrl && !/default|gravatar.*d=blank/i.test(user.imageUrl)) return <img className="ws-account__photo" src={user.imageUrl} alt="" width={size} height={size} style={{ width: size, height: size }} />;
  return user.avatarSeed ? <MemberAvatar seed={user.avatarSeed} size={size} /> : <span className="ws-account__photo" style={{ width: size, height: size }} aria-hidden="true" />;
}

/**
 * The account row at the bottom of the sidebar, as in ChatGPT: photo, name and current workspace. It only
 * opens this menu, which holds workspace switching, profile, settings, archive, the sign-in account and sign out.
 */
export default function AccountMenu({ user, compact = false, admin = false, onManageAccount, onSignOut }: { user: AccountMenuUser; compact?: boolean; admin?: boolean; onManageAccount: () => void; onSignOut: () => void }) {
  const { isAuthenticated } = useConvexAuth();
  const teams = useQuery(api.businessTeams.list, isAuthenticated ? {} : "skip");
  const pathname = usePathname(), router = useRouter(), t = useCopy(copy);
  const selected = pathname.match(/\/dashboard\/teams\/([^/]+)/)?.[1] ?? "";
  const current = teams?.find(row => row.team._id === selected);
  const workspace = current?.team.name ?? t.personal;
  const navigate = (href: string, close: () => void) => { close(); router.push(href); };
  const icon = (team: boolean) => <span className="ws-workspace-avatar" aria-hidden="true">{team ? <Users size={17} /> : <Avatar user={user} size={30} />}</span>;
  return <div className="ws-account">
    <WsMenu label={t.label} align="start" triggerClassName="ws-account__trigger" menuClassName="ws-workspace-menu" trigger={<>
      <Avatar user={user} size={compact ? 26 : 30} />
      {!compact && <span className="ws-workspace-title"><strong>{user.name}</strong><small>{workspace}</small></span>}
      {!compact && <ChevronsUpDown size={14} aria-hidden="true" className="ws-workspace-chevron" />}
    </>}>
      {close => <>
        <div className="ws-workspace-menu__head">
          <Avatar user={user} size={38} />
          <span className="ws-workspace-title"><strong>{user.name}</strong>{user.email && <small>{user.email}</small>}</span>
        </div>
        <hr />
        <p className="ws-workspace-menu__label">{t.switchTo}</p>
        <button type="button" role="menuitemradio" aria-checked={!current} onClick={() => navigate("/dashboard", close)}>{icon(false)}<span className="ws-workspace-title"><strong>{t.personal}</strong><small>{t.personalHelp}</small></span>{!current && <Check size={15} className="ws-workspace-check" />}</button>
        {(teams ?? []).map(row => <button key={row.team._id} type="button" role="menuitemradio" aria-checked={current?.team._id === row.team._id} onClick={() => navigate(`/dashboard/teams/${row.team._id}`, close)}>
          {icon(true)}<span className="ws-workspace-title"><strong>{row.team.name}</strong><small>{t.business} · {t.roles[row.role]}</small></span>{current?.team._id === row.team._id && <Check size={15} className="ws-workspace-check" />}
        </button>)}
        <button type="button" role="menuitem" className="ws-workspace-menu__add" onClick={() => navigate("/dashboard/teams", close)}><span className="ws-workspace-menu__icon"><Plus size={16} /></span>{t.create}</button>
        <hr />
        {current
          ? <button type="button" role="menuitem" onClick={() => navigate(`/dashboard/teams/${current.team._id}?tab=settings`, close)}><SlidersHorizontal size={17} />{t.workspaceSettings}</button>
          : <button type="button" role="menuitem" onClick={() => navigate("/dashboard/teams", close)}><UserPlus size={17} />{t.teams}</button>}
        <button type="button" role="menuitem" aria-current={pathname.startsWith("/dashboard/card") ? "page" : undefined} onClick={() => navigate("/dashboard/card", close)}><IdCard size={17} />{t.profile}</button>
        <button type="button" role="menuitem" aria-current={pathname.endsWith("/dashboard/settings") ? "page" : undefined} onClick={() => navigate("/dashboard/settings", close)}><Settings size={17} />{t.settings}</button>
        <button type="button" role="menuitem" aria-current={pathname.startsWith("/dashboard/archive") ? "page" : undefined} onClick={() => navigate("/dashboard/archive", close)}><Archive size={17} />{t.archive}</button>
        <button type="button" role="menuitem" onClick={() => { close(); onManageAccount(); }}><UserCog size={17} />{t.manage}</button>
        <hr />
        <button type="button" role="menuitem" aria-current={pathname.startsWith("/dashboard/connections") ? "page" : undefined} onClick={() => navigate("/dashboard/connections", close)}><Link2 size={17} />{t.connections}</button>
        {/* Docs open in a new tab so work in progress stays put. */}
        <button type="button" role="menuitem" onClick={() => { close(); window.open("/docs", "_blank", "noopener"); }}><BookOpen size={17} />{t.docs}</button>
        {admin && <button type="button" role="menuitem" className="ws-account__admin" aria-current={pathname.startsWith("/admin") ? "page" : undefined} onClick={() => navigate("/admin", close)}><Shield size={17} />{t.admin}</button>}
        <hr />
        <button type="button" role="menuitem" className="ws-account__signout" onClick={() => { close(); onSignOut(); }}><LogOut size={17} />{t.signOut}</button>
      </>}
    </WsMenu>
  </div>;
}
