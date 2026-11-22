"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CircleHelp, TriangleAlert, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import { EASE_OUT, SPRING_SMOOTH, SPRING_SNAPPY } from "@/lib/motion";

export interface ConfirmOptions {
  /** The question, kept short: "Delete this note?" */
  title: string;
  /** One or two sentences on what will happen. */
  message?: string;
  /** What the action applies to (a note title, a tag name…), shown in its own chip. */
  subject?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" is for destructive actions: red button, and focus starts on Cancel. */
  tone?: "default" | "danger";
  icon?: LucideIcon;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

interface Pending {
  id: number;
  options: ConfirmOptions;
  resolve: (confirmed: boolean) => void;
}

/** Without a provider (isolated renders, tests) a destructive action must still ask. */
const nativeConfirm: ConfirmFn = async ({ title, subject, message }) =>
  window.confirm([title, subject, message].filter(Boolean).join("\n\n"));

const ConfirmContext = createContext<ConfirmFn>(nativeConfirm);

/**
 * In-app replacement for `window.confirm`. Resolves true when confirmed and false when
 * cancelled, dismissed with Escape, or clicked away.
 *
 *   const askConfirm = useConfirm();
 *   if (!(await askConfirm({ title: "Delete this note?", tone: "danger", confirmLabel: "Delete" }))) return;
 */
export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<Pending | null>(null);
  const activeRef = useRef<Pending | null>(null);
  const queueRef = useRef<Pending[]>([]);
  const nextId = useRef(1);
  const pathname = usePathname();

  // Settling is keyed by the question itself, so a double click can never answer the next one in line.
  const settle = useCallback((item: Pending, confirmed: boolean) => {
    if (activeRef.current !== item) return;
    item.resolve(confirmed);
    const next = queueRef.current.shift() ?? null;
    activeRef.current = next;
    setActive(next);
  }, []);

  const confirm = useCallback<ConfirmFn>(
    (options) =>
      new Promise<boolean>((resolve) => {
        const item: Pending = { id: nextId.current++, options, resolve };
        if (activeRef.current) {
          queueRef.current.push(item);
        } else {
          activeRef.current = item;
          setActive(item);
        }
      }),
    [],
  );

  // A question belongs to the screen that asked it: leaving that screen (browser Back…) cancels it.
  useEffect(() => {
    return () => {
      const pending = [activeRef.current, ...queueRef.current];
      activeRef.current = null;
      queueRef.current = [];
      setActive(null);
      for (const item of pending) item?.resolve(false);
    };
  }, [pathname]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AnimatePresence mode="wait">{active && <ConfirmModal key={active.id} item={active} settle={settle} />}</AnimatePresence>
    </ConfirmContext.Provider>
  );
}

/**
 * With reduced motion everything only fades: the hidden state itself has no offset, scale or spin,
 * so not even a stray first frame of movement is painted before the final transform lands.
 */
function buildVariants(reduce: boolean): { panel: Variants; icon: Variants; item: Variants } {
  return {
    panel: {
      hidden: { opacity: 0, y: reduce ? 0 : 28, scale: reduce ? 1 : 0.94 },
      show: {
        opacity: 1,
        y: 0,
        scale: 1,
        // Spring for the movement, a plain fade for opacity so it never overshoots.
        transition: { ...SPRING_SMOOTH, opacity: { duration: 0.18, ease: EASE_OUT }, delayChildren: 0.05, staggerChildren: 0.04 },
      },
      exit: { opacity: 0, y: reduce ? 0 : 10, scale: reduce ? 1 : 0.97, transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } },
    },
    icon: {
      hidden: { opacity: 0, scale: reduce ? 1 : 0.55, rotate: reduce ? 0 : -12 },
      show: { opacity: 1, scale: 1, rotate: 0, transition: SPRING_SNAPPY },
    },
    item: {
      hidden: { opacity: 0, y: reduce ? 0 : 8 },
      show: { opacity: 1, y: 0, transition: { duration: 0.26, ease: EASE_OUT } },
    },
  };
}

