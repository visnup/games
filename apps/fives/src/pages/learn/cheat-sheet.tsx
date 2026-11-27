import { existsSync, readFileSync } from "node:fs";
import Link from "next/link";
import { useState } from "react";
import { num } from "kit/markdown.ts";
import { guide } from "kit/readme.ts";
import { Players, Trainer } from "../../components/Learn";
import { CHEAT_SHEET } from "../../read.ts";
import { practices, type Puzzle } from "../../review.ts";

/** Each cheat sheet rule's rows in the README's tables, and the start of its section's heading. */
const SOURCES = {
  lead: { breaks: ["lead your lowest card face up", "within 5 of 25, lead a card over 5 face up"], heading: "lead face down" },
  duck: { breaks: ["play to win tricks, not to lose them", "take every trick you're sure to win"], heading: "don't chase tricks" },
  take: { breaks: [], heading: "when you must take" },
};
const TAKE = { row: "when every card wins", says: "take with the biggest card that doesn't bust" };

type Break = { says: string; cost: number[] };
type Rule = { rule: string; title: string; text: string; id: string | null; breaks: Break[]; puzzles: number };
type Props = { rules: Rule[]; easy: number[]; beyond: number };

export function getStaticProps(): { props: Props } {
  const g = guide();
  const worth = g.table("without this rule");
  const pct = (row: Record<string, string>) => [3, 4].map((n) => num(row[`${n} players`]));
  const base = pct(worth[0]);
  const cost = (says: string) => {
    const at = pct(worth.find((r) => r["without this rule"] === says)!);
    return base.map((b, i) => Math.round(10 * (b - at[i])) / 10);
  };
  const take = g.table("rule").find((r) => r.rule.startsWith(TAKE.row))!;
  // only the build reads it, from the app's root
  const puzzles: Puzzle[] = existsSync("public/puzzles.json") ? JSON.parse(readFileSync("public/puzzles.json", "utf8")) : [];
  const count = (rule: string) => puzzles.filter((p) => practices(p, rule)).length;
  const rules = g.list("How to play well").map((item, i) => {
    const rule = CHEAT_SHEET[i];
    const { breaks, heading } = SOURCES[rule];
    return {
      rule,
      ...item,
      id: g.headings.find((h) => h.text.toLowerCase().replace("’", "'").startsWith(heading))?.id ?? null,
      breaks: rule === "take" ? [{ says: TAKE.says, cost: take["against Medium"].split(", ").map(num) }] : breaks.map((says) => ({ says, cost: cost(says) })),
      puzzles: count(rule),
    };
  });
  return { props: { rules, easy: cost("never flip a card (Easy)"), beyond: count("beyond") } };
}

const signed = (x: number) => (x > 0 ? `+${x.toFixed(1)}` : x < 0 ? `−${(-x).toFixed(1)}` : "0.0");

function Practice({ rule, n }: { rule: string; n: number }) {
  return n ? (
    <Link href={`/learn/puzzles?rule=${rule}`} className="shrink-0 rounded-lg bg-magenta px-3 py-1 text-sm font-bold text-white">
      Practice · {n}
    </Link>
  ) : null;
}

export default function Rules({ rules, easy, beyond }: Props) {
  const [players, setPlayers] = useState(4);
  const at = players - 3;
  const max = Math.max(...rules.flatMap((r) => r.breaks.flatMap((b) => b.cost)));
  return (
    <Trainer title="The cheat sheet" description="Fives' three rules of good play, what breaking each costs at 3 and 4 players, and puzzles from Hard's games to practice each one.">
      <h1 className="m-0 text-3xl font-bold">The cheat sheet</h1>
      <p className="m-0 opacity-80">
        Medium plays by these three rules. The first rule that fits the moment decides the play. Each bar is what breaking the rule costs one player at a table of Medium bots, in points of win chance. Never flipping a
        card at all costs {easy[at].toFixed(1)}.
      </p>
      <Players value={players} set={(n) => setPlayers(n!)} />
      <ol className="flex flex-col gap-3">
        {rules.map((r, i) => (
          <li key={r.rule} className="panel p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-magenta font-numbers font-bold text-white">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <h2 className="m-0 text-lg font-bold" dangerouslySetInnerHTML={{ __html: r.title }} />
                <p className="mt-1 mb-3 text-sm opacity-85" dangerouslySetInnerHTML={{ __html: r.text }} />
                <p className="label mt-0 mb-1">What it costs to instead…</p>
                <div className="grid grid-cols-[minmax(0,11rem)_1fr_3rem] items-center gap-x-2 gap-y-1 text-xs">
                  {r.breaks.map((b) => {
                    const w = b.cost[at];
                    return [
                      <span key={b.says} className="opacity-70">
                        {b.says}
                      </span>,
                      <span key={`${b.says} bar`} className="relative h-3">
                        <span className={`absolute inset-y-0 left-0 rounded-sm transition-all duration-300 ${w >= 0 ? "bg-magenta" : "bg-ink/30"}`} style={{ width: `${(100 * Math.abs(w)) / max}%` }} />
                      </span>,
                      <span key={`${b.says} n`} className="text-right font-numbers font-bold">
                        {signed(-w)}
                      </span>,
                    ];
                  })}
                </div>
                {r.id && (
                  <Link href={`/learn#${r.id}`} className="mt-2 inline-block text-sm underline opacity-80">
                    Why, in the guide
                  </Link>
                )}
              </div>
              <Practice rule={r.rule} n={r.puzzles} />
            </div>
          </li>
        ))}
      </ol>
      <section className="panel flex items-start gap-3 p-4">
        <div className="flex-1">
          <h2 className="m-0 text-lg font-bold">Beyond the rules</h2>
          <p className="mt-1 mb-0 text-sm opacity-85">These are positions where Medium&apos;s rules miss the best play. Hard&apos;s model finds it.</p>
        </div>
        <Practice rule="beyond" n={beyond} />
      </section>
    </Trainer>
  );
}
