"use client";

import { createElement, type ReactNode } from "react";
import { MotionConfig } from "motion/react";

/** Crisp critically-damped ease curve (fast response, smooth settle, zero bounce). */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

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

/** Subtle tactile press feedback for primary buttons and cards. */
export const TAP_PRESS = { scale: 0.97 } as const;

/** Crisp press feedback for circular icon buttons. */
export const TAP_ICON = { scale: 0.92 } as const;

export function MotionProvider({ children }: { children: ReactNode }) {
  return createElement(MotionConfig, { reducedMotion: "user", transition: { duration: 0.2, ease: EASE_OUT } }, children);
}
