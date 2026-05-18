import { useEffect, useState } from "react";
import type { RefObject } from "react";

function findScrollableAncestor(node: Element | null): HTMLElement | null {
  let current: Element | null = node ?? null;
  while (current && current !== document.body) {
    const style = getComputedStyle(current);
    if (/(auto|scroll|overlay)/.test(style.overflowY)) {
      return current as HTMLElement;
    }
    current = current.parentElement;
  }
  return (document.scrollingElement as HTMLElement | null) ?? null;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useMainScroll<T extends Element>(elementRef: RefObject<T | null>): number {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const el = elementRef.current;
    const scroller = findScrollableAncestor(el ?? null);
    if (!scroller) return;

    let rafId = 0;
    const handleScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        setScrollY(scroller.scrollTop);
      });
    };

    scroller.addEventListener("scroll", handleScroll, { passive: true });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial read of scroll position on mount; not a cascade
    setScrollY(scroller.scrollTop);

    return () => {
      scroller.removeEventListener("scroll", handleScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [elementRef]);

  return scrollY;
}
