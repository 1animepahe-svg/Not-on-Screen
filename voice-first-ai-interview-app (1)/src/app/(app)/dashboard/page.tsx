import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { ArrowRight, Clock, Mic, Plus, Sparkles, Target, TrendingUp } from "lucide-react";
import { db } from "@/db";
import { debriefs, interviewSessions } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { typeLabel, type DebriefJSON } from "@/lib/types";

export const dynamic = "force-dynamic";

const DIM: Record<string, string> = {
  communication_delivery: "Communication & delivery",
  structure_star: "STAR structure",
  role_fit: "Role fit",
  confidence_clarity: "Confidence & clarity",
  technical_depth: "Technical depth",
};

export default async function Dashboard() {
  const user = await requireUser("/dashboard");
  const sessions = await db.select().from(interviewSessions).where(eq(interviewSessions.userId, user.id)).orderBy(desc(interviewSessions.createdAt)).limit(30);
  const ids = sessions.map((s) => s.id);
  const debs = ids.length ? await db.select().from(debriefs).where(inArray(debriefs.sessionId, ids)).orderBy(desc(debriefs.version)) : [];
  const latestBySession = new Map<string, DebriefJSON>();
  for (const d of debs) if (!latestBySession.has(d.sessionId)) latestBySession.set(d.sessionId, d.json as DebriefJSON);

  const scored = sessions.filter((s) => s.overallScore != null);
  const avg = scored.length ? Math.round(scored.reduce((a, s) => a + (s.overallScore ?? 0), 0) / scored.length) : null;
  const best = scored.length ? Math.max(...scored.map((s) => s.overallScore ?? 0)) : null;
  const minutes = Math.round(sessions.reduce((a, s) => a + (s.actualSeconds ?? 0), 0) / 60);
  const trend = scored.slice(0, 8).reverse().map((s) => s.overallScore ?? 0);

  const dimTotals: Record<string, number[]> = {};
  [...latestBySession.values()].slice(0, 5).forEach((d) => {
    Object.entries(d.scores).forEach(([k, v]) => {
      if (k === "overall") return;
      (dimTotals[k] ||= []).push(v);
    });
  });
  const dims = Object.entries(dimTotals)
    .map(([k, v]) => ({ k, label: DIM[k] ?? k, avg: Math.round(v.reduce((a, b) => a + b, 0) / v.length) }))
    .sort((a, b) => a.avg - b.avg);
  const latestPlan = [...latestBySession.values()][0]?.practice_plan_7_days?.[0];

  const first = (user.name || "there").split(" ")[0];

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-white/45">Good to see you, {first}.</p>
          <h1 className="display mt-1 text-white">Your practice room</h1>
        </div>
        <Link href="/setup" className="inline-flex h-12 items-center gap-2 rounded-full bg-accent px-6 text-[15px] font-medium text-ink shadow-[0_8px_30px_-8px_rgba(52,211,164,0.55)] transition hover:bg-[#5fe0b9]">
          <Plus className="h-4 w-4" /> Start interview
        </Link>
      </div>

      {[
        { icon: Mic, label: "Sessions", value: sessions.length },
        { icon: TrendingUp, label: "Average score", value: avg ?? "—" },
        { icon: Target, label: "Best score", value: best ?? "—" },
        { icon: Clock, label: "Minutes practiced", value: minutes },
      ].map((s) => (
        <div key={s.label} className="glass col-span-6 rounded-3xl p-5 md:col-span-3">
          <s.icon className="h-4 w-4 text-accent" />
          <div className="mt-4 text-3xl font-semibold tabular-nums tracking-tight text-white">{s.value}</div>
          <div className="mt-1 text-xs uppercase tracking-[0.12em] text-white/40">{s.label}</div>
        </div>
      ))}

      <section className="glass col-span-12 rounded-3xl p-6 md:col-span-7">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Recent sessions</h2>
          <span className="text-xs text-white/35">{sessions.length} total</span>
        </div>
        {sessions.length === 0 ? (
          <div className="mt-8 flex flex-col items-center rounded-2xl border border-dashed border-white/10 py-12 text-center">
            <Sparkles className="h-6 w-6 text-accent" />
            <p className="mt-3 text-white/70">No sessions yet.</p>
            <p className="mt-1 text-sm text-white/40">Your first mock interview takes 2 minutes to set up.</p>
            <Link href="/setup" className="mt-5 text-sm text-accent hover:underline">Set up an interview →</Link>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-white/[0.06]">
            {sessions.slice(0, 8).map((s) => {
              const done = !!s.endedAt;
              return (
                <li key={s.id} className="flex items-center gap-4 py-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 text-sm font-semibold tabular-nums text-white">
                    {s.overallScore ?? "·"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-white">
                      {typeLabel(s.interviewType, s.customType)} · {s.companyName || s.companyUrl}
                    </div>
                    <div className="mt-0.5 text-xs text-white/40">
                      {s.createdAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {s.difficulty} ·{" "}
                      {done ? `${Math.max(1, Math.round((s.actualSeconds ?? 0) / 60))} of ${s.plannedMinutes} min` : "not finished"}
                      {s.status === "ended_early" && " · partial"}
                    </div>
                  </div>
                  {done ? (
                    <div className="flex gap-1">
                      <Link href={`/debrief/${s.id}`} className="rounded-full px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06] hover:text-white">Debrief</Link>
                      <Link href={`/replay/${s.id}`} className="rounded-full px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06] hover:text-white">Replay</Link>
                    </div>
                  ) : (
                    <Link href={`/interview/${s.id}`} className="inline-flex items-center gap-1 rounded-full border border-accent/30 px-3 py-1.5 text-xs text-accent hover:bg-accent/10">
                      Open room <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="col-span-12 flex flex-col gap-4 md:col-span-5">
        <div className="glass rounded-3xl p-6">
          <h2 className="text-lg font-semibold text-white">Insights</h2>
          {trend.length >= 2 ? (
            <svg viewBox="0 0 200 60" className="mt-4 h-16 w-full" preserveAspectRatio="none">
              <polyline
                fill="none"
                stroke="#34d3a4"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={trend.map((v, i) => `${(i / (trend.length - 1)) * 196 + 2},${58 - (v / 100) * 56}`).join(" ")}
              />
            </svg>
          ) : (
            <p className="mt-3 text-sm text-white/45">Complete two sessions to see your score trend.</p>
          )}
          {dims.length > 0 && (
            <div className="mt-5 space-y-3">
              {dims.map((d, i) => (
                <div key={d.k}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className={i === 0 ? "text-amber-200" : "text-white/60"}>{d.label}{i === 0 && " · focus area"}</span>
                    <span className="tabular-nums text-white/80">{d.avg}</span>
                  </div>
                  <div className="h-1 rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-accent" style={{ width: `${d.avg}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </div>
        {latestPlan && (
          <div className="glass rounded-3xl p-6">
            <div className="text-xs uppercase tracking-[0.12em] text-white/40">Today&apos;s practice</div>
            <div className="mt-2 font-medium text-white">{latestPlan.focus}</div>
            <ul className="mt-3 space-y-1.5 text-sm text-white/60">
              {latestPlan.tasks.map((t) => <li key={t}>· {t}</li>)}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
