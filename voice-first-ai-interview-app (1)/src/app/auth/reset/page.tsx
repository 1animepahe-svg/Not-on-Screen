"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Button, Card, Input, Label } from "@/components/ui";

function ResetInner() {
  const token = useSearchParams().get("token") || "";
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card className="w-full max-w-[420px] p-8">
      <h2 className="title text-white">Choose a new password</h2>
      <form
        className="mt-6 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          setError(null);
          const r = await fetch("/api/auth/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password: pw }) });
          const j = await r.json().catch(() => ({}));
          setLoading(false);
          if (!r.ok) return setError(j.error || "Reset failed");
          router.push("/dashboard");
          router.refresh();
        }}
      >
        <div>
          <Label hint="8+ characters">New password</Label>
          <Input type="password" minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        {error && <p className="text-sm text-rose-300">{error}</p>}
        <Button type="submit" loading={loading} className="w-full" size="lg">Update password</Button>
      </form>
    </Card>
  );
}

export default function ResetPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-[1100px] flex-col px-6">
      <header className="flex h-16 items-center"><Logo /></header>
      <div className="flex flex-1 items-center justify-center pb-20">
        <Suspense fallback={null}><ResetInner /></Suspense>
      </div>
    </main>
  );
}
