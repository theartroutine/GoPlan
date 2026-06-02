import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { TripPhoto } from "@/features/trips/domain/photo-types";
import { PhotoLightbox } from "@/features/trips/presentation/photo-lightbox";

const PHOTO: TripPhoto = {
  id: "photo_1",
  created_at: "2026-05-24T01:00:00Z",
  uploaded_by: {
    id: "user_1",
    display_name: "Minh",
    identify_tag: "@minh",
    avatar_url: null,
  },
  width: 2400,
  height: 1600,
  thumbnail_width: 480,
  thumbnail_height: 320,
  medium_width: 1600,
  medium_height: 1067,
  can_delete: true,
};

function renderLightbox(overrides: Partial<React.ComponentProps<typeof PhotoLightbox>> = {}) {
  const props: React.ComponentProps<typeof PhotoLightbox> = {
    photo: PHOTO,
    mediumUrl: "blob:photo-medium",
    loading: false,
    error: null,
    canNavigatePrevious: false,
    canNavigateNext: false,
    downloading: false,
    onClose: vi.fn(),
    onRequestDelete: vi.fn(),
    onRequestDownload: vi.fn(),
    onNavigatePrevious: vi.fn(),
    onNavigateNext: vi.fn(),
    ...overrides,
  };
  return { ...render(<PhotoLightbox {...props} />), props };
}

