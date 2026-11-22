"use client";

import { useEffect, useState } from "react";
import { Check, Download, FolderArchive, Sparkles } from "lucide-react";
import { api, errorMessage } from "@/lib/api-client";
import { formatBytes, formatDuration } from "@/lib/format";
import { TEMPLATES } from "@/lib/templates";
import { useAppStatus } from "../StatusProvider";
import { useToast } from "../Toast";
import { SectionCard, SectionHeader } from "./SectionLayout";

export function PlanSection() {
  const { status } = useAppStatus();
  const uploadLimit = status ? formatBytes(status.limits.maxUploadBytes) : "50 MB";
  const hours = status ? Math.round(status.limits.maxRecordingSec / 3600) : 3;
  const features = [
    "Unlimited notes, rewrites, and translations",
    `Recordings up to ${hours} hours per session`,
    "Meeting capture (microphone plus window audio)",
    `Audio and video uploads up to ${uploadLimit}`,
    "Speaker separation for meetings and interviews",
    `All ${TEMPLATES.length} rewrite styles, plus unlimited custom styles`,
    "Personal dictionary and text replacements",
    "Notion, Slack, Zapier, Make, and n8n connections",
    "Translation into 60+ languages",
    "Complete ZIP backup with audio",
  ];
  return (
    <div className="space-y-5">
      <SectionHeader title="Included features" />
      <section className="rounded-3xl bg-[var(--banner-sky)] p-6 text-[#01050f]">
        <p className="inline-flex items-center gap-1.5 text-sm font-medium opacity-80">
          <Sparkles className="h-4 w-4" /> Full workspace
        </p>
        <p className="mt-1 text-2xl font-bold">Everything unlocked</p>
        <p className="mt-1 text-sm opacity-80">Enjoy long recordings, unlimited rewrites, gallery styles, and full backups.</p>
      </section>
      <SectionCard title="Features">
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success)]" /> {feature}
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}

interface Stats {
  notes: number;
  archived: number;
  audioFiles: number;
  audioBytes: number;
  audioSeconds: number;
  rewrites: number;
}

export function DataSection() {
  const toast = useToast();
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    api<{ stats: Stats }>("/api/export?stats=1").then((data) => setStats(data.stats)).catch((error) => toast(errorMessage(error), "error"));
  }, [toast]);

  return (
    <div className="space-y-5">
      <SectionHeader title="Library & backup" description="All of your notes, rewrites, and recordings are kept privately on your device." />
      <SectionCard title="Your library">
        {stats ? (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              ["Notes", stats.notes.toLocaleString()],
              ["Archived", stats.archived.toLocaleString()],
              ["Rewrites", stats.rewrites.toLocaleString()],
              ["Recordings", stats.audioFiles.toLocaleString()],
              ["Audio length", formatDuration(stats.audioSeconds)],
              ["Audio storage", formatBytes(stats.audioBytes)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-[var(--surface-subtle)] p-3.5">
                <dt className="text-xs text-[var(--ink-muted)]">{label}</dt>
                <dd className="mt-0.5 text-lg font-bold tabular-nums text-[var(--ink)]">{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <div className="h-20 animate-pulse rounded-2xl bg-[var(--surface-subtle)]" />
        )}
      </SectionCard>
      <SectionCard title="Download a full backup">
        <div className="flex flex-wrap items-center gap-4">
          <FolderArchive className="h-8 w-8 shrink-0 text-[var(--ink-muted)]" />
          <p className="min-w-0 flex-1 text-sm text-[var(--ink-muted)]">
            Saves a ZIP archive containing all notes in Markdown format, tags, styles, settings, and every original recording.
          </p>
          <a href="/api/export" download className="btn btn-primary">
            <Download className="h-4 w-4" /> Export backup
          </a>
        </div>
      </SectionCard>
    </div>
  );
}

const CHANGES = [
  {
    title: "Calm blush & plum interface",
    body: "A lighter, distraction-free writing experience with smooth slide-over panels, instant theme switching, and crisp typography.",
  },
  {
    title: "Meeting recording",
    body: "Capture your microphone together with your meeting tab or window audio in a single click.",
  },
  {
    title: "Automatic crash recovery",
    body: "Your audio stays saved safely as you record, so you can pick up right where you left off if a tab ever closes.",
  },
  {
    title: "Rewrite Options Gallery",
    body: `${TEMPLATES.length} ready-made styles across 9 categories, many with customizable tone, length, and formatting.`,
  },
  {
    title: "Live streaming rewrites & translation",
    body: "Watch rewrites appear word by word, ask in your own words, and translate into 60+ languages.",
  },
  {
    title: "Personal dictionary & shortcuts",
    body: "Keep names spelled right and expand spoken shortcuts automatically.",
  },
  {
    title: "Long recordings & uploads",
    body: "Record up to 3 hours or drop long audio and video files — everything is transcribed seamlessly.",
  },
  {
    title: "Bulk organization",
    body: "Hover over cards to select multiple notes and merge, tag, archive, or delete in one click.",
  },
];

export function WhatsNewSection() {
  return (
    <div className="space-y-5">
      <SectionHeader title="What's new" description="Latest improvements in Saydraft." />
      <ul className="grid gap-3.5 sm:grid-cols-2">
        {CHANGES.map((change) => (
          <li key={change.title} className="surface-card rounded-3xl p-5">
            <p className="font-semibold text-[var(--ink)]">{change.title}</p>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">{change.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
