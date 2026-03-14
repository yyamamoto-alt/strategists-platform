/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@strategy-school/shared-db"],
  env: {
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@tiptap/react",
      "@tiptap/starter-kit",
      "@tiptap/extension-image",
      "@tiptap/extension-youtube",
      "@tiptap/extension-link",
      "@tiptap/extension-underline",
      "@tiptap/extension-placeholder",
    ],
  },
  images: {
    formats: ["image/avif", "image/webp"],
  },
};

module.exports = nextConfig;
