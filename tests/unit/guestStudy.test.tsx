import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { GUEST_STUDY_KEY, nextGuestProgress, saveGuestProgress, saveGuestReview, useGuestStudy } from "@/lib/learn/guestStudy";

beforeEach(() => {
  localStorage.clear();
  window.dispatchEvent(new StorageEvent("storage", { key: null }));
});

describe("guest study on this device", () => {
  it("records reading progress and resets only when explicitly requested", () => {
    const { result } = renderHook(useGuestStudy);
    act(() => saveGuestProgress("lesson", { percent: 55, lastBlockId: "heading" }));
    act(() => saveGuestProgress("lesson", { percent: 10 }));
    expect(result.current.progress.lesson).toMatchObject({ percent: 55, lastBlockId: "heading", state: "in_progress" });
    act(() => saveGuestProgress("lesson", { state: "completed" }));
    expect(result.current.progress.lesson).toMatchObject({ percent: 100, state: "completed" });
    act(() => saveGuestProgress("lesson", { state: "not_started" }));
    expect(result.current.progress.lesson).toMatchObject({ percent: 0, state: "not_started" });
    expect(result.current.progress.lesson.lastBlockId).toBeUndefined();
  });

  it("persists review levels by published version without creating account evidence", () => {
    const { result, unmount } = renderHook(useGuestStudy);
    act(() => saveGuestReview("set", "v1", "card", true));
    act(() => saveGuestReview("set", "v1", "card", true));
    act(() => saveGuestReview("set", "v2", "card", true));
    expect(result.current.reviews["set:v1"][0].box).toBe(2);
    expect(result.current.reviews["set:v2"][0].box).toBe(1);
    act(() => saveGuestReview("set", "v1", "card", false));
    expect(result.current.reviews["set:v1"][0].box).toBe(0);
    expect(localStorage.getItem(GUEST_STUDY_KEY)).toContain('"set:v2"');
    expect(localStorage.getItem("chaos.learn.v1")).toBeNull();
    unmount();
    const reopened = renderHook(useGuestStudy);
    expect(reopened.result.current.reviews["set:v2"][0].box).toBe(1);
  });

  it("updates other tabs and recovers from invalid stored JSON", () => {
    const { result } = renderHook(useGuestStudy);
    act(() => {
      localStorage.setItem(GUEST_STUDY_KEY, JSON.stringify({ progress: { other: nextGuestProgress("other", undefined, { percent: 30 }) }, reviews: {} }));
      window.dispatchEvent(new StorageEvent("storage", { key: GUEST_STUDY_KEY }));
    });
    expect(result.current.progress.other.percent).toBe(30);
    act(() => {
      localStorage.setItem(GUEST_STUDY_KEY, "bad JSON");
      window.dispatchEvent(new StorageEvent("storage", { key: GUEST_STUDY_KEY }));
    });
    expect(result.current.progress).toEqual({});
  });
});
