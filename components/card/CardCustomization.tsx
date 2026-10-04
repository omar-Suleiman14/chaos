"use client";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useLocale } from "@/lib/i18n";
import { avatarSeed } from "@/lib/avatarSeed";
import { siteUrl } from "@/lib/site";
import { type MemberCardData } from "@/lib/memberCard";
import MemberCardView from "./MemberCardView";
import MemberAvatar from "@/components/MemberAvatar";

export default function CardCustomization({ card, actorId, onboarding = false, onDone }: { card: Omit<MemberCardData, "url">; actorId: string; onboarding?: boolean; onDone?: () => void }) {
  const { locale } = useLocale(), ar = locale === "ar";
  const [name, setName] = useState(card.name), [username, setUsername] = useState(card.username), [style, setStyle] = useState(card.style), [avatar, setAvatar] = useState<number | null>(null);
  const [busy, setBusy] = useState(false), [ready, setReady] = useState(false), [error, setError] = useState("");
  const save = useMutation(api.memberCards.customizeCard);
  const seed = avatar === null ? card.seed : `${avatarSeed(actorId)}:avatar:${avatar}`;
  async function submit(skip = false) {
    setBusy(true); setError("");
    try { await save(skip ? { skip: true } : { name, username, style, ...(avatar === null ? {} : { avatar }), finishOnboarding: onboarding }); if (skip) onDone?.(); else setReady(true); }
    catch (e) { setError(e instanceof Error ? e.message : (ar ? "تعذر الحفظ" : "Couldn't save")); }
    finally { setBusy(false); }
  }
  return <section className="mc-customize" aria-labelledby="card-customize-title">
    <h1 id="card-customize-title">{ready ? (ar ? "بطاقتك جاهزة" : "Your card is ready") : onboarding ? (ar ? "خصّص بطاقة Chaos الخاصة بك" : "Customize your Chaos Card") : (ar ? "عدّل بطاقتك" : "Edit your Card")}</h1>
    {onboarding && !ready && <p>{ar ? "مرحبًا بك في Chaos. اجعلها بطاقتك، ويمكنك تغيير كل شيء لاحقًا." : "Welcome to Chaos. Make it yours—you can change everything later."}</p>}
    <MemberCardView data={{ ...card, name, username, style, seed, url: `${siteUrl}/card/${encodeURIComponent(username)}` }} onStyle={ready ? undefined : setStyle} />
    {ready ? <><p role="status">{ar ? "تم حفظ بطاقتك." : "Your Card is saved."}</p><button className="ws-btn ws-btn--primary" onClick={() => { if (onboarding) onDone?.(); else setReady(false); }}>{onboarding ? (ar ? "تابع إلى Chaos" : "Continue to Chaos") : (ar ? "تعديل" : "Edit")}</button></> : <form onSubmit={e => { e.preventDefault(); void submit(); }} className="mc-customize__form">
      <label>{ar ? "الاسم" : "Name"}<input value={name} maxLength={100} required onChange={e => setName(e.target.value)} autoComplete="name" dir="auto" /></label>
      <label>{ar ? "اسم المستخدم" : "Username"}<input value={username} minLength={3} maxLength={64} required onChange={e => setUsername(e.target.value)} autoComplete="username" dir="ltr" spellCheck={false} /></label>
      <fieldset><legend>{ar ? "الصورة الرمزية" : "Avatar"}</legend><div className="mc-customize__avatars">{Array.from({ length: 8 }, (_, index) => <button type="button" key={index} aria-label={ar ? `الصورة ${index + 1}` : `Avatar ${index + 1}`} aria-pressed={avatar === index} onClick={() => setAvatar(index)}><MemberAvatar seed={`${avatarSeed(actorId)}:avatar:${index}`} size={36} /></button>)}</div></fieldset>
      {error && <p role="alert">{error}</p>}
      <div className="mc-customize__actions"><button className="ws-btn ws-btn--primary" disabled={busy}>{busy ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "احفظ بطاقتي" : "Save my Card")}</button>{onboarding && <button type="button" className="ws-btn" disabled={busy} onClick={() => void submit(true)}>{ar ? "تخطَّ الآن" : "Skip for now"}</button>}</div>
    </form>}
  </section>;
}

export function CardOnboarding({ actorId, onDone }: { actorId: string; onDone: () => void }) {
  const card = useQuery(api.memberCards.mine);
  return card ? <CardCustomization card={card} actorId={actorId} onboarding onDone={onDone} /> : <p role="status">Loading your Card…</p>;
}
