"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { SessionUser } from "@/lib/auth-shared";

/** The signed-in user (null until loaded). Only fetches while `enabled` is true. */
export function useCurrentUser(enabled = true): SessionUser | null {
  const [user, setUser] = useState<SessionUser | null>(null);
  useEffect(() => {
    if (!enabled || user) return;
    let live = true;
    api<{ user: SessionUser }>("/api/auth/me")
      .then((data) => {
        if (live) setUser(data.user);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [enabled, user]);
  return user;
}
