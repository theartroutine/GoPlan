import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UploadReviewDialog } from "@/features/trips/presentation/upload-review-dialog";

function makeFile(name: string, sizeBytes = 1024, type = "image/jpeg") {
  const blob = new Blob(["x".repeat(sizeBytes)], { type });
  return new File([blob], name, { type, lastModified: 1700000000000 });
}

describe("UploadReviewDialog", () => {
  beforeEach(() => {
    let objectUrlIndex = 0;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => {
        objectUrlIndex += 1;
        return `blob:staged-${objectUrlIndex}`;
      }),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders count, total size, and a tile per staged file", () => {
    const files = [makeFile("a.jpg", 1024), makeFile("b.jpg", 2048)];
    render(
      <UploadReviewDialog
        open
        files={files}
        uploading={false}
        optimizing={false}
        error={null}
        onAddFiles={vi.fn()}
        onRemoveFile={vi.fn()}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Review photos" });
    expect(within(dialog).getByText(/2 photos · 3\.0 KB/)).toBeInTheDocument();
    expect(within(dialog).getByAltText("a.jpg")).toBeInTheDocument();
    expect(within(dialog).getByAltText("b.jpg")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Upload 2 photos" })).toBeEnabled();
  });

  it("calls onRemoveFile with the tile index", () => {
    const onRemoveFile = vi.fn();
    const files = [makeFile("a.jpg"), makeFile("b.jpg")];
    render(
      <UploadReviewDialog
        open
        files={files}
        uploading={false}
        optimizing={false}
        error={null}
        onAddFiles={vi.fn()}
        onRemoveFile={onRemoveFile}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove b.jpg" }));
    expect(onRemoveFile).toHaveBeenCalledWith(1);
  });

  it("disables the upload button when there are no staged files", () => {
    render(
      <UploadReviewDialog
        open
        files={[]}
        uploading={false}
        optimizing={false}
        error={null}
        onAddFiles={vi.fn()}
        onRemoveFile={vi.fn()}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /Upload \d+ photos?/ })).toBeDisabled();
  });

  it("shows the error banner and keeps the dialog usable", () => {
    render(
      <UploadReviewDialog
        open
        files={[makeFile("a.jpg")]}
        uploading={false}
        optimizing={false}
        error="Network error."
        onAddFiles={vi.fn()}
        onRemoveFile={vi.fn()}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("Network error.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload 1 photo" })).toBeEnabled();
  });

  it("invokes onConfirm and onCancel when their buttons are clicked", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <UploadReviewDialog
        open
        files={[makeFile("a.jpg")]}
        uploading={false}
        optimizing={false}
        error={null}
        onAddFiles={vi.fn()}
        onRemoveFile={vi.fn()}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Upload 1 photo" }));
    expect(onConfirm).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("forwards picked extra files through onAddFiles and dedupes by name+size+lastModified", () => {
    const onAddFiles = vi.fn();
    const existing = makeFile("a.jpg", 1024);
    render(
      <UploadReviewDialog
        open
        files={[existing]}
        uploading={false}
        optimizing={false}
        error={null}
        onAddFiles={onAddFiles}
        onRemoveFile={vi.fn()}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const addMoreButton = screen.getByRole("button", { name: "Add more" });
    const addMoreInput = addMoreButton.parentElement?.querySelector(
      'input[type="file"]',
    );
    if (!(addMoreInput instanceof HTMLInputElement)) {
      throw new Error("Add-more input not rendered next to the button.");
    }
    fireEvent.change(addMoreInput, {
      target: {
        files: [
          makeFile("a.jpg", 1024), // duplicate of existing
          makeFile("c.jpg", 4096),
        ],
      },
    });

    expect(onAddFiles).toHaveBeenCalledTimes(1);
    expect(onAddFiles.mock.calls[0][0]).toHaveLength(1);
    expect(onAddFiles.mock.calls[0][0][0].name).toBe("c.jpg");
  });

  it("revokes object URLs for staged files when the file list changes or the dialog closes", () => {
    const file = makeFile("a.jpg");
    const { rerender } = render(
      <UploadReviewDialog
        open
        files={[file]}
        uploading={false}
        optimizing={false}
        error={null}
        onAddFiles={vi.fn()}
        onRemoveFile={vi.fn()}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);

    rerender(
      <UploadReviewDialog
        open={false}
        files={[file]}
        uploading={false}
        optimizing={false}
        error={null}
        onAddFiles={vi.fn()}
        onRemoveFile={vi.fn()}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:staged-1");
  });
});
