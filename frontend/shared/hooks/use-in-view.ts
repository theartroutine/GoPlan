import { useCallback, useEffect, useRef, useState } from "react";

type Options = {
  rootMargin?: string;
  threshold?: number | number[];
  once?: boolean;
};

export function useInView<T extends Element>(options: Options = {}) {
  const { rootMargin = "0px", threshold = 0, once = true } = options;
  const [inView, setInView] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const elementRef = useRef<T | null>(null);

  const setRef = useCallback((node: T | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    elementRef.current = node;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) {
          setInView(true);
          if (once) {
            observer.disconnect();
            observerRef.current = null;
          }
        } else if (!once) {
          setInView(false);
        }
      },
      { rootMargin, threshold },
    );
    observer.observe(node);
    observerRef.current = observer;
  }, [rootMargin, threshold, once]);

  useEffect(() => () => {
    if (observerRef.current) observerRef.current.disconnect();
  }, []);

  return { ref: setRef, inView };
}
