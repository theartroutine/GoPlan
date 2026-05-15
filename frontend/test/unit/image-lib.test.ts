import { afterEach, describe, expect, it, vi } from "vitest";

import { compressImageToWebP, renderCroppedImageToWebP } from "@/shared/lib/image";

describe("compressImageToWebP", () => {
  it("returns a Blob via canvas.toBlob", async () => {
    const canvas = {
      toBlob: vi.fn((cb: BlobCallback) => {
        cb(new Blob(["x"], { type: "image/webp" }));
      }),
    } as unknown as HTMLCanvasElement;

    const blob = await compressImageToWebP(canvas, 0.85);

    expect(canvas.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      "image/webp",
      0.85,
    );
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/webp");
  });
});

describe("renderCroppedImageToWebP", () => {
  const originalImage = globalThis.Image;
  const originalCreateElement = document.createElement.bind(document);

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.Image = originalImage;
  });

  it("draws the selected crop into a fixed square canvas before WebP encoding", async () => {
    const drawImage = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage })),
      toBlob: vi.fn((cb: BlobCallback) => {
        cb(new Blob(["x"], { type: "image/webp" }));
      }),
    } as unknown as HTMLCanvasElement;

    class StubImage {
      crossOrigin = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      srcValue = "";

      set src(value: string) {
        this.srcValue = value;
        createdImages.push(this);
        queueMicrotask(() => this.onload?.());
      }
    }
    const createdImages: StubImage[] = [];

    globalThis.Image = StubImage as unknown as typeof Image;
    vi.spyOn(document, "createElement").mockImplementation(
      ((tagName: string, options?: ElementCreationOptions) => {
        if (tagName === "canvas") return canvas;
        return originalCreateElement(tagName, options);
      }) as typeof document.createElement,
    );

    const blob = await renderCroppedImageToWebP(
      "blob:avatar",
      { x: 10, y: 20, width: 300, height: 250 },
      { targetPx: 512, quality: 0.85 },
    );

    expect(createdImages).toHaveLength(1);
    expect(createdImages[0]?.crossOrigin).toBe("anonymous");
    expect(createdImages[0]?.srcValue).toBe("blob:avatar");
    expect(canvas.width).toBe(512);
    expect(canvas.height).toBe(512);
    expect(drawImage).toHaveBeenCalledWith(
      createdImages[0],
      10,
      20,
      300,
      250,
      0,
      0,
      512,
      512,
    );
    expect(canvas.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      "image/webp",
      0.85,
    );
    expect(blob.type).toBe("image/webp");
  });

  it("rejects when the browser cannot create a 2D canvas context", async () => {
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => null),
    } as unknown as HTMLCanvasElement;

    class StubImage {
      crossOrigin = "";
      onload: (() => void) | null = null;

      set src(_: string) {
        queueMicrotask(() => this.onload?.());
      }
    }

    globalThis.Image = StubImage as unknown as typeof Image;
    vi.spyOn(document, "createElement").mockImplementation(
      ((tagName: string, options?: ElementCreationOptions) => {
        if (tagName === "canvas") return canvas;
        return originalCreateElement(tagName, options);
      }) as typeof document.createElement,
    );

    await expect(
      renderCroppedImageToWebP(
        "blob:avatar",
        { x: 0, y: 0, width: 100, height: 100 },
      ),
    ).rejects.toThrow("Canvas 2D context unavailable.");
  });
});
