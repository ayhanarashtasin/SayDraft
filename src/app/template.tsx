"use client";

import { motion } from "motion/react";
import { EASE_OUT } from "@/lib/motion";

/**
 * Opacity-only route entrance wrapper.
 * Keeping the template root transform-free ensures fixed floating docks and
 * sticky headers never create a temporary containing block or jump on mount.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}
