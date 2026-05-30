"use client";

import type { MemoryMusicTrack } from "@/features/trips/domain/memory-types";

type MusicTrackPickerProps = {
  disabled?: boolean;
  loading: boolean;
  selectedKey: string;
  tracks: MemoryMusicTrack[];
  onSelect: (key: string) => void;
};

export const SILENT_MUSIC_KEY = "silent-placeholder";

export function MusicTrackPicker({
  disabled = false,
  loading,
  selectedKey,
  tracks,
  onSelect,
}: MusicTrackPickerProps) {
  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading music…</p>;
  }

  if (tracks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        No music available.
      </p>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {tracks.map((track) => (
        <button
          key={track.key}
          type="button"
          disabled={disabled || !track.enabled}
          aria-pressed={selectedKey === track.key}
          onClick={() => onSelect(track.key)}
          className="rounded-md border px-3 py-2 text-left text-sm transition-colors aria-pressed:border-primary aria-pressed:bg-primary/5 disabled:opacity-50"
        >
          <span className="block font-medium">{track.title}</span>
          <span className="block text-xs text-muted-foreground">{track.artist}</span>
          {track.license ? (
            <span className="block text-xs text-muted-foreground">{track.license}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
