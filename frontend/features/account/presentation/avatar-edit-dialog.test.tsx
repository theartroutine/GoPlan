import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AvatarEditDialog } from "@/features/account/presentation/avatar-edit-dialog";

const avatarHookMock = vi.hoisted(() => ({
  useUpdateAvatar: vi.fn(),
}));

const imageMock = vi.hoisted(() => ({
  renderCroppedImageToWebP: vi.fn(),
}));

const imagePreprocessMock = vi.hoisted(() => ({
  preprocessImageFile: vi.fn(),
  IMAGE_INPUT_ACCEPT: "image/jpeg,image/png,image/webp,image/heic,.heic,.heif",
}));

vi.mock("@/features/account/application/use-update-avatar", () => avatarHookMock);
vi.mock("@/shared/lib/image", () => imageMock);
vi.mock("@/shared/lib/image-preprocess", () => imagePreprocessMock);
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

describe("AvatarEditDialog", () => {
  const upload = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    avatarHookMock.useUpdateAvatar.mockReturnValue({
      upload,
      uploading: false,
      error: null,
    });
    imagePreprocessMock.preprocessImageFile.mockImplementation(
      async (file: File) => ({ ok: true as const, file, wasProcessed: false }),
    );
    imageMock.renderCroppedImageToWebP.mockResolvedValue(
      new Blob(["avatar"], { type: "image/webp" }),
    );
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:avatar"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows a local error when browser image encoding fails", async () => {
    imageMock.renderCroppedImageToWebP.mockRejectedValue(
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

  it("shows a local error when the file type is unsupported", async () => {
    imagePreprocessMock.preprocessImageFile.mockResolvedValue({
      ok: false,
      code: "UNSUPPORTED",
    });

    render(<AvatarEditDialog open onOpenChange={vi.fn()} />);
    const input = document.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Avatar file input was not rendered.");
    }

    fireEvent.change(input, {
      target: {
        files: [new File(["avatar"], "image.bmp", { type: "image/bmp" })],
      },
    });

    expect(
      await screen.findByText(
        "Selected file must be a JPEG, PNG, WebP, or HEIC image.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("cropper")).not.toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
  });

  it("renders an accessible description for the avatar dialog", () => {
    render(<AvatarEditDialog open onOpenChange={vi.fn()} />);

    expect(
      screen.getByText(
        "Choose a JPEG, PNG, WebP, or HEIC image, then crop it into a square avatar.",
      ),
    ).toBeInTheDocument();
  });
});
