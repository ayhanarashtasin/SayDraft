import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  {
    key: "Permissions-Policy",
    value: "microphone=(self), display-capture=(self), camera=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Hides the floating Next.js "N" dev-tools badge that `next dev` shows in the corner.
  devIndicators: false,
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/status": ["./node_modules/ffmpeg-static/ffmpeg*"],
    "/api/notes/*/audio": ["./node_modules/ffmpeg-static/ffmpeg*"],
    "/api/notes/*/audio-export": ["./node_modules/ffmpeg-static/ffmpeg*"],
    "/.well-known/workflow/v1/flow": ["./node_modules/ffmpeg-static/ffmpeg*"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withWorkflow(nextConfig);
