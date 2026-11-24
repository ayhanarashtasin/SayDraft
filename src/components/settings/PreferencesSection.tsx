"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, CircleAlert, Monitor, Moon, Sun } from "lucide-react";
import { motion } from "motion/react";
import { api, errorMessage } from "@/lib/api-client";
import { LANGUAGES } from "@/lib/languages";
import { SPRING_SNAPPY } from "@/lib/motion";
import type { AppSettings, Prompt } from "@/lib/types";
import { useAppStatus } from "../StatusProvider";
import { type Theme, useTheme } from "../ThemeProvider";
import { useToast } from "../Toast";
import { Accordion, Switch } from "../ui";
import { BackgroundPicker } from "./BackgroundPicker";
import { SectionCard, SectionHeader } from "./SectionLayout";

const MODEL_SUGGESTIONS = {
  transcribe: ["whisper-large-v3-turbo", "whisper-large-v3", "gpt-4o-mini-transcribe", "gpt-4o-transcribe", "whisper-1"],
  rewrite: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini", "gpt-4o", "gpt-5-mini", "gpt-5"],
  diarize: ["gpt-4o-transcribe-diarize"],
};

function ModelField({
  id,
  label,
  description,
  value,
  suggestions,
  allowEmpty,
  onSave,
}: {
  id: string;
  label: string;
  description: string;
  value: string;
  suggestions: string[];
  allowEmpty?: boolean;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const next = draft.trim();
    if (next === value || (!next && !allowEmpty)) {
      setDraft(value);
      return;
    }
    onSave(next);
  };
  return (
    <label htmlFor={id} className="block">
      <span className="text-sm font-medium">{label}</span>
      <span className="mt-0.5 block text-xs text-[var(--ink-muted)]">{description}</span>
      <input
        id={id}
        list={`${id}-options`}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
        }}
        placeholder={allowEmpty ? "Leave blank to keep off" : undefined}
        className="field mt-2 font-mono text-[13px]"
      />
      <datalist id={`${id}-options`}>
        {suggestions.map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
    </label>
  );
}

