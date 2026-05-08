"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";

import { bffUploadTripCover } from "@/features/trips/infrastructure/trips-api";
import { TripCoverImage } from "@/features/trips/presentation/trip-cover-image";
import { Button } from "@/shared/ui/button";

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
      const url = await bffUploadTripCover(file);
      onChange(url);
    } catch {
      setUploadError("Failed to upload. Try a different image (JPEG/PNG/WebP, max 5 MB).");
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
          accept="image/jpeg,image/png,image/webp"
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
