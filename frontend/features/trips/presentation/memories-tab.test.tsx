import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TripMemoryVideo } from "@/features/trips/domain/memory-types";

const memoriesApiMock = vi.hoisted(() => ({
  bffCreateTripMemory: vi.fn(),
  bffDeleteTripMemory: vi.fn(),
  bffFetchTripMemoryAssetBlob: vi.fn(),
  bffGetTripMemoryCreateOptions: vi.fn(),
  bffListTripMemories: vi.fn(),
  bffListTripMemoryStatuses: vi.fn(),
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
    let objectUrlIndex = 0;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => {
        objectUrlIndex += 1;
        return `blob:trip-memory-${objectUrlIndex}`;
      }),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    memoriesApiMock.bffFetchTripMemoryAssetBlob.mockResolvedValue(
      new Blob(["poster"], { type: "image/webp" }),
    );
    memoriesApiMock.bffGetTripMemoryCreateOptions.mockResolvedValue({
      photo_limits: {
        min: 5,
        max: 50,
        auto_pick: 20,
      },
    });
    photosApiMock.bffListTripPhotos.mockResolvedValue({
      results: [],
      nextCursor: null,
      previousCursor: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
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

  it("opens the viewer from a ready memory preview", async () => {
    memoriesApiMock.bffListTripMemories.mockResolvedValueOnce({
      results: [memory()],
      nextCursor: null,
      previousCursor: null,
    });

    render(<MemoriesTab />);

    const previewImage = await screen.findByRole("img", { name: "Da Nang recap preview" });
    expect(previewImage).toHaveAttribute("src", "blob:trip-memory-1");
    expect(memoriesApiMock.bffFetchTripMemoryAssetBlob).toHaveBeenCalledWith(
      "trip_1",
      "memory_1",
      "poster",
      { signal: expect.any(AbortSignal) },
    );
    expect(screen.queryByRole("button", { name: "Play memory" })).not.toBeInTheDocument();

    fireEvent.error(previewImage);
    const readyCard = screen.getByTestId("memory-card-memory_1");
    expect(readyCard.querySelector("video")).toBeNull();
    expect(within(readyCard).queryByText("Ready")).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Play Da Nang recap" }));

    const viewerVideo = await screen.findByLabelText("Da Nang recap video");
    expect(viewerVideo).toHaveAttribute(
      "src",
      "/api/trips/trip_1/memories/memory_1/video",
    );
    expect(memoriesApiMock.bffFetchTripMemoryAssetBlob).not.toHaveBeenCalledWith(
      "trip_1",
      "memory_1",
      "video",
      expect.anything(),
    );
    expect(screen.getByRole("button", { name: "Close viewer" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close dialog" })).not.toBeInTheDocument();
  });

  it("renders queued, rendering, and failed states", async () => {
    memoriesApiMock.bffListTripMemories.mockResolvedValueOnce({
      results: [
        memory({ id: "queued_1", status: "queued", title: "Queued memory" }),
        memory({ id: "rendering_1", status: "rendering", title: "Rendering memory" }),
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

    expect(await screen.findByText("Queued memory")).toBeInTheDocument();
    expect(screen.getByText("Rendering memory")).toBeInTheDocument();
    const queuedCard = screen.getByTestId("memory-card-queued_1");
    const renderingCard = screen.getByTestId("memory-card-rendering_1");
    expect(queuedCard).toHaveClass("memory-progress-border");
    expect(renderingCard).toHaveClass("memory-progress-border");
    expect(within(queuedCard).getByText("Queued")).toBeInTheDocument();
    expect(within(renderingCard).getByText("Rendering…")).toBeInTheDocument();
    expect(screen.getByTestId("memory-card-failed_1")).not.toHaveClass("memory-progress-border");
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Render failed")).toBeInTheDocument();
    expect(screen.getByText("A source photo file is missing.")).toBeInTheDocument();
  });

  it("polls while memories are queued or rendering and stops after terminal results", async () => {
    vi.useFakeTimers();
    memoriesApiMock.bffListTripMemories.mockResolvedValueOnce({
      results: [memory({ status: "queued" })],
      nextCursor: null,
      previousCursor: null,
    });
    memoriesApiMock.bffListTripMemoryStatuses
      .mockResolvedValueOnce({
        results: [memory({ status: "rendering", updated_at: "2026-05-24T01:02:00Z" })],
      })
      .mockResolvedValueOnce({
        results: [memory({ status: "ready", updated_at: "2026-05-24T01:03:00Z" })],
      });

    render(<MemoriesTab />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId("memory-card-memory_1")).toHaveAttribute("aria-busy", "true");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(memoriesApiMock.bffListTripMemories).toHaveBeenCalledTimes(1);
    expect(memoriesApiMock.bffListTripMemoryStatuses).toHaveBeenCalledWith(
      "trip_1",
      ["memory_1"],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.getByTestId("memory-card-memory_1")).toHaveAttribute("aria-busy", "true");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(memoriesApiMock.bffListTripMemories).toHaveBeenCalledTimes(1);
    expect(memoriesApiMock.bffListTripMemoryStatuses).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("memory-card-memory_1")).not.toHaveAttribute("aria-busy");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(memoriesApiMock.bffListTripMemoryStatuses).toHaveBeenCalledTimes(2);
  });

  it("does not recreate the polling interval on every in-progress update", async () => {
    vi.useFakeTimers();
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    memoriesApiMock.bffListTripMemories.mockResolvedValueOnce({
      results: [memory({ status: "queued" })],
      nextCursor: null,
      previousCursor: null,
    });
    memoriesApiMock.bffListTripMemoryStatuses.mockResolvedValueOnce({
      results: [memory({ status: "rendering", updated_at: "2026-05-24T01:02:00Z" })],
    });

    render(<MemoriesTab />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(memoriesApiMock.bffListTripMemories).toHaveBeenCalledTimes(1);
    expect(memoriesApiMock.bffListTripMemoryStatuses).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
  });

  it("backs off and eventually stops polling a stuck in-progress memory", async () => {
    vi.useFakeTimers();
    memoriesApiMock.bffListTripMemories.mockResolvedValueOnce({
      results: [memory({ status: "rendering" })],
      nextCursor: null,
      previousCursor: null,
    });
    memoriesApiMock.bffListTripMemoryStatuses.mockResolvedValue({
      results: [memory({ status: "rendering" })],
    });

    render(<MemoriesTab />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId("memory-card-memory_1")).toHaveAttribute("aria-busy", "true");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    const callsAtBackoffStart = memoriesApiMock.bffListTripMemoryStatuses.mock.calls.length;
    expect(callsAtBackoffStart).toBeGreaterThan(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });
    expect(memoriesApiMock.bffListTripMemoryStatuses).toHaveBeenCalledTimes(
      callsAtBackoffStart,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    const callsAfterBackoffTick = memoriesApiMock.bffListTripMemoryStatuses.mock.calls.length;
    expect(callsAfterBackoffTick).toBe(callsAtBackoffStart + 1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20 * 60_000);
    });
    const callsAfterStopWindow = memoriesApiMock.bffListTripMemoryStatuses.mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 60_000);
    });
    expect(memoriesApiMock.bffListTripMemoryStatuses).toHaveBeenCalledTimes(
      callsAfterStopWindow,
    );
  });

  it("keeps visible memories when silent status polling fails", async () => {
    vi.useFakeTimers();
    memoriesApiMock.bffListTripMemories.mockResolvedValueOnce({
      results: [memory({ status: "rendering" })],
      nextCursor: null,
      previousCursor: null,
    });
    memoriesApiMock.bffListTripMemoryStatuses.mockRejectedValueOnce(new Error("rate limit"));

    render(<MemoriesTab />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("Da Nang recap")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(screen.getByText("Da Nang recap")).toBeInTheDocument();
    expect(screen.queryByText("Could not load trip memories.")).not.toBeInTheDocument();
    expect(screen.queryByText("No memories yet.")).not.toBeInTheDocument();
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
        memory({ id: "queued_1", status: "queued", title: "Queued memory" }),
        memory({ id: "rendering_1", status: "rendering", title: "Rendering memory" }),
      ],
      nextCursor: null,
      previousCursor: null,
    });

    render(<MemoriesTab />);

    const queuedCard = await screen.findByTestId("memory-card-queued_1");
    const renderingCard = screen.getByTestId("memory-card-rendering_1");

    expect(within(queuedCard).queryByRole("button", { name: "Memory actions" }))
      .not.toBeInTheDocument();
    expect(within(renderingCard).queryByRole("button", { name: "Memory actions" }))
      .not.toBeInTheDocument();
  });
});
