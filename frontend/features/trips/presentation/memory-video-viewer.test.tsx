import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TripMemoryVideo } from "@/features/trips/domain/memory-types";

const memoriesApiMock = vi.hoisted(() => ({
  bffFetchTripMemoryAssetBlob: vi.fn(),
}));

vi.mock("@/features/trips/infrastructure/memories-api", () => memoriesApiMock);

import { MemoryVideoViewer } from "@/features/trips/presentation/memory-video-viewer";

const READY_MEMORY: TripMemoryVideo = {
  id: "memory 1",
  trip_id: "trip 1",
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

describe("MemoryVideoViewer", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn((blob: Blob) =>
        blob.type === "image/webp" ? "blob:memory-poster" : "blob:memory-video",
      ),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    memoriesApiMock.bffFetchTripMemoryAssetBlob.mockImplementation(
      async (_tripId: string, _memoryId: string, variant: "poster" | "video") =>
        new Blob([variant], {
          type: variant === "poster" ? "image/webp" : "video/mp4",
        }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders authenticated BFF blob assets for ready memories", async () => {
    render(<MemoryVideoViewer tripId="trip 1" memory={READY_MEMORY} onClose={() => {}} />);

    const video = await screen.findByLabelText("Da Nang recap video");
    expect(video).toHaveAttribute("src", "blob:memory-video");
    expect(video).toHaveAttribute("poster", "blob:memory-poster");
    expect(memoriesApiMock.bffFetchTripMemoryAssetBlob).toHaveBeenCalledWith(
      "trip 1",
      "memory 1",
      "poster",
      { signal: expect.any(AbortSignal), timeoutMs: undefined },
    );
    expect(memoriesApiMock.bffFetchTripMemoryAssetBlob).toHaveBeenCalledWith(
      "trip 1",
      "memory 1",
      "video",
      { signal: expect.any(AbortSignal), timeoutMs: 60000 },
    );
  });

  it("shows the download link only when the memory can be downloaded", async () => {
    const { rerender } = render(
      <MemoryVideoViewer tripId="trip 1" memory={READY_MEMORY} onClose={() => {}} />,
    );

    expect(await screen.findByLabelText("Da Nang recap video")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute(
      "href",
      "blob:memory-video",
    );
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute(
      "download",
      "da-nang-recap.mp4",
    );

    rerender(
      <MemoryVideoViewer
        tripId="trip 1"
        memory={{ ...READY_MEMORY, can_download: false }}
        onClose={() => {}}
      />,
    );

    expect(screen.queryByRole("link", { name: "Download" })).not.toBeInTheDocument();
  });

  it("does not render a video tag for non-ready memories", () => {
    render(
      <MemoryVideoViewer
        tripId="trip 1"
        memory={{ ...READY_MEMORY, status: "rendering", can_download: false }}
        onClose={() => {}}
      />,
    );

    expect(screen.queryByLabelText("Da Nang recap video")).not.toBeInTheDocument();
    expect(screen.getByText("Video is not ready yet.")).toBeInTheDocument();
  });
});
