import type { NextConfig } from "next";
import path from "path";

// Obscure base path so the admin panel lives at a hard-to-guess URL on the
// same domain (e.g. https://domain.com/console-7k29qz). Baked at build time
// via the ADMIN_BASE_PATH build arg; empty in local dev = served at root.
const basePath = process.env.ADMIN_BASE_PATH?.trim() || "";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  ...(basePath ? { basePath } : {}),
  transpilePackages: ["@wain/types"],
  webpack: (config) => {
    // Konva's Node.js build tries to require 'canvas' — alias it to false so
    // the browser build is used instead (dynamic({ ssr: false }) handles runtime)
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    return config;
  },
};

export default nextConfig;
