import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { debriefs, interviewSessions, transcriptTurns } from "@/db/schema";
import { HttpError } from "./auth";
import type { SessionContext } from "./prompts";
import type { Difficulty, InterviewType, SessionDTO, Speaker, TranscriptTurn } from "./types";

export type SessionRow = typeof interviewSessions.$inferSelect;

export async function getOwnedSession(id: string, userId: string): Promise<SessionRow> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "Session not found.");
  const [s] = await db
    .select()
    .from(interviewSessions)
    .where(and(eq(interviewSessions.id, id), eq(interviewSessions.userId, userId)))
    .limit(1);
  if (!s) throw new HttpError(404, "Session not found.");
  return s;
}

export function toDTO(s: SessionRow): SessionDTO {
  return {
    id: s.id,
    interviewType: s.interviewType as InterviewType,
    customType: s.customType,
    difficulty: s.difficulty as Difficulty,
    plannedMinutes: s.plannedMinutes,
    panelSize: s.panelSize,
    roleTitle: s.roleTitle,
    companyUrl: s.companyUrl,
    companyName: s.companyName,
    status: s.status,
    mode: s.mode,
    overallScore: s.overallScore,
    actualSeconds: s.actualSeconds,
    createdAt: s.createdAt.toISOString(),
    startedAt: s.startedAt?.toISOString() ?? null,
    endedAt: s.endedAt?.toISOString() ?? null,
  };
}

export function toContext(s: SessionRow): SessionContext {
  return {
    interviewType: s.interviewType as InterviewType,
    customType: s.customType,
    difficulty: s.difficulty as Difficulty,
    plannedMinutes: s.plannedMinutes,
    panelSize: s.panelSize,
    roleTitle: s.roleTitle,
    companyUrl: s.companyUrl,
    companyName: s.companyName,
    companyContext: s.companyContext,
    cvText: s.cvText,
    coverLetterText: s.coverLetterText,
    jdText: s.jdText,
  };
}

export async function loadTurns(sessionId: string): Promise<TranscriptTurn[]> {
  const rows = await db
    .select()
    .from(transcriptTurns)
    .where(eq(transcriptTurns.sessionId, sessionId))
    .orderBy(asc(transcriptTurns.tsStartMs), asc(transcriptTurns.seq));
  return rows.map((r) => ({
    clientId: r.clientId,
    seq: r.seq,
    speaker: r.speaker as Speaker,
    speakerName: r.speakerName,
    tsStartMs: r.tsStartMs,
    tsEndMs: r.tsEndMs,
    text: r.text,
    channel: r.channel as "voice" | "text",
  }));
}

export async function latestDebrief(sessionId: string) {
  const [d] = await db
    .select()
    .from(debriefs)
    .where(eq(debriefs.sessionId, sessionId))
    .orderBy(desc(debriefs.version))
    .limit(1);
  return d ?? null;
}

export function sanitizeTurns(input: unknown): TranscriptTurn[] {
  if (!Array.isArray(input)) return [];
  const speakers = new Set(["candidate", "interviewer_1", "interviewer_2", "system"]);
  return input
    .slice(0, 500)
    .map((t: Record<string, unknown>) => ({
      clientId: String(t.clientId ?? "").slice(0, 80),
      seq: Math.max(0, Math.floor(Number(t.seq) || 0)),
      speaker: (speakers.has(String(t.speaker)) ? t.speaker : "system") as Speaker,
      speakerName: String(t.speakerName ?? "").slice(0, 60),
      tsStartMs: Math.max(0, Math.floor(Number(t.tsStartMs) || 0)),
      tsEndMs: Math.max(0, Math.floor(Number(t.tsEndMs) || 0)),
      text: String(t.text ?? "").slice(0, 8000),
      channel: (t.channel === "text" ? "text" : "voice") as "voice" | "text",
    }))
    .filter((t) => t.clientId && t.text.trim());
}

export async function fetchCompanyContext(url: string): Promise<{ name: string; context: string }> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "user-agent": "Mozilla/5.0 (NotOnScreen interview prep)" },
      redirect: "follow",
    });
    clearTimeout(timer);
    const html = (await res.text()).slice(0, 400000);
    const pick = (re: RegExp) => re.exec(html)?.[1]?.trim() ?? "";
    const title = pick(/<title[^>]*>([^<]*)<\/title>/i);
    const site = pick(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']*)["']/i);
    const desc =
      pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
      pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i);
    const body = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z#0-9]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2000);
    const host = new URL(url).hostname.replace(/^www\./, "");
    const name = site || title.split(/[|\-–—:]/)[0].trim() || host;
    return { name: name.slice(0, 80), context: `Title: ${title}\nDescription: ${desc}\nPage text: ${body}` };
  } catch {
    const host = (() => {
      try {
        return new URL(url).hostname.replace(/^www\./, "");
      } catch {
        return url;
      }
    })();
    return { name: host.split(".")[0].replace(/^\w/, (c) => c.toUpperCase()), context: "" };
  }
}
