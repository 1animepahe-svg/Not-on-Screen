"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bookmark, FileBarChart } from "lucide-react";
import { Badge, Button, Card, Spinner } from "@/components/ui";
import { fmtTs, typeLabel, type SessionDTO, type TranscriptTurn } from "@/lib/types";

type Payload = { session: SessionDTO; turns: TranscriptTurn[]; bookmarks: { id: number; tMs: number; note: string }[]; hasRecording: boolean; connectionLog: { t: number; state: string; note?: string }[] };

export function ReplayView({ id, initialT }: { id: string; initialT: number | null }) {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cur, setCur] = useState<number>(initialT ?? -1);
  const audio = useRef<HTMLAudioElement>(null);
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const jumped = useRef(false);

  useEffect(() => {
    fetch(`/api/sessions/${id}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        setData(j);
      })
      .catch((e) => setErr(e.message));
  }, [id]);

  const turns = useMemo(() => (data?.turns ?? []).filter((t) => t.speaker !== "system"), [data]);
  const total = Math.max(1, (data?.session.actualSeconds ?? 0) * 1000, ...turns.map((t) => t.tsEndMs));
  const activeTurn = useMemo(() => {
    if (cur < 0) return null;
    let best: TranscriptTurn | null = null;
    for (const t of turns) if (t.tsStartMs <= cur + 400) best = t;
    return best;
  }, [cur, turns]);

  function jump(ms: number) {
    setCur(ms);
    if (audio.current && data?.hasRecording) {
      audio.current.currentTime = ms / 1000;
      void audio.current.play().catch(() => {});
    }
  }

  useEffect(() => {
    if (!data || jumped.current || initialT == null) return;
    jumped.current = true;
    const t = [...turns].reverse().find((x) => x.tsStartMs <= initialT + 400);
    if (t) setTimeout(() => refs.current[t.clientId]?.scrollIntoView({ behavior: "smooth", block: "center" }), 200);
  }, [data, initialT, turns]);

  useEffect(() => {
    if (activeTurn && audio.current && !audio.current.paused) refs.current[activeTurn.clientId]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeTurn]);

  if (err) return <Card className="mx-auto mt-16 max-w-[480px] p-8 text-center text-white/70">{err}</Card>;
  if (!data) return <div className="mt-24 flex justify-center"><Spinner /></div>;
  const s = data.session;

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge>{typeLabel(s.interviewType, s.customType)}</Badge>
            <Badge>{s.difficulty}</Badge>
            {s.mode === "fallback_text" && <Badge tone="warn">Included text fallback</Badge>}
          </div>
          <h1 className="display mt-3 text-white">Session replay</h1>
          <p className="mt-1 text-white/50">{s.companyName} · {fmtTs(total)} · {turns.length} turns</p>
        </div>
        <Link href={`/debrief/${id}`}><Button variant="outline"><FileBarChart className="h-4 w-4" /> Debrief</Button></Link>
      </div>

      <Card className="col-span-12 p-6">
        {data.hasRecording ? (
          <audio ref={audio} controls src={`/api/sessions/${id}/audio`} className="w-full" onTimeUpdate={(e) => setCur(e.currentTarget.currentTime * 1000)} />
        ) : (
          <p className="text-sm text-white/45">No audio was recorded for this session (text mode, recording disabled, or unsupported browser). The transcript timeline is fully navigable.</p>
        )}
        {/* Timeline */}
        <div
          className="relative mt-5 h-10 cursor-pointer rounded-xl bg-white/[0.03]"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const ms = ((e.clientX - r.left) / r.width) * total;
            jump(ms);
            const t = [...turns].reverse().find((x) => x.tsStartMs <= ms);
            if (t) refs.current[t.clientId]?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        >
          {turns.map((t) => (
            <span
              key={t.clientId}
              className={`absolute top-2 h-6 rounded ${t.speaker === "candidate" ? "bg-white/30" : "bg-accent/70"}`}
              style={{ left: `${(t.tsStartMs / total) * 100}%`, width: `${Math.max(0.4, ((t.tsEndMs - t.tsStartMs) / total) * 100)}%` }}
              title={`${t.speakerName} ${fmtTs(t.tsStartMs)}`}
            />
          ))}
          {data.bookmarks.map((b) => (
            <Bookmark key={b.id} className="absolute -top-1 h-3.5 w-3.5 -translate-x-1/2 fill-amber-300 text-amber-300" style={{ left: `${(b.tMs / total) * 100}%` }} />
          ))}
          {cur >= 0 && <span className="absolute top-0 h-full w-px bg-white" style={{ left: `${Math.min(100, (cur / total) * 100)}%` }} />}
        </div>
        <div className="mt-2 flex gap-4 text-[11px] text-white/40">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-accent/70" /> Interviewer</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-white/30" /> You</span>
          <span className="flex items-center gap-1.5"><Bookmark className="h-3 w-3 fill-amber-300 text-amber-300" /> Bookmark</span>
        </div>
      </Card>

      <Card className="col-span-12 p-6 md:col-span-8">
        <h2 className="mb-4 text-lg font-semibold text-white">Transcript</h2>
        {turns.length === 0 && <p className="text-sm text-white/45">No transcript turns were captured.</p>}
        <div className="space-y-1">
          {turns.map((t) => {
            const active = activeTurn?.clientId === t.clientId;
            return (
              <div
                key={t.clientId}
                ref={(el) => {
                  refs.current[t.clientId] = el;
                }}
                onClick={() => jump(t.tsStartMs)}
                className={`cursor-pointer rounded-2xl p-3 transition-colors duration-200 ${active ? "bg-accent/[0.08] ring-1 ring-accent/30" : "hover:bg-white/[0.03]"}`}
              >
                <div className="mb-1 flex items-center gap-2 text-xs">
                  <span className="font-mono text-white/40">{fmtTs(t.tsStartMs)}–{fmtTs(t.tsEndMs)}</span>
                  <span className={t.speaker === "candidate" ? "text-white/70" : "text-accent"}>{t.speakerName}</span>
                  {t.channel === "text" && <span className="text-white/30">· text</span>}
                </div>
                <p className="text-[15px] leading-relaxed text-white/80">{t.text}</p>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="col-span-12 space-y-4 md:col-span-4">
        <Card className="p-6">
          <h3 className="font-semibold text-white">Bookmarks</h3>
          {data.bookmarks.length === 0 ? <p className="mt-2 text-sm text-white/40">None added.</p> : (
            <ul className="mt-3 space-y-2">
              {data.bookmarks.map((b) => (
                <li key={b.id}><button onClick={() => jump(b.tMs)} className="flex gap-3 text-left text-sm"><span className="font-mono text-amber-200">{fmtTs(b.tMs)}</span><span className="text-white/70">{b.note || "Bookmark"}</span></button></li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-6">
          <h3 className="font-semibold text-white">Connection log</h3>
          <ul className="mt-3 max-h-64 space-y-1.5 overflow-y-auto text-xs scroll-thin">
            {data.connectionLog.length === 0 && <li className="text-white/40">No events.</li>}
            {data.connectionLog.map((l, i) => (
              <li key={i} className="flex gap-2"><span className="font-mono text-white/35">{fmtTs(l.t)}</span><span className="text-white/70">{l.state}</span>{l.note && <span className="truncate text-white/35" title={l.note}>{l.note}</span>}</li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
