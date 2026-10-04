import { describe, expect, it } from "vitest";
import { builtInTemplates } from "@/convex/formTemplates";
import { checkDefinition, flowTheme, isRtl, missingTranslations } from "@/convex/formLogic";
import { contrastIssues } from "@/components/forms/formThemes";

describe("built-in templates", () => {
  it("offers at least 20 templates with unique ids and names", () => {
    expect(builtInTemplates.length).toBeGreaterThanOrEqual(20);
    expect(new Set(builtInTemplates.map((t) => t.id)).size).toBe(builtInTemplates.length);
    expect(new Set(builtInTemplates.map((t) => t.name)).size).toBe(builtInTemplates.length);
  });

  it("covers the common needs", () => {
    const ids = builtInTemplates.map((t) => t.id);
    for (const id of ["event-rsvp", "csat-nps", "job-application", "contact", "course-evaluation", "workshop-feedback", "volunteer-signup", "order-form", "bug-report", "pulse-survey", "parent-teacher", "general-knowledge-quiz", "vocabulary-quiz", "team-retrospective", "feature-request"]) {
      expect(ids, id).toContain(id);
    }
  });

  it.each(builtInTemplates.map((t) => [t.id, t] as const))("%s passes checkDefinition with no errors and no warnings", (_id, template) => {
    const report = checkDefinition(template.definition);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(template.description.length).toBeGreaterThan(20);
  });

  it.each(builtInTemplates.map((t) => [t.id, t] as const))("%s is fully translated to Arabic", (_id, template) => {
    expect(template.definition.languages).toContain("ar");
    expect(isRtl("ar")).toBe(true);
    expect(missingTranslations(template.definition).ar).toEqual([]);
  });

  it.each(builtInTemplates.map((t) => [t.id, t] as const))("%s has readable theme colours", (_id, template) => {
    expect(contrastIssues(template.definition.theme)).toEqual([]);
  });

  it("starts every template on Flow", () => {
    expect(builtInTemplates.every((t) => t.definition.theme.preset === "flow")).toBe(true);
    expect(builtInTemplates.find((t) => t.id === "feedback")!.definition.theme).toEqual(flowTheme);
  });

  it("gives the quizzes a complete answer key", () => {
    for (const id of ["general-knowledge-quiz", "vocabulary-quiz"]) {
      const def = builtInTemplates.find((t) => t.id === id)!.definition;
      expect(def.quiz?.enabled).toBe(true);
      expect(def.fields).toHaveLength(10);
      for (const f of def.fields) {
        expect(f.quiz?.correctOptionIds).toHaveLength(1);
        expect(f.quiz!.points).toBeGreaterThan(0);
        expect(f.required).toBe(true);
      }
    }
  });
});
