/** @type {import('next').NextConfig} */
const nextConfig = {
  // The Google client libraries are heavy native-ish deps; keep them external
  // to the server bundle so Next doesn't try to bundle them.
  experimental: {
    serverComponentsExternalPackages: [
      "@google-analytics/data",
      "@google-analytics/admin",
      "googleapis",
    ],
  },
};

export default nextConfig;
