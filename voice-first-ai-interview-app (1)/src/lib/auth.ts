import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify, createRemoteJWKSet } from "jose";
import { scryptSync, randomBytes, timingSafeEqual, createHash } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

export const SESSION_COOKIE = "nos_session";

function secretKey() {
  const raw =
    process.env.AUTH_SECRET ||
    createHash("sha256")
      .update("not-on-screen:" + (process.env.DATABASE_URL || "dev"))
      .digest("hex");
  return new TextEncoder().encode(raw);
}

export function hashPassword(pw: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(pw: string, stored: string | null) {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, "hex");
  const b = scryptSync(pw, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function createSessionCookie(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey());
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export type CurrentUser = typeof users.$inferSelect;

export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    const jar = await cookies();
    const token = jar.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub) return null;
    const [u] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
    return u ?? null;
  } catch {
    return null;
  }
}

/** For server components: redirect to /auth when not signed in. */
export async function requireUser(next?: string) {
  const u = await getCurrentUser();
  if (!u) redirect(`/auth${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return u;
}

/** For route handlers. */
export async function apiUser() {
  const u = await getCurrentUser();
  if (!u) throw new HttpError(401, "Please sign in first.");
  return u;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function handleError(e: unknown) {
  if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
  console.error(e);
  return Response.json({ error: "Something went wrong. Your data is safe — please retry." }, { status: 500 });
}

// ---------- Firebase ID token verification (no admin SDK needed) ----------
const firebaseJWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

export async function verifyFirebaseIdToken(idToken: string) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) throw new HttpError(400, "Firebase is not configured on the server.");
  const { payload } = await jwtVerify(idToken, firebaseJWKS, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  });
  return payload as {
    sub: string;
    email?: string;
    name?: string;
    firebase?: { sign_in_provider?: string };
  };
}

export function publicUser(u: CurrentUser) {
  return { id: u.id, email: u.email, name: u.name, provider: u.provider, settings: u.settings };
}