export function PreferencesSection() {
  const toast = useToast();
  const { theme, setTheme } = useTheme();
  const { status, refresh } = useAppStatus();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    api<{ settings: AppSettings }>("/api/settings").then((data) => setSettings(data.settings)).catch((error) => toast(errorMessage(error), "error"));
    api<{ prompts: Prompt[] }>("/api/prompts").then((data) => setPrompts(data.prompts)).catch(() => undefined);
  }, [toast]);

  async function save(patch: Partial<AppSettings>) {
    try {
      const data = await api<{ settings: AppSettings }>("/api/settings", { method: "PATCH", json: patch });
      setSettings(data.settings);
      toast("Preferences saved");
      void refresh();
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  }

  return (
    <div className="space-y-5">
      <SectionHeader title="Preferences" description="Choose how Saydraft looks, transcribes, and polishes your notes." />

      <SectionCard title="Appearance">
        <div className="space-y-5">
          <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-full bg-[var(--surface-subtle)] p-1">
            {(
              [
                ["system", "System", Monitor],
                ["light", "Light", Sun],
                ["dark", "Dark", Moon],
              ] as Array<[Theme, string, typeof Sun]>
            ).map(([value, label, Icon]) => {
              const active = theme === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setTheme(value)}
                  className={`relative inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-150 ${
                    active ? "text-[var(--ink)]" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="prefs-theme-pill"
                      transition={SPRING_SNAPPY}
                      aria-hidden="true"
                      className="absolute inset-0 rounded-full bg-[var(--surface)] shadow-xs"
                    />
                  )}
                  <span className="relative z-10 inline-flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5" /> {label}
                  </span>
                </button>
              );
            })}
          </div>

          <div>
            <p className="text-sm font-medium">Dashboard background</p>
            <p className="mb-3 mt-0.5 text-xs text-[var(--ink-muted)]">
              Pick a fixed wallpaper or let Saydraft rotate all 7 every 30 minutes.
            </p>
            <BackgroundPicker />
          </div>
        </div>
      </SectionCard>

      {!settings ? (
        <SectionCard title="Loading…">
          <div className="h-24 animate-pulse rounded-2xl bg-[var(--surface-subtle)]" />
        </SectionCard>
      ) : (
        <>
          <SectionCard title="Language & transcription">
            <div className="space-y-5">
              <label className="block">
                <span className="text-sm font-medium">Speaker&apos;s language</span>
                <span className="mt-0.5 block text-xs text-[var(--ink-muted)]">
                  The language you usually speak. Auto-detect handles most notes cleanly.
                </span>
                <select value={settings.defaultLanguage} onChange={(event) => void save({ defaultLanguage: event.target.value })} className="field mt-2">
                  <option value="auto">Auto-detect</option>
                  {LANGUAGES.map((language) => (
                    <option key={language.code} value={language.code}>
                      {language.name} · {language.native}
                    </option>
                  ))}
                </select>
              </label>
              <Switch
                checked={settings.useDictionary}
                onChange={(value) => void save({ useDictionary: value })}
                label="Use my dictionary"
                description="Helps spell names, brands, and special terms accurately."
              />
              <Switch
                checked={settings.autoReplacements}
                onChange={(value) => void save({ autoReplacements: value })}
                label="Apply text replacements automatically"
                description="Runs your saved phrase shortcuts on every new transcript."
              />
              <Switch
                checked={settings.autoTitle}
                onChange={(value) => void save({ autoTitle: value })}
                label="Automatic titles"
                description="Gives new recordings a short title automatically."
              />
            </div>
          </SectionCard>

          <SectionCard title="Automatic rewrite">
            <label className="block">
              <span className="text-sm font-medium">Style new recordings automatically</span>
              <span className="mt-0.5 block text-xs text-[var(--ink-muted)]">Creates a polished version right after transcription finishes.</span>
              <select
                value={settings.autoRewritePromptId ?? ""}
                onChange={(event) => void save({ autoRewritePromptId: event.target.value ? Number(event.target.value) : null })}
                className="field mt-2"
              >
                <option value="">Off</option>
                {prompts.map((prompt) => (
                  <option key={prompt.id} value={prompt.id}>
                    {prompt.title} ({prompt.category})
                  </option>
                ))}
              </select>
            </label>
          </SectionCard>

          <div className="surface-card rounded-3xl">
            <button
              type="button"
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((open) => !open)}
              className="flex w-full cursor-pointer items-center justify-between gap-2 p-5 text-left sm:px-6"
            >
              <div>
                <h2 className="text-base font-semibold text-[var(--ink)]">Advanced</h2>
                <p className="mt-0.5 text-xs text-[var(--ink-muted)]">AI service status, audio capabilities, and model preferences.</p>
              </div>
              <motion.span animate={{ rotate: advancedOpen ? 180 : 0 }} transition={SPRING_SNAPPY} className="inline-flex shrink-0">
                <ChevronDown className="h-4 w-4 text-[var(--ink-muted)]" />
              </motion.span>
            </button>

            <Accordion open={advancedOpen}>
              <div className="space-y-6 border-t border-[var(--border)] px-5 pb-6 pt-5 sm:px-6">
                {status && (
                  <div className="space-y-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Service status</p>
                    <ul className="space-y-2 text-sm">
                      <li className="flex items-start gap-2">
                        {status.configured ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success)]" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" />}
                        <span>
                          {status.configured
                            ? "Voice transcription and AI rewriting are connected and ready."
                            : "Voice transcription and AI rewriting aren't connected yet."}
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        {status.ffmpeg ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success)]" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" />}
                        <span>
                          {status.ffmpeg
                            ? "Extended audio & video conversion is active."
                            : "Standard audio formats active. ffmpeg enables additional formats and long audio."}
                        </span>
                      </li>
                    </ul>
                  </div>
                )}

                <div className="space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">AI model selection</p>
                  <ModelField
                    id="transcribe-model"
                    label="Transcription model"
                    description="Used to turn voice recordings and uploaded audio into text."
                    value={settings.transcribeModel}
                    suggestions={MODEL_SUGGESTIONS.transcribe}
                    onSave={(value) => void save({ transcribeModel: value })}
                  />
                  <ModelField
                    id="rewrite-model"
                    label="Writing model"
                    description="Used for note titles, rewrites, and translations."
                    value={settings.rewriteModel}
                    suggestions={MODEL_SUGGESTIONS.rewrite}
                    onSave={(value) => void save({ rewriteModel: value })}
                  />
                  <ModelField
                    id="diarize-model"
                    label="Speaker separation model"
                    description="Optional speaker labeling for meetings and interviews."
                    value={settings.diarizeModel}
                    suggestions={MODEL_SUGGESTIONS.diarize}
                    allowEmpty
                    onSave={(value) => void save({ diarizeModel: value })}
                  />
                </div>
              </div>
            </Accordion>
          </div>
        </>
      )}
    </div>
  );
}
