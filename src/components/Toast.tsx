"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { SPRING_SNAPPY, TAP_ICON } from "@/lib/motion";

type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

type ToastFn = (message: string, kind?: ToastKind) => void;

const ToastContext = createContext<ToastFn>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback<ToastFn>(
    (message, kind = "success") => {
      const id = nextId.current++;
      setItems((current) => [...current.slice(-3), { id, kind, message }]);
      setTimeout(() => dismiss(id), kind === "error" ? 7000 : 3500);
    },
    [dismiss],
  );

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4"
      >
        <AnimatePresence mode="popLayout">
          {items.map((item) => {
            const Icon = item.kind === "success" ? CheckCircle2 : item.kind === "error" ? CircleAlert : Info;
            const isError = item.kind === "error";
            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: -14, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.94 }}
                transition={SPRING_SNAPPY}
                role={isError ? "alert" : "status"}
                className={`pointer-events-auto flex max-w-md items-center gap-2.5 rounded-full px-4 py-2.5 text-sm font-medium shadow-[var(--shadow-float)] ${
                  isError
                    ? "border border-[var(--danger)]/35 bg-[var(--surface)] text-[var(--danger)]"
                    : "bg-[var(--accent)] text-[var(--accent-ink)]"
                }`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    item.kind === "success"
                      ? "text-[var(--success)]"
                      : isError
                        ? "text-[var(--danger)]"
                        : "opacity-80"
                  }`}
                />
                <span className="flex-1">{item.message}</span>
                <motion.button
                  type="button"
                  whileTap={TAP_ICON}
                  onClick={() => dismiss(item.id)}
                  aria-label="Dismiss"
                  className="cursor-pointer rounded-full p-0.5 opacity-65 transition-opacity hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </motion.button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastFn {
  return useContext(ToastContext);
}