describe("PhotoLightbox", () => {
  it("renders the medium image and keeps controls hidden until hover", () => {
    renderLightbox();

    const dialog = screen.getByRole("dialog", { name: "Photo detail" });
    expect(within(dialog).getByAltText("Selected photo uploaded by Minh")).toHaveAttribute(
      "src",
      "blob:photo-medium",
    );
    const overlay = dialog.querySelector("[data-photo-lightbox-controls]");
    expect(overlay).toHaveAttribute("data-visible", "false");
    expect(
      within(dialog).queryByRole("button", { name: "Close photo viewer" }),
    ).not.toBeInTheDocument();

    const stage = dialog.querySelector("[data-photo-lightbox-stage]");
    if (!(stage instanceof HTMLElement)) {
      throw new Error("Photo lightbox stage was not rendered.");
    }
    fireEvent.mouseEnter(stage);

    expect(overlay).toHaveAttribute("data-visible", "true");
    expect(within(dialog).getByText("Minh")).toBeInTheDocument();
    expect(within(dialog).getByText("May 24")).toBeInTheDocument();
  });

  it("uses a viewport-sized viewer instead of the compact dialog width", () => {
    renderLightbox({
      photo: {
        ...PHOTO,
        medium_width: 2560,
        medium_height: 1440,
      },
    });

    const dialog = screen.getByRole("dialog", { name: "Photo detail" });
    expect(dialog).toHaveClass("w-screen", "max-w-none", "sm:max-w-none");
    expect(dialog).toHaveClass("overflow-hidden", "rounded-none");

    const stage = dialog.querySelector("[data-photo-lightbox-stage]");
    if (!(stage instanceof HTMLElement)) {
      throw new Error("Photo lightbox stage was not rendered.");
    }
    expect(stage).toHaveClass("h-[100dvh]", "w-screen", "max-h-[100dvh]");

    expect(within(dialog).getByAltText("Selected photo uploaded by Minh")).toHaveClass(
      "max-h-[100dvh]",
      "max-w-[100vw]",
      "object-contain",
    );
  });

  it("shows a delete button only when can_delete is true", () => {
    const { unmount } = renderLightbox();
    const dialog = screen.getByRole("dialog", { name: "Photo detail" });
    const stage = dialog.querySelector("[data-photo-lightbox-stage]");
    if (!(stage instanceof HTMLElement)) {
      throw new Error("Photo lightbox stage was not rendered.");
    }
    fireEvent.mouseEnter(stage);
    expect(
      screen.getByRole("button", { name: "Delete photo uploaded by Minh" }),
    ).toBeInTheDocument();
    unmount();

    renderLightbox({ photo: { ...PHOTO, can_delete: false } });
    const nextDialog = screen.getByRole("dialog", { name: "Photo detail" });
    const nextStage = nextDialog.querySelector("[data-photo-lightbox-stage]");
    if (!(nextStage instanceof HTMLElement)) {
      throw new Error("Photo lightbox stage was not rendered.");
    }
    fireEvent.mouseEnter(nextStage);
    expect(
      screen.queryByRole("button", { name: "Delete photo uploaded by Minh" }),
    ).not.toBeInTheDocument();
  });

  it("calls onRequestDelete when the delete button is clicked", () => {
    const onRequestDelete = vi.fn();
    renderLightbox({ onRequestDelete });

    const dialog = screen.getByRole("dialog", { name: "Photo detail" });
    const stage = dialog.querySelector("[data-photo-lightbox-stage]");
    if (!(stage instanceof HTMLElement)) {
      throw new Error("Photo lightbox stage was not rendered.");
    }
    fireEvent.mouseEnter(stage);
    fireEvent.click(screen.getByRole("button", { name: "Delete photo uploaded by Minh" }));
    expect(onRequestDelete).toHaveBeenCalledWith(PHOTO);
  });

  it("calls onRequestDownload when the download button is clicked", () => {
    const onRequestDownload = vi.fn();
    renderLightbox({ onRequestDownload });

    const dialog = screen.getByRole("dialog", { name: "Photo detail" });
    const stage = dialog.querySelector("[data-photo-lightbox-stage]");
    if (!(stage instanceof HTMLElement)) {
      throw new Error("Photo lightbox stage was not rendered.");
    }
    fireEvent.mouseEnter(stage);
    fireEvent.click(screen.getByRole("button", { name: "Download photo uploaded by Minh" }));
    expect(onRequestDownload).toHaveBeenCalledWith(PHOTO);
  });

  it("shows the download button even when the photo cannot be deleted", () => {
    renderLightbox({ photo: { ...PHOTO, can_delete: false } });

    const dialog = screen.getByRole("dialog", { name: "Photo detail" });
    const stage = dialog.querySelector("[data-photo-lightbox-stage]");
    if (!(stage instanceof HTMLElement)) {
      throw new Error("Photo lightbox stage was not rendered.");
    }
    fireEvent.mouseEnter(stage);
    expect(
      screen.getByRole("button", { name: "Download photo uploaded by Minh" }),
    ).toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    renderLightbox({ onClose });

    const dialog = screen.getByRole("dialog", { name: "Photo detail" });
    const stage = dialog.querySelector("[data-photo-lightbox-stage]");
    if (!(stage instanceof HTMLElement)) {
      throw new Error("Photo lightbox stage was not rendered.");
    }
    fireEvent.mouseEnter(stage);
    fireEvent.click(screen.getByRole("button", { name: "Close photo viewer" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("hides controls immediately when the pointer leaves the photo", () => {
    renderLightbox();

    const dialog = screen.getByRole("dialog", { name: "Photo detail" });
    const stage = dialog.querySelector("[data-photo-lightbox-stage]");
    if (!(stage instanceof HTMLElement)) {
      throw new Error("Photo lightbox stage was not rendered.");
    }
    const overlay = dialog.querySelector("[data-photo-lightbox-controls]");
    expect(overlay).not.toBeNull();

    fireEvent.mouseEnter(stage);
    expect(overlay).toHaveAttribute("data-visible", "true");

    fireEvent.mouseLeave(stage);
    expect(overlay).toHaveAttribute("data-visible", "false");
  });

  it("navigates by overlay buttons and disables unavailable directions", () => {
    const onNavigatePrevious = vi.fn();
    const onNavigateNext = vi.fn();
    renderLightbox({
      canNavigatePrevious: false,
      canNavigateNext: true,
      onNavigatePrevious,
      onNavigateNext,
    });

    const dialog = screen.getByRole("dialog", { name: "Photo detail" });
    const stage = dialog.querySelector("[data-photo-lightbox-stage]");
    if (!(stage instanceof HTMLElement)) {
      throw new Error("Photo lightbox stage was not rendered.");
    }
    fireEvent.mouseEnter(stage);

    const previousButton = within(dialog).getByRole("button", { name: "Previous photo" });
    const nextButton = within(dialog).getByRole("button", { name: "Next photo" });
    expect(previousButton).toBeDisabled();
    expect(nextButton).toBeEnabled();

    fireEvent.click(previousButton);
    fireEvent.click(nextButton);

    expect(onNavigatePrevious).not.toHaveBeenCalled();
    expect(onNavigateNext).toHaveBeenCalledOnce();
  });

  it("navigates with left and right keyboard arrows", () => {
    const onNavigatePrevious = vi.fn();
    const onNavigateNext = vi.fn();
    renderLightbox({
      canNavigatePrevious: true,
      canNavigateNext: true,
      onNavigatePrevious,
      onNavigateNext,
    });

    const dialog = screen.getByRole("dialog", { name: "Photo detail" });
    fireEvent.keyDown(dialog, { key: "ArrowLeft" });
    fireEvent.keyDown(dialog, { key: "ArrowRight" });

    expect(onNavigatePrevious).toHaveBeenCalledOnce();
    expect(onNavigateNext).toHaveBeenCalledOnce();
  });

  it("does not navigate with keyboard arrows at album boundaries", () => {
    const onNavigatePrevious = vi.fn();
    const onNavigateNext = vi.fn();
    renderLightbox({
      canNavigatePrevious: false,
      canNavigateNext: false,
      onNavigatePrevious,
      onNavigateNext,
    });

    const dialog = screen.getByRole("dialog", { name: "Photo detail" });
    fireEvent.keyDown(dialog, { key: "ArrowLeft" });
    fireEvent.keyDown(dialog, { key: "ArrowRight" });

    expect(onNavigatePrevious).not.toHaveBeenCalled();
    expect(onNavigateNext).not.toHaveBeenCalled();
  });

  it("keeps controls hidden when a photo is reopened until the user hovers again", () => {
    const { rerender } = renderLightbox();

    const dialog = screen.getByRole("dialog", { name: "Photo detail" });
    const stage = dialog.querySelector("[data-photo-lightbox-stage]");
    if (!(stage instanceof HTMLElement)) {
      throw new Error("Photo lightbox stage was not rendered.");
    }
    const overlay = dialog.querySelector("[data-photo-lightbox-controls]");
    expect(overlay).not.toBeNull();
    fireEvent.mouseEnter(stage);
    expect(overlay).toHaveAttribute("data-visible", "true");
    fireEvent.mouseLeave(stage);
    expect(overlay).toHaveAttribute("data-visible", "false");

    rerender(
      <PhotoLightbox
        photo={null}
        mediumUrl={null}
        loading={false}
        error={null}
        canNavigatePrevious={false}
        canNavigateNext={false}
        downloading={false}
        onClose={vi.fn()}
        onRequestDelete={vi.fn()}
        onRequestDownload={vi.fn()}
        onNavigatePrevious={vi.fn()}
        onNavigateNext={vi.fn()}
      />,
    );

    rerender(
      <PhotoLightbox
        photo={{ ...PHOTO, id: "photo_2" }}
        mediumUrl="blob:photo-medium-2"
        loading={false}
        error={null}
        canNavigatePrevious={false}
        canNavigateNext={false}
        downloading={false}
        onClose={vi.fn()}
        onRequestDelete={vi.fn()}
        onRequestDownload={vi.fn()}
        onNavigatePrevious={vi.fn()}
        onNavigateNext={vi.fn()}
      />,
    );

    const reopenedOverlay = screen
      .getByRole("dialog", { name: "Photo detail" })
      .querySelector("[data-photo-lightbox-controls]");
    expect(reopenedOverlay).toHaveAttribute("data-visible", "false");
  });
});
