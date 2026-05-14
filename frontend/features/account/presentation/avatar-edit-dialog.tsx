"use client";

import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { toast } from "sonner";

import { useUpdateAvatar } from "@/features/account/application/use-update-avatar";
import { compressImageToWebP } from "@/shared/lib/image";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const TARGET_PX = 512;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image for cropping."));
    img.src = src;
  });
}

async function renderCroppedWebp(imageSrc: string, area: Area): Promise<Blob> {
  const img = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = TARGET_PX;
  canvas.height = TARGET_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, TARGET_PX, TARGET_PX);
  return compressImageToWebP(canvas, 0.85);
}

export function AvatarEditDialog({ open, onOpenChange }: Props) {
  const { upload, uploading, error } = useUpdateAvatar();
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const handleFile = useCallback((file: File) => {
    setFileUrl(URL.createObjectURL(file));
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        if (fileUrl) URL.revokeObjectURL(fileUrl);
        setFileUrl(null);
        setCrop({ x: 0, y: 0 });
        setZoom(1);
        setCroppedAreaPixels(null);
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
    const blob = await renderCroppedWebp(fileUrl, croppedAreaPixels);
    const ok = await upload(blob);
    if (ok) {
      toast.success("Avatar updated.");
      handleOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Change avatar</DialogTitle>
        </DialogHeader>

        {!fileUrl ? (
          <label className="flex h-40 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border text-sm text-muted-foreground hover:border-primary">
            Click to choose an image
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </label>
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
            {error && <p className="text-xs text-destructive">{error}</p>}
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
