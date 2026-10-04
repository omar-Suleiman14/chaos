"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useConvexAuth, useQuery } from "convex/react";
import { Users } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useCopy } from "@/lib/i18n";

const copy = {
  en: { label: "Workspace", personal: "Personal · just you", create: "Create a Business team", settings: "Teams & invitations" },
  ar: { label: "مساحة العمل", personal: "شخصي · لك وحدك", create: "أنشئ فريق أعمال", settings: "الفرق والدعوات" },
};
export default function TeamSwitcher() {
  const { isAuthenticated } = useConvexAuth();
  const teams = useQuery(api.businessTeams.list, isAuthenticated ? {} : "skip");
  const pathname = usePathname(), router = useRouter(), t = useCopy(copy);
  const selected = pathname.match(/\/dashboard\/teams\/([^/]+)/)?.[1] ?? "";
  return <div className="ws-team-switcher">
    <label className="ws-team-switcher__label"><Users size={15} aria-hidden="true" />{t.label}
      <select aria-label={t.label} value={teams?.some(row => row.team._id === selected) ? selected : ""} onChange={event => router.push(event.target.value === "new" ? "/dashboard/teams" : event.target.value ? `/dashboard/teams/${event.target.value}` : "/dashboard")}>
        <option value="">{t.personal}</option>
        {teams?.map(row => <option key={row.team._id} value={row.team._id}>{row.team.name} · Business</option>)}
        <option value="new">{t.create}</option>
      </select>
    </label>
    <Link href="/dashboard/teams">{t.settings}</Link>
  </div>;
}
