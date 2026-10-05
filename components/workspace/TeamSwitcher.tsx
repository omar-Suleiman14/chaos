"use client";

import { usePathname, useRouter } from "next/navigation";
import { useConvexAuth, useQuery } from "convex/react";
import { Users, UserRound, ChevronsUpDown, Check, Plus, Settings, SlidersHorizontal, UserPlus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useCopy } from "@/lib/i18n";
import { WsMenu } from "./primitives";

const copy = {
  en: {
    label: "Workspace", personal: "Personal", personalHelp: "Just you", business: "Business", switchTo: "Workspaces",
    roles: { owner: "Owner", admin: "Admin", member: "Member" }, create: "Create a Business team",
    workspaceSettings: "Workspace settings", teams: "Teams & invitations", settings: "Settings",
  },
  ar: {
    label: "مساحة العمل", personal: "شخصي", personalHelp: "لك وحدك", business: "أعمال", switchTo: "مساحات العمل",
    roles: { owner: "مالك", admin: "مسؤول", member: "عضو" }, create: "أنشئ فريق أعمال",
    workspaceSettings: "إعدادات مساحة العمل", teams: "الفرق والدعوات", settings: "الإعدادات",
  },
};

/** Workspace name in the sidebar; it opens a menu to switch workspace and reach workspace and app settings. */
export default function TeamSwitcher() {
  const { isAuthenticated } = useConvexAuth();
  const teams = useQuery(api.businessTeams.list, isAuthenticated ? {} : "skip");
  const pathname = usePathname(), router = useRouter(), t = useCopy(copy);
  const selected = pathname.match(/\/dashboard\/teams\/([^/]+)/)?.[1] ?? "";
  const current = teams?.find(row => row.team._id === selected);
  const subtitle = current ? `${t.business} · ${t.roles[current.role]}` : t.personalHelp;
  const navigate = (href: string, close: () => void) => { close(); router.push(href); };
  const avatar = (team: boolean, large = false) => <span className="ws-workspace-avatar" data-large={large || undefined} aria-hidden="true">{team ? <Users size={large ? 18 : 17} /> : <UserRound size={large ? 18 : 17} />}</span>;
  return <div className="ws-team-switcher">
    <WsMenu label={t.label} align="start" triggerClassName="ws-workspace-trigger" menuClassName="ws-workspace-menu" trigger={<>
      {avatar(!!current)}
      <span className="ws-workspace-title"><strong>{current?.team.name ?? t.personal}</strong><small>{subtitle}</small></span>
      <ChevronsUpDown size={14} aria-hidden="true" className="ws-workspace-chevron" />
    </>}>
      {close => <>
        <div className="ws-workspace-menu__head">
          {avatar(!!current, true)}
          <span className="ws-workspace-title"><strong>{current?.team.name ?? t.personal}</strong><small>{subtitle}</small></span>
        </div>
        <hr />
        <p className="ws-workspace-menu__label">{t.switchTo}</p>
        <button type="button" role="menuitemradio" aria-checked={!current} onClick={() => navigate("/dashboard", close)}>{avatar(false)}<span className="ws-workspace-title"><strong>{t.personal}</strong><small>{t.personalHelp}</small></span>{!current && <Check size={15} className="ws-workspace-check" />}</button>
        {(teams ?? []).map(row => <button key={row.team._id} type="button" role="menuitemradio" aria-checked={current?.team._id === row.team._id} onClick={() => navigate(`/dashboard/teams/${row.team._id}`, close)}>
          {avatar(true)}<span className="ws-workspace-title"><strong>{row.team.name}</strong><small>{t.business} · {t.roles[row.role]}</small></span>{current?.team._id === row.team._id && <Check size={15} className="ws-workspace-check" />}
        </button>)}
        <button type="button" role="menuitem" className="ws-workspace-menu__add" onClick={() => navigate("/dashboard/teams", close)}><span className="ws-workspace-menu__icon"><Plus size={16} /></span>{t.create}</button>
        <hr />
        {current
          ? <button type="button" role="menuitem" onClick={() => navigate(`/dashboard/teams/${current.team._id}?tab=settings`, close)}><SlidersHorizontal size={17} />{t.workspaceSettings}</button>
          : <button type="button" role="menuitem" onClick={() => navigate("/dashboard/teams", close)}><UserPlus size={17} />{t.teams}</button>}
        <button type="button" role="menuitem" aria-current={pathname.endsWith("/dashboard/settings") ? "page" : undefined} onClick={() => navigate("/dashboard/settings", close)}><Settings size={17} />{t.settings}</button>
      </>}
    </WsMenu>
  </div>;
}
