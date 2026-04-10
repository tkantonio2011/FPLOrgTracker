/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: false,
  },
  // Standalone output bundles only production deps and creates a minimal server.js
  // Required by scripts/deploy.sh for clean EC2 deployment.
  output: "standalone",
  // Force the file tracer to include ALL Prisma engine binaries so the Linux
  // binary (rhel-openssl-3.0.x) is present in the standalone output even when
  // building on Windows.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/.prisma/client/**"],
  },
};

export default nextConfig;
