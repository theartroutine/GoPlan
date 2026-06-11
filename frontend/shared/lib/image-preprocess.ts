/**
 * Client-side image preprocessing: downscale oversized images and decode HEIC
 * before validation/upload, instead of hard-rejecting them. Targets mirror what
 * the server keeps (it never stores originals), so nothing of value is lost.
 */

export const IMAGE_INPUT_ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

const STANDARD_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const HEIC_TYPES = new Set(["image/heic", "image/heif"]);
const GENERIC_BINARY_TYPES = new Set([
  "application/octet-stream",
  "binary/octet-stream",
]);

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
