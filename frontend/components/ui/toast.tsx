"use client";

import { clsx } from "clsx";
import { X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { ExplorerLink } from "../explorer-link";

type ToastTone = "success" | "error" | "pending";

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
  txHash?: string;
}

interface ToastApi {
  push: (t: Omit<ToastItem, "id">) => void;
}

const Ctx = createContext<ToastApi>({ push: () => {} });

export function useToast() {
  return useContext(Ctx);
}

const bar: Record<ToastTone, string> = {
  success: "bg-green-500",
  error: "bg-alert",
  pending: "bg-marigold-400",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

  const push = useCallback(
    (t: Omit<ToastItem, "id">) => {
      const id = Date.now() + Math.random();
      setItems((xs) => [...xs.slice(-3), { ...t, id }]);
      // Auto-dismiss after 6s; errors persist until closed.
      if (t.tone !== "error") setTimeout(() => dismiss(id), 6_000);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ push }), [push]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-20 right-4 z-50 flex w-[calc(100%-32px)] max-w-sm flex-col gap-2 sm:bottom-6 sm:right-6"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className="pointer-events-auto flex animate-toast-in overflow-hidden rounded-panel border border-line bg-surface shadow-pop"
          >
            <span aria-hidden className={clsx("w-1 shrink-0", bar[t.tone])} />
            <div className="min-w-0 flex-1 px-4 py-3">
              <div className="text-[15px] font-semibold leading-5">{t.title}</div>
              {t.body && <div className="mt-1 text-[13px] leading-[18px] text-muted">{t.body}</div>}
              {t.txHash && (
                <div className="mt-1.5 text-[13px]">
                  <ExplorerLink hash={t.txHash} />
                </div>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="m-2 h-8 rounded-btn px-2 text-muted hover:bg-ghost"
              aria-label="Dismiss"
            >
              <X className="size-4" strokeWidth={1.75} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
