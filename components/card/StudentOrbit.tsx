"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useLocale } from "@/lib/i18n";
import { CARD_THEMES } from "@/lib/memberCard";
import MemberAvatar from "@/components/MemberAvatar";
import Link from "@/components/site/SiteLink";
import { useTilt } from "./useTilt";
import "./student-orbit.css";

/** All eligible students are reachable; only the visible side rows mount. */
export default function StudentOrbit({ username }: { username: string }) {
  const { locale } = useLocale();
  const { results, status, loadMore } = usePaginatedQuery(
    api.studentRoster.publicStudents,
    { username },
    { initialNumItems: 24 },
  );
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
  const [layout, setLayout] = useState({ width: 180, height: 400, compact: false });
  const [tops, setTops] = useState([0, 0]);
  useEffect(() => {
    const wing = stage.current?.querySelector<HTMLElement>(
      ".student-orbit__wing",
    );
    if (!wing) return;
    const resize = new ResizeObserver(([entry]) =>
      setLayout({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
        compact: window.matchMedia("(max-width: 600px)").matches,
      }),
    );
    resize.observe(wing);
    return () => resize.disconnect();
  }, []);
  const compact = layout.compact;
  const columns = Math.max(1, Math.floor(layout.width / 92));
  const rowHeight = compact ? 104 : 132;
  const sides = useMemo(
    () => [
      results.filter((_, i) => i % 2 === 0),
      results.filter((_, i) => i % 2 === 1),
    ],
    [results],
  );
  const nearEnd = sides.some(
    (rows, side) =>
      tops[side] + layout.height + rowHeight * 2 >=
      Math.ceil(rows.length / columns) * rowHeight,
  );
  useEffect(() => {
    if (nearEnd && status === "CanLoadMore") loadMore(48);
  }, [nearEnd, status, loadMore]);
  return (
    <div
      ref={stage}
      className="student-orbit"
      role="group"
      aria-label={locale === "ar" ? "بطاقات الطلاب" : "Student cards"}
    >
      <p className="sr-only">
        {locale === "ar"
          ? "مرّر البطاقات بجانب المعلم لتصفّح جميع الطلاب."
          : "Scroll the cards beside the teacher to browse all students."}
      </p>
      {sides.map((students, side) => {
        const first =
          Math.max(0, Math.floor(tops[side] / rowHeight) - 1) * columns;
        const last = Math.min(
          students.length,
          (Math.ceil((tops[side] + layout.height) / rowHeight) + 1) * columns,
        );
        return (
          <div
            key={side}
            className="student-orbit__wing"
            data-side={side}
            tabIndex={students.length ? 0 : -1}
            aria-label={
              locale === "ar" ? "تصفّح بطاقات الطلاب" : "Browse student cards"
            }
            onScroll={(event) => {
              const top = event.currentTarget.scrollTop;
              setTops((previous) =>
                previous.map((value, i) => (i === side ? top : value)),
              );
            }}
          >
            <div
              className="student-orbit__rows"
              style={{
                height: Math.ceil(students.length / columns) * rowHeight,
              }}
            >
              {students.slice(first, last).map((student, offset) => {
                if (!student.username) return null;
                const index = first + offset;
                const theme =
                  CARD_THEMES[
                    ((student.style % CARD_THEMES.length) +
                      CARD_THEMES.length) %
                      CARD_THEMES.length
                  ];
                return (
                  <div
                    key={student.id}
                    className="student-orbit__slot"
                    style={
                      {
                        top: Math.floor(index / columns) * rowHeight + 10,
                        left: `${((index % columns) * 100) / columns}%`,
                        width: `${100 / columns}%`,
                        "--delay": `${(index % 8) * -0.8}s`,
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
          </div>
        );
      })}
      {(status === "LoadingMore" || status === "LoadingFirstPage") && (
        <span className="sr-only" role="status">
          {locale === "ar"
            ? "جارٍ تحميل بطاقات الطلاب"
            : "Loading student cards"}
        </span>
      )}
    </div>
  );
}

/** Per-teacher opt-out, alongside the global preference in settings. */
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
