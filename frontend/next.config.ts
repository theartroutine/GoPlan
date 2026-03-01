import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));
const tailwindcssPath = path.join(frontendRoot, "node_modules", "tailwindcss");

const nextConfig: NextConfig = {
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
