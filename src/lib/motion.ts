"use client";

import { createElement, type ReactNode } from "react";
import { MotionConfig } from "motion/react";

/** Crisp critically-damped ease curve (fast response, smooth settle, zero bounce). */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Standard UI cubic-bezier matching Tailwind ease-in-out. */
export const EASE_TAILWIND = [0.4, 0, 0.2, 1] as const;

/** Snappy critically-damped spring for switches, segmented pills, tabs, and checkboxes. */
export const SPRING_SNAPPY = {
  type: "spring",
  stiffness: 520,
  damping: 38,
  mass: 0.7,
} as const;

/** Smooth critically-damped spring for drawers, sidebars, docks, and grid reflow. */
export const SPRING_SMOOTH = {
  type: "spring",
  stiffness: 400,
  damping: 36,
  mass: 0.85,
} as const;

/** Smooth 250ms transition for right-hand sidebars (Rewrite / Translate). */
export const SIDE_PANEL_TRANSITION = {
  duration: 0.25,
  ease: EASE_TAILWIND,
} as const;

/** Crisp frosted menu popover reveal. */
export const POPOVER_MOTION = {
  initial: { opacity: 0, scale: 0.96, y: 6 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.96, y: 4 },
  transition: { duration: 0.16, ease: EASE_OUT },
} as const;

/** Subtle tactile press feedback for primary buttons and cards. */
export const TAP_PRESS = { scale: 0.97 } as const;

/** Crisp press feedback for circular icon buttons. */
export const TAP_ICON = { scale: 0.92 } as const;

export function MotionProvider({ children }: { children: ReactNode }) {
  return createElement(MotionConfig, { reducedMotion: "user", transition: { duration: 0.2, ease: EASE_OUT } }, children);
}
