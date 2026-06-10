"use client";

import { useState } from "react";
import Image, { type ImageProps } from "next/image";

import {
  DEFAULT_TRIP_COVER_URL,
  getTripCoverUrl,
} from "@/features/trips/domain/get-trip-cover-url";

type Props = Omit<ImageProps, "src" | "onError"> & {
  coverUrl: string | null | undefined;
};

export function TripCoverImage({ coverUrl, alt, ...rest }: Props) {
  const target = getTripCoverUrl(coverUrl);
  const [src, setSrc] = useState(target);
  // Re-sync when the coverUrl prop changes (e.g. right after an upload);
  // useState only seeds on mount, so without this the preview never updates.
  const [prevTarget, setPrevTarget] = useState(target);
  if (target !== prevTarget) {
    setPrevTarget(target);
    setSrc(target);
  }

  return (
    <Image
      {...rest}
      src={src}
      alt={alt}
      onError={() => {
        if (src !== DEFAULT_TRIP_COVER_URL) setSrc(DEFAULT_TRIP_COVER_URL);
      }}
    />
  );
}
