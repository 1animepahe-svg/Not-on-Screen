import { DEBRIEF_SYSTEM } from "./prompts";
import { generateJSON, geminiKey, TEXT_MODEL } from "./gemini";
import { fmtTs, type DebriefJSON, type TranscriptTurn, type Evidence } from "./types";

export type DebriefFacts = {
  session_status: "ended_early" | "completed";
  planned_duration_minutes: number;
  actual_duration_minutes: number;
  company: string;
  interview_type: string;
  difficulty: string;
  role_hint: string;
};

// ---------------- JSON schema sent to Gemini (schema enforcement layer 1) ----------------
const S = { type: "string" } as const;
const I = { type: "integer" } as const;
const evidenceSchema = {
  type: "object",
  properties: { timestamp_start: S, timestamp_end: S, quote: S },
  required: ["timestamp_start", "timestamp_end", "quote"],
};
export const DEBRIEF_JSON_SCHEMA = {
  type: "object",
  properties: {
    session_summary: {
      type: "object",
      properties: {
        session_status: { type: "string", enum: ["ended_early", "completed"] },
        planned_duration_minutes: I,
        actual_duration_minutes: { type: "number" },
        role_guess: S,
        company: S,
        interview_type: S,
        difficulty: S,
        topics_discussed: {
          type: "array",
          items: {
            type: "object",
            properties: { topic: S, notes: { type: "array", items: S } },
            required: ["topic", "notes"],
          },
        },
      },
      required: [
        "session_status",
        "planned_duration_minutes",
        "actual_duration_minutes",
        "role_guess",
        "company",
        "interview_type",
        "difficulty",
        "topics_discussed",
      ],
    },
    scores: {
      type: "object",
      properties: {
        overall: I,
        communication_delivery: I,
        structure_star: I,
        role_fit: I,
        confidence_clarity: I,
        technical_depth: I,
      },
      required: ["overall", "communication_delivery", "structure_star", "role_fit", "confidence_clarity", "technical_depth"],
    },
    strengths: {
      type: "array",
      items: {
        type: "object",
        properties: { title: S, evidence: evidenceSchema, why_it_matters: S },
        required: ["title", "evidence", "why_it_matters"],
      },
    },
    improvements: {
      type: "array",
      items: {
        type: "object",
        properties: { title: S, issue: S, evidence: evidenceSchema, better_answer_example: S, micro_exercise: S },
        required: ["title", "issue", "evidence", "better_answer_example", "micro_exercise"],
      },
    },
    delivery_metrics: {
      type: "object",
      properties: { filler_word_estimate: I, pace_wpm_estimate: I, long_pause_estimate: I },
      required: ["filler_word_estimate", "pace_wpm_estimate", "long_pause_estimate"],
    },
    moments_that_mattered: {
      type: "array",
      items: {
        type: "object",
        properties: { label: S, timestamp_start: S, timestamp_end: S, reason: S },
        required: ["label", "timestamp_start", "timestamp_end", "reason"],
      },
    },
    practice_plan_7_days: {
      type: "array",
      items: {
        type: "object",
        properties: { day: I, focus: S, tasks: { type: "array", items: S }, time_minutes: I },
        required: ["day", "focus", "tasks", "time_minutes"],
      },
    },
    next_interview_checklist: { type: "array", items: S },
    notes_if_low_data: S,
  },
  required: [
    "session_summary",
    "scores",
    "strengths",
    "improvements",
    "delivery_metrics",
    "moments_that_mattered",
    "practice_plan_7_days",
    "next_interview_checklist",
    "notes_if_low_data",
  ],
};

// ---------------- validation / coercion (schema enforcement layer 2) ----------------
type AnyObj = Record<string, unknown>;
const obj = (v: unknown): AnyObj => (v && typeof v === "object" && !Array.isArray(v) ? (v as AnyObj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : d);
const num = (v: unknown, d = 0): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : d;
};
const tsFix = (v: unknown) => {
  const s = str(v).trim();
  if (/^\d{1,3}:\d{2}$/.test(s)) return s.padStart(5, "0");
  const n = num(v, NaN);
  return Number.isFinite(n) ? fmtTs(n > 10000 ? n : n * 1000) : "00:00";
};
const ev = (v: unknown): Evidence => {
  const o = obj(v);
  return { timestamp_start: tsFix(o.timestamp_start), timestamp_end: tsFix(o.timestamp_end), quote: str(o.quote) };
};

