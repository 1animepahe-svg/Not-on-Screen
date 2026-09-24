"use client";

import { motion, AnimatePresence } from "framer-motion";

export function Avatar({ initials, name, title, speaking, size = 96, you = false }: { initials: string; name: string; title: string; speaking: boolean; size?: number; you?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <AnimatePresence>
          {speaking && (
            <>
              <motion.span
                key="r1"
                className="absolute inset-0 rounded-full border-2 border-accent"
                initial={{ opacity: 0.7, scale: 1 }}
                animate={{ opacity: 0, scale: 1.35 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
              />
              <motion.span
                key="r2"
                className="absolute inset-0 rounded-full border border-accent/70"
                initial={{ opacity: 0.6, scale: 1 }}
                animate={{ opacity: 0, scale: 1.2 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut", delay: 0.5 }}
              />
            </>
          )}
        </AnimatePresence>
        <motion.div
          animate={{ scale: speaking ? 1.04 : 1, boxShadow: speaking ? "0 0 0 2px rgba(52,211,164,0.9), 0 0 40px rgba(52,211,164,0.35)" : "0 0 0 1px rgba(255,255,255,0.1)" }}
          transition={{ duration: 0.2 }}
          className={`flex h-full w-full items-center justify-center rounded-full ${you ? "bg-gradient-to-br from-white/15 to-white/[0.03]" : "bg-gradient-to-br from-accent-deep/70 to-[#0f1a17]"}`}
        >
          <span className="font-semibold tracking-wide text-white/90" style={{ fontSize: size * 0.28 }}>
            {initials}
          </span>
        </motion.div>
      </div>
      <div className="text-center">
        <div className="text-sm font-medium text-white">{name}</div>
        <div className="text-xs text-white/45">{title}</div>
      </div>
    </div>
  );
}
