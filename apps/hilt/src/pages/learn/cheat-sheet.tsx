import { existsSync, readFileSync } from "node:fs";
import Link from "next/link";
import { useState } from "react";
import { num } from "kit/markdown.ts";
import { guide } from "kit/readme.ts";
import { Players, Trainer } from "../../components/Learn";
import { practices, type Puzzle } from "../../review.ts";

const AT = ["against Medium", "against the league", "against Hard"] as const;

type Rule = { title: string; text: string; rule?: string; id: string | null; worth?: number[][]; puzzles: number };
type Props = { rules: Rule[]; choices: Rule[]; beyond: number };

const plain = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&#39;/g, "'")
    .replace(/[.,]+$/, "")
    .toLowerCase();

export function getStaticProps(): { props: Props } {
  const g = guide();
  const table = g.table("rule");
  // only the build reads it, from the app's root
  const puzzles: Puzzle[] = existsSync("public/puzzles.json") ? JSON.parse(readFileSync("public/puzzles.json", "utf8")) : [];
  const count = (rule: string) => puzzles.filter((p) => practices(p, rule)).length;
  const id = (start: string) => g.headings.find((h) => h.text.toLowerCase().startsWith(start))?.id ?? null;
  const rules = g.list("How to play well").map((item) => {
    const row = table.find((r) => plain(item.title).startsWith(r.rule.toLowerCase()))!;
    return { ...item, rule: row.rule, id: id(row.rule.toLowerCase()), worth: AT.map((a) => row[a].split(" / ").map(num)), puzzles: count(row.rule) };
  });
  const choices = g.list("How to play well", 1).map((item) => {
    const chip = plain(item.title) === "the chip";
    return { ...item, ...(chip && { rule: "chip" }), id: id(chip ? "which chip" : plain(item.title)), puzzles: chip ? count("chip") : 0 };
  });
  return { props: { rules, choices, beyond: count("beyond") } };
}

const signed = (x: number) => (x > 0 ? `+${x.toFixed(1)}` : x < 0 ? `−${(-x).toFixed(1)}` : "0.0");

function Practice({ rule, n }: { rule?: string; n: number }) {
  return rule && n ? (
    <Link href={`/learn/puzzles?rule=${encodeURIComponent(rule)}`} className="shrink-0 rounded-lg bg-accent px-3 py-1 text-sm font-bold text-white">
      Practice · {n}
    </Link>
  ) : null;
}

export default function Rules({ rules, choices, beyond }: Props) {
  const [players, setPlayers] = useState(4);
  const at = players - 3;
  const max = Math.max(...rules.flatMap((r) => r.worth!.flat()));
  return (
    <Trainer title="The cheat sheet" description="Hilt's nine rules of good play, what each is worth at 3 to 6 players, and puzzles from Hard's games to practice each one.">
      <h1 className="text-3xl font-bold">The cheat sheet</h1>
      <p className="m-0 opacity-80">Medium plays by these rules, in this order. The first rule that fits the moment decides the move. Each bar is what breaking the rule costs, in points of win chance.</p>
      <Players value={players} set={(n) => setPlayers(n!)} />
      <ol className="flex flex-col gap-3">
        {rules.map((r, i) => (
          <li key={r.rule} className="panel p-4">
            <div className="flex items-start gap-3">
              <span className="font-numbers grid size-8 shrink-0 place-items-center rounded-full bg-white/15 font-bold">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <h2 className="m-0 text-lg font-bold" dangerouslySetInnerHTML={{ __html: r.title }} />
                <p className="mt-1 mb-3 text-sm opacity-85" dangerouslySetInnerHTML={{ __html: r.text }} />
                <div className="grid grid-cols-[8rem_1fr_3rem] items-center gap-x-2 gap-y-1 text-xs">
                  {AT.map((a, k) => {
                    const w = r.worth![k][at];
                    return [
                      <span key={a} className="opacity-70">
                        {a}
                      </span>,
                      <span key={`${a} bar`} className="relative h-3">
                        <span className={`absolute inset-y-0 left-0 rounded-sm transition-all duration-300 ${w >= 0 ? "bg-accent" : "bg-white/40"}`} style={{ width: `${(100 * Math.abs(w)) / max}%` }} />
                      </span>,
                      <span key={`${a} n`} className="font-numbers text-right font-bold">
                        {signed(w)}
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
      <h2 className="mb-0 text-xl font-bold">Outside battles</h2>
      <ul className="flex flex-col gap-3">
        {choices.map((r) => (
          <li key={r.title} className="panel flex items-start gap-3 p-4">
            <div className="min-w-0 flex-1">
              <h3 className="m-0 font-bold" dangerouslySetInnerHTML={{ __html: r.title }} />
              <p className="mt-1 mb-0 text-sm opacity-85" dangerouslySetInnerHTML={{ __html: r.text }} />
              {r.id && (
                <Link href={`/learn#${r.id}`} className="mt-2 inline-block text-sm underline opacity-80">
                  Why, in the guide
                </Link>
              )}
            </div>
            <Practice rule={r.rule} n={r.puzzles} />
          </li>
        ))}
      </ul>
      <section className="panel flex items-start gap-3 p-4">
        <div className="flex-1">
          <h2 className="m-0 text-lg font-bold">Beyond the rules</h2>
          <p className="mt-1 mb-0 text-sm opacity-85">Positions where Medium&apos;s rules miss the best move and Hard&apos;s model finds it.</p>
        </div>
        <Practice rule="beyond" n={beyond} />
      </section>
    </Trainer>
  );
}
