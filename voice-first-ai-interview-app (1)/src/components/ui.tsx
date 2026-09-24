"use client";

import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { Loader2 } from "lucide-react";

export function Card({ className = "", children, ...rest }: HTMLMotionProps<"div"> & { children?: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className={`glass rounded-3xl ${className}`}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "outline" | "danger"; loading?: boolean; size?: "sm" | "md" | "lg" };
export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = "primary", loading, size = "md", className = "", children, disabled, ...rest },
  ref
) {
  const base = "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none select-none";
  const sizes = { sm: "h-8 px-3.5 text-[13px]", md: "h-10 px-5 text-sm", lg: "h-12 px-7 text-[15px]" };
  const variants = {
    primary: "bg-accent text-ink hover:bg-[#5fe0b9] shadow-[0_8px_30px_-8px_rgba(52,211,164,0.55)]",
    ghost: "text-white/75 hover:text-white hover:bg-white/[0.06]",
    outline: "border border-white/12 text-white/85 hover:border-white/25 hover:bg-white/[0.04]",
    danger: "bg-rose-500/90 text-white hover:bg-rose-500",
  };
  return (
    <button ref={ref} disabled={disabled || loading} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
});

export function Badge({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: "neutral" | "accent" | "warn" | "danger"; className?: string }) {
  const tones = {
    neutral: "border-white/10 bg-white/[0.04] text-white/70",
    accent: "border-accent/30 bg-accent/10 text-accent",
    warn: "border-amber-300/30 bg-amber-300/10 text-amber-200",
    danger: "border-rose-400/30 bg-rose-400/10 text-rose-200",
  };
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${tones[tone]} ${className}`}>{children}</span>;
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className = "", ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={`h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 text-[15px] text-white placeholder:text-white/30 outline-none transition focus:border-accent/60 focus:bg-white/[0.05] focus:ring-4 focus:ring-accent/10 ${className}`}
      {...rest}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className = "", ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={`w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[15px] text-white placeholder:text-white/30 outline-none transition focus:border-accent/60 focus:bg-white/[0.05] focus:ring-4 focus:ring-accent/10 scroll-thin ${className}`}
      {...rest}
    />
  );
});

export function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between">
      <span className="text-[13px] font-medium tracking-wide text-white/70">{children}</span>
      {hint && <span className="text-xs text-white/35">{hint}</span>}
    </div>
  );
}

export function Segmented<T extends string | number>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-full border border-white/10 bg-white/[0.03] p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={`relative rounded-full px-4 py-1.5 text-sm transition-colors ${value === o.value ? "text-ink" : "text-white/60 hover:text-white"}`}
        >
          {value === o.value && <motion.span layoutId={`seg-${options.map((x) => x.value).join("")}`} className="absolute inset-0 rounded-full bg-accent" transition={{ duration: 0.2 }} />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <Loader2 className={`h-5 w-5 animate-spin text-white/50 ${className}`} />;
}
