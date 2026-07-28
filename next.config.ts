import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse pulls in a native binary (@napi-rs/canvas) - left unbundled so
  // Vercel's serverless function resolves the actual prebuilt binding at
  // runtime instead of Turbopack tracing/bundling it (which drops native
  // .node files and breaks PDF text extraction in production only, not in
  // local `next dev`).
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas", "pdfjs-dist"],
};

export default nextConfig;
