import nextMDX from "@next/mdx";

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: false,
    // Enable `src/instrumentation.ts` — required so the BOOTSTRAP_SUPER_ADMIN_EMAIL
    // provisioning runs at server startup. In Next.js 15 this becomes the default
    // and the flag can be removed.
    instrumentationHook: true,
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
  // MDX support for the in-app user manual (003-user-manual).
  pageExtensions: ["ts", "tsx", "js", "jsx", "mdx"],
};

const withMDX = nextMDX({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins: [],
    rehypePlugins: [],
  },
});

export default withMDX(nextConfig);
