"use client";

import { ChaosSelect } from "@/components/workspace/ChaosSelect";
import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatNumber, useCopy, useLocale } from "@/lib/i18n";
import QueryErrorBoundary from "@/components/forms/QueryErrorBoundary";

import { toast } from "@/lib/toast";

const copy = {
  en: { title: "Teams", loading: "Loading teams…", empty: "No teams yet.", name: "Team name", capacity: "Maximum members", create: "Create team", player: "Player", team: "Team", choose: "Choose a team", assign: "Assign player", join: "Join team", rank: "Rank", members: "Members", score: "Score", frozen: "Teams are locked once the countdown starts.", created: "Team created.", assigned: "Player assigned.", joined: "You joined the team.", failed: "Could not update the team. Try again.", full: "This team is full. Choose another team.", busy: "Saving…" },
  ar: { title: "الفرق", loading: "جارٍ تحميل الفرق…", empty: "لا توجد فرق بعد.", name: "اسم الفريق", capacity: "الحد الأقصى للأعضاء", create: "إنشاء فريق", player: "اللاعب", team: "الفريق", choose: "اختر فريقًا", assign: "تعيين اللاعب", join: "الانضمام للفريق", rank: "الترتيب", members: "الأعضاء", score: "الدرجة", frozen: "تُقفل الفرق عند بدء العد التنازلي.", created: "تم إنشاء الفريق.", assigned: "تم تعيين اللاعب.", joined: "انضممت إلى الفريق.", failed: "تعذر تحديث الفريق. حاول مجددًا.", full: "هذا الفريق مكتمل. اختر فريقًا آخر.", busy: "جارٍ الحفظ…" },
};
/** Teams are switched off in the host and player screens until the feature is ready. */
export const TEAMS_ENABLED = false;

type HostProps = { gameId: Id<"liveGames">; frozen: boolean; maxPlayers: number; players: { _id: Id<"livePlayers">; nickname: string }[]; token?: never };
type PlayerProps = { gameId: Id<"liveGames">; frozen: boolean; token: string; maxPlayers?: never; players?: never };

export default function TeamPanel(props: HostProps | PlayerProps) {
  return <QueryErrorBoundary key={props.gameId}><Teams {...props} /></QueryErrorBoundary>;
}

function Teams(props: HostProps | PlayerProps) {
  const t = useCopy(copy), { locale } = useLocale();
  const teams = useQuery(api.liveTeams.standings, props.token === undefined ? { gameId: props.gameId } : { gameId: props.gameId, token: props.token });
  const create = useMutation(api.liveTeams.create), assign = useMutation(api.liveTeams.assign), join = useMutation(api.liveTeams.join);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  async function run(work: () => Promise<unknown>, message: string) {
    if (pending.current || props.frozen) return;
    pending.current = true; setBusy(true);
    try { await work(); toast.success(message, { id: "live-team" }); } catch (e) { const text = e instanceof Error ? e.message : ""; toast.error(text.includes("LIVE_TEAMS_FROZEN") ? t.frozen : text.includes("LIVE_TEAM_FULL") ? t.full : t.failed, { id: "live-team" }); }
    finally { pending.current = false; setBusy(false); }
  }
  return <section className="live-card grid gap-4 w-full" aria-label={t.title}>
    <h2 className="text-xl font-bold">{t.title}</h2>
    {teams === undefined ? <output >{t.loading}</output> : !teams.length ? <p className="live-muted">{t.empty}</p> : <div className="overflow-x-auto"><table className="w-full text-start"><thead><tr>{[t.rank, t.team, t.members, t.score].map(label => <th key={label} scope="col" className="text-start p-2">{label}</th>)}</tr></thead><tbody>{teams.map(team => <tr key={team.teamId}><td className="p-2">{formatNumber(locale, team.rank)}</td><th className="text-start p-2" scope="row">{team.name}{!!team.players?.length && <span className="block live-muted text-sm font-normal">{team.players.join(", ")}</span>}</th><td className="p-2">{formatNumber(locale, team.members)}</td><td className="p-2">{formatNumber(locale, team.score)}</td></tr>)}</tbody></table></div>}
    {props.frozen ? <p className="live-muted">{t.frozen}</p> : props.token === undefined ? <>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); void run(() => create({ gameId: props.gameId, name: String(data.get("name")).trim(), maxMembers: Number(data.get("capacity")) }), t.created); }}>
        <label className="grid gap-1">{t.name}<input className="live-input !text-base !text-start" name="name" required maxLength={60} disabled={busy} /></label><label className="grid gap-1">{t.capacity}<input className="live-input !text-base" name="capacity" type="number" min={1} max={props.maxPlayers} step={1} defaultValue={Math.min(5, props.maxPlayers)} required disabled={busy} /></label>
        <button className="live-btn live-btn--primary w-fit" disabled={busy || teams === undefined || teams.length >= 20}>{busy ? t.busy : t.create}</button>
      </form>
      {!!teams?.length && !!props.players.length && <form className="grid gap-3 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); void run(() => assign({ gameId: props.gameId, playerId: String(data.get("player")) as Id<"livePlayers">, teamId: String(data.get("team")) as Id<"liveTeams"> }), t.assigned); }}><label className="grid gap-1">{t.player}<ChaosSelect className="live-input !text-base !text-start" name="player" required disabled={busy}>{props.players.map(player => <option key={player._id} value={player._id}>{player.nickname}</option>)}</ChaosSelect></label><label className="grid gap-1">{t.team}<ChaosSelect className="live-input !text-base !text-start" name="team" required disabled={busy}><option value="">{t.choose}</option>{teams.map(team => <option key={team.teamId} value={team.teamId}>{team.name}</option>)}</ChaosSelect></label><button className="live-btn w-fit" disabled={busy}>{t.assign}</button></form>}
    </> : !!teams?.length && <form className="grid gap-3" onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); void run(() => join({ gameId: props.gameId, token: props.token, teamId: String(data.get("team")) as Id<"liveTeams"> }), t.joined); }}><label className="grid gap-1">{t.team}<ChaosSelect className="live-input !text-base !text-start" name="team" required disabled={busy}><option value="">{t.choose}</option>{teams.map(team => <option key={team.teamId} value={team.teamId}>{team.name}</option>)}</ChaosSelect></label><button className="live-btn live-btn--primary w-fit" disabled={busy}>{busy ? t.busy : t.join}</button></form>}
  </section>;
}
