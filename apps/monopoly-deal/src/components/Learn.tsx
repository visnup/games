import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactNode } from "react";

const PAGES = [
  ["/learn", "Guide"],
  ["/learn/cheat-sheet", "Cheat sheet"],
  ["/learn/cards", "Cards"],
  ["/learn/puzzles", "Puzzles"],
] as const;

/** Links between the guide and its trainers, and back to the game. */
export function Nav({ className = "" }: { className?: string }) {
  const { pathname } = useRouter();
  return (
    <nav className={`flex flex-wrap items-center gap-1 text-sm ${className}`}>
      <Link href="/" className="mr-auto px-2 py-1 font-bold">
        Monopoly Deal
      </Link>
      {PAGES.map(([href, name]) => (
        <Link key={href} href={href} className={`rounded-md px-3 py-1 ${pathname === href ? "bg-white/20 font-bold" : "opacity-80 hover:bg-white/10"}`}>
          {name}
        </Link>
      ))}
    </nav>
  );
}

/** A trainer beside the guide. */
export function Trainer({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 p-4">
      <Head>
        <title>{`${title} · Monopoly Deal`}</title>
        <meta name="description" content={description} />
      </Head>
      <Nav />
      {children}
    </main>
  );
}

/** A choice of player count from `counts`, with "any" when `any`. */
export function Players({ value, set, any, counts = [2, 3, 4, 5] }: { value?: number; set: (n?: number) => void; any?: boolean; counts?: number[] }) {
  const options = [...(any ? [undefined] : []), ...counts];
  return (
    <div className="flex items-center gap-1 text-sm" role="radiogroup" aria-label="Players">
      {options.map((n) => (
        <button key={n ?? "any"} role="radio" aria-checked={value === n} className={value === n ? "primary" : "quiet"} onClick={() => set(n)}>
          {n ? `${n} players` : "Any"}
        </button>
      ))}
    </div>
  );
}

/** A link to the `n` puzzles that practice `rule`, when there are any. */
export function Practice({ rule, n }: { rule?: string; n: number }) {
  return rule && n ? (
    <Link href={`/learn/puzzles?rule=${encodeURIComponent(rule)}`} className="shrink-0 rounded-lg bg-gold px-3 py-1 text-sm font-bold text-black">
      Practice · {n}
    </Link>
  ) : null;
}

export const signed = (x: number) => (x > 0 ? `+${x.toFixed(1)}` : x < 0 ? `−${(-x).toFixed(1)}` : "0.0");
