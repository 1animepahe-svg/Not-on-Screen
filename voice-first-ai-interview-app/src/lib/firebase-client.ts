"use client";

import { firebaseConfig, firebaseEnabled } from "./firebase-config";
import type { Auth } from "firebase/auth";

let authPromise: Promise<Auth> | null = null;

/** Lazily initialises Firebase Auth only when configured (keeps bundle light otherwise). */
export function getFirebaseAuth(): Promise<Auth> | null {
  if (!firebaseEnabled) return null;
  if (!authPromise) {
    authPromise = (async () => {
      const { initializeApp, getApps } = await import("firebase/app");
      const { getAuth, setPersistence, browserLocalPersistence } = await import("firebase/auth");
      const app = getApps()[0] ?? initializeApp(firebaseConfig);
      const auth = getAuth(app);
      await setPersistence(auth, browserLocalPersistence);
      return auth;
    })();
  }
  return authPromise;
}

export async function exchangeFirebaseToken(idToken: string, name?: string) {
  const r = await fetch("/api/auth/firebase", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken, name }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Sign-in failed");
  return j;
}

export async function signOutEverywhere() {
  try {
    const a = getFirebaseAuth();
    if (a) {
      const { signOut } = await import("firebase/auth");
      await signOut(await a);
    }
  } catch {}
  await fetch("/api/auth/signout", { method: "POST" }).catch(() => {});
}

export function firebaseErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code || "";
  const map: Record<string, string> = {
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/wrong-password": "Incorrect email or password.",
    "auth/user-not-found": "No account found with that email.",
    "auth/email-already-in-use": "An account with this email already exists.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/popup-closed-by-user": "Google sign-in was closed before finishing.",
    "auth/network-request-failed": "Network error — check your connection.",
    "auth/too-many-requests": "Too many attempts. Try again in a few minutes.",
  };
  return map[code] || (e instanceof Error ? e.message : "Authentication failed.");
}
