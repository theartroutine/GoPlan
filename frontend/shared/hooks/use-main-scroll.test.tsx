import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useMainScroll } from "./use-main-scroll";

function Probe({ onScroll }: { onScroll: (n: number) => void }) {
  const Inner = () => {
    const y = useMainScroll<HTMLDivElement>(scrollerRef);
    onScroll(y);
    return null;
  };
  const scrollerRef = { current: null } as { current: HTMLDivElement | null };
  return (
    <div
      ref={(node) => { scrollerRef.current = node; }}
      style={{ overflowY: "auto", height: 100 }}
      data-testid="scroller"
    >
      <Inner />
    </div>
  );
}

describe("useMainScroll", () => {
  it("returns 0 when prefers-reduced-motion is on", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });

    const values: number[] = [];
    render(<Probe onScroll={(n) => values.push(n)} />);
    expect(values[0]).toBe(0);
  });

  it("updates scrollY after a scroll event when reduced-motion is off", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});

    const values: number[] = [];
    const { getByTestId } = render(<Probe onScroll={(n) => values.push(n)} />);
    const scroller = getByTestId("scroller") as HTMLDivElement;

    act(() => {
      Object.defineProperty(scroller, "scrollTop", { configurable: true, value: 42 });
      scroller.dispatchEvent(new Event("scroll"));
    });

    expect(values.at(-1)).toBe(42);

    vi.unstubAllGlobals();
  });
});
