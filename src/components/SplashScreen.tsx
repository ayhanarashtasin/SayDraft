"use client";

import { useEffect, useState } from "react";
import { BrandLogo } from "./BrandLogo";

const SPLASH_DURATION_MS = 2000;

/** Full-screen branded logo shimmer shown for 2s on initial page load or refresh. */
export function SplashScreen() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setHidden(true);
      return;
    }
    // Fallback unmount if hydration finishes after the CSS exit animation already ended.
    const timer = window.setTimeout(() => setHidden(true), SPLASH_DURATION_MS + 50);
    return () => window.clearTimeout(timer);
  }, []);

  if (hidden) return null;

  return (
    <div
      className="splash-screen"
      aria-hidden="true"
      onAnimationEnd={(event) => {
        if (event.animationName === "splash-fade-out") setHidden(true);
      }}
    >
      <div className="splash-logo">
        <BrandLogo className="h-full w-full" />
      </div>
    </div>
  );
}
