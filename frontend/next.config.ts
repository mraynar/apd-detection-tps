import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the Flask backend to serve the MJPEG stream and any static images
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "5001",
        pathname: "/**",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "5001",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
