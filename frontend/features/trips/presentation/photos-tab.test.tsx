import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TripPhoto } from "@/features/trips/domain/photo-types";

const photosApiMock = vi.hoisted(() => ({
  bffDeleteTripPhoto: vi.fn(),
  bffFetchTripPhotoAssetBlob: vi.fn(),
  bffListTripPhotos: vi.fn(),
  bffUploadTripPhotos: vi.fn(),
}));

vi.mock("@/features/trips/infrastructure/photos-api", () => photosApiMock);
vi.mock("@/features/trips/presentation/trip-context", () => ({
  useTripContext: () => ({
    tripId: "trip_1",
    data: {
      trip: { status: "PLANNING" },
      my_membership: { role: "CAPTAIN" },
    },
  }),
}));

import { PhotosTab } from "@/features/trips/presentation/photos-tab";

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

const SECOND_PHOTO: TripPhoto = {
  ...PHOTO,
  id: "photo_2",
  created_at: "2026-05-25T01:00:00Z",
  uploaded_by: {
    id: "user_2",
    display_name: "Lan",
    identify_tag: "@lan",
    avatar_url: null,
  },
};

describe("PhotosTab", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    let objectUrlIndex = 0;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => {
        objectUrlIndex += 1;
        return `blob:trip-photo-${objectUrlIndex}`;
      }),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    photosApiMock.bffFetchTripPhotoAssetBlob.mockResolvedValue(
      new Blob(["image"], { type: "image/webp" }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows an empty state when the trip has no photos", async () => {
    photosApiMock.bffListTripPhotos.mockResolvedValueOnce({
      results: [],
      nextCursor: null,
      previousCursor: null,
    });

    render(<PhotosTab />);

    expect(await screen.findByText("No photos yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload photos" })).toBeInTheDocument();
  });

  it("renders gallery photos and loads the next page on demand", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      bottom: 1080,
      height: 991,
      left: 0,
      right: 1596,
      toJSON: () => ({}),
      top: 89,
      width: 1596,
      x: 0,
      y: 89,
    });
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1920,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 1080,
    });
    photosApiMock.bffListTripPhotos
      .mockResolvedValueOnce({
        results: [PHOTO],
        nextCursor: "page-2",
        previousCursor: null,
      })
      .mockResolvedValueOnce({
        results: [{ ...PHOTO, id: "photo_2" }],
        nextCursor: null,
        previousCursor: null,
      });

    render(<PhotosTab />);

    expect(await screen.findByRole("button", { name: /Open photo uploaded by Minh/i }))
      .toBeInTheDocument();
    expect(photosApiMock.bffListTripPhotos).toHaveBeenNthCalledWith(
      1,
      "trip_1",
      expect.objectContaining({
        pageSize: 28,
        signal: expect.any(AbortSignal),
      }),
    );
    await waitFor(() => {
      expect(screen.getByAltText("Photo uploaded by Minh")).toHaveAttribute(
        "src",
        "blob:trip-photo-1",
      );
    });
    expect(photosApiMock.bffFetchTripPhotoAssetBlob).toHaveBeenCalledWith(
      "trip_1",
      "photo_1",
      "thumbnail",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Load more photos" }));

    await waitFor(() => {
      expect(photosApiMock.bffListTripPhotos).toHaveBeenNthCalledWith(
        2,
        "trip_1",
        expect.objectContaining({ cursor: "page-2", pageSize: 28 }),
      );
    });
    await waitFor(() => {
      expect(screen.getAllByAltText("Photo uploaded by Minh")).toHaveLength(2);
    });
    await waitFor(() => {
      expect(screen.getAllByAltText("Photo uploaded by Minh")[1]).toHaveAttribute(
        "src",
        "blob:trip-photo-2",
      );
    });
  });

  it("keeps the gallery visible when one thumbnail request fails", async () => {
    photosApiMock.bffListTripPhotos.mockResolvedValueOnce({
      results: [PHOTO, SECOND_PHOTO],
      nextCursor: null,
      previousCursor: null,
    });
    photosApiMock.bffFetchTripPhotoAssetBlob.mockImplementation(
      async (_tripId: string, photoId: string) => {
        if (photoId === "photo_1") {
          throw new Error("thumbnail unavailable");
        }
        return new Blob(["image"], { type: "image/webp" });
      },
    );

    render(<PhotosTab />);

    expect(await screen.findByRole("button", { name: /Open photo uploaded by Minh/i }))
      .toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Open photo uploaded by Lan/i }))
      .toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByAltText("Photo uploaded by Lan")).toHaveAttribute(
        "src",
        "blob:trip-photo-1",
      );
    });
    await waitFor(() => {
      expect(screen.queryByText("Could not load trip photos.")).not.toBeInTheDocument();
    });
  });

  it("opens a medium-image lightbox from the thumbnail gallery", async () => {
    photosApiMock.bffListTripPhotos.mockResolvedValueOnce({
      results: [PHOTO],
      nextCursor: null,
      previousCursor: null,
    });

    render(<PhotosTab />);

    fireEvent.click(await screen.findByRole("button", { name: /Open photo uploaded by Minh/i }));

    const dialog = await screen.findByRole("dialog", { name: "Photo detail" });
    await waitFor(() => {
      expect(within(dialog).getByAltText("Selected photo uploaded by Minh")).toHaveAttribute(
        "src",
        "blob:trip-photo-2",
      );
    });
    expect(photosApiMock.bffFetchTripPhotoAssetBlob).toHaveBeenCalledWith(
      "trip_1",
      "photo_1",
      "medium",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("navigates the opened lightbox through adjacent album photos", async () => {
    photosApiMock.bffListTripPhotos.mockResolvedValueOnce({
      results: [PHOTO, SECOND_PHOTO],
      nextCursor: null,
      previousCursor: null,
    });

    render(<PhotosTab />);

    fireEvent.click(await screen.findByRole("button", { name: /Open photo uploaded by Minh/i }));

    const dialog = await screen.findByRole("dialog", { name: "Photo detail" });
    await waitFor(() => {
      expect(within(dialog).getByAltText("Selected photo uploaded by Minh")).toHaveAttribute(
        "src",
        expect.stringMatching(/^blob:trip-photo-/),
      );
    });

    const stage = dialog.querySelector("[data-photo-lightbox-stage]");
    if (!(stage instanceof HTMLElement)) {
      throw new Error("Photo lightbox stage was not rendered.");
    }
    fireEvent.mouseEnter(stage);

    expect(within(dialog).getByRole("button", { name: "Previous photo" })).toBeDisabled();
    const nextButton = within(dialog).getByRole("button", { name: "Next photo" });
    expect(nextButton).toBeEnabled();
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(photosApiMock.bffFetchTripPhotoAssetBlob).toHaveBeenCalledWith(
        "trip_1",
        "photo_2",
        "medium",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
    await waitFor(() => {
      expect(within(dialog).getByAltText("Selected photo uploaded by Lan")).toHaveAttribute(
        "src",
        expect.stringMatching(/^blob:trip-photo-/),
      );
    });

    expect(within(dialog).getByRole("button", { name: "Previous photo" })).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "Next photo" })).toBeDisabled();

    fireEvent.keyDown(dialog, { key: "ArrowLeft" });

    await waitFor(() => {
      expect(photosApiMock.bffFetchTripPhotoAssetBlob).toHaveBeenCalledWith(
        "trip_1",
        "photo_1",
        "medium",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
    await waitFor(() => {
      expect(within(dialog).getByAltText("Selected photo uploaded by Minh")).toHaveAttribute(
        "src",
        expect.stringMatching(/^blob:trip-photo-/),
      );
    });
  });

  it("rejects HEIC before upload with user-friendly copy", async () => {
    photosApiMock.bffListTripPhotos.mockResolvedValueOnce({
      results: [],
      nextCursor: null,
      previousCursor: null,
    });

    render(<PhotosTab />);
    await screen.findByText("No photos yet.");

    const uploadButton = screen.getByRole("button", { name: "Upload photos" });
    const targetInput = uploadButton.parentElement?.querySelector('input[type="file"]');
    if (!(targetInput instanceof HTMLInputElement)) {
      throw new Error("Empty-state file input was not rendered next to the CTA.");
    }
    fireEvent.change(targetInput, {
      target: {
        files: [new File(["heic"], "memory.heic", { type: "image/heic" })],
      },
    });

    expect(
      await screen.findByText(
        "Use JPEG, PNG, WebP, or HEIC photos. SVG and other formats are not supported.",
      ),
    ).toBeInTheDocument();
    expect(photosApiMock.bffUploadTripPhotos).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Review photos" })).not.toBeInTheDocument();
  });

  it("deletes a removable photo after confirmation", async () => {
    photosApiMock.bffListTripPhotos.mockResolvedValueOnce({
      results: [PHOTO],
      nextCursor: null,
      previousCursor: null,
    });
    photosApiMock.bffDeleteTripPhoto.mockResolvedValueOnce(undefined);

    render(<PhotosTab />);

    fireEvent.click(await screen.findByRole("button", { name: /Open photo uploaded by Minh/i }));
    const dialog = await screen.findByRole("dialog", { name: "Photo detail" });
    const stage = dialog.querySelector("[data-photo-lightbox-stage]");
    if (!(stage instanceof HTMLElement)) {
      throw new Error("Photo lightbox stage was not rendered.");
    }
    fireEvent.mouseEnter(stage);
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete photo uploaded by Minh" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete photo" }));

    await waitFor(() => {
      expect(photosApiMock.bffDeleteTripPhoto).toHaveBeenCalledWith("trip_1", "photo_1");
    });
    await waitFor(() => {
      expect(screen.queryByAltText("Photo uploaded by Minh")).not.toBeInTheDocument();
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:trip-photo-1");
  });

  it("stages selected files and only uploads after the user confirms", async () => {
    photosApiMock.bffListTripPhotos.mockResolvedValueOnce({
      results: [],
      nextCursor: null,
      previousCursor: null,
    });
    const uploaded: TripPhoto = { ...PHOTO, id: "photo_new" };
    photosApiMock.bffUploadTripPhotos.mockResolvedValueOnce([uploaded]);

    render(<PhotosTab />);
    await screen.findByText("No photos yet.");

    const uploadButton = screen.getByRole("button", { name: "Upload photos" });
    const stagedInput = uploadButton.parentElement?.querySelector('input[type="file"]');
    if (!(stagedInput instanceof HTMLInputElement)) {
      throw new Error("Empty-state file input was not rendered next to the CTA.");
    }
    const file = new File(["x"], "trip.jpg", { type: "image/jpeg" });
    fireEvent.change(stagedInput, { target: { files: [file] } });

    const dialog = await screen.findByRole("dialog", { name: "Review photos" });
    expect(within(dialog).getByAltText("trip.jpg")).toBeInTheDocument();
    expect(photosApiMock.bffUploadTripPhotos).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Upload 1 photo" }));

    await waitFor(() => {
      expect(photosApiMock.bffUploadTripPhotos).toHaveBeenCalledWith("trip_1", [file]);
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Review photos" })).not.toBeInTheDocument();
    });
  });

  it("cancels staging without calling the upload API", async () => {
    photosApiMock.bffListTripPhotos.mockResolvedValueOnce({
      results: [],
      nextCursor: null,
      previousCursor: null,
    });

    render(<PhotosTab />);
    await screen.findByText("No photos yet.");

    const uploadButton = screen.getByRole("button", { name: "Upload photos" });
    const stagedInput = uploadButton.parentElement?.querySelector('input[type="file"]');
    if (!(stagedInput instanceof HTMLInputElement)) {
      throw new Error("Empty-state file input was not rendered next to the CTA.");
    }
    fireEvent.change(stagedInput, {
      target: { files: [new File(["x"], "trip.jpg", { type: "image/jpeg" })] },
    });

    const dialog = await screen.findByRole("dialog", { name: "Review photos" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Review photos" })).not.toBeInTheDocument();
    });
    expect(photosApiMock.bffUploadTripPhotos).not.toHaveBeenCalled();
  });

  it("clears the upload error when the user removes the last staged file after a failed upload", async () => {
    photosApiMock.bffListTripPhotos.mockResolvedValueOnce({
      results: [],
      nextCursor: null,
      previousCursor: null,
    });
    photosApiMock.bffUploadTripPhotos.mockRejectedValueOnce(
      new Error("network down"),
    );

    render(<PhotosTab />);
    await screen.findByText("No photos yet.");

    const uploadButton = screen.getByRole("button", { name: "Upload photos" });
    const stagedInput = uploadButton.parentElement?.querySelector('input[type="file"]');
    if (!(stagedInput instanceof HTMLInputElement)) {
      throw new Error("Empty-state file input was not rendered next to the CTA.");
    }
    fireEvent.change(stagedInput, {
      target: { files: [new File(["x"], "trip.jpg", { type: "image/jpeg" })] },
    });

    const dialog = await screen.findByRole("dialog", { name: "Review photos" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Upload 1 photo" }));

    await waitFor(() => {
      expect(within(dialog).getByText("Could not upload photos.")).toBeInTheDocument();
    });

    fireEvent.click(within(dialog).getByRole("button", { name: "Remove trip.jpg" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Review photos" })).not.toBeInTheDocument();
    });
    expect(screen.queryByText("Could not upload photos.")).not.toBeInTheDocument();
  });

  it("revokes thumbnail and medium object URLs on cleanup", async () => {
    photosApiMock.bffListTripPhotos.mockResolvedValueOnce({
      results: [PHOTO],
      nextCursor: null,
      previousCursor: null,
    });

    const { unmount } = render(<PhotosTab />);

    fireEvent.click(await screen.findByRole("button", { name: /Open photo uploaded by Minh/i }));
    const dialog = await screen.findByRole("dialog", { name: "Photo detail" });
    await waitFor(() => {
      expect(within(dialog).getByAltText("Selected photo uploaded by Minh")).toHaveAttribute(
        "src",
        "blob:trip-photo-2",
      );
    });

    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:trip-photo-1");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:trip-photo-2");
  });
});