function ConfirmModal({ item, settle }: { item: Pending; settle: (item: Pending, confirmed: boolean) => void }) {
  const { title, message, subject, confirmLabel = "Confirm", cancelLabel = "Cancel", tone = "default" } = item.options;
  const danger = tone === "danger";
  const Icon = item.options.icon ?? (danger ? TriangleAlert : CircleHelp);
  const titleId = useId();
  const bodyId = useId();
  const reduceMotion = useReducedMotion();
  const variants = useMemo(() => buildVariants(!!reduceMotion), [reduceMotion]);
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // A drawer or dialog underneath may already hold the scroll lock; only release a lock we took ourselves.
    const overflow = document.body.style.overflow;
    const ownsScrollLock = overflow !== "hidden";
    if (ownsScrollLock) document.body.style.overflow = "hidden";

    // Destructive questions start on the safe answer, so a stray Enter can't delete anything.
    const frame = requestAnimationFrame(() => (danger ? cancelRef : confirmRef).current?.focus({ preventScroll: true }));

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Swallowed here so a drawer or dialog underneath doesn't close along with us.
        event.preventDefault();
        event.stopImmediatePropagation();
        settle(item, false);
        return;
      }
      if (event.repeat && (event.key === "Enter" || event.key === " ")) {
        // A key still held down from the click that opened this must not answer it.
        event.preventDefault();
        return;
      }
      if (event.key === "Tab" && panel) {
        const buttons = Array.from(panel.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
        if (buttons.length === 0) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        const focused = document.activeElement;
        if (!panel.contains(focused)) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey && focused === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && focused === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown, true);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown, true);
      if (ownsScrollLock && document.body.style.overflow === "hidden") document.body.style.overflow = overflow;
      // Hand focus back to whatever opened the question, unless something else has taken it since.
      const focused = document.activeElement;
      if (previous?.isConnected && (!focused || focused === document.body || panel?.contains(focused))) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [item, settle, danger]);

  return (
    <motion.div
      className="fixed inset-0 z-[55] flex items-end justify-center bg-[var(--backdrop)] backdrop-blur-[3px] sm:items-center sm:p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      // Linear on the way out so the scrim fades in step with the card instead of vanishing first.
      exit={{ opacity: 0, transition: { duration: 0.18, ease: "linear" } }}
      transition={{ duration: 0.2, ease: EASE_OUT }}
      onPointerDown={() => settle(item, false)}
    >
      <motion.div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? bodyId : undefined}
        tabIndex={-1}
        onPointerDown={(event) => event.stopPropagation()}
        variants={variants.panel}
        initial="hidden"
        animate="show"
        exit="exit"
        className={`surface-card relative w-full overflow-hidden rounded-t-[1.75rem] px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 text-center shadow-2xl outline-none sm:max-w-[23.5rem] sm:rounded-[1.75rem] sm:pb-6 sm:pt-7 ${
          danger ? "[--tone:var(--danger)]" : "[--tone:var(--brand)]"
        }`}
      >
        {/* Soft wash of the tone colour behind the icon. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-32"
          style={{ background: "radial-gradient(70% 100% at 50% 0%, color-mix(in srgb, var(--tone) 18%, transparent), transparent)" }}
        />
        <div className="relative">
          <div aria-hidden="true" className="mx-auto mb-4 h-1 w-9 rounded-full bg-[var(--border)] sm:hidden" />

          <motion.div
            variants={variants.icon}
            className="relative mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full text-[var(--tone)]"
            style={{
              backgroundColor: "color-mix(in srgb, var(--tone) 14%, transparent)",
              boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--tone) 22%, transparent)",
            }}
          >
            {!reduceMotion && (
              <motion.span
                aria-hidden="true"
                className="absolute inset-0 rounded-full"
                style={{ boxShadow: "0 0 0 2px color-mix(in srgb, var(--tone) 38%, transparent)" }}
                initial={{ scale: 1, opacity: 0.7 }}
                animate={{ scale: 1.75, opacity: 0 }}
                transition={{ duration: 0.85, delay: 0.2, ease: EASE_OUT }}
              />
            )}
            <Icon className="h-6 w-6" aria-hidden="true" />
          </motion.div>

          <motion.h2 variants={variants.item} id={titleId} className="text-[1.1875rem] font-semibold leading-snug tracking-tight text-[var(--ink)]">
            {title}
          </motion.h2>
          {message && (
            <motion.p variants={variants.item} id={bodyId} className="mx-auto mt-1.5 max-w-[20rem] text-sm leading-relaxed text-[var(--ink-subtle)]">
              {message}
            </motion.p>
          )}
          {subject && (
            <motion.p
              variants={variants.item}
              className="mx-auto mt-4 line-clamp-2 break-words rounded-2xl bg-[var(--surface-subtle)] px-4 py-2.5 text-sm font-medium text-[var(--ink)]"
            >
              {subject}
            </motion.p>
          )}

          <motion.div variants={variants.item} className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row">
            <button ref={cancelRef} type="button" className="btn btn-secondary h-11 flex-1 text-[0.9375rem]" onClick={() => settle(item, false)}>
              {cancelLabel}
            </button>
            <button
              ref={confirmRef}
              type="button"
              className={`btn h-11 flex-1 text-[0.9375rem] ${danger ? "btn-danger dark:text-[var(--accent-ink)]" : "btn-primary"}`}
              onClick={() => settle(item, true)}
            >
              {confirmLabel}
            </button>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}
