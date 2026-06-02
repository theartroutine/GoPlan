"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type AssetBlobState = {
  assetKey: string;
  error: unknown | null;
  status: "error" | "ready";
  url: string | null;
};

type AssetBlobMapEntry = {
  itemId: string;
  url: string;
};

type UseAssetBlobUrlOptions = {
  assetKey: string | null;
  fetchBlob: (signal: AbortSignal) => Promise<Blob>;
};

type UseAssetBlobUrlMapOptions<T> = {
  fetchBlob: (item: T, signal: AbortSignal) => Promise<Blob>;
  getId: (item: T) => string;
  items: T[];
  resetKey: string;
};

export function useAssetBlobUrl({
  assetKey,
  fetchBlob,
}: UseAssetBlobUrlOptions) {
  const [asset, setAsset] = useState<AssetBlobState | null>(null);

  useEffect(() => {
    if (!assetKey) return undefined;

    const controller = new AbortController();
    let objectUrl: string | null = null;

    void fetchBlob(controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setAsset({ assetKey, error: null, status: "ready", url: objectUrl });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setAsset({ assetKey, error, status: "error", url: null });
        }
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetKey, fetchBlob]);

  const currentAsset = asset?.assetKey === assetKey ? asset : null;
  return {
    error: currentAsset?.error ?? null,
    failed: currentAsset?.status === "error",
    loading: Boolean(assetKey) && !currentAsset,
    url: currentAsset?.url ?? null,
  };
}

export function useAssetBlobUrlMap<T>({
  fetchBlob,
  getId,
  items,
  resetKey,
}: UseAssetBlobUrlMapOptions<T>) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Set<string>>(() => new Set());
  const urlsRef = useRef<Map<string, AssetBlobMapEntry>>(new Map());
  const errorsRef = useRef<Map<string, string>>(new Map());
  const requestsRef = useRef<Map<string, AbortController>>(new Map());
  const visibleIdsRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(false);

  const syncUrls = useCallback(() => {
    setUrls(
      Object.fromEntries(
        Array.from(urlsRef.current.values()).map((entry) => [
          entry.itemId,
          entry.url,
        ]),
      ),
    );
  }, []);

  const syncErrors = useCallback(() => {
    setErrors(new Set(errorsRef.current.values()));
  }, []);

  const clearAllRefs = useCallback(() => {
    for (const controller of requestsRef.current.values()) {
      controller.abort();
    }
    requestsRef.current.clear();
    for (const entry of urlsRef.current.values()) {
      URL.revokeObjectURL(entry.url);
    }
    urlsRef.current.clear();
    errorsRef.current.clear();
    visibleIdsRef.current = new Set();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearAllRefs();
    };
  }, [clearAllRefs]);

  useEffect(() => {
    const itemEntries = items.map((item) => {
      const itemId = getId(item);
      return { assetKey: `${resetKey}:${itemId}`, item, itemId };
    });
    const visibleAssetKeys = new Set(itemEntries.map((entry) => entry.assetKey));
    visibleIdsRef.current = visibleAssetKeys;

    let urlsChanged = false;
    let errorsChanged = false;
    for (const [assetKey, entry] of urlsRef.current.entries()) {
      if (!visibleAssetKeys.has(assetKey)) {
        URL.revokeObjectURL(entry.url);
        urlsRef.current.delete(assetKey);
        urlsChanged = true;
      }
    }
    for (const [assetKey, controller] of requestsRef.current.entries()) {
      if (!visibleAssetKeys.has(assetKey)) {
        controller.abort();
        requestsRef.current.delete(assetKey);
      }
    }
    for (const assetKey of errorsRef.current.keys()) {
      if (!visibleAssetKeys.has(assetKey)) {
        errorsRef.current.delete(assetKey);
        errorsChanged = true;
      }
    }
    if (urlsChanged) syncUrls();
    if (errorsChanged) syncErrors();

    for (const { assetKey, item, itemId } of itemEntries) {
      if (
        urlsRef.current.has(assetKey) ||
        requestsRef.current.has(assetKey) ||
        errorsRef.current.has(assetKey)
      ) {
        continue;
      }

      const controller = new AbortController();
      requestsRef.current.set(assetKey, controller);
      void fetchBlob(item, controller.signal)
        .then((blob) => {
          if (
            controller.signal.aborted ||
            !mountedRef.current ||
            !visibleIdsRef.current.has(assetKey)
          ) {
            return;
          }

          const objectUrl = URL.createObjectURL(blob);
          const previousUrl = urlsRef.current.get(assetKey)?.url;
          if (previousUrl) URL.revokeObjectURL(previousUrl);
          urlsRef.current.set(assetKey, { itemId, url: objectUrl });
          syncUrls();
        })
        .catch(() => {
          if (
            !controller.signal.aborted &&
            mountedRef.current &&
            visibleIdsRef.current.has(assetKey)
          ) {
            errorsRef.current.set(assetKey, itemId);
            syncErrors();
          }
        })
        .finally(() => {
          requestsRef.current.delete(assetKey);
        });
    }
  }, [fetchBlob, getId, items, resetKey, syncErrors, syncUrls]);

  return { errors, urls };
}
