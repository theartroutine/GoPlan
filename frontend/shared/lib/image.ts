export type CropArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RenderCroppedImageOptions = {
  targetPx?: number;
  quality?: number;
};

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image for cropping."));
    img.src = src;
  });
}

export function compressImageToWebP(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Canvas could not be encoded to WebP."));
          return;
        }
        resolve(blob);
      },
      "image/webp",
      quality,
    );
  });
}

export async function renderCroppedImageToWebP(
  imageSrc: string,
  area: CropArea,
  options: RenderCroppedImageOptions = {},
): Promise<Blob> {
  const targetPx = options.targetPx ?? 512;
  const quality = options.quality ?? 0.85;
  const img = await loadImageElement(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = targetPx;
  canvas.height = targetPx;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  ctx.drawImage(
    img,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    targetPx,
    targetPx,
  );
  return compressImageToWebP(canvas, quality);
}
