/**
 * Client-side image preprocessing: downscale oversized images and decode HEIC
 * before validation/upload, instead of hard-rejecting them. Targets mirror what
 * the server keeps (it never stores originals), so nothing of value is lost.
 */

import { compressImageToWebP } from "@/shared/lib/image";

export const IMAGE_INPUT_ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

const STANDARD_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const HEIC_TYPES = new Set(["image/heic", "image/heif"]);
const GENERIC_BINARY_TYPES = new Set([
  "application/octet-stream",
  "binary/octet-stream",
]);
const QUALITY_STEPS = [0.9, 0.8, 0.7];

export type SourceKind = "standard" | "heic" | "unsupported";

export function classifySource(file: Pick<File, "name" | "type">): SourceKind {
  const name = file.name.toLowerCase();
  if (HEIC_TYPES.has(file.type) || name.endsWith(".heic") || name.endsWith(".heif")) {
    return "heic";
  }
  if (file.type === "image/svg+xml" || name.endsWith(".svg")) return "unsupported";
  if (STANDARD_TYPES.has(file.type)) return "standard";
  // Empty/generic MIME happens on some platforms; let decoding decide.
  if (file.type === "" || GENERIC_BINARY_TYPES.has(file.type)) return "standard";
  return "unsupported";
}

export function scaledDimensions(
  width: number,
  height: number,
  maxEdgePx: number,
): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxEdgePx) return { width, height };
  const scale = maxEdgePx / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function webpFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  return `${base || "photo"}.webp`;
}

export type PreprocessTarget = {
  /** Max long edge after processing, in pixels. */
  maxEdgePx: number;
  /** Max encoded size, in bytes. */
  maxBytes: number;
};

export type PreprocessResult =
  | { ok: true; file: File; wasProcessed: boolean }
  | { ok: false; code: "UNSUPPORTED" | "UNREADABLE" };

export type DecodedBitmap = {
  width: number;
  height: number;
  source: unknown;
  close(): void;
};

export type ImageCodec = {
  decode(blob: Blob): Promise<DecodedBitmap>;
  encodeWebP(
    bitmap: DecodedBitmap,
    width: number,
    height: number,
    quality: number,
  ): Promise<Blob>;
  /** Decode HEIC/HEIF into a JPEG blob; lazy-loads the WASM decoder. */
  decodeHeic(file: File): Promise<Blob>;
};

export const browserImageCodec: ImageCodec = {
  async decode(blob) {
    // createImageBitmap applies EXIF orientation by default ("from-image").
    const bitmap = await createImageBitmap(blob);
    return {
      width: bitmap.width,
      height: bitmap.height,
      source: bitmap,
      close: () => bitmap.close(),
    };
  },
  async encodeWebP(decoded, width, height, quality) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(decoded.source as ImageBitmap, 0, 0, width, height);
    return compressImageToWebP(canvas, quality);
  },
  async decodeHeic(file) {
    const { heicTo } = await import("heic-to");
    return heicTo({ blob: file, type: "image/jpeg", quality: 0.92 });
  },
};

export async function preprocessImageFile(
  file: File,
  target: PreprocessTarget,
  codec: ImageCodec = browserImageCodec,
): Promise<PreprocessResult> {
  const kind = classifySource(file);
  if (kind === "unsupported") return { ok: false, code: "UNSUPPORTED" };

  let sourceBlob: Blob = file;
  if (kind === "heic") {
    try {
      sourceBlob = await codec.decodeHeic(file);
    } catch {
      return { ok: false, code: "UNREADABLE" };
    }
  }

  let bitmap: DecodedBitmap;
  try {
    bitmap = await codec.decode(sourceBlob);
  } catch {
    return { ok: false, code: "UNREADABLE" };
  }

  try {
    const fitsAsIs =
      kind === "standard" &&
      file.size <= target.maxBytes &&
      Math.max(bitmap.width, bitmap.height) <= target.maxEdgePx;
    if (fitsAsIs) return { ok: true, file, wasProcessed: false };

    const { width, height } = scaledDimensions(bitmap.width, bitmap.height, target.maxEdgePx);
    let encoded: Blob | null = null;
    for (const quality of QUALITY_STEPS) {
      encoded = await codec.encodeWebP(bitmap, width, height, quality);
      if (encoded.size <= target.maxBytes) break;
    }
    if (!encoded || encoded.size > target.maxBytes) {
      // Budget exhausted even at the lowest quality step. Practically
      // unreachable at 2560px WebP except when the encoder ignores quality
      // (e.g. old Safari falls back to lossless PNG bytes for toBlob WebP).
      return { ok: false, code: "UNREADABLE" };
    }
    return {
      ok: true,
      file: new File([encoded], webpFileName(file.name), { type: "image/webp" }),
      wasProcessed: true,
    };
  } catch {
    return { ok: false, code: "UNREADABLE" };
  } finally {
    bitmap.close();
  }
}
