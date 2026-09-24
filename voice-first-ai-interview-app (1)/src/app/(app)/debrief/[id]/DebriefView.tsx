"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { AlertCircle, Check, Download, Lightbulb, PlayCircle, Quote, RefreshCw, Sparkles, TrendingUp } from "lucide-react";
import { ScoreBar, ScoreRing } from "@/components/ScoreRing";
import { Badge, Button, Card, Spinner } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { parseTs, typeLabel, type DebriefJSON, type Evidence, type SessionDTO } from "@/lib/types";

type Payload = { session: SessionDTO; turns: unknown[]; debrief: { json: DebriefJSON; version: number; source: string; model: string } | null };

const SCORE_LABELS: [keyof DebriefJSON["scores"], string][] = [
  ["communication_delivery", "Communication & delivery"],
  ["structure_star", "Structure (STAR)"],
  ["role_fit", "Role fit"],
  ["confidence_clarity", "Confidence & clarity"],
  ["technical_depth", "Technical depth"],
];

function EvidenceChip({ id, ev }: { id: string; ev: Evidence }) {
  if (!ev.quote) return null;
  return (
    <Link href={`/replay/${id}?t=${parseTs(ev.timestamp_start)}`} className="group mt-3 block rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3 transition-colors hover:border-accent/30">
      <div className="mb-1 flex items-center gap-2 text-[11px] text-white/40">
        <Quote className="h-3 w-3" />
        <span className="font-mono">{ev.timestamp_start}–{ev.timestamp_end}</span>
        <PlayCircle className="ml-auto h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <p className="text-sm italic leading-relaxed text-white/70">“{ev.quote}”</p>
    </Link>
  );
}

