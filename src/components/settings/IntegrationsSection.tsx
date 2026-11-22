"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, CheckCircle2, ChevronDown, CircleAlert, Pencil, Plus, Send, Trash2, Unplug, Webhook, Zap } from "lucide-react";
import { motion } from "motion/react";
import { api, errorMessage } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { SPRING_SNAPPY } from "@/lib/motion";
import type { IntegrationAction } from "@/lib/types";
import { useConfirm } from "../ConfirmDialog";
import { useToast } from "../Toast";
import { Accordion, Dialog, Spinner, Switch } from "../ui";
import { SectionCard, SectionHeader } from "./SectionLayout";

type Draft = {
  id: number | null;
  type: "webhook" | "notion";
  title: string;
  url: string;
  token: string;
  pageUrl: string;
  onTranscript: boolean;
  onRewrite: boolean;
};

const EMPTY: Draft = { id: null, type: "webhook", title: "", url: "", token: "", pageUrl: "", onTranscript: false, onRewrite: false };

const SAMPLE_PAYLOAD = `{
  "event": "note.transcribed",
  "text": "Weekly plan\\n\\nCall the supplier…",
  "note": {
    "id": 42,
    "title": "Weekly plan",
    "transcript": "Call the supplier…",
    "language": "en",
    "source": "recording",
    "durationSec": 74.5,
    "tags": ["Work"],
    "createdAt": "2026-11-22T09:15:00.000Z",
    "updatedAt": "2026-11-22T09:16:10.000Z"
  },
  "rewrite": null,
  "sentAt": "2026-11-22T09:16:11.000Z"
}`;

