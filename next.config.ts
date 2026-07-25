import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @x402/extensions has a subpath export (@x402/extensions/bazaar) that
  // Turbopack's bundler was mis-tracing for the /api/premium-research
  // serverless function — the build succeeded but the deployed function
  // threw "Cannot find package '@x402/extensions'" (ERR_MODULE_NOT_FOUND)
  // at request time, silently failing every payment before verification
  // ever ran. This makes Next.js require() it natively from node_modules
  // instead of bundling it, which Vercel's own build/trace step handles
  // correctly.
  serverExternalPackages: ['@x402/extensions'],
};

export default nextConfig;