export function normalizeDebrief(raw: unknown, facts: DebriefFacts, turnCount: number): DebriefJSON {
  const r = obj(raw);
  const ss = obj(r.session_summary);
  const sc = obj(r.scores);
  const minScore = turnCount >= 2 ? 1 : 0;
  const score = (v: unknown) => Math.round(Math.min(100, Math.max(minScore, num(v, minScore || 0))));
  const dm = obj(r.delivery_metrics);

  const plan = arr(r.practice_plan_7_days).map((d, i) => {
    const o = obj(d);
    return {
      day: i + 1,
      focus: str(o.focus, "Practice"),
      tasks: arr(o.tasks).map((t) => str(t)).filter(Boolean),
      time_minutes: Math.round(Math.min(120, Math.max(5, num(o.time_minutes, 20)))),
    };
  });

  return {
    session_summary: {
      session_status: facts.session_status,
      planned_duration_minutes: facts.planned_duration_minutes,
      actual_duration_minutes: facts.actual_duration_minutes,
      role_guess: str(ss.role_guess, facts.role_hint) || facts.role_hint,
      company: facts.company,
      interview_type: facts.interview_type,
      difficulty: facts.difficulty,
      topics_discussed: arr(ss.topics_discussed).map((t) => {
        const o = obj(t);
        return { topic: str(o.topic), notes: arr(o.notes).map((n) => str(n)).filter(Boolean) };
      }),
    },
    scores: {
      overall: score(sc.overall),
      communication_delivery: score(sc.communication_delivery),
      structure_star: score(sc.structure_star),
      role_fit: score(sc.role_fit),
      confidence_clarity: score(sc.confidence_clarity),
      technical_depth: score(sc.technical_depth),
    },
    strengths: arr(r.strengths).map((s) => {
      const o = obj(s);
      return { title: str(o.title), evidence: ev(o.evidence), why_it_matters: str(o.why_it_matters) };
    }),
    improvements: arr(r.improvements).map((s) => {
      const o = obj(s);
      return {
        title: str(o.title),
        issue: str(o.issue),
        evidence: ev(o.evidence),
        better_answer_example: str(o.better_answer_example),
        micro_exercise: str(o.micro_exercise),
      };
    }),
    delivery_metrics: {
      filler_word_estimate: Math.max(0, Math.round(num(dm.filler_word_estimate))),
      pace_wpm_estimate: Math.max(0, Math.round(num(dm.pace_wpm_estimate))),
      long_pause_estimate: Math.max(0, Math.round(num(dm.long_pause_estimate))),
    },
    moments_that_mattered: arr(r.moments_that_mattered).map((m) => {
      const o = obj(m);
      return { label: str(o.label), timestamp_start: tsFix(o.timestamp_start), timestamp_end: tsFix(o.timestamp_end), reason: str(o.reason) };
    }),
    practice_plan_7_days: plan,
    next_interview_checklist: arr(r.next_interview_checklist).map((c) => str(c)).filter(Boolean),
    notes_if_low_data: str(r.notes_if_low_data),
  };
}

export function validateDebrief(d: DebriefJSON, turnCount: number): string[] {
  const errs: string[] = [];
  if (turnCount >= 2 && Object.values(d.scores).some((s) => s < 1)) errs.push("scores must be 1-100");
  if (d.practice_plan_7_days.length !== 7) errs.push("practice_plan_7_days must have exactly 7 entries");
  if (!d.strengths.length) errs.push("strengths must not be empty");
  if (!d.improvements.length) errs.push("improvements must not be empty");
  if (!d.next_interview_checklist.length) errs.push("next_interview_checklist must not be empty");
  return errs;
}

// ---------------- heuristic debrief (schema enforcement layer 4: never fail) ----------------
const FILLERS = /\b(um+|uh+|erm|like|you know|basically|actually|sort of|kind of|i mean|literally)\b/gi;
const words = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

