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
  static nextNaturalWidth = 512;
  static nextNaturalHeight = 512;

  crossOrigin = "";
  naturalWidth = StubImage.nextNaturalWidth;
  naturalHeight = StubImage.nextNaturalHeight;
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
    StubImage.nextNaturalWidth = 512;
    StubImage.nextNaturalHeight = 512;
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

  it("rejects source images above the avatar dimension limit before cropping", async () => {
    StubImage.nextNaturalWidth = 6000;
    StubImage.nextNaturalHeight = 6000;

    render(<AvatarEditDialog open onOpenChange={vi.fn()} />);
    const input = document.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Avatar file input was not rendered.");
    }

    fireEvent.change(input, {
      target: {
        files: [new File(["avatar"], "huge.png", { type: "image/png" })],
      },
    });

    expect(
      await screen.findByText("Avatar image must be at most 1024x1024 pixels."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("cropper")).not.toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
  });

  it("renders an accessible description for the avatar dialog", () => {
    render(<AvatarEditDialog open onOpenChange={vi.fn()} />);

    expect(
      screen.getByText("Choose a JPEG, PNG, or WebP image, then crop it into a square avatar."),
    ).toBeInTheDocument();
  });
});
