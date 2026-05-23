import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TripPhoto } from "@/features/trips/domain/photo-types";

const photosApiMock = vi.hoisted(() => ({
  bffDeleteTripPhoto: vi.fn(),
  bffListTripPhotos: vi.fn(),
  bffUploadTripPhotos: vi.fn(),
  getTripPhotoAssetUrl: vi.fn(
    (tripId: string, photoId: string, variant: "thumbnail" | "medium") =>
      `/api/trips/${tripId}/photos/${photoId}/${variant}`,
  ),
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

describe("PhotosTab", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    photosApiMock.getTripPhotoAssetUrl.mockImplementation(
      (tripId: string, photoId: string, variant: "thumbnail" | "medium") =>
        `/api/trips/${tripId}/photos/${photoId}/${variant}`,
    );
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
    expect(screen.getByAltText("Photo uploaded by Minh")).toHaveAttribute(
      "src",
      "/api/trips/trip_1/photos/photo_1/thumbnail",
    );

    fireEvent.click(screen.getByRole("button", { name: "Load more photos" }));

    await waitFor(() => {
      expect(photosApiMock.bffListTripPhotos).toHaveBeenNthCalledWith(
        2,
        "trip_1",
        expect.objectContaining({ cursor: "page-2" }),
      );
    });
    await waitFor(() => {
      expect(screen.getAllByAltText("Photo uploaded by Minh")).toHaveLength(2);
    });
    expect(screen.getAllByAltText("Photo uploaded by Minh")[1]).toHaveAttribute(
      "src",
      "/api/trips/trip_1/photos/photo_2/thumbnail",
    );
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
    expect(within(dialog).getByAltText("Selected photo uploaded by Minh")).toHaveAttribute(
      "src",
      "/api/trips/trip_1/photos/photo_1/medium",
    );
  });

  it("rejects HEIC before upload with user-friendly copy", async () => {
    photosApiMock.bffListTripPhotos.mockResolvedValueOnce({
      results: [],
      nextCursor: null,
      previousCursor: null,
    });

    render(<PhotosTab />);
    await screen.findByText("No photos yet.");

    const input = document.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Photos file input was not rendered.");
    }

    fireEvent.change(input, {
      target: {
        files: [new File(["heic"], "memory.heic", { type: "image/heic" })],
      },
    });

    expect(
      await screen.findByText(
        "HEIC photos are not supported yet. Convert them to JPEG, PNG, or WebP and try again.",
      ),
    ).toBeInTheDocument();
    expect(photosApiMock.bffUploadTripPhotos).not.toHaveBeenCalled();
  });

  it("deletes a removable photo after confirmation", async () => {
    photosApiMock.bffListTripPhotos.mockResolvedValueOnce({
      results: [PHOTO],
      nextCursor: null,
      previousCursor: null,
    });
    photosApiMock.bffDeleteTripPhoto.mockResolvedValueOnce(undefined);

    render(<PhotosTab />);

    fireEvent.click(await screen.findByRole("button", { name: "Delete photo uploaded by Minh" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete photo" }));

    await waitFor(() => {
      expect(photosApiMock.bffDeleteTripPhoto).toHaveBeenCalledWith("trip_1", "photo_1");
    });
    await waitFor(() => {
      expect(screen.queryByAltText("Photo uploaded by Minh")).not.toBeInTheDocument();
    });
  });
});
