import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import MagneticFileDropZone, { acceptsFile } from "@/components/workspace/MagneticFileDropZone";

describe("magnetic file drop zone", () => {
  it("validates the same extensions for browsing and drag", () => {
    expect(acceptsFile(new File(["hi"], "document.pdf"), ".pdf,application/pdf")).toBe(true);
    expect(acceptsFile(new File(["hi"], "document.exe"), ".pdf,application/pdf")).toBe(false);
  });
  it("accepts a single file from the desktop", () => {
    const onFile = vi.fn();
    render(<MagneticFileDropZone accept=".csv" onFile={onFile} />);
    const file = new File(["x"], "questions.csv", { type: "text/csv" });
    fireEvent.drop(screen.getByTestId("magnetic-file-drop"), { dataTransfer: { types: ["Files"], files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file);
  });
  it("rejects unsupported or oversized files and retains browse", () => {
    const onFile = vi.fn(), onReject = vi.fn();
    const { container } = render(<MagneticFileDropZone accept=".pdf" maxBytes={3} onFile={onFile} onReject={onReject} label="Choose source" />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const click = vi.spyOn(input, "click").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: "Choose source" }));
    expect(click).toHaveBeenCalledOnce();
    fireEvent.change(input, { target: { files: [new File(["hello"], "long.pdf")] } });
    fireEvent.change(input, { target: { files: [new File(["ok"], "evil.exe")] } });
    expect(onReject).toHaveBeenCalledWith("size");
    expect(onReject).toHaveBeenCalledWith("type");
    expect(onFile).not.toHaveBeenCalled();
  });
});
