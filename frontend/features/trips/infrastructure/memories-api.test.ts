import { beforeEach, describe, expect, it, vi } from "vitest";

const bffMock = vi.hoisted(() => ({
  delete: vi.fn(),
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
}));

vi.mock("@/shared/http/bff-client", () => ({
  bff: bffMock,
}));

import type { TripMemoryVideo } from "@/features/trips/domain/memory-types";
import {
  bffCreateTripMemory,
  bffDeleteTripMemory,
  bffDisableTripMemoryShareLink,
  bffEnableTripMemoryShareLink,
  bffListMemoryMusicTracks,
  bffListTripMemories,
  bffUpdateTripMemory,
} from "@/features/trips/infrastructure/memories-api";

const MEMORY: TripMemoryVideo = {
  id: "memory_1",
  trip_id: "trip_1",
  title: "Da Nang recap",
  status: "ready",
  source_mode: "manual",
  source_photo_count: 8,
  music: { key: "sunrise-road", title: "Sunrise Road", artist: "GoPlan" },
  duration_seconds: 32,
  created_by: { id: "user_1", display_name: "Minh" },
  can_manage: true,
  can_download: true,
  render_error: null,
  share: { enabled: false, url: null },
  created_at: "2026-05-24T01:00:00Z",
  updated_at: "2026-05-24T01:01:00Z",
};

describe("memories-api", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("lists trip memories through encoded BFF path and extracts cursors", async () => {
    const signal = new AbortController().signal;
    bffMock.get.mockResolvedValue({
      data: {
        next: "https://api.example.com/api/trips/trip%201/memories?cursor=next-page",
        previous: "https://api.example.com/api/trips/trip%201/memories?cursor=prev-page",
        results: [MEMORY],
      },
    });

    await expect(
      bffListTripMemories("trip 1", {
        cursor: "current-page",
        pageSize: 20,
        signal,
      }),
    ).resolves.toEqual({
      nextCursor: "next-page",
      previousCursor: "prev-page",
      results: [MEMORY],
    });

    expect(bffMock.get).toHaveBeenCalledWith("/api/trips/trip%201/memories", {
      params: { cursor: "current-page", page_size: 20 },
      signal,
    });
  });

  it("creates, updates, and deletes memories through encoded BFF routes", async () => {
    bffMock.post.mockResolvedValueOnce({ data: { memory: MEMORY } });
    bffMock.patch.mockResolvedValueOnce({ data: { memory: { ...MEMORY, title: "Updated" } } });
    bffMock.delete.mockResolvedValueOnce({ data: null });

    await expect(
      bffCreateTripMemory("trip/1", {
        source_mode: "manual",
        photo_ids: ["photo_1", "photo_2"],
        title: "Da Nang recap",
      }),
    ).resolves.toBe(MEMORY);
    await expect(
      bffUpdateTripMemory("trip/1", "memory/1", { title: "Updated" }),
    ).resolves.toMatchObject({ title: "Updated" });
    await expect(bffDeleteTripMemory("trip/1", "memory/1")).resolves.toBeUndefined();

    expect(bffMock.post).toHaveBeenCalledWith("/api/trips/trip%2F1/memories", {
      source_mode: "manual",
      photo_ids: ["photo_1", "photo_2"],
      title: "Da Nang recap",
    });
    expect(bffMock.patch).toHaveBeenCalledWith(
      "/api/trips/trip%2F1/memories/memory%2F1",
      { title: "Updated" },
    );
    expect(bffMock.delete).toHaveBeenCalledWith(
      "/api/trips/trip%2F1/memories/memory%2F1",
    );
  });

  it("enables and disables share links and lists music tracks", async () => {
    const share = { enabled: true, url: "https://goplan.test/memories/share-1" };
    const tracks = [{ key: "track_1", title: "Road", artist: "GoPlan", enabled: true }];
    bffMock.post.mockResolvedValueOnce({ data: { share } });
    bffMock.delete.mockResolvedValueOnce({ data: { share: { enabled: false, url: null } } });
    bffMock.get.mockResolvedValueOnce({ data: { tracks } });

    await expect(bffEnableTripMemoryShareLink("trip 1", "memory 1")).resolves.toBe(share);
    await expect(bffDisableTripMemoryShareLink("trip 1", "memory 1")).resolves.toEqual({
      enabled: false,
      url: null,
    });
    await expect(bffListMemoryMusicTracks("trip 1")).resolves.toEqual(tracks);

    expect(bffMock.post).toHaveBeenCalledWith(
      "/api/trips/trip%201/memories/memory%201/share-link",
    );
    expect(bffMock.delete).toHaveBeenCalledWith(
      "/api/trips/trip%201/memories/memory%201/share-link",
    );
    expect(bffMock.get).toHaveBeenCalledWith(
      "/api/trips/trip%201/memories/music-tracks",
    );
  });
});
