import { act, render, screen, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it } from "vitest";
import { useTextSelection } from "@/components/learn/reader/SelectionToolbar";

function SelectionFixture() {
  const root = useRef<HTMLElement>(null);
  const [selected] = useTextSelection(root);
  return <><article ref={root}><p data-block-id="p">{"A  Portal  pressure\nchanges"}</p></article><output aria-label="Selection">{JSON.stringify(selected && { text: selected.text, offset: selected.offset })}</output></>;
}
describe("annotation selection anchors", () => {
  it("preserves whitespace and original offsets for exact server quote validation", async () => {
    render(<SelectionFixture />);
    const node = screen.getByRole("article").querySelector("p")!.firstChild!;
    const range = document.createRange();
    range.setStart(node, 1); range.setEnd(node, 22);
    range.getBoundingClientRect = () => new DOMRect(0, 0, 100, 20);
    act(() => {
      document.getSelection()!.removeAllRanges();
      document.getSelection()!.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    });
    await waitFor(() => {
      expect(JSON.parse(screen.getByLabelText("Selection").textContent!)).toEqual({ text: node.textContent!.slice(1, 22), offset: 1 });
    });
    document.getSelection()!.removeAllRanges();
  });
});