export function heuristicDebrief(turns: TranscriptTurn[], facts: DebriefFacts): DebriefJSON {
  const cand = turns.filter((t) => t.speaker === "candidate" && t.text.trim());
  const ivw = turns.filter((t) => t.speaker.startsWith("interviewer"));
  const totalWords = cand.reduce((a, t) => a + words(t.text), 0);
  const fillers = cand.reduce((a, t) => a + (t.text.match(FILLERS)?.length ?? 0), 0);
  const voiceCand = cand.filter((t) => t.channel === "voice" && t.tsEndMs - t.tsStartMs > 1500);
  const vWords = voiceCand.reduce((a, t) => a + words(t.text), 0);
  const vMin = voiceCand.reduce((a, t) => a + (t.tsEndMs - t.tsStartMs), 0) / 60000;
  const wpm = vMin > 0 ? Math.round(Math.min(230, Math.max(60, vWords / vMin))) : 0;
  let pauses = 0;
  for (let i = 1; i < turns.length; i++) {
    if (turns[i].speaker === "candidate" && turns[i].channel === "voice" && turns[i].tsStartMs - turns[i - 1].tsEndMs > 4000) pauses++;
  }
  const hasNum = (t: string) => /\d|percent|%|million|thousand/i.test(t);
  const iCount = cand.reduce((a, t) => a + (t.text.match(/\bI\b|\bI'm\b|\bmy\b/g)?.length ?? 0), 0);
  const weCount = cand.reduce((a, t) => a + (t.text.match(/\bwe\b|\bour\b|\bteam\b/gi)?.length ?? 0), 0);
  const starHits = cand.reduce(
    (a, t) => a + (/(situation|context|task|goal|so i|i decided|result|outcome|impact|as a result)/i.test(t.text) ? 1 : 0),
    0
  );
  const avgLen = cand.length ? totalWords / cand.length : 0;
  const numRatio = cand.length ? cand.filter((t) => hasNum(t.text)).length / cand.length : 0;
  const fillerRate = totalWords ? fillers / totalWords : 0;
  const clamp = (n: number) => Math.round(Math.min(95, Math.max(turns.length >= 2 ? 8 : 0, n)));
  const lenScore = Math.min(25, avgLen / 4);
  const structure = clamp(35 + (cand.length ? (starHits / cand.length) * 35 : 0) + lenScore * 0.6);
  const communication = clamp(62 + lenScore * 0.5 - fillerRate * 400 - pauses * 3);
  const confidence = clamp(55 + (iCount > weCount ? 12 : -6) - fillerRate * 300 + Math.min(10, avgLen / 10));
  const technical = clamp(40 + numRatio * 30 + lenScore * 0.8);
  const roleFit = clamp(45 + lenScore * 0.8 + numRatio * 15);
  const overall = clamp((structure + communication + confidence + technical + roleFit) / 5);

  const quote = (t?: TranscriptTurn): Evidence =>
    t
      ? { timestamp_start: fmtTs(t.tsStartMs), timestamp_end: fmtTs(t.tsEndMs), quote: t.text.length > 220 ? t.text.slice(0, 217) + "…" : t.text }
      : { timestamp_start: "00:00", timestamp_end: "00:00", quote: "" };
  const byLen = [...cand].sort((a, b) => words(b.text) - words(a.text));
  const withNum = cand.find((t) => hasNum(t.text));
  const withWe = [...cand].sort((a, b) => (b.text.match(/\bwe\b/gi)?.length ?? 0) - (a.text.match(/\bwe\b/gi)?.length ?? 0))[0];
  const shortest = [...cand].sort((a, b) => words(a.text) - words(b.text))[0];

  const strengths: DebriefJSON["strengths"] = [];
  if (withNum) strengths.push({ title: "Quantified impact", evidence: quote(withNum), why_it_matters: "Numbers make impact credible and memorable for interviewers." });
  if (byLen[0]) strengths.push({ title: "Willingness to go into detail", evidence: quote(byLen[0]), why_it_matters: "Depth signals real experience rather than rehearsed talking points." });
  if (!strengths.length) strengths.push({ title: "Showed up and practiced", evidence: quote(cand[0]), why_it_matters: "Reps under realistic pressure are the fastest way to improve." });

  const improvements: DebriefJSON["improvements"] = [];
  if (shortest && words(shortest.text) < 40)
    improvements.push({
      title: "Answers too brief",
      issue: "Short answers leave the interviewer guessing about your role, actions and results.",
      evidence: quote(shortest),
      better_answer_example: "In my last role, our onboarding flow lost 30% of users (Situation). I owned the fix (Task). I ran five user interviews, rewrote the first two screens and A/B tested them (Action). Drop-off fell to 18% within a month (Result).",
      micro_exercise: "Pick one past project and say it aloud in exactly 4 sentences — one per STAR letter. Repeat 3 times, timing ~60 seconds.",
    });
  if (withWe && weCount > iCount)
    improvements.push({
      title: "Clarify personal ownership",
      issue: "Frequent 'we' hides what YOU specifically did.",
      evidence: quote(withWe),
      better_answer_example: "The team shipped the migration; my part was designing the rollback plan and personally running the cutover for the three largest customers.",
      micro_exercise: "Rewrite your top 3 stories replacing every 'we' with either 'I' (your action) or a named role (their action).",
    });
  if (numRatio < 0.3)
    improvements.push({
      title: "Add measurable results",
      issue: "Few answers ended with a concrete, measurable outcome.",
      evidence: quote(byLen[0] ?? cand[0]),
      better_answer_example: "…and as a result, p95 latency dropped from 900ms to 350ms and support tickets on that flow fell by about 40%.",
      micro_exercise: "For each of your 5 key stories, write one metric (time, money, %, users) and one sentence on how it was measured.",
    });
  if (fillerRate > 0.03)
    improvements.push({
      title: "Reduce filler words",
      issue: `About ${fillers} filler words detected — they dilute confidence.`,
      evidence: quote(cand.find((t) => new RegExp(FILLERS.source, "i").test(t.text)) ?? cand[0]),
      better_answer_example: "Replace 'um, so basically, like…' with a one-second silent pause, then a crisp headline sentence.",
      micro_exercise: "Record a 90-second answer; count fillers; redo it replacing each filler with a deliberate pause.",
    });
  if (!improvements.length)
    improvements.push({
      title: "Lead with the headline",
      issue: "Strong answers start with the result, then explain the path.",
      evidence: quote(cand[0]),
      better_answer_example: "I cut deployment time by 70%. Here's how: …",
      micro_exercise: "Take 3 answers and rewrite the first sentence as the outcome.",
    });

  const topics = ivw
    .filter((t) => t.text.includes("?"))
    .slice(0, 6)
    .map((t) => {
      const q = t.text.split(/(?<=\?)/).find((s) => s.includes("?"))?.trim() ?? t.text;
      return { topic: q.length > 90 ? q.slice(0, 87) + "…" : q, notes: [`Asked at ${fmtTs(t.tsStartMs)}`] };
    });

  const moments: DebriefJSON["moments_that_mattered"] = [];
  if (withNum) moments.push({ label: "Strong evidence", timestamp_start: fmtTs(withNum.tsStartMs), timestamp_end: fmtTs(withNum.tsEndMs), reason: "You backed a claim with a number." });
  if (shortest) moments.push({ label: "Missed opportunity", timestamp_start: fmtTs(shortest.tsStartMs), timestamp_end: fmtTs(shortest.tsEndMs), reason: "A brief answer where a full STAR story would land better." });
  if (byLen[0] && byLen[0] !== withNum) moments.push({ label: "Deepest answer", timestamp_start: fmtTs(byLen[0].tsStartMs), timestamp_end: fmtTs(byLen[0].tsEndMs), reason: "Your most detailed response — check it for structure and a clear result." });

  const weakest = Object.entries({ structure, communication, confidence, technical, roleFit }).sort((a, b) => a[1] - b[1])[0][0];
  const focusMap: Record<string, string> = {
    structure: "STAR structure",
    communication: "Clear delivery",
    confidence: "Ownership & confidence",
    technical: "Depth & specifics",
    roleFit: "Role alignment",
  };
  const plan = [
    { focus: `${focusMap[weakest]} fundamentals`, tasks: ["Re-listen to this session's weakest answer", "Rewrite it using STAR with a metric"], time_minutes: 25 },
    { focus: "Story bank", tasks: ["Draft 5 stories: success, failure, conflict, leadership, ambiguity", "Add one metric to each"], time_minutes: 40 },
    { focus: "Headline-first answers", tasks: ["Practice 6 questions starting with the result", "Keep each under 90 seconds"], time_minutes: 30 },
    { focus: "Company & role research", tasks: ["Map 3 JD requirements to your stories", "Prepare 3 sharp questions for the interviewer"], time_minutes: 30 },
    { focus: "Follow-up resilience", tasks: ["Run a Hard mock and answer every 'why?' twice deeper", "Note where you got vague"], time_minutes: 35 },
    { focus: "Delivery polish", tasks: ["Record 3 answers and count fillers", "Replace fillers with pauses"], time_minutes: 20 },
    { focus: "Full dress rehearsal", tasks: ["Complete a full-length mock", "Compare scores with today"], time_minutes: 60 },
  ].map((p, i) => ({ day: i + 1, ...p }));

  const low =
    cand.length < 3 || totalWords < 120
      ? `Low data: only ${cand.length} candidate answer(s) and ~${totalWords} words were captured${facts.session_status === "ended_early" ? " because the session ended early" : ""}. Scores are directional; run a longer session for a reliable read.`
      : "";

  return {
    session_summary: {
      session_status: facts.session_status,
      planned_duration_minutes: facts.planned_duration_minutes,
      actual_duration_minutes: facts.actual_duration_minutes,
      role_guess: facts.role_hint || "Not specified",
      company: facts.company,
      interview_type: facts.interview_type,
      difficulty: facts.difficulty,
      topics_discussed: topics,
    },
    scores: { overall, communication_delivery: communication, structure_star: structure, role_fit: roleFit, confidence_clarity: confidence, technical_depth: technical },
    strengths: strengths.slice(0, 4),
    improvements: improvements.slice(0, 4),
    delivery_metrics: { filler_word_estimate: fillers, pace_wpm_estimate: wpm, long_pause_estimate: pauses },
    moments_that_mattered: moments,
    practice_plan_7_days: plan,
    next_interview_checklist: [
      "Open every answer with a one-sentence headline result",
      "Have 5 STAR stories with metrics ready",
      "Say 'I' for your actions; name others' roles explicitly",
      "Prepare 3 questions about the team's biggest challenge",
      "Pause instead of filler words",
      "Re-read the JD and map each requirement to a story",
    ],
    notes_if_low_data: low,
  };
}

// ---------------- pipeline ----------------
export async function generateDebrief(
  turns: TranscriptTurn[],
  facts: DebriefFacts
): Promise<{ debrief: DebriefJSON; source: "gemini" | "heuristic"; model: string }> {
  const turnCount = turns.filter((t) => t.speaker !== "system").length;
  const payload = {
    session_facts: facts,
    transcript_turns: turns
      .filter((t) => t.speaker !== "system")
      .map((t) => ({
        speaker: t.speaker === "candidate" ? "candidate" : `interviewer (${t.speakerName || t.speaker})`,
        timestamp_start: fmtTs(t.tsStartMs),
        timestamp_end: fmtTs(t.tsEndMs),
        text: t.text,
      })),
  };

  if (geminiKey() && turnCount > 0) {
    let lastErrs: string[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const prompt =
          attempt === 0
            ? `Generate DEBRIEF_JSON for this session.\n${JSON.stringify(payload)}`
            : `Your previous output failed validation: ${lastErrs.join("; ")}. Regenerate DEBRIEF_JSON fully and correctly.\n${JSON.stringify(payload)}`;
        const raw = await generateJSON({ system: DEBRIEF_SYSTEM, prompt, schema: DEBRIEF_JSON_SCHEMA, temperature: 0.5 });
        const d = normalizeDebrief(raw, facts, turnCount);
        lastErrs = validateDebrief(d, turnCount);
        if (!lastErrs.length) return { debrief: d, source: "gemini", model: TEXT_MODEL };
        // Patch the fixable bits from heuristics rather than failing (layer 3)
        if (attempt === 1) {
          const h = heuristicDebrief(turns, facts);
          if (d.practice_plan_7_days.length !== 7) d.practice_plan_7_days = h.practice_plan_7_days;
          if (!d.strengths.length) d.strengths = h.strengths;
          if (!d.improvements.length) d.improvements = h.improvements;
          if (!d.next_interview_checklist.length) d.next_interview_checklist = h.next_interview_checklist;
          return { debrief: normalizeDebrief(d, facts, turnCount), source: "gemini", model: TEXT_MODEL };
        }
      } catch (e) {
        console.error("debrief gemini attempt failed", e);
        lastErrs = ["invalid JSON or API error"];
      }
    }
  }
  return { debrief: normalizeDebrief(heuristicDebrief(turns, facts), facts, turnCount), source: "heuristic", model: "local-heuristic" };
}
