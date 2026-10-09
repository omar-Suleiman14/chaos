import { describe, expect, it } from "vitest";
import { checkDefinition } from "@/convex/formLogic";
import { fromDefinition, normalizeSound, parseFormInput, themeContrastIssues, themeWarnings, toDefinition } from "@/convex/mcpContract";
import type { McpFormInput, McpThemePatch } from "@/convex/mcpContract";
import { contrastIssues, isThemeEdited, themeFromPreset, themePresets } from "@/components/forms/formThemes";

const quiz: McpFormInput = {
  title: "What we discussed",
  quizMode: true,
  presentation: "one_at_a_time",
  questions: [
    { type: "single_choice", label: "Which planet is largest?", options: ["Mars", "Jupiter", "Venus"], correctAnswers: ["Jupiter"], points: 2, explanation: "Jupiter is the biggest." },
    { type: "multiple_choice", label: "Pick the gas giants", options: ["Jupiter", "Saturn", "Earth"], correctAnswers: ["Jupiter", "Saturn"] },
    { type: "long_text", label: "What surprised you?" },
  ],
};

describe("ChatGPT app contract", () => {
  it("builds a publishable quiz with an answer key from option labels", () => {
    const def = toDefinition(quiz);
    expect(def.quiz).toEqual({ enabled: true });
    expect(def.presentation).toBe("conversational");
    const [q1, q2, q3] = def.fields;
    expect(q1.type).toBe("choice");
    expect(q1.quiz?.correctOptionIds).toEqual([q1.options!.find((o) => o.label === "Jupiter")!.id]);
    expect(q1.quiz?.points).toBe(2);
    expect(q2.quiz?.correctOptionIds).toHaveLength(2);
    expect(q3.type).toBe("textarea");
    expect(q3.quiz).toBeUndefined();
    expect(checkDefinition(def).errors).toEqual([]);
  });

  it("round-trips through the model's view and keeps ids and option ids on edit", () => {
    const def = toDefinition(quiz);
    const view = fromDefinition(def);
    expect(view.quizMode).toBe(true);
    expect(view.presentation).toBe("one_at_a_time");
    expect(view.questions[0]).toMatchObject({ type: "single_choice", correctAnswers: ["Jupiter"], points: 2 });

    const edited = toDefinition({ questions: [{ ...view.questions[0], label: "Largest planet?" }] }, def);
    expect(edited.fields).toHaveLength(1);
    expect(edited.fields[0].id).toBe(def.fields[0].id);
    expect(edited.fields[0].options).toEqual(def.fields[0].options);
    expect(edited.title).toBe(def.title);
  });

  it("carries whether respondents see the answers after submitting, and keeps it on edits that leave it out", () => {
    expect(fromDefinition(toDefinition(quiz)).showAnswers).toBe(true);
    const hidden = toDefinition({ ...quiz, showAnswers: false });
    expect(hidden.quiz).toEqual({ enabled: true, showAnswers: false });
    expect(fromDefinition(hidden).showAnswers).toBe(false);
    expect(toDefinition({ title: "Renamed" }, hidden).quiz).toEqual({ enabled: true, showAnswers: false });
    expect(toDefinition({ showAnswers: true }, hidden).quiz).toEqual({ enabled: true });
    expect(fromDefinition(toDefinition({ ...quiz, quizMode: false })).showAnswers).toBeUndefined();
    expect(parseFormInput({ ...quiz, showAnswers: "no" })).toMatchObject({ errors: expect.arrayContaining(["showAnswers must be true or false."]) });
  });

  it("rejects answer keys that do not match an option and keys on text questions", () => {
    const bad = parseFormInput({ title: "x", questions: [
      { type: "single_choice", label: "Q", options: ["A", "B"], correctAnswers: ["C"] },
      { type: "short_text", label: "T", correctAnswers: ["A"] },
    ] });
    expect("errors" in bad && bad.errors.join(" ")).toMatch(/not found: C/);
    expect("errors" in bad && bad.errors.join(" ")).toMatch(/only single_choice/);
    expect("errors" in parseFormInput({ questions: [] })).toBe(true);
    expect("input" in parseFormInput({ questions: [] }, true)).toBe(true);
  });

  it("validates theme patches and sound names", () => {
    const ok = parseFormInput({ theme: { accent: "#ABCDEF", font: "serif", buttons: "pill" }, sound: "Glass" }, true);
    expect("input" in ok && ok.input).toMatchObject({ theme: { accent: "#abcdef", font: "serif", buttons: "pill" }, sound: "soft" });
    const bad = parseFormInput({ theme: { accent: "blue", font: "comic", cover: 3, logoUrl: "https://x.y/z.png", preset: "nope" }, sound: "loud" }, true);
    const text = "errors" in bad ? bad.errors.join(" ") : "";
    for (const part of ["accent", "font", "cover", "logoUrl", "preset", "sound"]) expect(text).toContain(part);
    // A preset id must arrive with its full look.
    expect("errors" in parseFormInput({ theme: { preset: "google-forms" } }, true)).toBe(true);
    expect(normalizeSound("SILENT")).toBe("off");
    expect(normalizeSound("wood")).toBe("wood");
    expect(normalizeSound("x")).toBeUndefined();
  });

  it("defaults new forms to the Flow style with sound on, and applies the theme and sound given", () => {
    const def = toDefinition({ title: "T", questions: [] });
    expect(def.theme).toMatchObject({ preset: "flow", sound: "soft" });
    expect(toDefinition({ title: "T", questions: [], sound: "off" }).theme.sound).toBe("off");
    const styled = toDefinition({ title: "T", questions: [], sound: "arcade" });
    expect(styled.theme).toMatchObject({ preset: "flow", sound: "arcade" });
  });

  it("keeps logo and sound when the look changes, keeps the preset when properties are overridden", () => {
    const base = toDefinition({ title: "T", questions: [], sound: "wood" });
    base.theme.logoUrl = "https://example.com/logo.png";
    const midnight = themePresets.find((p) => p.id === "midnight")!;
    const { sound: _s, background: _b, ...look } = midnight.theme;
    const dark = toDefinition({ theme: { preset: "midnight", ...look } as McpThemePatch }, base);
    expect(dark.theme).toMatchObject({ preset: "midnight", background: "dark", pageColor: "#0f1a25", logoUrl: "https://example.com/logo.png", sound: "wood" });
    const edited = toDefinition({ theme: { accent: "#ff0000" } }, dark);
    expect(edited.theme).toMatchObject({ preset: "midnight", accent: "#ff0000", pageColor: "#0f1a25", sound: "wood" });
    expect(isThemeEdited(edited.theme)).toBe(true);
    expect(isThemeEdited(dark.theme)).toBe(false);
    expect(toDefinition({ sound: "off" }, edited).theme).toMatchObject({ accent: "#ff0000", sound: "off" });
  });

  it("upgrades legacy themes to a full custom theme", () => {
    const legacy = toDefinition({ title: "T", questions: [] });
    legacy.theme = { accent: "#22c55e", background: "plain", font: "sans", radius: "small" };
    const next = toDefinition({ theme: { font: "mono" } }, legacy);
    expect(next.theme).toMatchObject({ version: 1, preset: "custom", font: "mono", pageColor: "#f5f4f0", layout: "flat" });
    expect(checkDefinition(next).errors.filter((e) => /colour|logo/i.test(e))).toEqual([]);
  });

  it("finds unreadable colours exactly like the app's contrast check", () => {
    const themes = [
      { ...toDefinition({ title: "T", questions: [] }).theme },
      { ...toDefinition({ title: "T", questions: [] }).theme, textColor: "#f0ebf8" },
      { ...toDefinition({ title: "T", questions: [] }).theme, accent: "#f0ebf9" },
      ...themePresets.map((p) => themeFromPreset(p.id)),
    ];
    for (const theme of themes) expect(themeContrastIssues(theme)).toEqual(contrastIssues(theme));
    expect(themeWarnings(themes[1])[0]).toMatch(/Text on page/);
    expect(themeWarnings(themes[0])).toEqual([]);
  });

  it("exposes the theme in the model's view", () => {
    const view = fromDefinition(toDefinition({ title: "T", questions: [] }));
    expect(view.theme).toMatchObject({ preset: "flow", sound: "soft", font: "segoe", hasLogo: false });
  });

  it("clears logic that points at removed questions so publishing is not blocked", () => {
    const def = toDefinition({ title: "Logic", questions: [
      { type: "single_choice", label: "Attend?", options: ["Yes", "No"] },
      { type: "short_text", label: "Why?" },
    ] });
    def.fields[1].showIf = { match: "all", conditions: [{ fieldId: def.fields[0].id, op: "equals", value: "no" }] };
    const view = fromDefinition(def);
    const next = toDefinition({ questions: [view.questions[1]] }, def);
    expect(next.fields[0].showIf).toBeUndefined();
  });
});
