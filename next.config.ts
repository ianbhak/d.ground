import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  // unpdf bundles pdf.js — keep it external so the Node server route
  // loads it at runtime instead of webpack trying to bundle it.
  serverExternalPackages: ["unpdf"],
};

export default nextConfig;
