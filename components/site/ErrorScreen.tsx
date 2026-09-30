"use client";

import Link from "next/link";
import Logo from "@/components/Logo";
import { useCopy } from "@/lib/i18n";

type Action = { label: string } & ({ href: string } | { onClick: () => void });

const copy = { en: { reference: "Reference" }, ar: { reference: "المرجع" } };

function ActionButton({ action, primary }: { action: Action; primary?: boolean }) {
  const className = `ws-btn ${primary ? "ws-btn--primary" : "ws-btn--ghost"} !min-h-[46px] !px-5 !text-base`;
  return "href" in action
    ? <Link href={action.href} className={className}>{action.label}</Link>
    : <button type="button" onClick={action.onClick} className={className}>{action.label}</button>;
}

/**
 * The creator-side error and not-found screen, in the workspace look: the logo,
 * one plain sentence, one main action. `inline` renders inside the dashboard
 * shell instead of filling the screen. Never shows error messages or stacks;
 * only Next's digest, as a reference someone can quote to support.
 */
export default function ErrorScreen({ title, body, primary, secondary, digest, inline }: {
  title: string;
  body: string;
  primary: Action;
  secondary?: Action;
  digest?: string;
  inline?: boolean;
}) {
  const t = useCopy(copy);
  const content = (
    <div className="mx-auto grid w-full max-w-md justify-items-center gap-4 text-center">
      {!inline && <Logo size={44} className="mb-2" />}
      <h1 className="text-[1.75rem] font-bold leading-tight tracking-[-0.02em] text-[var(--on-background)]">{title}</h1>
      <p className="text-[17px] leading-relaxed text-[var(--on-surface-variant)]">{body}</p>
      <div className="mt-3 flex w-full flex-col-reverse items-stretch justify-center gap-2 sm:w-auto sm:flex-row sm:items-center">
        {secondary && <ActionButton action={secondary} />}
        <ActionButton action={primary} primary />
      </div>
      {digest && <p className="mt-4 select-all text-[13px] text-[var(--on-surface-variant)]">{t.reference}: {digest}</p>}
    </div>
  );
  if (inline) return <div className="grid place-items-center px-4 py-20">{content}</div>;
  return <main className="workspace-ui grid min-h-[100dvh] place-items-center px-6 py-16">{content}</main>;
}
