import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // next/image's default loader needs a server; serve images as-is instead.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
