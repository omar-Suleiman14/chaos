import { describe, expect, it } from "vitest";
import { clampWidth, readSidebarPreferences, SIDEBAR_DEFAULT } from "../../lib/dashboard/sidebarPreferences";
const stored = (data: Record<string,string>): Pick<Storage,"getItem"> => ({getItem: k => data[k] ?? null});

describe("dashboard sidebar preference restoration", () => {
  it("uses existing defaults when there is no stored preference", () => {
    expect(readSidebarPreferences(stored({}))).toEqual({collapsed:false,width:SIDEBAR_DEFAULT});
  });
  it("retains collapsed state and clamps out-of-range widths", () => {
    expect(readSidebarPreferences(stored({"chaos.ui.sidebar-collapsed":"true","chaos.ui.sidebar-width":"999"}))).toEqual({collapsed:true,width:420});
    expect(readSidebarPreferences(stored({"chaos.ui.sidebar-width":"1"})).width).toBe(200);
    expect(clampWidth(310)).toBe(310);
  });
  it("falls back when storage access is blocked", () => {
    expect(readSidebarPreferences({getItem:()=>{throw new Error("blocked")}})).toEqual({collapsed:false,width:SIDEBAR_DEFAULT});
  });
});
