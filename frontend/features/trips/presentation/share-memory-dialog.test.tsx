import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TripMemoryVideo } from "@/features/trips/domain/memory-types";

const memoriesApiMock = vi.hoisted(() => ({
  bffDisableTripMemoryShareLink: vi.fn(),
  bffEnableTripMemoryShareLink: vi.fn(),
}));

vi.mock("@/features/trips/infrastructure/memories-api", () => memoriesApiMock);

import { ShareMemoryDialog } from "@/features/trips/presentation/share-memory-dialog";

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

describe("ShareMemoryDialog", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("requires confirmation before enabling a public link", async () => {
    memoriesApiMock.bffEnableTripMemoryShareLink.mockResolvedValue({
      enabled: true,
      url: "https://goplan.test/m/share-1",
    });

    render(
      <ShareMemoryDialog
        tripId="trip_1"
        memory={MEMORY}
        onClose={() => {}}
        onShareChanged={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Enable public link" }));
    expect(memoriesApiMock.bffEnableTripMemoryShareLink).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirm enable" }));

    await waitFor(() => {
      expect(memoriesApiMock.bffEnableTripMemoryShareLink).toHaveBeenCalledWith(
        "trip_1",
        "memory_1",
      );
    });
  });

  it("copies and disables an enabled share link", async () => {
    memoriesApiMock.bffDisableTripMemoryShareLink.mockResolvedValue({
      enabled: false,
      url: null,
    });
    const onShareChanged = vi.fn();

    render(
      <ShareMemoryDialog
        tripId="trip_1"
        memory={{
          ...MEMORY,
          share: { enabled: true, url: "https://goplan.test/m/share-1" },
        }}
        onClose={() => {}}
        onShareChanged={onShareChanged}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "https://goplan.test/m/share-1",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Disable link" }));

    await waitFor(() => {
      expect(memoriesApiMock.bffDisableTripMemoryShareLink).toHaveBeenCalledWith(
        "trip_1",
        "memory_1",
      );
      expect(onShareChanged).toHaveBeenCalledWith({ enabled: false, url: null });
    });
  });
});
