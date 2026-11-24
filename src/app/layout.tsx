import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import { SplashScreen } from "@/components/SplashScreen";
import { StatusProvider } from "@/components/StatusProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/Toast";
import { MotionProvider } from "@/lib/motion";
import "./globals.css";

export const metadata: Metadata = {
  title: "Saydraft",
  description: "Record voice notes, get accurate transcripts, and rewrite them cleanly into notes, summaries, and messages.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/favicon.svg",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Saydraft",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcedf4" },
    { media: "(prefers-color-scheme: dark)", color: "#111022" },
  ],
};

// Applies the saved theme before first paint to avoid a flash of the wrong colors.
const themeScript = `(function(){try{var t=localStorage.getItem('saydraft-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.add(d?'dark':'light');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen overscroll-y-none antialiased">
        <SplashScreen />
        <ThemeProvider>
          <MotionProvider>
            <ToastProvider>
              <ConfirmProvider>
                <StatusProvider>{children}</StatusProvider>
              </ConfirmProvider>
            </ToastProvider>
          </MotionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
