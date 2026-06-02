/**
 * Parse a download filename out of a `Content-Disposition` header, falling back
 * to a provided default when the header is missing or unparseable. Handles both
 * the plain `filename="..."` form and the RFC 5987 `filename*=UTF-8''...` form.
 */
export function parseContentDispositionFilename(
  header: string | null | undefined,
  fallback: string,
): string {
  if (!header) return fallback;

  const extended = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header);
  if (extended?.[1]) {
    try {
      return decodeURIComponent(extended[1].replace(/^"|"$/g, "").trim());
    } catch {
      // Fall through to the plain filename form.
    }
  }

  const plain = /filename="?([^";]+)"?/i.exec(header);
  if (plain?.[1]) return plain[1].trim();

  return fallback;
}

/**
 * Trigger a browser "Save as" download for an in-memory blob. The object URL is
 * revoked on the next tick so the download has a chance to start first.
 */
export function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
