import type { NextConfig } from "next";

function hostnameFromUrl(value?: string) {
  if (!value) return undefined;
  try {
    return new URL(value).hostname;
  } catch {
    return undefined;
  }
}

const remoteImageHostnames = [
  "images.unsplash.com",
  process.env.MEDIA_HOSTNAME,
  hostnameFromUrl(process.env.R2_PUBLIC_BASE_URL),
].filter((hostname): hostname is string => Boolean(hostname));

const nextConfig: NextConfig = {
  cacheComponents: true,
  async headers() {
    return [
      {
        source: "/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      },
      {
        source: "/sign-in/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      },
      {
        source: "/brand/inspora-icon-v1.svg",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
  images: {
    minimumCacheTTL: 60 * 60 * 24 * 31,
    remotePatterns: [
      ...remoteImageHostnames.map((hostname) => ({ protocol: "https" as const, hostname })),
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
  typedRoutes: true,
};

export default nextConfig;
