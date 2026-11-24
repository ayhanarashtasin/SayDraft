"use client";

import { useEffect, useId, useRef } from "react";
import { Loader2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { EASE_OUT, SPRING_SMOOTH, SPRING_SNAPPY, TAP_ICON } from "@/lib/motion";

/** Closes a popover on outside click or Escape. */
export function useDismiss(ref: React.RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, open, onClose]);
}

function isTopDialog(panel: HTMLElement | null): boolean {
  if (!panel) return false;
  const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
  return dialogs[dialogs.length - 1] === panel;
}

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  trigger: React.ReactNode;
  children: React.ReactNode;
  /** Classes for the floating panel (position it with top/bottom/left/right utilities). */
  panelClassName?: string;
  className?: string;
}

/** A trigger with a spring-smooth floating menu panel. */
export function Popover({ open, onClose, trigger, children, panelClassName = "", className = "" }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, onClose);
  const opensUp = panelClassName.includes("bottom-");
  return (
    <div ref={ref} className={`relative ${className}`}>
      {trigger}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: opensUp ? 6 : -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: opensUp ? 4 : -4 }}
            transition={{ duration: 0.16, ease: EASE_OUT }}
            style={{ transformOrigin: opensUp ? "bottom center" : "top center" }}
            className={`menu ${panelClassName}`}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  centeredHeader?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

export function Dialog({ open, onClose, title, description, centeredHeader = false, children, footer, size = "md" }: DialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isTopDialog(panelRef.current)) onClose();
    };
    document.addEventListener("keydown", onKey);
    const frame = requestAnimationFrame(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>("input, textarea, select, button:not([data-close])");
      (focusable ?? panelRef.current)?.focus();
    });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, onClose]);

  const width =
    size === "sm"
      ? "max-w-[26rem]"
      : size === "lg"
        ? "max-w-[33rem]"
        : size === "xl"
          ? "max-w-[47.25rem]"
          : "max-w-[30rem]";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: EASE_OUT }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--backdrop)] p-0 backdrop-blur-[3px] sm:items-center sm:p-4"
          onPointerDown={onClose}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            tabIndex={-1}
            onPointerDown={(event) => event.stopPropagation()}
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={SPRING_SMOOTH}
            className={`flex max-h-[92vh] w-full ${width} flex-col rounded-t-[2rem] border border-[var(--border)]/60 bg-[var(--surface-panel)] shadow-2xl outline-none sm:rounded-[2rem]`}
          >
            {centeredHeader ? (
              <div className="relative flex min-h-[3.75rem] items-center justify-center px-14 pt-4">
                {title && (
                  <h2 id={titleId} className="truncate text-[1rem] font-semibold tracking-tight text-[var(--ink)]">
                    {title}
                  </h2>
                )}
                <motion.button
                  type="button"
                  data-close
                  whileTap={TAP_ICON}
                  onClick={onClose}
                  aria-label="Close"
                  className="circle-close absolute right-4 top-4"
                >
                  <X className="h-4 w-4" />
                </motion.button>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3 px-6 pt-5">
                <div className="min-w-0">
                  {title && (
                    <h2 id={titleId} className="text-lg font-semibold tracking-tight text-[var(--ink)]">
                      {title}
                    </h2>
                  )}
                  {description && <p className="mt-0.5 text-sm text-[var(--ink-muted)]">{description}</p>}
                </div>
                <motion.button
                  type="button"
                  data-close
                  whileTap={TAP_ICON}
                  onClick={onClose}
                  aria-label="Close"
                  className="circle-close"
                >
                  <X className="h-4 w-4" />
                </motion.button>
              </div>
            )}
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>
            {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] px-6 py-4">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  headerContent?: React.ReactNode;
  ariaLabel?: string;
  widthClassName?: string;
  children: React.ReactNode;
}

/** Right-edge slide-over drawer with critically-damped spring physics. */
export function Drawer({
  open,
  onClose,
  title,
  headerContent,
  ariaLabel,
  widthClassName = "w-full max-w-[24.375rem]",
  children,
}: DrawerProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isTopDialog(panelRef.current)) onClose();
    };
    document.addEventListener("keydown", onKey);
    const frame = requestAnimationFrame(() => panelRef.current?.focus());
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: EASE_OUT }}
          className="fixed inset-0 z-50 flex justify-end bg-[var(--backdrop)] backdrop-blur-[2px]"
          onPointerDown={onClose}
        >
          <motion.article
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-label={!title ? ariaLabel ?? "Panel" : undefined}
            tabIndex={-1}
            onPointerDown={(event) => event.stopPropagation()}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={SPRING_SMOOTH}
            className={`no-scrollbar relative flex h-full ${widthClassName} flex-col overflow-y-auto bg-[var(--surface-panel)] shadow-2xl outline-none`}
          >
            {headerContent !== undefined ? (
              headerContent
            ) : (
              <div className="sticky top-0 z-10 flex items-center justify-center border-b border-[var(--border)] bg-[var(--surface-panel)]/95 px-6 py-[1.1875rem] backdrop-blur-md">
                <h2 id={titleId} className="text-[1.0625rem]/6 font-semibold text-[var(--ink)]">
                  {title}
                </h2>
                <motion.button
                  type="button"
                  data-close
                  whileTap={TAP_ICON}
                  onClick={onClose}
                  aria-label="Close"
                  className="absolute right-4 top-1/2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-[var(--surface-panel-card)] text-[var(--ink-subtle)] transition-opacity hover:opacity-70"
                >
                  <X className="h-4 w-4" />
                </motion.button>
              </div>
            )}
            {children}
          </motion.article>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Smooth height + opacity collapsible wrapper (replaces abrupt <details> or CSS grid hacks). */
