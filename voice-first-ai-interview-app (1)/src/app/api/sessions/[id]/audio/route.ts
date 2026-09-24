import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { recordings } from "@/db/schema";
import { apiUser, handleError, HttpError } from "@/lib/auth";
import { getOwnedSession } from "@/lib/sessions";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  try {
    const u = await apiUser();
    const { id } = await params;
    await getOwnedSession(id, u.id);
    const mime = (req.headers.get("content-type") || "audio/webm").split(";")[0];
    const buf = Buffer.from(await req.arrayBuffer());
    if (!buf.length) throw new HttpError(400, "Empty recording.");
    if (buf.length > 60 * 1024 * 1024) throw new HttpError(413, "Recording too large.");
    await db.delete(recordings).where(eq(recordings.sessionId, id));
    await db.insert(recordings).values({ sessionId: id, mime, sizeBytes: buf.length, data: buf });
    return Response.json({ ok: true, size: buf.length });
  } catch (e) {
    return handleError(e);
  }
}

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const u = await apiUser();
    const { id } = await params;
    await getOwnedSession(id, u.id);
    const [r] = await db.select().from(recordings).where(eq(recordings.sessionId, id)).orderBy(desc(recordings.id)).limit(1);
    if (!r) throw new HttpError(404, "No recording for this session.");
    return new Response(new Uint8Array(r.data), { headers: { "content-type": r.mime, "content-length": String(r.sizeBytes) } });
  } catch (e) {
    return handleError(e);
  }
}
