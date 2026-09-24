"use client";

import { useEffect, useRef } from "react";

/** Mirrored bar waveform driven by a live level getter (0..1). */
export function Waveform({ getLevel, active, bars = 48, height = 56, color = "#34d3a4" }: { getLevel: () => number; active: boolean; bars?: number; height?: number; color?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const hist = useRef<number[]>(Array(bars).fill(0));
  const getRef = useRef(getLevel);
  getRef.current = getLevel;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let t = 0;
    const dpr = window.devicePixelRatio || 1;
    const draw = () => {
      t += 1;
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (c.width !== w * dpr) {
        c.width = w * dpr;
        c.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const lvl = active ? getRef.current() : 0;
      if (t % 2 === 0) {
        hist.current.shift();
        hist.current.push(lvl);
      }
      const bw = w / bars;
      for (let i = 0; i < bars; i++) {
        const idle = 0.05 + 0.03 * Math.sin(t / 18 + i / 3);
        const v = Math.max(idle, hist.current[i] ?? 0);
        const bh = Math.max(2, v * h * 0.95);
        const alpha = 0.25 + 0.75 * (i / bars);
        ctx.fillStyle = color;
        ctx.globalAlpha = alpha * (active ? 1 : 0.5);
        const x = i * bw + bw * 0.3;
        const r = Math.min(bw * 0.2, 2);
        ctx.beginPath();
        ctx.roundRect(x, (h - bh) / 2, bw * 0.4, bh, r);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active, bars, color]);
  return <canvas ref={ref} style={{ height }} className="w-full" aria-hidden />;
}
