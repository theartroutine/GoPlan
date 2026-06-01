import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// jsdom does not implement PointerEvent. Without this, fireEvent.pointerDown
// creates a plain Event that lacks the `button` and `ctrlKey` properties
// Radix UI checks in its dropdown trigger handler.
if (typeof window !== "undefined" && !window.PointerEvent) {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number;
    readonly width: number;
    readonly height: number;
    readonly pressure: number;
    readonly tangentialPressure: number;
    readonly tiltX: number;
    readonly tiltY: number;
    readonly twist: number;
    readonly pointerType: string;
    readonly isPrimary: boolean;
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.width = params.width ?? 1;
      this.height = params.height ?? 1;
      this.pressure = params.pressure ?? 0;
      this.tangentialPressure = params.tangentialPressure ?? 0;
      this.tiltX = params.tiltX ?? 0;
      this.tiltY = params.tiltY ?? 0;
      this.twist = params.twist ?? 0;
      this.pointerType = params.pointerType ?? "";
      this.isPrimary = params.isPrimary ?? false;
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsdom polyfill
  (window as any).PointerEvent = PointerEventPolyfill;
}

afterEach(() => {
  cleanup();
});

// jsdom does not provide IntersectionObserver. Provide a no-op default so
// components mounting under it do not throw. Per-test overrides can replace
// this via `vi.stubGlobal("IntersectionObserver", MyMock)`.
class NoopIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = "";
  readonly thresholds: ReadonlyArray<number> = [];
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] { return []; }
}

vi.stubGlobal("IntersectionObserver", NoopIntersectionObserver);

// jsdom does not provide ResizeObserver. Provide a no-op default so
// components mounting under it do not throw.
class NoopResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

vi.stubGlobal("ResizeObserver", NoopResizeObserver);

// jsdom does not implement scrollIntoView. Provide a no-op so Radix
// dropdown items (which call scrollIntoView on keyboard navigation) do not throw.
Element.prototype.scrollIntoView = vi.fn();
