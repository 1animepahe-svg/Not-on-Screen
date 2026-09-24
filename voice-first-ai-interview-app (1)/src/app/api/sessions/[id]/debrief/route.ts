import { eq } from "drizzle-orm";
import { db } from "@/db";
import { debriefs, interviewSessions } from "@/db/schema";
import { apiUser, handleError } from "@/lib/auth";
import { generateDebrief } from "@/lib/debrief";
import { getOwnedSession, latestDebrief, loadTurns } from "@/lib/sessions";
import { typeLabel } from "@/lib/types";

export const maxDuration = 120;
type Ctx = { params: Promise<{ id: string }> };

/** Generates (or regenerates) DEBRIEF_JSON strictly from the stored transcript turns. */
export async function POST(_req: Request, { params }: Ctx) {
  try {
    const u = await apiUser();
    const { id } = await params;
    let s = await getOwnedSession(id, u.id);
    if (!s.endedAt) {
      // Session never finalized (tab closed / crash): finalize from transcript timing.
      const turns = await loadTurns(id);
      const last = turns.reduce((m, t) => Math.max(m, t.tsEndMs), 0);
      [s] = await db
        .update(interviewSessions)
        .set({ status: "ended_early", actualSeconds: Math.round(last / 1000), endedAt: new Date() })
        .where(eq(interviewSessions.id, id))
        .returning();
    }
    const turns = await loadTurns(id);
    const actualMin = Math.round(((s.actualSeconds ?? 0) / 60) * 10) / 10;
    const facts = {
      session_status: (s.status === "completed" ? "completed" : "ended_early") as "completed" | "ended_early",
      planned_duration_minutes: s.plannedMinutes,
      actual_duration_minutes: actualMin,
      company: s.companyName || s.companyUrl,
      interview_type: typeLabel(s.interviewType, s.customType),
      difficulty: s.difficulty,
      role_hint: s.roleTitle,
    };
    const { debrief, source, model } = await generateDebrief(turns, facts);
    const prev = await latestDebrief(id);
    const version = (prev?.version ?? 0) + 1;
    const [row] = await db
      .insert(debriefs)
      .values({ sessionId: id, version, json: debrief, source, model, partial: facts.session_status === "ended_early" })
      .returning();
    await db.update(interviewSessions).set({ overallScore: debrief.scores.overall }).where(eq(interviewSessions.id, id));
    return Response.json({ debrief: { json: row.json, version: row.version, source: row.source, model: row.model, createdAt: row.createdAt } });
  } catch (e) {
    return handleError(e);
  }
}
