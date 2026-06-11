"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";

import {
  bffUploadTripCover,
  extractBffErrorDetail,
} from "@/features/trips/infrastructure/trips-api";
import {
  IMAGE_INPUT_ACCEPT,
  preprocessImageFile,
} from "@/shared/lib/image-preprocess";
import { TripCoverImage } from "@/features/trips/presentation/trip-cover-image";
import { Button } from "@/shared/ui/button";

// Mirrors backend TRIP_COVER_MAX_EDGE / TRIP_COVER_MAX_BYTES.
const COVER_PREPROCESS_TARGET = { maxEdgePx: 2560, maxBytes: 10 * 1024 * 1024 };

type Props = {
  /** URL shown in the preview. Empty string falls back to app default placeholder. */
  coverUrl: string;
  /** Called with the new permanent /media/... URL after the user uploads a custom image. */
  onChange: (url: string) => void;
};

export function CoverImagePicker({ coverUrl, onChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setUploading(true);
    try {
      const result = await preprocessImageFile(file, COVER_PREPROCESS_TARGET);
      if (!result.ok) {
        setUploadError(
          result.code === "UNSUPPORTED"
            ? "Use a JPEG, PNG, WebP, or HEIC image."
            : "Could not read this photo. Convert it to JPEG and try again.",
        );
        return;
      }
      const url = await bffUploadTripCover(result.file);
      onChange(url);
    } catch (error) {
      setUploadError(
        extractBffErrorDetail(
          error,
          "Failed to upload. Try a different image (JPEG, PNG, WebP, or HEIC).",
        ),
      );
    } finally {
      setUploading(false);
      // Reset so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative w-full aspect-[16/7] rounded-md overflow-hidden bg-muted">
        <TripCoverImage
          coverUrl={coverUrl}
          alt="Trip cover preview"
          fill
          loading="eager"
          fetchPriority="high"
          className="object-cover"
          unoptimized
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="gap-1.5"
        >
          <Upload className="h-3.5 w-3.5" />
          {uploading ? "Uploading…" : "Change cover image"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept={IMAGE_INPUT_ACCEPT}
          className="hidden"
          onChange={handleFileChange}
        />
        {uploadError && (
          <p className="text-xs text-destructive">{uploadError}</p>
        )}
      </div>
    </div>
  );
}
