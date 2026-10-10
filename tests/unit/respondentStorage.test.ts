import { describe, expect, it } from "vitest";
import { readRespondentStorage } from "../../lib/forms/respondentStorage";
const storage = (records: Record<string, string>): Pick<Storage, "getItem"> => ({ getItem: key => records[key] ?? null });

describe("respondent local draft and receipt reader", () => {
  it("restores the local progress and a receipt with an id", () => {
    const read = readRespondentStorage<{ answers: object }, { receiptCode: string }>(storage({ draft: '{"answers":{"one":1}}', receipt: '{"receiptCode":"r1"}' }), "draft", "receipt", true);
    expect(read).toEqual({ progress: { answers: { one: 1 } }, receipt: { receiptCode: "r1" } });
  });
  it("does not expose receipts when editing or resuming", () => {
    expect(readRespondentStorage(storage({ receipt: '{"receiptCode":"private"}' }), "draft", "receipt", false)).toEqual({ progress: null, receipt: null });
  });
  it("ignores receipts without a code", () => {
    expect(readRespondentStorage(storage({ receipt: '{}' }), "draft", "receipt", true).receipt).toBeNull();
  });
  it("lets callers retain their existing unavailable-storage fallback", () => {
    expect(() => readRespondentStorage(storage({ draft: "{" }), "draft", "receipt", true)).toThrow();
  });
});
