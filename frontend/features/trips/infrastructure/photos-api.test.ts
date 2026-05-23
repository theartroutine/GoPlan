import { beforeEach, describe, expect, it, vi } from "vitest";

const bffMock = vi.hoisted(() => ({
  delete: vi.fn(),
  get: vi.fn(),
  postForm: vi.fn(),
}));

vi.mock("@/shared/http/bff-client", () => ({
  bff: bffMock,
}));

import {
  bffDeleteTripPhoto,
  bffListTripPhotos,
  bffUploadTripPhotos,
  getTripPhotoAssetUrl,
} from "@/features/trips/infrastructure/photos-api";
import type { TripPhoto } from "@/features/trips/domain/photo-types";

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

describe("photos-api", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("lists trip photos through the BFF and extracts the next cursor", async () => {
    const signal = new AbortController().signal;
    bffMock.get.mockResolvedValue({
      data: {
        next: "https://api.example.com/api/trips/trip_1/photos?cursor=next-page",
        previous: null,
        results: [PHOTO],
      },
    });

    await expect(
      bffListTripPhotos("trip_1", { cursor: "current-page", signal }),
    ).resolves.toEqual({
      nextCursor: "next-page",
      previousCursor: null,
      results: [PHOTO],
    });

    expect(bffMock.get).toHaveBeenCalledWith("/api/trips/trip_1/photos", {
      params: { cursor: "current-page" },
      signal,
    });
  });

  it("uploads multiple photos as repeated files in multipart form data", async () => {
    const first = new File(["one"], "one.jpg", { type: "image/jpeg" });
    const second = new File(["two"], "two.webp", { type: "image/webp" });
    bffMock.postForm.mockResolvedValue({ data: { photos: [PHOTO] } });

    await expect(bffUploadTripPhotos("trip_1", [first, second])).resolves.toEqual([PHOTO]);

    expect(bffMock.postForm).toHaveBeenCalledWith(
      "/api/trips/trip_1/photos",
      expect.any(FormData),
    );
    const form = bffMock.postForm.mock.calls[0][1] as FormData;
    expect(form.getAll("files")).toEqual([first, second]);
  });

  it("deletes a trip photo through the BFF detail route", async () => {
    bffMock.delete.mockResolvedValue({ data: null });

    await expect(bffDeleteTripPhoto("trip_1", "photo_1")).resolves.toBeUndefined();

    expect(bffMock.delete).toHaveBeenCalledWith("/api/trips/trip_1/photos/photo_1");
  });

  it("builds protected BFF asset URLs for thumbnails and medium images", () => {
    expect(getTripPhotoAssetUrl("trip_1", "photo_1", "thumbnail")).toBe(
      "/api/trips/trip_1/photos/photo_1/thumbnail",
    );
    expect(getTripPhotoAssetUrl("trip 1", "photo/1", "medium")).toBe(
      "/api/trips/trip%201/photos/photo%2F1/medium",
    );
  });
});
