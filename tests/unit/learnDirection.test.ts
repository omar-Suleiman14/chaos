import { expect, it } from "vitest";
import { contentDirection } from "@/lib/learn/direction";
it.each(["ar", "ar-EG", "AR-sa", "ar_EG", "he", "fa", "ur", "az-Arab"])("reads %s right to left", language => {
  expect(contentDirection(language)).toBe("rtl");
});
it.each(["en", "en-US", "ar-Latn", "az-Latn", "", "other", undefined])("reads %s left to right", language => {
  expect(contentDirection(language)).toBe("ltr");
});
