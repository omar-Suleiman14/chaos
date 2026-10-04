"use client";

import { useCallback, useRef, useState, type CSSProperties } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useLocale } from "@/lib/i18n";
import { CARD_THEMES } from "@/lib/memberCard";
import MemberAvatar from "@/components/MemberAvatar";
import Link from "@/components/site/SiteLink";
import { useTilt } from "./useTilt";
import "./student-orbit.css";

const paginationOpts = { numItems: 8, cursor: null };

/** One bounded subscription for the current author, without full cards or QR codes. */
export default function StudentOrbit({ username }: { username: string }) {
  const { locale } = useLocale();
  const students = useQuery(api.studentRoster.publicStudents, {
    username,
    paginationOpts,
  });
  const stage = useRef<HTMLDivElement>(null);
  const cards = useCallback(
    () =>
      Array.from(
        stage.current?.querySelectorAll<HTMLElement>(".student-orbit__slot") ??
          [],
      ),
    [],
  );
  useTilt(stage, cards);
  return (
    <div
      ref={stage}
      className="student-orbit"
      role="group"
      aria-label={locale === "ar" ? "بطاقات الطلاب" : "Student cards"}
    >
      {students?.page.slice(0, 8).map((student, index) => {
        if (!student.username) return null;
        const theme =
          CARD_THEMES[
            ((student.style % CARD_THEMES.length) + CARD_THEMES.length) %
              CARD_THEMES.length
          ];
        return (
          <div
            key={student.id}
            className="student-orbit__slot"
            data-slot={index}
            style={
              {
                "--delay": `${index * -0.8}s`,
                "--lean": `${index % 2 ? 7 : -7}deg`,
              } as CSSProperties
            }
          >
            <div className="student-orbit__float">
              <Link
                className="student-orbit__card"
                href={`/card/${encodeURIComponent(student.username)}`}
                prefetch={false}
                aria-label={`${student.name} @${student.username}`}
                title={`${student.name} @${student.username}`}
                style={
                  {
                    "--student-ink": theme.ink,
                    "--student-art": `linear-gradient(135deg, ${theme.art.join(",")})`,
                  } as CSSProperties
                }
              >
                <span className="student-orbit__art">
                  <MemberAvatar seed={student.seed} size={36} />
                </span>
                <strong dir="auto">{student.name}</strong>
                <span className="student-orbit__handle" dir="ltr">
                  @{student.username}
                </span>
                <span className="student-orbit__stamp" aria-hidden>
                  CHAOS
                </span>
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Keep opt-in available without bringing back the public roster. */
export function StudentVisibility({ username }: { username: string }) {
  const { locale } = useLocale();
  const visibility = useQuery(api.studentRoster.myVisibility, { username });
  const setVisible = useMutation(api.studentRoster.setPublicVisibility);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  if (visibility == null) return null;
  return (
    <div className="student-visibility">
      <label>
        <input
          type="checkbox"
          checked={visibility}
          disabled={saving}
          onChange={async (event) => {
            const visible = event.target.checked;
            setSaving(true);
            setError("");
            try {
              await setVisible({ username, visible });
            } catch {
              setError(
                locale === "ar"
                  ? "تعذر حفظ الإعداد."
                  : "Couldn't save this setting.",
              );
            } finally {
              setSaving(false);
            }
          }}
        />
        {locale === "ar"
          ? "اعرض بطاقتي هنا علنًا"
          : "Show my Card here publicly"}
      </label>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
