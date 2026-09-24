"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Logo } from "@/components/Logo";
import { Button, Card, Input, Label } from "@/components/ui";
import { firebaseEnabled } from "@/lib/firebase-config";
import { exchangeFirebaseToken, firebaseErrorMessage, getFirebaseAuth } from "@/lib/firebase-client";

type Mode = "signin" | "signup" | "forgot";

export function AuthForm({ initialMode, next }: { initialMode: Mode; next: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<React.ReactNode>(null);

  const done = () => {
    router.push(next);
    router.refresh();
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (firebaseEnabled) {
        const auth = await getFirebaseAuth()!;
        const fa = await import("firebase/auth");
        if (mode === "forgot") {
          await fa.sendPasswordResetEmail(auth, email);
          setInfo("If an account exists for that email, a reset link is on its way.");
          return;
        }
        const cred =
          mode === "signup" ? await fa.createUserWithEmailAndPassword(auth, email, password) : await fa.signInWithEmailAndPassword(auth, email, password);
        if (mode === "signup" && name) await fa.updateProfile(cred.user, { displayName: name });
        await exchangeFirebaseToken(await cred.user.getIdToken(), name);
        return done();
      }
      // Local auth mode (Firebase not configured)
      const url = mode === "signup" ? "/api/auth/signup" : mode === "signin" ? "/api/auth/signin" : "/api/auth/forgot";
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, name }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Something went wrong");
      if (mode === "forgot") {
        setInfo(
          j.devResetUrl ? (
            <span>
              No email provider is configured, so here is your reset link:{" "}
              <Link className="text-accent underline" href={j.devResetUrl}>Reset password</Link>
            </span>
          ) : (
            "If an account exists for that email, you can reset it now."
          )
        );
        return;
      }
      done();
    } catch (err) {
      setError(firebaseEnabled ? firebaseErrorMessage(err) : err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function google() {
    setError(null);
    setLoading(true);
    try {
      const auth = await getFirebaseAuth()!;
      const { GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
      const cred = await signInWithPopup(auth, new GoogleAuthProvider());
      await exchangeFirebaseToken(await cred.user.getIdToken(), cred.user.displayName || undefined);
      done();
    } catch (err) {
      setError(firebaseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const titles = { signin: "Welcome back", signup: "Create your account", forgot: "Reset your password" };
  const subs = {
    signin: "Sign in to continue your practice.",
    signup: "Your sessions, transcripts and debriefs stay tied to you.",
    forgot: "Enter your email and we'll help you get back in.",
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-[1100px] flex-col px-6">
      <header className="flex h-16 items-center">
        <Logo />
      </header>
      <div className="flex flex-1 items-center justify-center pb-20">
        <Card className="w-full max-w-[420px] p-8">
          <AnimatePresence mode="wait">
            <motion.div key={mode} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
              <h2 className="title text-white">{titles[mode]}</h2>
              <p className="mt-2 text-sm text-white/50">{subs[mode]}</p>
            </motion.div>
          </AnimatePresence>

          {mode !== "forgot" && (
            <div className="mt-6 flex rounded-full border border-white/10 bg-white/[0.03] p-1 text-sm">
              {(["signin", "signup"] as const).map((m) => (
                <button key={m} onClick={() => { setMode(m); setError(null); setInfo(null); }} className={`relative flex-1 rounded-full py-1.5 transition-colors ${mode === m ? "text-ink" : "text-white/60 hover:text-white"}`}>
                  {mode === m && <motion.span layoutId="authtab" className="absolute inset-0 rounded-full bg-accent" transition={{ duration: 0.2 }} />}
                  <span className="relative">{m === "signin" ? "Sign in" : "Sign up"}</span>
                </button>
              ))}
            </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <div>
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Morgan" autoComplete="name" />
              </div>
            )}
            <div>
              <Label>Email</Label>
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
            </div>
            {mode !== "forgot" && (
              <div>
                <Label hint={mode === "signin" ? undefined : "8+ characters"}>Password</Label>
                <Input type="password" required minLength={mode === "signup" ? 8 : 1} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete={mode === "signup" ? "new-password" : "current-password"} />
              </div>
            )}
            {error && <p className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
            {info && <p className="rounded-xl border border-accent/20 bg-accent/10 px-3 py-2 text-sm text-white/85">{info}</p>}
            <Button type="submit" loading={loading} className="w-full" size="lg">
              {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
            </Button>
          </form>

          {mode !== "forgot" && (
            <>
              <div className="my-5 flex items-center gap-3 text-xs text-white/30">
                <span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" />
              </div>
              <Button variant="outline" className="w-full" size="lg" onClick={google} disabled={!firebaseEnabled || loading} title={firebaseEnabled ? undefined : "Configure Firebase to enable Google Sign-In"}>
                <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden><path fill="#fff" d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.64 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.95S8.78 6.28 12 6.28c1.83 0 3.06.78 3.76 1.45l2.57-2.47C16.68 3.72 14.53 2.8 12 2.8 6.92 2.8 2.8 6.92 2.8 12s4.12 9.2 9.2 9.2c5.31 0 8.83-3.73 8.83-8.99 0-.6-.07-1.06-.15-1.51z" /></svg>
                Continue with Google
              </Button>
              {!firebaseEnabled && <p className="mt-2 text-center text-xs text-white/30">Google Sign-In activates when Firebase keys are configured.</p>}
            </>
          )}

          <div className="mt-6 text-center text-sm text-white/50">
            {mode === "signin" && <button onClick={() => { setMode("forgot"); setError(null); }} className="hover:text-white">Forgot password?</button>}
            {mode === "forgot" && <button onClick={() => { setMode("signin"); setInfo(null); }} className="hover:text-white">← Back to sign in</button>}
          </div>
        </Card>
      </div>
    </main>
  );
}
