"use client";

import { usePathname, useRouter } from "next/navigation";
import { useConvexAuth, useQuery } from "convex/react";
import { Users, UserRound, ChevronDown, Check, Plus, Settings } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useCopy } from "@/lib/i18n";
import { WsMenu } from "./primitives";

const copy = {
  en: { label: "Workspace", personal: "Personal · just you", create: "Create a Business team", settings: "Teams & invitations" },
  ar: { label: "مساحة العمل", personal: "شخصي · لك وحدك", create: "أنشئ فريق أعمال", settings: "الفرق والدعوات" },
};
export default function TeamSwitcher() {
  const { isAuthenticated } = useConvexAuth();
  const teams = useQuery(api.businessTeams.list, isAuthenticated ? {} : "skip");
  const pathname = usePathname(), router = useRouter(), t = useCopy(copy);
  const selected = pathname.match(/\/dashboard\/teams\/([^/]+)/)?.[1] ?? "";
  const current = teams?.find(row => row.team._id === selected);
  const navigate = (href: string, close: () => void) => { close(); router.push(href); };
  return <div className="ws-team-switcher">
    <WsMenu label={t.label} align="start" triggerClassName="ws-workspace-trigger" trigger={<>
      <span className="ws-workspace-avatar" aria-hidden="true">{current ? <Users size={17} /> : <UserRound size={17} />}</span>
      <span className="ws-workspace-title"><small>{t.label}</small><strong>{current?.team.name ?? t.personal}</strong></span>
      <ChevronDown size={14} aria-hidden="true" />
    </>}>
      {close => <>
        <button type="button" role="menuitemradio" aria-checked={!current} onClick={() => navigate("/dashboard", close)}><UserRound size={16} /><span>{t.personal}</span>{!current && <Check size={14} />}</button>
        {(teams ?? []).map(row => <button key={row.team._id} type="button" role="menuitemradio" aria-checked={current?.team._id === row.team._id} onClick={() => navigate(`/dashboard/teams/${row.team._id}`, close)}><Users size={16} /><span><strong>{row.team.name}</strong><small>Business</small></span>{current?.team._id === row.team._id && <Check size={14} />}</button>)}
        <hr />
        <button type="button" role="menuitem" onClick={() => navigate("/dashboard/teams", close)}><Plus size={16} />{t.create}</button>
        <button type="button" role="menuitem" onClick={() => navigate("/dashboard/teams", close)}><Settings size={16} />{t.settings}</button>
      </>}
    </WsMenu>
  </div>;
}