export function IntegrationsSection() {
  const toast = useToast();
  const askConfirm = useConfirm();
  const [actions, setActions] = useState<IntegrationAction[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<number | "save" | null>(null);
  const [sampleOpen, setSampleOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setActions((await api<{ actions: IntegrationAction[] }>("/api/actions")).actions);
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  }, [toast]);
  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!draft) return;
    setBusy("save");
    try {
      const json =
        draft.type === "webhook"
          ? { type: draft.type, title: draft.title, url: draft.url, onTranscript: draft.onTranscript, onRewrite: draft.onRewrite }
          : {
              type: draft.type,
              title: draft.title,
              pageUrl: draft.pageUrl,
              ...(draft.token.trim() ? { token: draft.token } : {}),
              onTranscript: draft.onTranscript,
              onRewrite: draft.onRewrite,
            };
      if (draft.id === null) await api("/api/actions", { json });
      else await api(`/api/actions/${draft.id}`, { method: "PATCH", json });
      toast(draft.id === null ? "Connection added" : "Connection saved");
      setDraft(null);
      await load();
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusy(null);
    }
  }

  async function test(action: IntegrationAction) {
    setBusy(action.id);
    try {
      await api(`/api/actions/${action.id}/test`, { json: {} });
      toast(`Test sent to ${action.title}`);
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusy(null);
      void load();
    }
  }

  async function toggle(action: IntegrationAction, field: "onTranscript" | "onRewrite", value: boolean) {
    try {
      await api(`/api/actions/${action.id}`, { method: "PATCH", json: { [field]: value } });
      await load();
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Integrations"
        description="Send notes and rewrites to Notion, Slack, Zapier, Make, or n8n automatically when ready, or anytime from a note's menu."
        actions={
          <>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setDraft({ ...EMPTY, type: "webhook" })}>
              <Plus className="h-3.5 w-3.5" /> Add link
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDraft({ ...EMPTY, type: "notion" })}>
              <Plus className="h-3.5 w-3.5" /> Notion
            </button>
          </>
        }
      />

      {!actions ? (
        <div className="surface-card h-24 animate-pulse rounded-3xl" />
      ) : actions.length === 0 ? (
        <SectionCard>
          <p className="text-sm text-[var(--ink-muted)]">No connected apps yet. Add a Notion page or an automation link (Zapier, Make, n8n, or Slack).</p>
        </SectionCard>
      ) : (
        <ul className="space-y-3">
          {actions.map((action) => (
            <li key={action.id} className="surface-card rounded-3xl p-5">
              <div className="flex flex-wrap items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-subtle)]">
                  {action.type === "webhook" ? <Webhook className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{action.title}</p>
                  <p className="truncate text-xs text-[var(--ink-muted)]">{action.type === "webhook" ? action.target : `Notion page ${action.target}`}</p>
                  {action.lastRunAt && (
                    <p className={`mt-1 inline-flex items-center gap-1 text-xs ${action.lastStatus === "ok" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
                      {action.lastStatus === "ok" ? <CheckCircle2 className="h-3 w-3" /> : <CircleAlert className="h-3 w-3" />}
                      {action.lastStatus === "ok" ? "Last sent" : "Failed"} {formatDateTime(action.lastRunAt)}
                      {action.lastStatus === "error" && action.lastError ? `: ${action.lastError}` : ""}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy === action.id} onClick={() => void test(action)}>
                    {busy === action.id ? <Spinner className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />} Test
                  </button>
                  <button
                    type="button"
                    className="icon-btn h-8 w-8"
                    aria-label={`Edit ${action.title}`}
                    onClick={() =>
                      setDraft({
                        id: action.id,
                        type: action.type,
                        title: action.title,
                        url: action.type === "webhook" ? action.target : "",
                        token: "",
                        pageUrl: action.type === "notion" ? action.target : "",
                        onTranscript: action.onTranscript,
                        onRewrite: action.onRewrite,
                      })
                    }
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="icon-btn h-8 w-8 hover:!text-[var(--danger)]"
                    aria-label={`Delete ${action.title}`}
                    onClick={async () => {
                      const confirmed = await askConfirm({
                        title: "Disconnect this integration?",
                        subject: action.title,
                        message: "Notes will no longer be sent to it, and its saved settings will be removed.",
                        confirmLabel: "Disconnect",
                        tone: "danger",
                        icon: Unplug,
                      });
                      if (!confirmed) return;
                      try {
                        await api(`/api/actions/${action.id}`, { method: "DELETE" });
                        await load();
                      } catch (error) {
                        toast(errorMessage(error), "error");
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="mt-3 grid gap-3 border-t border-[var(--border)] pt-3 sm:grid-cols-2">
                <Switch checked={action.onTranscript} onChange={(value) => void toggle(action, "onTranscript", value)} label="Send new transcripts automatically" />
                <Switch checked={action.onRewrite} onChange={(value) => void toggle(action, "onRewrite", value)} label="Send new rewrites automatically" />
              </div>
            </li>
          ))}
        </ul>
      )}

      <SectionCard title="Zapier, Make, n8n & Slack">
        <div className="flex gap-3 text-sm">
          <Zap className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div className="space-y-2 text-[var(--ink-muted)]">
            <p>
              Create a webhook trigger in Zapier, Make, n8n, or Slack, copy its URL, and add it above. Your notes flow right in.
            </p>
            <div>
              <button
                type="button"
                aria-expanded={sampleOpen}
                onClick={() => setSampleOpen((open) => !open)}
                className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-[var(--ink-subtle)] transition-colors hover:text-[var(--ink)]"
              >
                <motion.span animate={{ rotate: sampleOpen ? 180 : 0 }} transition={SPRING_SNAPPY} className="inline-flex">
                  <ChevronDown className="h-3.5 w-3.5" />
                </motion.span>
                For developers: sample webhook payload
              </button>
              <Accordion open={sampleOpen}>
                <div className="pt-2">
                  <pre className="overflow-x-auto rounded-2xl bg-[var(--surface-subtle)] p-3 text-xs text-[var(--ink)]">{SAMPLE_PAYLOAD}</pre>
                </div>
              </Accordion>
            </div>
          </div>
        </div>
      </SectionCard>

      <Dialog
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Edit connection" : draft?.type === "notion" ? "Connect a Notion page" : "Add automation link"}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={busy === "save"} onClick={() => void save()}>
              {busy === "save" && <Spinner className="h-3.5 w-3.5" />} Save
            </button>
          </>
        }
      >
        {draft && (
          <div className="space-y-4">
            <label className="block text-sm font-medium">
              Name
              <input
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                maxLength={60}
                placeholder={draft.type === "webhook" ? "e.g. Zapier to Google Docs" : "e.g. Notion inbox"}
                className="field mt-1.5"
              />
            </label>
            {draft.type === "webhook" ? (
              <label className="block text-sm font-medium">
                Destination URL
                <input
                  value={draft.url}
                  onChange={(event) => setDraft({ ...draft, url: event.target.value })}
                  type="url"
                  placeholder="https://hooks.zapier.com/hooks/catch/…"
                  className="field mt-1.5 font-mono text-[13px]"
                />
              </label>
            ) : (
              <>
                <ol className="list-decimal space-y-1 pl-5 text-xs text-[var(--ink-muted)]">
                  <li>Create an internal integration in your Notion settings and copy its secret.</li>
                  <li>Open the destination Notion page, choose ⋯ → Connections, and add it.</li>
                  <li>Paste your Notion page link below.</li>
                </ol>
                <label className="block text-sm font-medium">
                  Integration secret
                  <input
                    value={draft.token}
                    onChange={(event) => setDraft({ ...draft, token: event.target.value })}
                    type="password"
                    autoComplete="off"
                    placeholder={draft.id ? "Leave blank to keep saved secret" : "Paste secret token"}
                    className="field mt-1.5 font-mono text-[13px]"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Page link
                  <input
                    value={draft.pageUrl}
                    onChange={(event) => setDraft({ ...draft, pageUrl: event.target.value })}
                    placeholder="https://www.notion.so/My-notes-…"
                    className="field mt-1.5 font-mono text-[13px]"
                  />
                </label>
              </>
            )}
            <div className="space-y-3 rounded-2xl bg-[var(--surface-subtle)] p-3">
              <Switch checked={draft.onTranscript} onChange={(value) => setDraft({ ...draft, onTranscript: value })} label="Send automatically when transcribed" />
              <Switch checked={draft.onRewrite} onChange={(value) => setDraft({ ...draft, onRewrite: value })} label="Send automatically when rewritten" />
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
