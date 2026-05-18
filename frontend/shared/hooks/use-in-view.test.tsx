import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useRef } from "react";

import { useInView } from "./use-in-view";

type ObserverCallback = (entries: IntersectionObserverEntry[]) => void;

class MockObserver implements IntersectionObserver {
  static instances: MockObserver[] = [];
  readonly root: Element | Document | null = null;
  readonly rootMargin: string;
  readonly thresholds: ReadonlyArray<number> = [];
  public disconnectCount = 0;
  public observed: Element[] = [];
  public callback: ObserverCallback;
  constructor(cb: ObserverCallback, options?: IntersectionObserverInit) {
    this.callback = cb;
    this.rootMargin = options?.rootMargin ?? "";
    MockObserver.instances.push(this);
  }
  observe(el: Element): void { this.observed.push(el); }
  unobserve(): void {}
  disconnect(): void { this.disconnectCount++; }
  takeRecords(): IntersectionObserverEntry[] { return []; }
}

function Probe({ onState }: { onState: (inView: boolean) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { ref: setRef, inView } = useInView<HTMLDivElement>({ once: true });
  onState(inView);
  return (
    <div
      ref={(node) => {
        ref.current = node;
        setRef(node);
      }}
    />
  );
}

describe("useInView", () => {
  it("becomes true after observer reports intersection and disconnects when once", () => {
    MockObserver.instances = [];
    vi.stubGlobal("IntersectionObserver", MockObserver);

    const states: boolean[] = [];
    render(<Probe onState={(v) => states.push(v)} />);

    expect(states[0]).toBe(false);
    const observer = MockObserver.instances[0];
    expect(observer).toBeDefined();
    expect(observer.observed.length).toBe(1);

    act(() => {
      observer.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        observer,
      );
    });

    expect(states.at(-1)).toBe(true);
    expect(observer.disconnectCount).toBe(1);

    vi.unstubAllGlobals();
  });
});
