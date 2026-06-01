import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { TripMemoryVideo } from "@/features/trips/domain/memory-types";

const memoriesApiMock = vi.hoisted(() => ({
  bffFetchTripMemoryAssetBlob: vi.fn(),
}));

vi.mock("@/features/trips/infrastructure/memories-api", () => memoriesApiMock);

import { MemoryVideoCard } from "@/features/trips/presentation/memory-video-card";

// Radix DropdownMenu needs these in jsdom to open.
beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

function memory(overrides: Partial<TripMemoryVideo> = {}): TripMemoryVideo {
  return {
    id: "memory_1",
    trip_id: "trip_1",
    title: "Da Nang recap",
    status: "ready",
    source_mode: "manual",
    source_photo_count: 12,
    duration_seconds: 95,
    music: { key: "sunrise", title: "Sunrise Road", artist: "GoPlan", license: "CC-BY" },
    can_manage: true,
    can_download: true,
    share: { enabled: false, url: null },
    render_error: null,
    updated_at: "2026-05-24T01:00:00Z",
    created_at: "2026-05-24T00:00:00Z",
    ...overrides,
  } as TripMemoryVideo;
}

function openMenu() {
  const trigger = screen.getByRole("button", { name: "Memory actions" });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.pointerUp(trigger, { button: 0, pointerType: "mouse" });
  fireEvent.click(trigger);
}

describe("MemoryVideoCard", () => {
  beforeEach(() => {
    let index = 0;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => `blob:poster-${(index += 1)}`),
    });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    memoriesApiMock.bffFetchTripMemoryAssetBlob.mockResolvedValue(
      new Blob(["poster"], { type: "image/webp" }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the play target and a duration badge for a ready memory", () => {
    render(
      <MemoryVideoCard memory={memory()} onDelete={vi.fn()} onPlay={vi.fn()} onShare={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Play Da Nang recap" })).toBeInTheDocument();
    expect(screen.getByText("1:35")).toBeInTheDocument();
    expect(screen.getByText("12 photos")).toBeInTheDocument();
  });

  it("plays when the poster is clicked", () => {
    const onPlay = vi.fn();
    render(
      <MemoryVideoCard memory={memory()} onDelete={vi.fn()} onPlay={onPlay} onShare={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Play Da Nang recap" }));
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it("exposes share, download, and delete in the actions menu for a manageable ready memory", () => {
    const onShare = vi.fn();
    const onDelete = vi.fn();
    render(
      <MemoryVideoCard memory={memory()} onDelete={onDelete} onPlay={vi.fn()} onShare={onShare} />,
    );
    openMenu();
    const menu = screen.getByRole("menu");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Share" }));
    expect(onShare).toHaveBeenCalledTimes(1);

    openMenu();
    expect(
      within(screen.getByRole("menu")).getByRole("menuitem", { name: "Download" }),
    ).toHaveAttribute("href", "/api/trips/trip_1/memories/memory_1/download");

    openMenu();
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Delete memory" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("does not render an actions menu while queued or rendering", () => {
    render(
      <MemoryVideoCard
        memory={memory({ status: "queued" })}
        onDelete={vi.fn()}
        onPlay={vi.fn()}
        onShare={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Memory actions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Play/ })).not.toBeInTheDocument();
  });

  it("shows the failed badge and error, and offers only delete in the menu", () => {
    render(
      <MemoryVideoCard
        memory={memory({
          status: "failed",
          can_download: false,
          render_error: { code: "MEMORY_SOURCE_UNAVAILABLE", message: "A source photo file is missing." },
        })}
        onDelete={vi.fn()}
        onPlay={vi.fn()}
        onShare={vi.fn()}
      />,
    );
    expect(screen.getByText("Render failed")).toBeInTheDocument();
    expect(screen.getByText("A source photo file is missing.")).toBeInTheDocument();
    openMenu();
    const menu = screen.getByRole("menu");
    expect(within(menu).queryByRole("menuitem", { name: "Share" })).not.toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: "Download" })).not.toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Delete memory" })).toBeInTheDocument();
  });
});
