import { db } from "@/db";
import { transcriptTurns } from "@/db/schema";
import { apiUser, handleError } from "@/lib/auth";
import { getOwnedSession, sanitizeTurns } from "@/lib/sessions";

type Ctx = { params: Promise<{ id: string }> };

/** Idempotent batch upsert of transcript turns (keyed by clientId). */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const u = await apiUser();
    const { id } = await params;
    await getOwnedSession(id, u.id);
    const body = await req.json().catch(() => ({}));
    const turns = sanitizeTurns((body as { turns?: unknown }).turns);
    if (turns.length) {
      await db
        .insert(transcriptTurns)
        .values(turns.map((t) => ({ ...t, sessionId: id })))
        .onConflictDoNothing({ target: [transcriptTurns.sessionId, transcriptTurns.clientId] });
    }
    return Response.json({ ok: true, saved: turns.length });
  } catch (e) {
    return handleError(e);
  }
}