export function DebriefView({ id }: { id: string }) {
  const toast = useToast();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const autoTried = useRef(false);

  const generate = useCallback(
    async (isRegen: boolean) => {
      setGenerating(true);
      setError(null);
      try {
        const r = await fetch(`/api/sessions/${id}/debrief`, { method: "POST" });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Debrief failed");
        setData((d) => (d ? { ...d, debrief: j.debrief, session: { ...d.session, overallScore: j.debrief.json.scores.overall } } : d));
        if (isRegen) toast(`Debrief regenerated (v${j.debrief.version}) from the same transcript.`, "success");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Debrief failed");
      } finally {
        setGenerating(false);
      }
    },
    [id, toast]
  );

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/sessions/${id}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        setData(j);
        if (!j.debrief && !autoTried.current) {
          autoTried.current = true;
          void generate(false);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't load session");
      }
    })();
  }, [id, generate]);

  useEffect(() => {
    setChecked(JSON.parse(localStorage.getItem(`nos-check-${id}`) || "{}"));
  }, [id]);
  const toggle = (i: number) => {
    const n = { ...checked, [i]: !checked[i] };
    setChecked(n);
    localStorage.setItem(`nos-check-${id}`, JSON.stringify(n));
  };

  if (error && !data?.debrief)
    return (
      <Card className="mx-auto mt-16 max-w-[520px] p-8 text-center">
        <AlertCircle className="mx-auto h-6 w-6 text-amber-300" />
        <p className="mt-3 text-white/80">{error}</p>
        <p className="mt-1 text-sm text-white/45">Your transcript is saved. You can retry safely.</p>
        <Button className="mt-5" onClick={() => generate(false)} loading={generating}>Retry debrief</Button>
      </Card>
    );

  if (!data || !data.debrief)
    return (
      <div className="mt-24 flex flex-col items-center text-center">
        <motion.div animate={{ scale: [1, 1.08, 1], opacity: [0.6, 1, 0.6] }} transition={{ duration: 1.8, repeat: Infinity }} className="flex h-16 w-16 items-center justify-center rounded-full border border-accent/40">
          <Sparkles className="h-6 w-6 text-accent" />
        </motion.div>
        <h2 className="title mt-6 text-white">Building your debrief</h2>
        <p className="mt-2 text-sm text-white/45">Reading every turn of your transcript and pulling timestamped evidence…</p>
      </div>
    );

  const d = data.debrief.json;
  const s = data.session;
  const partial = d.session_summary.session_status === "ended_early";

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 mb-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {partial ? <Badge tone="warn">PARTIAL SESSION DEBRIEF</Badge> : <Badge tone="accent">Completed session</Badge>}
            <Badge>{typeLabel(s.interviewType, s.customType)}</Badge>
            <Badge>{d.session_summary.difficulty}</Badge>
            <Badge>v{data.debrief.version} · {data.debrief.source === "gemini" ? "Gemini" : "Offline analyzer"}</Badge>
          </div>
          <h1 className="display mt-3 text-white">{d.session_summary.company}</h1>
          <p className="mt-1 text-white/50">
            {d.session_summary.role_guess} · {d.session_summary.actual_duration_minutes} of {d.session_summary.planned_duration_minutes} planned minutes
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/replay/${id}`}><Button variant="outline"><PlayCircle className="h-4 w-4" /> Replay</Button></Link>
          <Button
            variant="ghost"
            onClick={() => {
              const url = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }));
              const a = document.createElement("a");
              a.href = url;
              a.download = `debrief-${id}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download className="h-4 w-4" /> JSON
          </Button>
          <Button onClick={() => generate(true)} loading={generating}><RefreshCw className="h-4 w-4" /> Regenerate debrief</Button>
        </div>
      </div>

      {d.notes_if_low_data && (
        <div className="col-span-12 flex items-start gap-3 rounded-2xl border border-amber-300/15 bg-amber-300/[0.05] px-5 py-4 text-sm text-amber-100/80">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {d.notes_if_low_data}
        </div>
      )}

      {/* Scores */}
      <Card className="col-span-12 flex flex-col items-center justify-center p-8 md:col-span-4">
        <ScoreRing value={d.scores.overall} label="Overall" />
        <div className="mt-6 grid w-full grid-cols-3 gap-2 text-center">
          {[
            ["Fillers", d.delivery_metrics.filler_word_estimate],
            ["WPM", d.delivery_metrics.pace_wpm_estimate || "—"],
            ["Long pauses", d.delivery_metrics.long_pause_estimate],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl border border-white/[0.07] py-3">
              <div className="text-lg font-semibold tabular-nums text-white">{v}</div>
              <div className="text-[11px] uppercase tracking-wider text-white/40">{k}</div>
            </div>
          ))}
        </div>
      </Card>
      <Card className="col-span-12 space-y-4 p-8 md:col-span-8">
        <h2 className="text-lg font-semibold text-white">Score breakdown</h2>
        {SCORE_LABELS.map(([k, l], i) => <ScoreBar key={k} label={l} value={d.scores[k]} delay={0.15 + i * 0.08} />)}
        {d.session_summary.topics_discussed.length > 0 && (
          <div className="pt-3">
            <div className="mb-2 text-xs uppercase tracking-[0.12em] text-white/40">Topics discussed</div>
            <div className="flex flex-wrap gap-2">
              {d.session_summary.topics_discussed.map((t, i) => (
                <span key={i} title={t.notes.join(" · ")} className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/70">{t.topic}</span>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Strengths & improvements */}
      <div className="col-span-12 md:col-span-6">
        <h2 className="mb-3 mt-4 flex items-center gap-2 text-lg font-semibold text-white"><TrendingUp className="h-4 w-4 text-accent" /> Strengths</h2>
        <div className="space-y-3">
          {d.strengths.map((x, i) => (
            <Card key={i} className="p-5" transition={{ duration: 0.22, delay: i * 0.05 }}>
              <div className="font-medium text-white">{x.title}</div>
              <p className="mt-1 text-sm text-white/55">{x.why_it_matters}</p>
              <EvidenceChip id={id} ev={x.evidence} />
            </Card>
          ))}
        </div>
      </div>
      <div className="col-span-12 md:col-span-6">
        <h2 className="mb-3 mt-4 flex items-center gap-2 text-lg font-semibold text-white"><Lightbulb className="h-4 w-4 text-amber-300" /> Improvements</h2>
        <div className="space-y-3">
          {d.improvements.map((x, i) => (
            <Card key={i} className="p-5" transition={{ duration: 0.22, delay: i * 0.05 }}>
              <div className="font-medium text-white">{x.title}</div>
              <p className="mt-1 text-sm text-white/55">{x.issue}</p>
              <EvidenceChip id={id} ev={x.evidence} />
              <div className="mt-3 rounded-2xl bg-accent/[0.06] p-3 text-sm">
                <div className="mb-1 text-[11px] uppercase tracking-wider text-accent">Better answer</div>
                <p className="leading-relaxed text-white/75">{x.better_answer_example}</p>
              </div>
              <p className="mt-3 text-xs text-white/50"><span className="text-white/70">Micro-exercise:</span> {x.micro_exercise}</p>
            </Card>
          ))}
        </div>
      </div>

      {/* Moments */}
      {d.moments_that_mattered.length > 0 && (
        <Card className="col-span-12 mt-4 p-8">
          <h2 className="text-lg font-semibold text-white">Moments that mattered</h2>
          <ol className="relative mt-5 space-y-5 border-l border-white/10 pl-6">
            {d.moments_that_mattered.map((m, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[29px] top-1.5 h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_12px_rgba(52,211,164,0.8)]" />
                <Link href={`/replay/${id}?t=${parseTs(m.timestamp_start)}`} className="group">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-accent">{m.timestamp_start}</span>
                    <span className="font-medium text-white group-hover:underline">{m.label}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-white/55">{m.reason}</p>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {/* Plan + checklist */}
      <Card className="col-span-12 p-8 md:col-span-8">
        <h2 className="text-lg font-semibold text-white">7-day practice plan</h2>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {d.practice_plan_7_days.map((p) => (
            <div key={p.day} className="rounded-2xl border border-white/[0.07] p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-[0.12em] text-white/40">Day {p.day}</span>
                <span className="text-xs text-white/40">{p.time_minutes} min</span>
              </div>
              <div className="mt-1 font-medium text-white">{p.focus}</div>
              <ul className="mt-2 space-y-1 text-sm text-white/55">{p.tasks.map((t, i) => <li key={i}>· {t}</li>)}</ul>
            </div>
          ))}
        </div>
      </Card>
      <Card className="col-span-12 p-8 md:col-span-4">
        <h2 className="text-lg font-semibold text-white">Next interview checklist</h2>
        <ul className="mt-4 space-y-2">
          {d.next_interview_checklist.map((c, i) => (
            <li key={i}>
              <button onClick={() => toggle(i)} className="flex w-full items-start gap-3 rounded-xl p-2 text-left text-sm transition-colors hover:bg-white/[0.03]">
                <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${checked[i] ? "border-accent bg-accent" : "border-white/20"}`}>
                  {checked[i] && <Check className="h-3 w-3 text-ink" />}
                </span>
                <span className={checked[i] ? "text-white/35 line-through" : "text-white/75"}>{c}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      {generating && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-black/60 px-4 py-2 text-sm text-white/70 backdrop-blur"><Spinner className="h-4 w-4" /> Regenerating from the same transcript…</div>
      )}
    </div>
  );
}
