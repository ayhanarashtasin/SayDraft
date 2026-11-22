"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api-client";

/** Ends this device's session, then goes to the login page. */
export function LogoutButton({ variant = "button" }: { variant?: "button" | "row" }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function logout() {
    if (busy) return;
    setBusy(true);
    try {
      await api("/api/auth/logout", { method: "POST" });
      window.location.assign("/login");
    } catch (error) {
      toast(errorMessage(error), "error");
      setBusy(false);
    }
  }

  if (variant === "row") {
    return (
      <button
        type="button"
        onClick={() => void logout()}
        disabled={busy}
        className="flex w-full cursor-pointer items-center gap-3 py-3 text-left text-[1.03125rem]/6 text-[var(--ink)] transition-opacity hover:opacity-70 disabled:opacity-50"
      >
        {busy ? <Spinner className="h-5 w-5 shrink-0" /> : <LogOut className="h-5 w-5 shrink-0 text-[var(--ink-subtle)]" />}
        <span className="flex-1 truncate">Log out</span>
      </button>
    );
  }
  return (
    <button type="button" onClick={() => void logout()} disabled={busy} className="btn btn-secondary">
      {busy ? <Spinner className="h-4 w-4" /> : <LogOut className="h-4 w-4" />} Log out
    </button>
  );
}
