"use client";

import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect, useState } from "react";

export function ScoreRing({ value, size = 168, stroke = 10, label, delay = 0 }: { value: number; size?: number; stroke?: number; label?: string; delay?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const mv = useMotionValue(0);
  const offset = useTransform(mv, (v) => c - (v / 100) * c);
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const ctrl = animate(mv, value, { duration: 1.2, delay, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => setDisplay(Math.round(v)) });
    return () => ctrl.stop();
  }, [value, delay, mv]);
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
        <motion.circle cx={size / 2} cy={size / 2} r={r} stroke="#34d3a4" strokeWidth={stroke} strokeLinecap="round" fill="none" strokeDasharray={c} style={{ strokeDashoffset: offset }} />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-semibold tracking-tight text-white" style={{ fontSize: size * 0.28 }}>
          {display}
        </span>
        {label && <span className="text-xs uppercase tracking-[0.14em] text-white/45">{label}</span>}
      </div>
    </div>
  );
}

export function ScoreBar({ label, value, delay = 0 }: { label: string; value: number; delay?: number }) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-sm">
        <span className="text-white/65">{label}</span>
        <span className="font-medium tabular-nums text-white">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
        <motion.div className="h-full rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: `${value}%` }} transition={{ duration: 1, delay, ease: [0.22, 1, 0.36, 1] }} />
      </div>
    </div>
  );
}
