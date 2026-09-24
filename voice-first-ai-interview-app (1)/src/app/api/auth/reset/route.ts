import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSessionCookie, handleError, hashPassword, HttpError } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const { token, password } = (await req.json()) as { token?: string; password?: string };
    if (!token) throw new HttpError(400, "Missing reset token.");
    if (!password || password.length < 8) throw new HttpError(400, "Password must be at least 8 characters.");
    const [u] = await db.select().from(users).where(eq(users.resetToken, token)).limit(1);
    if (!u || !u.resetTokenExpires || u.resetTokenExpires.getTime() < Date.now())
      throw new HttpError(400, "This reset link is invalid or expired.");
    await db
      .update(users)
      .set({ passwordHash: hashPassword(password), resetToken: null, resetTokenExpires: null })
      .where(eq(users.id, u.id));
    await createSessionCookie(u.id);
    return Response.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
