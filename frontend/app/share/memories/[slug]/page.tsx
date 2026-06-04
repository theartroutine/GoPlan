import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { resolvePublicAppBaseUrl } from "@/shared/http/public-origin";

type PageProps = {
  params: Promise<{ slug: string }>;
};

type PublicMemoryMusic = {
  title: string;
  artist: string;
  license: string;
  license_url: string;
  source_url: string;
};

type PublicMemory = {
  title: string;
  poster_url: string;
  video_url: string;
  duration_seconds: number | null;
  source_photo_count: number;
  music: PublicMemoryMusic | null;
};

const PUBLIC_MEMORY_DESCRIPTION = "A shared GoPlan memory video.";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function parsePublicMemoryMusic(value: unknown): PublicMemoryMusic | null {
  const candidate = asRecord(value);
  if (
    candidate === null ||
    typeof candidate.title !== "string" ||
    typeof candidate.artist !== "string" ||
    typeof candidate.license !== "string" ||
    typeof candidate.license_url !== "string" ||
    typeof candidate.source_url !== "string"
  ) {
    return null;
  }
  return {
    title: candidate.title,
    artist: candidate.artist,
    license: candidate.license,
    license_url: candidate.license_url,
    source_url: candidate.source_url,
  };
}

function isPublicMemory(value: unknown): value is PublicMemory {
  const candidate = asRecord(value);
  return (
    candidate !== null &&
    typeof candidate.title === "string" &&
    typeof candidate.poster_url === "string" &&
    typeof candidate.video_url === "string" &&
    (
      typeof candidate.duration_seconds === "number" ||
      candidate.duration_seconds === null
    ) &&
    typeof candidate.source_photo_count === "number"
  );
}

function displayTitle(memory: PublicMemory): string {
  return memory.title.trim() || "Trip memory";
}

function publicPosterPath(slug: string): string {
  return `/api/share/memories/${encodeURIComponent(slug)}/poster`;
}

function publicVideoPath(slug: string): string {
  return `/api/share/memories/${encodeURIComponent(slug)}/video`;
}

async function parsePublicMemoryResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

const fetchPublicMemory = cache(
  async (slug: string, origin: string): Promise<PublicMemory | null> => {
    const response = await fetch(
      `${origin}/api/share/memories/${encodeURIComponent(slug)}`,
      { cache: "no-store" },
    );

    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error("Public memory request failed.");
    }

    const payload = await parsePublicMemoryResponse(response);
    if (!isPublicMemory(payload)) return null;
    return {
      ...payload,
      music: parsePublicMemoryMusic(asRecord(payload)?.music),
    };
  },
);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const origin = await resolvePublicAppBaseUrl();
  const memory = await fetchPublicMemory(slug, origin);

  if (!memory) {
    return {
      title: "Memory not found | GoPlan",
      robots: { index: false, follow: false },
    };
  }

  const title = displayTitle(memory);
  const posterUrl = `${origin}${publicPosterPath(slug)}`;
  const videoUrl = `${origin}${publicVideoPath(slug)}`;

  return {
    metadataBase: new URL(origin),
    title: `${title} | GoPlan`,
    description: PUBLIC_MEMORY_DESCRIPTION,
    openGraph: {
      title,
      description: PUBLIC_MEMORY_DESCRIPTION,
      type: "video.other",
      siteName: "GoPlan",
      images: [{ url: posterUrl, alt: title }],
      videos: [{ url: videoUrl, type: "video/mp4" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: PUBLIC_MEMORY_DESCRIPTION,
      images: [posterUrl],
    },
  };
}

export default async function PublicMemoryPage({ params }: PageProps) {
  const { slug } = await params;
  const origin = await resolvePublicAppBaseUrl();
  const memory = await fetchPublicMemory(slug, origin);

  if (!memory) notFound();

  const title = displayTitle(memory);
  const posterSrc = publicPosterPath(slug);
  const videoSrc = publicVideoPath(slug);

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between py-2">
          <p className="text-sm font-semibold">GoPlan</p>
        </header>

        <section className="flex flex-1 flex-col justify-center gap-5 py-6">
          <div className="space-y-3">
            <h1 className="text-2xl font-semibold text-balance sm:text-3xl">
              {title}
            </h1>
            <video
              aria-label={`${title} video`}
              className="aspect-video w-full rounded-md bg-black shadow-2xl shadow-black/30"
              controls
              controlsList="nodownload"
              disablePictureInPicture
              playsInline
              poster={posterSrc}
              preload="metadata"
              src={videoSrc}
            />
            {memory.music ? (
              <p className="text-xs text-zinc-400">
                Music: {memory.music.title} by{" "}
                <a
                  className="underline underline-offset-2 hover:text-zinc-200"
                  href={memory.music.source_url}
                  rel="noopener noreferrer nofollow"
                  target="_blank"
                >
                  {memory.music.artist}
                </a>{" "}
                —{" "}
                <a
                  className="underline underline-offset-2 hover:text-zinc-200"
                  href={memory.music.license_url}
                  rel="noopener noreferrer nofollow"
                  target="_blank"
                >
                  {memory.music.license}
                </a>
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
