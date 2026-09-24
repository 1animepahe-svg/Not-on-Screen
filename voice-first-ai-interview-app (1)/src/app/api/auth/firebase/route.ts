import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSessionCookie, handleError, HttpError, publicUser, verifyFirebaseIdToken } from "@/lib/auth";

/** Exchanges a Firebase ID token for an app session cookie (persisted per user). */
export async function POST(req: Request) {
  try {
    const { idToken, name } = (await req.json()) as { idToken?: string; name?: string };
    if (!idToken) throw new HttpError(400, "Missing Firebase ID token.");
    const claims = await verifyFirebaseIdToken(idToken).catch(() => {
      throw new HttpError(401, "Firebase session could not be verified. Please sign in again.");
    });
    const email = (claims.email || `${claims.sub}@firebase.local`).toLowerCase();
    const provider = claims.firebase?.sign_in_provider === "google.com" ? "google" : "firebase";
    let [u] = await db.select().from(users).where(eq(users.firebaseUid, claims.sub)).limit(1);
    if (!u) [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (u) {
      [u] = await db.update(users).set({ firebaseUid: claims.sub, provider }).where(eq(users.id, u.id)).returning();
    } else {
      [u] = await db
        .insert(users)
        .values({ email, name: name || claims.name || email.split("@")[0], firebaseUid: claims.sub, provider })
        .returning();
    }
    await createSessionCookie(u.id);
    return Response.json({ user: publicUser(u) });
  } catch (e) {
    return handleError(e);
  }
}
