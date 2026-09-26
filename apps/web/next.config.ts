import type { NextConfig } from "next";
import path from "node:path";
import { config as loadEnv } from "dotenv";

// Single .env at the monorepo root, shared by web, worker and bot.
loadEnv({ path: path.join(process.cwd(), "../../.env"), quiet: true });

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: [
    "@quvr/shared",
    "@quvr/providers",
    "@quvr/scoring",
    "@quvr/services",
    "@quvr/db",
  ],
  serverExternalPackages: ["@prisma/client", "ioredis", "bullmq", "ws"],
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default config;
