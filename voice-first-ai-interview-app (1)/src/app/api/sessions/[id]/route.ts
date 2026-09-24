import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookmarks, interviewSessions, recordings } from "@/db/schema";
import { apiUser, handleError, HttpError } from "@/lib/auth";
import { getOwnedSession, latestDebrief, loadTurns, toDTO } from "@/lib/sessions";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const u = await apiUser();
    const { id } = await params;
    const s = await getOwnedSession(id, u.id);
    const [turns, bms, deb, rec] = await Promise.all([
      loadTurns(id),
      db.select().from(bookmarks).where(eq(bookmarks.sessionId, id)).orderBy(asc(bookmarks.tMs)),
      latestDebrief(id),
      db.select({ n: sql<number>`count(*)::int` }).from(recordings).where(eq(recordings.sessionId, id)),
    ]);
    return Response.json({
      session: toDTO(s),
      connectionLog: s.connectionLog,
      turns,
      bookmarks: bms.map((b) => ({ id: b.id, tMs: b.tMs, note: b.note })),
      debrief: deb ? { json: deb.json, version: deb.version, source: deb.source, model: deb.model, createdAt: deb.createdAt } : null,
      hasRecording: (rec[0]?.n ?? 0) > 0,
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const u = await apiUser();
    const { id } = await params;
    const s = await getOwnedSession(id, u.id);
    const b = (await req.json()) as { action?: string; mode?: string; actualSeconds?: number; log?: { t: number; state: string; note?: string }[] };
    const log = Array.isArray(b.log) ? [...s.connectionLog, ...b.log].slice(-200) : s.connectionLog;
    if (b.action === "start") {
      const [r] = await db
        .update(interviewSessions)
        .set({ status: "live", startedAt: s.startedAt ?? new Date(), connectionLog: log })
        .where(eq(interviewSessions.id, id))
        .returning();
      return Response.json({ session: toDTO(r) });
    }
    if (b.action === "mode") {
      const [r] = await db
        .update(interviewSessions)
        .set({ mode: b.mode === "fallback_text" ? "fallback_text" : "voice", connectionLog: log })
        .where(eq(interviewSessions.id, id))
        .returning();
      return Response.json({ session: toDTO(r) });
    }
    if (b.action === "end") {
      const actual = Math.max(0, Math.round(Number(b.actualSeconds) || 0));
      const status = actual < s.plannedMinutes * 60 * 0.9 ? "ended_early" : "completed";
      const [r] = await db
        .update(interviewSessions)
        .set({ status, actualSeconds: actual, endedAt: new Date(), connectionLog: log })
        .where(eq(interviewSessions.id, id))
        .returning();
      return Response.json({ session: toDTO(r) });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const u = await apiUser();
    const { id } = await params;
    await getOwnedSession(id, u.id);
    await db.delete(interviewSessions).where(eq(interviewSessions.id, id));
    return Response.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
