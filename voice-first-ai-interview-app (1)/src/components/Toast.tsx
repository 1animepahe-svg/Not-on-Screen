"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, XCircle, X } from "lucide-react";

type Tone = "info" | "warn" | "error" | "success";
type T = { id: number; msg: string; tone: Tone };
const Ctx = createContext<(msg: string, tone?: Tone) => void>(() => {});

export function useToast() {
  return useContext(Ctx);
}

const icons = { info: Info, warn: AlertTriangle, error: XCircle, success: CheckCircle2 };
const tint = { info: "text-white/70", warn: "text-amber-300", error: "text-rose-300", success: "text-accent" };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<T[]>([]);
  const push = useCallback((msg: string, tone: Tone = "info") => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.filter((x) => x.msg !== msg).slice(-3), { id, msg, tone }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), tone === "error" ? 7000 : 4500);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-6 right-6 z-[100] flex w-[360px] max-w-[calc(100vw-48px)] flex-col gap-2" role="status" aria-live="polite">
        <AnimatePresence initial={false}>
          {items.map((t) => {
            const I = icons[t.tone];
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className="glass pointer-events-auto flex items-start gap-3 rounded-2xl px-4 py-3 text-sm text-white/90"
              >
                <I className={`mt-0.5 h-4 w-4 shrink-0 ${tint[t.tone]}`} />
                <span className="flex-1 leading-snug">{t.msg}</span>
                <button onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))} className="text-white/40 hover:text-white/80" aria-label="Dismiss">
                  <X className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
