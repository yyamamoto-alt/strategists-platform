/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@strategy-school/shared-db"],
  env: {
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
};

module.exports = nextConfig;
