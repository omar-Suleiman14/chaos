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
import { WsSwitch } from "@/components/workspace/primitives";
import { parseError } from "@/lib/errors";
import { localizeMessage } from "@/lib/messages";

export default function CardCustomization({ card, actorId, onboarding = false, showPreview = true, onDone }: { card: Omit<MemberCardData, "url">; actorId: string; onboarding?: boolean; showPreview?: boolean; onDone?: () => void }) {
  const { locale } = useLocale(), ar = locale === "ar";
  const [name, setName] = useState(card.name), [username, setUsername] = useState(card.username), [style, setStyle] = useState(card.style), [avatar, setAvatar] = useState<number | null>(null);
  const [busy, setBusy] = useState(false), [ready, setReady] = useState(false), [error, setError] = useState("");
  const save = useMutation(api.memberCards.customizeCard);
  const me = useQuery(api.quizFunctions.getCurrentUser);
  const [studentChoice, setStudentChoice] = useState<boolean | null>(null);
  const showStudentCards = studentChoice ?? !me?.hideStudentCards;
  const seed = avatar === null ? card.seed : `${avatarSeed(actorId)}:avatar:${avatar}`;
  const [errorField, setErrorField] = useState<string | null>(null);
  const Heading = onboarding ? "h1" : "h2";
  async function submit(skip = false) {
    if (!skip && !name.trim()) { setErrorField("name"); setError(ar ? "أدخل اسمك." : "Enter your name."); return; }
    setBusy(true); setError(""); setErrorField(null);
    try { await save(skip ? { skip: true, ...(studentChoice === null ? {} : { showStudentCards }) } : { name, ...(username.trim().toLowerCase() === card.username ? {} : { username }), style, ...(avatar === null ? {} : { avatar }), showStudentCards, finishOnboarding: onboarding }); if (skip) onDone?.(); else setReady(true); }
    catch (e) {
      const parsed = parseError(e);
      if (["INVALID_USERNAME", "USERNAME_TAKEN", "USERNAME_CONFLICT"].includes(parsed.code)) {
        setErrorField("username");
        setError(parsed.code === "INVALID_USERNAME" ? localizeMessage(locale, parsed.message) : (ar ? "اسم المستخدم مستخدم بالفعل. اختر اسمًا آخر." : "That username is already in use. Choose another."));
      } else setError(parsed.code === "NETWORK" ? (ar ? "تحقق من اتصالك وحاول مجددًا." : "Check your connection and try again.") : (ar ? "تعذر حفظ البطاقة. حاول مجددًا." : "Couldn't save your card. Please try again."));
    }
    finally { setBusy(false); }
  }
  return <section className="mc-customize" aria-labelledby="card-customize-title">
    <Heading id="card-customize-title">{ready ? (ar ? "بطاقتك جاهزة" : "Your card is ready") : onboarding ? (ar ? "خصّص بطاقة Chaos الخاصة بك" : "Customize your Chaos Card") : (ar ? "عدّل بطاقتك" : "Edit your Card")}</Heading>
    {onboarding && !ready && <p>{ar ? "مرحبًا بك في Chaos. اجعلها بطاقتك، ويمكنك تغيير كل شيء لاحقًا." : "Welcome to Chaos. Make it yours—you can change everything later."}</p>}
    <div className="mc-customize__layout" data-preview={showPreview}>{showPreview && <div className="mc-customize__preview"><MemberCardView data={{ ...card, name, username, style, seed, url: `${siteUrl}/card/${encodeURIComponent(username)}` }} onStyle={ready ? undefined : setStyle} /></div>}
    {ready ? <div className="mc-customize__form"><p role="status">{ar ? "تم حفظ بطاقتك." : "Your Card is saved."}</p><button className="ws-btn ws-btn--primary" onClick={() => { if (onboarding) onDone?.(); else setReady(false); }}>{onboarding ? (ar ? "تابع إلى Chaos" : "Continue to Chaos") : (ar ? "تعديل" : "Edit")}</button></div> : <form onSubmit={e => { e.preventDefault(); void submit(); }} className="mc-customize__form">
      <label>{ar ? "الاسم" : "Name"}<input value={name} maxLength={100} required onChange={e => { setName(e.target.value); if (errorField === "name") { setError(""); setErrorField(null); } }} autoComplete="name" dir="auto" aria-invalid={errorField === "name"} aria-describedby={errorField === "name" ? "card-name-error" : undefined} /></label>
      {error && errorField === "name" && <p id="card-name-error" className="mc-help" role="alert">{error}</p>}
      <label>{ar ? "اسم المستخدم" : "Username"}<input value={username} minLength={3} maxLength={30} required onChange={e => { setUsername(e.target.value); if (errorField === "username") { setError(""); setErrorField(null); } }} autoComplete="username" autoCapitalize="none" dir="ltr" spellCheck={false} aria-invalid={errorField === "username"} aria-describedby={errorField === "username" ? "card-username-error" : undefined} /></label>
      {error && errorField === "username" && <p id="card-username-error" className="mc-help" role="alert">{error}</p>}
      <fieldset><legend>{ar ? "الصورة الرمزية" : "Avatar"}</legend><div className="mc-customize__avatars">{Array.from({ length: 8 }, (_, index) => <button type="button" key={index} aria-label={ar ? `الصورة ${index + 1}` : `Avatar ${index + 1}`} aria-pressed={avatar === index} onClick={() => setAvatar(index)}><MemberAvatar seed={`${avatarSeed(actorId)}:avatar:${index}`} size={36} /></button>)}</div></fieldset>
      <div className="mc-customize__visibility"><div><span id="card-student-label">{ar ? "أظهر بطاقتي لدى معلّميّ" : "Show my Card with my teachers"}</span><p className="mc-help">{ar ? "تظهر بطاقتك علنًا مع معلّميك تلقائيًا. يمكنك إيقاف ذلك هنا أو في الإعدادات." : "Visible publicly by default. You can turn this off here or in settings."}</p></div><WsSwitch label={ar ? "أظهر بطاقتي لدى معلّميّ" : "Show my Card with my teachers"} hideLabel checked={showStudentCards} disabled={!me || busy} onChange={setStudentChoice} /></div>
      {error && errorField === null && <p role="alert">{error}</p>}
      <div className="mc-customize__actions"><button className="ws-btn ws-btn--primary" disabled={busy || !me}>{busy ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "احفظ بطاقتي" : "Save my Card")}</button>{onboarding && <button type="button" className="ws-btn" disabled={busy} onClick={() => void submit(true)}>{ar ? "تخطَّ الآن" : "Skip for now"}</button>}</div>
    </form>}</div>
  </section>;
}

export function CardOnboarding({ actorId, onDone }: { actorId: string; onDone: () => void }) {
  const card = useQuery(api.memberCards.mine);
  return card ? <CardCustomization card={card} actorId={actorId} onboarding onDone={onDone} /> : <CardSetupSkeleton />;
}

export function CardSetupSkeleton() {
  const { locale } = useLocale();
  return <section className="mc-customize mc-customize--loading" aria-busy="true" aria-label={locale === "ar" ? "تحميل إعداد البطاقة" : "Loading card setup"}><div className="mc-customize__skeleton-title" /><div className="mc-customize__layout"><div className="mc-customize__skeleton-card" /><div className="mc-customize__skeleton-fields">{Array.from({ length: 4 }, (_, i) => <div key={i} />)}</div></div></section>;
}
