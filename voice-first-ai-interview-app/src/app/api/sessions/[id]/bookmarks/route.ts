import { db } from "@/db";
import { bookmarks } from "@/db/schema";
import { apiUser, handleError } from "@/lib/auth";
import { getOwnedSession } from "@/lib/sessions";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  try {
    const u = await apiUser();
    const { id } = await params;
    await getOwnedSession(id, u.id);
    const b = (await req.json()) as { tMs?: number; note?: string };
    const [row] = await db
      .insert(bookmarks)
      .values({ sessionId: id, tMs: Math.max(0, Math.round(Number(b.tMs) || 0)), note: String(b.note || "").slice(0, 500) })
      .returning();
    return Response.json({ bookmark: { id: row.id, tMs: row.tMs, note: row.note } });
  } catch (e) {
    return handleError(e);
  }
}
