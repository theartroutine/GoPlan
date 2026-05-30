import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TripMemoryVideo } from "@/features/trips/domain/memory-types";

const memoriesApiMock = vi.hoisted(() => ({
  bffCreateTripMemory: vi.fn(),
  bffDeleteTripMemory: vi.fn(),
  bffListMemoryMusicTracks: vi.fn(),
  bffListTripMemories: vi.fn(),
}));

const photosApiMock = vi.hoisted(() => ({
  bffListTripPhotos: vi.fn(),
}));

vi.mock("@/features/trips/infrastructure/memories-api", () => memoriesApiMock);
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

import { MemoriesTab } from "@/features/trips/presentation/memories-tab";

function memory(overrides: Partial<TripMemoryVideo> = {}): TripMemoryVideo {
  return {
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
    ...overrides,
  };
}

describe("MemoriesTab", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    memoriesApiMock.bffListMemoryMusicTracks.mockResolvedValue([
      {
        key: "sunrise-road",
        title: "Sunrise Road",
        artist: "GoPlan",
        enabled: true,
      },
    ]);
    photosApiMock.bffListTripPhotos.mockResolvedValue({
      results: [],
      nextCursor: null,
      previousCursor: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows an empty state with create memory action", async () => {
    memoriesApiMock.bffListTripMemories.mockResolvedValueOnce({
      results: [],
      nextCursor: null,
      previousCursor: null,
    });

    render(<MemoriesTab />);

    expect(await screen.findByText("No memories yet.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Create memory" }).length).toBeGreaterThan(0);
  });

  it("opens the viewer from a ready memory card", async () => {
    memoriesApiMock.bffListTripMemories.mockResolvedValueOnce({
      results: [memory()],
      nextCursor: null,
      previousCursor: null,
    });

    render(<MemoriesTab />);

    fireEvent.click(await screen.findByRole("button", { name: "Play memory" }));

    expect(screen.getByLabelText("Da Nang recap video")).toHaveAttribute(
      "src",
      "/api/trips/trip_1/memories/memory_1/video",
    );
  });

  it("renders queued, rendering, and failed states", async () => {
    memoriesApiMock.bffListTripMemories.mockResolvedValueOnce({
      results: [
        memory({ id: "queued_1", status: "queued", title: "Queued" }),
        memory({ id: "rendering_1", status: "rendering", title: "Rendering" }),
        memory({
          id: "failed_1",
          status: "failed",
          title: "Failed",
          can_download: false,
          render_error: {
            code: "MEMORY_SOURCE_UNAVAILABLE",
            message: "A source photo file is missing.",
          },
        }),
      ],
      nextCursor: null,
      previousCursor: null,
    });

    render(<MemoriesTab />);

    expect((await screen.findAllByText("Queued")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Rendering").length).toBeGreaterThan(0);
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Render failed")).toBeInTheDocument();
    expect(screen.getByText("A source photo file is missing.")).toBeInTheDocument();
  });

  it("polls while memories are queued or rendering and stops after terminal results", async () => {
    vi.useFakeTimers();
    memoriesApiMock.bffListTripMemories
      .mockResolvedValueOnce({
        results: [memory({ status: "queued" })],
        nextCursor: null,
        previousCursor: null,
      })
      .mockResolvedValueOnce({
        results: [memory({ status: "rendering" })],
        nextCursor: null,
        previousCursor: null,
      })
      .mockResolvedValueOnce({
        results: [memory({ status: "ready" })],
        nextCursor: null,
        previousCursor: null,
      });

    render(<MemoriesTab />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getAllByText("Queued").length).toBeGreaterThan(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(memoriesApiMock.bffListTripMemories).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(memoriesApiMock.bffListTripMemories).toHaveBeenCalledTimes(3);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(memoriesApiMock.bffListTripMemories).toHaveBeenCalledTimes(3);
  });

  it("inserts a created memory into the list", async () => {
    memoriesApiMock.bffListTripMemories.mockResolvedValueOnce({
      results: [],
      nextCursor: null,
      previousCursor: null,
    });
    memoriesApiMock.bffCreateTripMemory.mockResolvedValue(memory({
      id: "created_1",
      title: "Created memory",
      status: "queued",
      can_download: false,
    }));

    render(<MemoriesTab />);

    fireEvent.click(await screen.findByRole("button", { name: "Create memory" }));
    fireEvent.click(await screen.findByRole("button", { name: "Auto" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Create memory" }).at(-1)!);

    expect(await screen.findByText("Created memory")).toBeInTheDocument();
  });

  it("loads additional memory pages", async () => {
    memoriesApiMock.bffListTripMemories
      .mockResolvedValueOnce({
        results: [memory({ id: "memory_first", title: "First memory" })],
        nextCursor: "cursor_2",
        previousCursor: null,
      })
      .mockResolvedValueOnce({
        results: [memory({ id: "memory_second", title: "Older memory" })],
        nextCursor: null,
        previousCursor: null,
      });

    render(<MemoriesTab />);

    expect(await screen.findByText("First memory")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    expect(await screen.findByText("Older memory")).toBeInTheDocument();
    expect(memoriesApiMock.bffListTripMemories).toHaveBeenLastCalledWith(
      "trip_1",
      { cursor: "cursor_2" },
    );
  });

  it("does not offer delete for queued or rendering memories", async () => {
    memoriesApiMock.bffListTripMemories.mockResolvedValueOnce({
      results: [
        memory({ id: "queued_1", status: "queued", title: "Queued" }),
        memory({ id: "rendering_1", status: "rendering", title: "Rendering" }),
      ],
      nextCursor: null,
      previousCursor: null,
    });

    render(<MemoriesTab />);

    const queuedCard = await screen.findByTestId("memory-card-queued_1");
    const renderingCard = screen.getByTestId("memory-card-rendering_1");

    expect(within(queuedCard).queryByRole("button", { name: "Delete memory" }))
      .not.toBeInTheDocument();
    expect(within(renderingCard).queryByRole("button", { name: "Delete memory" }))
      .not.toBeInTheDocument();
  });
});
