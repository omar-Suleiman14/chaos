import { describe, expect, it } from "vitest";
import { formStatusLabels, type FormStatus } from "@/lib/formStatusLabels";

describe("shared form status labels", () => {
  it("keeps the full lifecycle vocabulary identical across badges and creator filters", () => {
    const statuses: FormStatus[] = ["draft", "live", "closed", "archived"];
    expect(statuses.map(status => formStatusLabels.en[status])).toEqual(["Draft", "Live", "Closed", "Archived"]);
    expect(statuses.map(status => formStatusLabels.ar[status])).toEqual(["مسودة", "منشور", "مغلق", "مؤرشف"]);
  });
});
