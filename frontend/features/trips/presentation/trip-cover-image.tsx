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
  const initial = getTripCoverUrl(coverUrl);
  const [src, setSrc] = useState(initial);

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
