import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "@/db";
import { users } from "@/db/schema";
import { handleError, HttpError } from "@/lib/auth";
import { firebaseEnabled } from "@/lib/firebase-config";

/**
 * Local-mode password reset. With Firebase enabled, the client calls
 * sendPasswordResetEmail() instead. Without an email provider we return the
 * reset link directly so the flow is testable end-to-end.
 */
export async function POST(req: Request) {
  try {
    if (firebaseEnabled) throw new HttpError(400, "Use Firebase password reset.");
    const { email } = (await req.json()) as { email?: string };
    const e = (email || "").trim().toLowerCase();
    const [u] = await db.select().from(users).where(eq(users.email, e)).limit(1);
    if (!u || !u.passwordHash) return Response.json({ ok: true });
    const token = randomBytes(24).toString("hex");
    await db
      .update(users)
      .set({ resetToken: token, resetTokenExpires: new Date(Date.now() + 30 * 60 * 1000) })
      .where(eq(users.id, u.id));
    return Response.json({ ok: true, devResetUrl: `/auth/reset?token=${token}` });
  } catch (e) {
    return handleError(e);
  }
}
