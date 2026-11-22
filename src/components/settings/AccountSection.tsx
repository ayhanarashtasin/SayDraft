"use client";

import { LockKeyhole } from "lucide-react";
import { LogoutButton } from "../auth/LogoutButton";
import { useCurrentUser } from "../auth/useCurrentUser";
import { SectionCard, SectionHeader } from "./SectionLayout";

export function AccountSection() {
  const user = useCurrentUser();
  return (
    <div className="space-y-5">
      <SectionHeader title="Account" description="The login you use for Saydraft." />
      <SectionCard>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">Name</dt>
            <dd className="mt-1 truncate text-[var(--ink)]">{user ? user.name || "Not set" : "…"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">Email</dt>
            <dd className="mt-1 truncate text-[var(--ink)]">{user ? user.email : "…"}</dd>
          </div>
        </dl>
        <div className="mt-5">
          <LogoutButton />
        </div>
      </SectionCard>
      <SectionCard>
        <p className="flex items-start gap-2 text-sm text-[var(--ink-subtle)]">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-muted)]" />
          <span>
            Your notes, recordings, tags, rewrite styles, dictionary, integrations and settings belong to your account. Other people who use
            this workspace cannot see them.
          </span>
        </p>
      </SectionCard>
    </div>
  );
}
