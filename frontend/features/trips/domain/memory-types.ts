export type TripMemoryStatus = "queued" | "rendering" | "ready" | "failed";

export type TripMemorySourceMode = "manual" | "auto";

export type TripMemoryUser = {
  id: string | null;
  display_name: string;
};

export type MemoryMusicSummary = {
  key: string;
  title: string;
  artist: string;
  // Present for CC-BY tracks; we must show this credit to listeners.
  license?: string;
  license_url?: string;
  source_url?: string;
};

export type TripMemoryShare = {
  enabled: boolean;
  url: string | null;
};

export type TripMemoryRenderError = {
  code: string;
  message: string;
};

export type TripMemoryVideo = {
  id: string;
  trip_id: string;
  title: string;
  status: TripMemoryStatus;
  source_mode: TripMemorySourceMode;
  source_photo_count: number;
  music: MemoryMusicSummary;
  duration_seconds: number | null;
  created_by: TripMemoryUser;
  can_manage: boolean;
  can_download: boolean;
  share: TripMemoryShare;
  render_error: TripMemoryRenderError | null;
  created_at: string;
  updated_at: string;
};

export type TripMemoryListResponse = {
  next: string | null;
  previous: string | null;
  results: TripMemoryVideo[];
};

export type TripMemoryPage = {
  nextCursor: string | null;
  previousCursor: string | null;
  results: TripMemoryVideo[];
};

export type CreateTripMemoryPayload = {
  title?: string;
  source_mode: TripMemorySourceMode;
  photo_ids?: string[];
  music_key: string;
};

export type UpdateTripMemoryPayload = {
  title: string;
};

export type TripMemoryResponse = {
  memory: TripMemoryVideo;
};

export type TripMemoryShareResponse = {
  share: TripMemoryShare;
};

export type MemoryMusicTrack = {
  key: string;
  title: string;
  artist: string;
  enabled: boolean;
  license?: string;
  license_url?: string;
  source_url?: string;
};

export type MemoryMusicTracksResponse = {
  tracks: MemoryMusicTrack[];
};
