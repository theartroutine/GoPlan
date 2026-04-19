import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));
const tailwindcssPath = path.join(frontendRoot, "node_modules", "tailwindcss");

const nextConfig: NextConfig = {
  async rewrites() {
    // Proxy Django-served media files so the browser can load them from port 3000.
    // Note: next.config.ts runs at build time and cannot import from shared/http/config.ts
    // (which throws at module load if the env var is absent). The "http://localhost:8000"
    // fallback is intentional for local dev only — production must set NEXT_PUBLIC_API_BASE_URL.
    const djangoBase = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(
      /\/+$/,
      "",
    );
    return [
      {
        source: "/media/:path*",
        destination: `${djangoBase}/media/:path*`,
      },
    ];
  },
  turbopack: {
    // Prevent monorepo root mis-detection when multiple lockfiles exist.
    root: frontendRoot,
    resolveAlias: {
      tailwindcss: tailwindcssPath,
    },
  },
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      tailwindcss: tailwindcssPath,
    };
    return config;
  },
};

export default nextConfig;
