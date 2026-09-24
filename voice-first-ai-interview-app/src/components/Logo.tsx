import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-2.5">
      <span className="relative flex h-7 w-7 items-center justify-center rounded-full border border-accent/40">
        <span className="h-2 w-2 rounded-full bg-accent shadow-[0_0_14px_rgba(52,211,164,0.9)] transition-transform duration-200 group-hover:scale-125" />
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-white">
        Not on screen
      </span>
    </Link>
  );
}
