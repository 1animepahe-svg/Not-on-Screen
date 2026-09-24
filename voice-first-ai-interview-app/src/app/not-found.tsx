import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="text-sm text-white/40">404</p>
      <h1 className="title mt-2 text-white">This page isn&apos;t here.</h1>
      <Link href="/dashboard" className="mt-6 text-sm text-accent hover:underline">Back to dashboard</Link>
    </main>
  );
}
