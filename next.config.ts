import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  // unpdf bundles pdf.js and @napi-rs/canvas ships native .node
  // binaries — keep both external so the Node server route loads them
  // at runtime instead of webpack trying to bundle them.
  serverExternalPackages: ["unpdf", "@napi-rs/canvas"],
};

export default nextConfig;
