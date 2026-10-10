import { describe, expect, it } from "vitest";
import { emptyDefinition, type FormField } from "../../convex/formLogic";
import { buildSteps } from "../../lib/forms/formSteps";

const question = (id: string) => ({ id, type: "text" } as FormField);
describe("form presentation step builder", () => {
  it("page mode includes only visible fields in a single step", () => {
    const def = { ...emptyDefinition("test"), presentation: "page" as const, fields: [question("one"), question("two")] };
    expect(buildSteps(def, new Set(["two"]))).toEqual([{ key: "all", fields: [def.fields[1]] }]);
  });
  it("immersive mode yields one step per visible non-section field", () => {
    const def = { ...emptyDefinition("test"), presentation: "flow" as const, fields: [question("one"), question("two")] };
    expect(buildSteps(def, new Set(["one"])).map(s => s.key)).toEqual(["one"]);
  });
});
