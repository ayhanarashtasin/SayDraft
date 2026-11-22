"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import type { AppStatus } from "@/lib/types";

interface StatusValue {
  status: AppStatus | null;
  /** True when the server could not be reached. */
  offline: boolean;
  refresh: () => Promise<void>;
}

const StatusContext = createContext<StatusValue>({ status: null, offline: false, refresh: async () => {} });

/** Loads server capabilities (API key, ffmpeg, limits, settings) once for the whole app. */
export function StatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [offline, setOffline] = useState(false);
  const pathname = usePathname();
  // The login and sign-up pages are shown to signed-out visitors: there is no status to load for them.
  const signedOutPage = pathname === "/login" || pathname === "/signup";

  const refresh = useCallback(async () => {
    try {
      setStatus(await api<AppStatus>("/api/status"));
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    if (!signedOutPage) void refresh();
  }, [refresh, signedOutPage]);

  const value = useMemo(() => ({ status, offline, refresh }), [status, offline, refresh]);
  return <StatusContext.Provider value={value}>{children}</StatusContext.Provider>;
}

export function useAppStatus(): StatusValue {
  return useContext(StatusContext);
}
