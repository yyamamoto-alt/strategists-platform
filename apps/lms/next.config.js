/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@strategy-school/shared-db"],
  env: {
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  images: {
    formats: ["image/avif", "image/webp"],
  },
};

module.exports = nextConfig;
