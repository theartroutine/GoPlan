"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { toast } from "sonner";

import { useUpdateAvatar } from "@/features/account/application/use-update-avatar";
import { renderCroppedImageToWebP } from "@/shared/lib/image";
import {
  IMAGE_INPUT_ACCEPT,
  preprocessImageFile,
} from "@/shared/lib/image-preprocess";
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
// The preprocessed source only feeds the cropper locally (never uploaded);
// these bounds keep huge camera photos workable in memory.
const AVATAR_SOURCE_TARGET = { maxEdgePx: 2048, maxBytes: 10 * 1024 * 1024 };

export function AvatarEditDialog({ open, onOpenChange }: Props) {
  const { upload, uploading, error } = useUpdateAvatar();
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  // Render+upload spans an async gap before `uploading` flips on; this ref
  // blocks re-entry during that window so a double-click can't fire two encodes.
  const submittingRef = useRef(false);
  // Bumped on dialog close and on every new pick; an in-flight preprocess
  // whose token no longer matches must not commit state (stale-image guard).
  const pickTokenRef = useRef(0);

  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [fileUrl]);

  const handleFile = useCallback(async (file: File) => {
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    setFileUrl(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setLocalError(null);
    setProcessing(true);

    const token = ++pickTokenRef.current;
    try {
      const result = await preprocessImageFile(file, AVATAR_SOURCE_TARGET);
      if (pickTokenRef.current !== token) return; // dialog closed or pick superseded
      if (!result.ok) {
        setLocalError(
          result.code === "UNSUPPORTED"
            ? "Selected file must be a JPEG, PNG, WebP, or HEIC image."
            : "Could not read this photo. Convert it to JPEG and try again.",
        );
        return;
      }
      setFileUrl(URL.createObjectURL(result.file));
    } finally {
      setProcessing(false);
    }
  }, [fileUrl]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        pickTokenRef.current += 1; // invalidate any in-flight preprocess
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
    if (submittingRef.current) return;
    submittingRef.current = true;
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
    } finally {
      submittingRef.current = false;
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Change avatar</DialogTitle>
          <DialogDescription className="sr-only">
            Choose a JPEG, PNG, WebP, or HEIC image, then crop it into a square avatar.
          </DialogDescription>
        </DialogHeader>

        {!fileUrl ? (
          <>
            <label className="flex h-40 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border text-sm text-muted-foreground hover:border-primary">
              {processing ? "Optimizing image…" : "Click to choose an image"}
              <input
                type="file"
                accept={IMAGE_INPUT_ACCEPT}
                className="hidden"
                disabled={processing}
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
