import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    onClose: vi.fn(),
    onRequestDelete: vi.fn(),
    ...overrides,
  };
  return { ...render(<PhotoLightbox {...props} />), props };
}

describe("PhotoLightbox", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the medium image with uploader and date overlay", () => {
    renderLightbox();

    const dialog = screen.getByRole("dialog", { name: "Photo detail" });
    expect(within(dialog).getByAltText("Selected photo uploaded by Minh")).toHaveAttribute(
      "src",
      "blob:photo-medium",
    );
    expect(within(dialog).getByText("Minh")).toBeInTheDocument();
    expect(within(dialog).getByText("May 24")).toBeInTheDocument();
  });

  it("shows a delete button only when can_delete is true", () => {
    const { unmount } = renderLightbox();
    expect(
      screen.getByRole("button", { name: "Delete photo uploaded by Minh" }),
    ).toBeInTheDocument();
    unmount();

    renderLightbox({ photo: { ...PHOTO, can_delete: false } });
    expect(
      screen.queryByRole("button", { name: "Delete photo uploaded by Minh" }),
    ).not.toBeInTheDocument();
  });

  it("calls onRequestDelete when the delete button is clicked", () => {
    const onRequestDelete = vi.fn();
    renderLightbox({ onRequestDelete });

    fireEvent.click(screen.getByRole("button", { name: "Delete photo uploaded by Minh" }));
    expect(onRequestDelete).toHaveBeenCalledWith(PHOTO);
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    renderLightbox({ onClose });

    fireEvent.click(screen.getByRole("button", { name: "Close photo viewer" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("hides the overlay after 2.5s of inactivity and re-shows on mouse move", () => {
    renderLightbox();

    const closeBtn = screen.getByRole("button", { name: "Close photo viewer" });
    const overlay = closeBtn.closest("[data-photo-lightbox-controls]");
    expect(overlay).not.toBeNull();
    expect(overlay).toHaveAttribute("data-visible", "true");

    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(overlay).toHaveAttribute("data-visible", "false");

    const dialog = screen.getByRole("dialog", { name: "Photo detail" });
    act(() => {
      fireEvent.mouseMove(dialog);
    });
    expect(overlay).toHaveAttribute("data-visible", "true");
  });
});
