export type InterviewType = "hr" | "technical" | "coding" | "situational" | "custom";
export type Difficulty = "easy" | "medium" | "hard";
export type Speaker = "candidate" | "interviewer_1" | "interviewer_2" | "system";

export const INTERVIEW_TYPES: { id: InterviewType; label: string; blurb: string }[] = [
  { id: "hr", label: "HR", blurb: "Motivation, culture fit, career story" },
  { id: "technical", label: "Technical", blurb: "System design, depth, tradeoffs" },
  { id: "coding", label: "Coding", blurb: "Problem solving, talk-through, complexity" },
  { id: "situational", label: "Situational / Behavioral", blurb: "STAR stories, judgment, conflict" },
  { id: "custom", label: "Custom", blurb: "Describe the interview you want" },
];

export const DIFFICULTIES: { id: Difficulty; label: string; blurb: string }[] = [
  { id: "easy", label: "Easy", blurb: "Supportive. Hints allowed. Guided toward STAR." },
  { id: "medium", label: "Medium", blurb: "Neutral and professional. Probes metrics and tradeoffs." },
  { id: "hard", label: "Hard", blurb: "Strict and skeptical. Calls out vague answers." },
];

export type TranscriptTurn = {
  clientId: string;
  seq: number;
  speaker: Speaker;
  speakerName: string;
  tsStartMs: number;
  tsEndMs: number;
  text: string;
  channel: "voice" | "text";
};

export type Persona = {
  key: "interviewer_1" | "interviewer_2";
  name: string;
  title: string;
  style: string;
  initials: string;
};

export type SessionDTO = {
  id: string;
  interviewType: InterviewType;
  customType: string;
  difficulty: Difficulty;
  plannedMinutes: number;
  panelSize: number;
  roleTitle: string;
  companyUrl: string;
  companyName: string;
  status: string;
  mode: string;
  overallScore: number | null;
  actualSeconds: number | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
};

export type Evidence = { timestamp_start: string; timestamp_end: string; quote: string };

export type DebriefJSON = {
  session_summary: {
    session_status: "ended_early" | "completed";
    planned_duration_minutes: number;
    actual_duration_minutes: number;
    role_guess: string;
    company: string;
    interview_type: string;
    difficulty: string;
    topics_discussed: { topic: string; notes: string[] }[];
  };
  scores: {
    overall: number;
    communication_delivery: number;
    structure_star: number;
    role_fit: number;
    confidence_clarity: number;
    technical_depth: number;
  };
  strengths: { title: string; evidence: Evidence; why_it_matters: string }[];
  improvements: {
    title: string;
    issue: string;
    evidence: Evidence;
    better_answer_example: string;
    micro_exercise: string;
  }[];
  delivery_metrics: {
    filler_word_estimate: number;
    pace_wpm_estimate: number;
    long_pause_estimate: number;
  };
  moments_that_mattered: { label: string; timestamp_start: string; timestamp_end: string; reason: string }[];
  practice_plan_7_days: { day: number; focus: string; tasks: string[]; time_minutes: number }[];
  next_interview_checklist: string[];
  notes_if_low_data: string;
};

export function fmtTs(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function parseTs(ts: string): number {
  const m = /^(\d+):(\d{1,2})$/.exec((ts || "").trim());
  if (!m) return 0;
  return (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) * 1000;
}

export function typeLabel(t: string, custom?: string) {
  if (t === "custom" && custom) return custom;
  return INTERVIEW_TYPES.find((x) => x.id === t)?.label ?? t;
}

/** Personas are deterministic per interview type so the UI and prompts agree. */
export function getPersonas(type: InterviewType, panelSize: number): Persona[] {
  const hr: Persona = {
    key: "interviewer_1",
    name: "Maya",
    title: "HR Business Partner",
    style: "warm, perceptive, culture-focused",
    initials: "MA",
  };
  const skeptic: Persona = {
    key: "interviewer_1",
    name: "Daniel",
    title: "Senior Staff Engineer",
    style: "skeptical, precise, digs into edge cases and tradeoffs",
    initials: "DA",
  };
  const manager: Persona = {
    key: "interviewer_2",
    name: "Priya",
    title: "Hiring Manager",
    style: "outcome-oriented, pragmatic, cares about impact and ownership",
    initials: "PR",
  };
  if (type === "hr") return [hr];
  if (type === "technical" || type === "coding") return [skeptic, manager];
  const lead: Persona = { ...manager, key: "interviewer_1" };
  if (panelSize >= 2) return [lead, { ...hr, key: "interviewer_2" }];
  return [lead];
}
