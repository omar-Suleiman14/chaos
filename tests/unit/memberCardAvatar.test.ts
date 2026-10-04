import { expect, it } from "vitest";
import { memberCardSvg } from "@/lib/memberCard";
import { blobatar } from "blobatar";

const data = { name: "Student", username: "student", seed: "selected-avatar", memberSince: 1, style: 0, url: "https://chaos.fail/card/student" };
const shapes = (svg: string) => [...new DOMParser().parseFromString(svg, "image/svg+xml").querySelectorAll("path")].map(path => path.getAttribute("d"));
const avatar = (svg: string, side: "front" | "back") => new DOMParser().parseFromString(svg, "image/svg+xml").querySelector(`svg[x="${side === "front" ? 104 : 144}"]`)!.outerHTML;

it.each(["front", "back"] as const)("renders the selected avatar on the %s, independently of username and theme", side => {
  const selected = avatar(memberCardSvg(data, side), side);
  expect(shapes(selected)).toEqual(shapes(blobatar(data.seed)));
  expect(avatar(memberCardSvg({ ...data, username: "renamed", style: 3 }, side), side)).toBe(selected);
  expect(avatar(memberCardSvg({ ...data, seed: "different-avatar" }, side), side)).not.toBe(selected);
});
