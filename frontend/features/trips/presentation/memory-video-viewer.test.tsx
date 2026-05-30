import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { TripMemoryVideo } from "@/features/trips/domain/memory-types";
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
  it("renders an authenticated BFF video src for ready memories", () => {
    render(<MemoryVideoViewer tripId="trip 1" memory={READY_MEMORY} onClose={() => {}} />);

    const video = screen.getByLabelText("Da Nang recap video");
    expect(video).toHaveAttribute(
      "src",
      "/api/trips/trip%201/memories/memory%201/video",
    );
  });

  it("shows the download link only when the memory can be downloaded", () => {
    const { rerender } = render(
      <MemoryVideoViewer tripId="trip 1" memory={READY_MEMORY} onClose={() => {}} />,
    );

    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute(
      "href",
      "/api/trips/trip%201/memories/memory%201/download",
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