export function Accordion({ open, children, className = "" }: { open: boolean; children: React.ReactNode; className?: string }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: EASE_OUT }}
          className={`overflow-hidden ${className}`}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  hideLabel,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  /** Keeps the label for screen readers only. */
  hideLabel?: boolean;
}) {
  const id = useId();
  return (
    <div className={`flex items-start justify-between gap-4 ${disabled ? "opacity-50" : ""}`}>
      <label htmlFor={id} className={hideLabel ? "sr-only" : "min-w-0 cursor-pointer"}>
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-[var(--ink-muted)]">{description}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 flex h-[31px] w-[51px] shrink-0 cursor-pointer items-center rounded-full p-[2px] transition-colors duration-200 disabled:cursor-not-allowed ${
          checked ? "justify-end bg-[var(--brand)]" : "justify-start bg-[#787880]/20 dark:bg-[#787880]/40"
        }`}
      >
        <motion.span
          layout
          transition={SPRING_SNAPPY}
          className="inline-block h-[27px] w-[27px] rounded-full bg-white"
          style={{ boxShadow: "var(--shadow-switch-thumb)" }}
        />
      </button>
    </div>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} aria-hidden="true" />;
}

export function ProgressBar({ value, label }: { value: number | null; label?: string }) {
  const percent = value === null ? null : Math.round(Math.min(Math.max(value, 0), 1) * 100);
  return (
    <div
      className="progress-track"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? undefined}
    >
      <div className={`progress-bar ${percent === null ? "pulse-dot w-1/3" : ""}`} style={percent === null ? undefined : { width: `${Math.max(percent, 3)}%` }} />
    </div>
  );
}

export function TagDot({ color, className = "h-2 w-2" }: { color: string; className?: string }) {
  return <span aria-hidden="true" className={`inline-block shrink-0 rounded-full ${className}`} style={{ backgroundColor: color }} />;
}

export function CuteMicIcon({ className = "h-10 w-10", eyeFill = "var(--accent)" }: { className?: string; eyeFill?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" className={className}>
      <g fill="currentColor">
        <path d="M24.3 46.8604C14.22 46.8604 6 38.6604 6 28.5604V24.8004C6 24.0204 6.64 23.4004 7.4 23.4004C8.16 23.4004 8.8 24.0404 8.8 24.8004V28.5604C8.8 37.1004 15.74 44.0404 24.28 44.0404C32.82 44.0404 39.76 37.1004 39.76 28.5604V24.8004C39.76 24.0204 40.4 23.4004 41.16 23.4004C41.92 23.4004 42.56 24.0404 42.56 24.8004V28.5604C42.6 38.6604 34.38 46.8604 24.3 46.8604Z" />
        <rect x="12.3008" y="5" width="24" height="36" rx="12" />
      </g>
      <g fill={eyeFill}>
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M20.4038 18C19.0762 18 18 19.0762 18 20.4038C18 21.7315 19.0762 22.8077 20.4038 22.8077C21.7315 22.8077 22.8077 21.7315 22.8077 20.4038C22.8077 20.1007 22.3672 20.02 22.0707 20.083C22.008 20.0964 21.9429 20.1034 21.8762 20.1034C21.3618 20.1034 20.9447 19.6863 20.9447 19.1719C20.9447 18.7283 20.9126 18.0127 20.4692 18.0009C20.4475 18.0003 20.4257 18 20.4038 18Z"
        />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M28.0953 18C26.7676 18 25.6914 19.0762 25.6914 20.4038C25.6914 21.7315 26.7676 22.8077 28.0953 22.8077C29.4229 22.8077 30.4991 21.7315 30.4991 20.4038C30.4991 20.1007 30.0587 20.02 29.7621 20.083C29.6994 20.0964 29.6343 20.1034 29.5676 20.1034C29.0532 20.1034 28.6361 19.6863 28.6361 19.1719C28.6361 18.7283 28.604 18.0127 28.1606 18.0009C28.1389 18.0003 28.1171 18 28.0953 18Z"
        />
      </g>
    </svg>
  );
}
