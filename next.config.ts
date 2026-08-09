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
  "res.cloudinary.com",
  process.env.MEDIA_HOSTNAME,
  hostnameFromUrl(process.env.R2_PUBLIC_BASE_URL),
].filter((hostname): hostname is string => Boolean(hostname));

const nextConfig: NextConfig = {
  cacheComponents: true,
  images: {
    minimumCacheTTL: 60 * 60 * 24 * 31,
    remotePatterns: remoteImageHostnames.map((hostname) => ({ protocol: "https", hostname })),
  },
  typedRoutes: true,
};

export default nextConfig;
