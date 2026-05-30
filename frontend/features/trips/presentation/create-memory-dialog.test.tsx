import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TripMemoryVideo } from "@/features/trips/domain/memory-types";
import type { TripPhoto } from "@/features/trips/domain/photo-types";

const memoriesApiMock = vi.hoisted(() => ({
  bffCreateTripMemory: vi.fn(),
  bffListMemoryMusicTracks: vi.fn(),
}));

const photosApiMock = vi.hoisted(() => ({
  bffListTripPhotos: vi.fn(),
}));

vi.mock("@/features/trips/infrastructure/memories-api", () => memoriesApiMock);
vi.mock("@/features/trips/infrastructure/photos-api", () => photosApiMock);

import { CreateMemoryDialog } from "@/features/trips/presentation/create-memory-dialog";

function photo(id: string): TripPhoto {
  return {
    id,
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
}

const CREATED_MEMORY: TripMemoryVideo = {
  id: "memory_1",
  trip_id: "trip_1",
  title: "Da Nang recap",
  status: "queued",
  source_mode: "manual",
  source_photo_count: 5,
  music: { key: "sunrise-road", title: "Sunrise Road", artist: "GoPlan" },
  duration_seconds: null,
  created_by: { id: "user_1", display_name: "Minh" },
  can_manage: true,
  can_download: false,
  render_error: null,
  share: { enabled: false, url: null },
  created_at: "2026-05-24T01:00:00Z",
  updated_at: "2026-05-24T01:01:00Z",
};

function renderDialog(onCreated = vi.fn()) {
  return render(
    <CreateMemoryDialog
      tripId="trip_1"
      open
      onOpenChange={() => {}}
      onCreated={onCreated}
    />,
  );
}

describe("CreateMemoryDialog", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    photosApiMock.bffListTripPhotos.mockResolvedValue({
      results: Array.from({ length: 6 }, (_, index) => photo(`photo_${index + 1}`)),
      nextCursor: null,
      previousCursor: null,
    });
    memoriesApiMock.bffListMemoryMusicTracks.mockResolvedValue([
      {
        key: "sunrise-road",
        title: "Sunrise Road",
        artist: "GoPlan",
        enabled: true,
      },
    ]);
  });

  it("requires 5 to 50 selected photos in manual mode", async () => {
    renderDialog();

    await screen.findByRole("checkbox", { name: /photo_1/i });
    fireEvent.click(screen.getByRole("button", { name: "Create memory" }));

    expect(
      await screen.findByText("Select between 5 and 50 photos."),
    ).toBeInTheDocument();
    expect(memoriesApiMock.bffCreateTripMemory).not.toHaveBeenCalled();
  });

  it("submits auto mode without photo ids", async () => {
    memoriesApiMock.bffCreateTripMemory.mockResolvedValue({
      ...CREATED_MEMORY,
      source_mode: "auto",
      source_photo_count: 0,
    });
    const onCreated = vi.fn();
    renderDialog(onCreated);

    fireEvent.click(screen.getByRole("button", { name: "Auto" }));
    fireEvent.click(screen.getByRole("button", { name: "Create memory" }));

    await waitFor(() => {
      expect(memoriesApiMock.bffCreateTripMemory).toHaveBeenCalledWith("trip_1", {
        source_mode: "auto",
        title: "",
      });
      expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ source_mode: "auto" }));
      expect(memoriesApiMock.bffListMemoryMusicTracks).not.toHaveBeenCalled();
    });
  });

  it("does not show a user-facing music picker", () => {
    renderDialog();

    expect(screen.queryByText("Music")).not.toBeInTheDocument();
    expect(memoriesApiMock.bffListMemoryMusicTracks).not.toHaveBeenCalled();
  });

  it("loads later photo pages and can submit selected photos from them", async () => {
    photosApiMock.bffListTripPhotos
      .mockResolvedValueOnce({
        results: Array.from({ length: 4 }, (_, index) => photo(`photo_${index + 1}`)),
        nextCursor: "photo_cursor_2",
        previousCursor: null,
      })
      .mockResolvedValueOnce({
        results: [photo("photo_5"), photo("photo_6")],
        nextCursor: null,
        previousCursor: null,
      });
    memoriesApiMock.bffCreateTripMemory.mockResolvedValue(CREATED_MEMORY);
    renderDialog();

    expect(await screen.findByRole("checkbox", { name: /photo_1/i }))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more photos" }));

    expect(await screen.findByRole("checkbox", { name: /photo_5/i }))
      .toBeInTheDocument();
    for (const id of ["photo_1", "photo_2", "photo_3", "photo_4", "photo_5"]) {
      fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(id, "i") }));
    }
    fireEvent.click(screen.getByRole("button", { name: "Create memory" }));

    await waitFor(() => {
      expect(photosApiMock.bffListTripPhotos).toHaveBeenLastCalledWith("trip_1", {
        cursor: "photo_cursor_2",
        pageSize: 50,
        signal: undefined,
      });
      expect(memoriesApiMock.bffCreateTripMemory).toHaveBeenCalledWith("trip_1", {
        source_mode: "manual",
        photo_ids: ["photo_1", "photo_2", "photo_3", "photo_4", "photo_5"],
        title: "",
      });
    });
  });

  it("keeps the dialog open and maps create errors", async () => {
    memoriesApiMock.bffCreateTripMemory.mockRejectedValue({
      response: {
        data: {
          error_code: "MEMORY_INVALID_MUSIC",
          detail: "Bad music",
        },
      },
    });
    renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Auto" }));
    fireEvent.click(screen.getByRole("button", { name: "Create memory" }));

    expect(
      await screen.findByText("Selected music track is not available."),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Create memory" })).toBeInTheDocument();
  });
});
