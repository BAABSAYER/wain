import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle for slim Docker runtime images.
  output: "standalone",
  // Trace files from the monorepo root so workspace packages are included.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ["@wain/types", "three"],
};

export default nextConfig;
