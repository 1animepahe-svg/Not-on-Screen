import Link from "next/link";
import { ArrowRight, AudioLines, FileSearch, Gauge, ShieldCheck, Users, Waves } from "lucide-react";
import { Logo } from "@/components/Logo";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const features = [
  { icon: AudioLines, title: "Voice-first, real time", body: "Low-latency Gemini Live conversation. Interrupt naturally, push-to-talk or hands-free." },
  { icon: Users, title: "Distinct interviewer panels", body: "A warm HR partner, a skeptical staff engineer, a pragmatic hiring manager." },
  { icon: Gauge, title: "Difficulty you can feel", body: "Easy coaches you toward STAR. Hard calls out vague answers and grills tradeoffs." },
  { icon: FileSearch, title: "Evidence-based debrief", body: "Every strength and gap is tied to a timestamped quote from your transcript." },
  { icon: ShieldCheck, title: "Built not to break", body: "Auto-reconnect, seamless text fallback, and a debrief even if you stop after 2 minutes." },
  { icon: Waves, title: "Replay every moment", body: "Transcript timeline with jump-to, bookmarks, and audio playback." },
];

export default async function Landing() {
  const user = await getCurrentUser();
  const cta = user ? "/dashboard" : "/auth?mode=signup";
  return (
    <main>
      <header className="mx-auto flex h-16 max-w-[1100px] items-center justify-between px-6">
        <Logo />
        <div className="flex items-center gap-2">
          {user ? (
            <Link href="/dashboard" className="rounded-full px-4 py-2 text-sm text-white/80 hover:text-white">Dashboard</Link>
          ) : (
            <>
              <Link href="/auth" className="rounded-full px-4 py-2 text-sm text-white/70 hover:text-white">Sign in</Link>
              <Link href="/auth?mode=signup" className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-ink hover:bg-[#5fe0b9]">Get started</Link>
            </>
          )}
        </div>
      </header>

      <section className="mx-auto grid max-w-[1100px] grid-cols-12 gap-6 px-6 pb-16 pt-20 md:pt-28">
        <div className="col-span-12 md:col-span-8">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs tracking-wide text-white/60">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Powered by Gemini Live
          </p>
          <h1 className="display text-white">
            Rehearse out loud.
            <br />
            <span className="text-white/45">Walk in composed.</span>
          </h1>
          <p className="mt-6 max-w-[560px] text-[17px] leading-relaxed text-white/60">
            A private, voice-first interview room. Speak with a realistic AI panel tuned to your CV, the job description and the company — then get a
            rigorous debrief grounded in exactly what you said.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link href={cta} className="group inline-flex h-12 items-center gap-2 rounded-full bg-accent px-7 text-[15px] font-medium text-ink shadow-[0_8px_30px_-8px_rgba(52,211,164,0.55)] transition hover:bg-[#5fe0b9]">
              Start practicing <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <span className="text-sm text-white/40">Free to try · 2-minute sessions still get a full debrief</span>
          </div>
        </div>
        <div className="col-span-12 md:col-span-4">
          <div className="glass relative overflow-hidden rounded-3xl p-6">
            <div className="text-xs uppercase tracking-[0.14em] text-white/40">Hard · Technical panel</div>
            <div className="mt-5 space-y-4 text-sm leading-relaxed">
              <p><span className="text-accent">Daniel</span> <span className="text-white/75">— You said latency improved. By how much, and how did you measure it?</span></p>
              <p className="text-white/45">You — We made it a lot faster after the migration…</p>
              <p><span className="text-accent">Daniel</span> <span className="text-white/75">— That&apos;s vague. What did YOU do specifically?</span></p>
            </div>
            <div className="mt-6 flex h-10 items-end gap-[3px]">
              {Array.from({ length: 36 }).map((_, i) => (
                <span key={i} className="w-full rounded-full bg-accent/70" style={{ height: `${18 + Math.abs(Math.sin(i * 0.7)) * 80}%`, opacity: 0.3 + (i / 36) * 0.7 }} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1100px] grid-cols-12 gap-4 px-6 pb-24">
        {features.map((f) => (
          <div key={f.title} className="glass col-span-12 rounded-3xl p-6 sm:col-span-6 md:col-span-4">
            <f.icon className="h-5 w-5 text-accent" />
            <h3 className="mt-4 text-[17px] font-semibold text-white">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/55">{f.body}</p>
          </div>
        ))}
      </section>

      <footer className="mx-auto max-w-[1100px] border-t border-white/[0.06] px-6 py-8 text-xs text-white/35">
        © {new Date().getFullYear()} Not on screen · Practice privately. Perform confidently.
      </footer>
    </main>
  );
}
