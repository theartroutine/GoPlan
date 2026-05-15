"use client";

import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { toast } from "sonner";

import { useUpdateAvatar } from "@/features/account/application/use-update-avatar";
import {
  loadImageElement,
  renderCroppedImageToWebP,
} from "@/shared/lib/image";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const TARGET_PX = 512;
const MAX_SOURCE_DIMENSION_PX = 1024;
const ALLOWED_SOURCE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function AvatarEditDialog({ open, onOpenChange }: Props) {
  const { upload, uploading, error } = useUpdateAvatar();
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    setFileUrl(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setLocalError(null);

    if (file.type && !ALLOWED_SOURCE_TYPES.has(file.type)) {
      setLocalError("Selected file must be a JPEG, PNG, or WebP image.");
      return;
    }

    const nextFileUrl = URL.createObjectURL(file);
    try {
      const image = await loadImageElement(nextFileUrl);
      if (
        image.naturalWidth > MAX_SOURCE_DIMENSION_PX ||
        image.naturalHeight > MAX_SOURCE_DIMENSION_PX
      ) {
        URL.revokeObjectURL(nextFileUrl);
        setLocalError(
          `Avatar image must be at most ${MAX_SOURCE_DIMENSION_PX}x${MAX_SOURCE_DIMENSION_PX} pixels.`,
        );
        return;
      }
    } catch {
      URL.revokeObjectURL(nextFileUrl);
      setLocalError("Selected file could not be read as an image.");
      return;
    }

    setFileUrl(nextFileUrl);
  }, [fileUrl]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        if (fileUrl) URL.revokeObjectURL(fileUrl);
        setFileUrl(null);
        setCrop({ x: 0, y: 0 });
        setZoom(1);
        setCroppedAreaPixels(null);
        setLocalError(null);
      }
      onOpenChange(next);
    },
    [fileUrl, onOpenChange],
  );

  const onCropComplete = useCallback((_: Area, areaPx: Area) => {
    setCroppedAreaPixels(areaPx);
  }, []);

  async function handleSave() {
    if (!fileUrl || !croppedAreaPixels) return;
    setLocalError(null);
    try {
      const blob = await renderCroppedImageToWebP(fileUrl, croppedAreaPixels, {
        targetPx: TARGET_PX,
        quality: 0.85,
      });
      const ok = await upload(blob);
      if (ok) {
        toast.success("Avatar updated.");
        handleOpenChange(false);
      }
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : "Could not prepare avatar image.",
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Change avatar</DialogTitle>
          <DialogDescription className="sr-only">
            Choose a JPEG, PNG, or WebP image, then crop it into a square avatar.
          </DialogDescription>
        </DialogHeader>

        {!fileUrl ? (
          <>
            <label className="flex h-40 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border text-sm text-muted-foreground hover:border-primary">
              Click to choose an image
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />
            </label>
            {localError && (
              <p className="text-xs text-destructive" role="alert">
                {localError}
              </p>
            )}
          </>
        ) : (
          <>
            <div className="relative h-72 w-full overflow-hidden rounded-lg bg-muted">
              <Cropper
                image={fileUrl}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-full"
            />
            {(localError || error) && (
              <p className="text-xs text-destructive" role="alert">
                {localError ?? error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={uploading}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={uploading || !croppedAreaPixels}>
                {uploading ? "Uploading…" : "Save"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
