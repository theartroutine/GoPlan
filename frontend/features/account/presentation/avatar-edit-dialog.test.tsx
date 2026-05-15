import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AvatarEditDialog } from "@/features/account/presentation/avatar-edit-dialog";

const avatarHookMock = vi.hoisted(() => ({
  useUpdateAvatar: vi.fn(),
}));

const imageMock = vi.hoisted(() => ({
  compressImageToWebP: vi.fn(),
}));

vi.mock("@/features/account/application/use-update-avatar", () => avatarHookMock);
vi.mock("@/shared/lib/image", () => imageMock);
vi.mock("react-easy-crop", () => ({
  default: (props: {
    onCropComplete: (
      area: { x: number; y: number; width: number; height: number },
      areaPx: { x: number; y: number; width: number; height: number },
    ) => void;
  }) => {
    queueMicrotask(() => {
      const area = { x: 0, y: 0, width: 100, height: 100 };
      props.onCropComplete(area, area);
    });
    return <div data-testid="cropper" />;
  },
}));

class StubImage {
  crossOrigin = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  set src(_: string) {
    queueMicrotask(() => this.onload?.());
  }
}

describe("AvatarEditDialog", () => {
  const upload = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    avatarHookMock.useUpdateAvatar.mockReturnValue({
      upload,
      uploading: false,
      error: null,
    });
    vi.stubGlobal("Image", StubImage);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:avatar"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows a local error when browser image encoding fails", async () => {
    imageMock.compressImageToWebP.mockRejectedValue(
      new Error("Canvas could not be encoded to WebP."),
    );

    render(<AvatarEditDialog open onOpenChange={vi.fn()} />);
    const input = document.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Avatar file input was not rendered.");
    }

    fireEvent.change(input, {
      target: {
        files: [new File(["avatar"], "avatar.png", { type: "image/png" })],
      },
    });

    await screen.findByTestId("cropper");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Canvas could not be encoded to WebP."),
    ).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
  });
});
