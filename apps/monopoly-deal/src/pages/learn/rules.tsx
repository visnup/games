import { existsSync, readFileSync } from "node:fs";
import { useState } from "react";
import { CHEAT_SHEET } from "../../advice.ts";
import { Players, Practice, signed, Trainer } from "../../components/Learn";
import { rules, type Rule } from "../../guide.ts";
import { practices, type Puzzles } from "../../review.ts";

type Props = { rules: (Rule & { puzzles: number; why: string })[]; beyond: number };

export function getStaticProps(): { props: Props } {
  // only the build reads it, from the app's root
  const { puzzles }: Puzzles = existsSync("public/puzzles.json") ? JSON.parse(readFileSync("public/puzzles.json", "utf8")) : { puzzles: [] };
  const count = (rule: string) => puzzles.filter((p) => practices(p, rule)).length;
  return {
    props: {
      // a text fragment scrolls to the rule itself in browsers that support one, else to its section
      rules: rules().map((r) => ({ ...r, puzzles: count(r.rule), why: `/learn#${r.id}:~:text=${encodeURIComponent(CHEAT_SHEET[r.rule].lead).replace(/-/g, "%2D")}` })),
      beyond: count("beyond"),
    },
  };
}

export default function Rules({ rules, beyond }: Props) {
  const [players, setPlayers] = useState(2);
  const at = players === 2 ? 0 : 1;
  const max = Math.max(...rules.flatMap((r) => r.breaks.flatMap((b) => b.cost)));
  return (
    <Trainer title="The cheat sheet" description="Monopoly Deal's rules of good play, what breaking each one costs at 2 and 5 players, and puzzles from Hard's games to practice them.">
      <h1 className="text-3xl font-bold">The cheat sheet</h1>
      <p className="m-0 opacity-80">Medium plays by these rules. Each bar is what breaking the rule costs one player in points of win chance. Medium plays every other seat.</p>
      <Players value={players} set={(n) => setPlayers(n!)} counts={[2, 5]} />
      <ol className="flex flex-col gap-3">
        {rules.map((r, i) => (
          <li key={r.rule} className="panel p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/15 font-bold">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <h2 className="m-0 text-lg font-bold" dangerouslySetInnerHTML={{ __html: r.title }} />
                <p className="mt-1 mb-3 text-sm opacity-85" dangerouslySetInnerHTML={{ __html: r.text }} />
                <p className="mt-0 mb-1 text-xs opacity-70">Instead, if you…</p>
                <div className="grid grid-cols-[minmax(0,14rem)_1fr_3rem] items-center gap-x-2 gap-y-1 text-xs">
                  {r.breaks.map((b) => {
                    const w = b.cost[at];
                    return [
                      <span key={b.name} className="opacity-80">
                        {b.name}
                      </span>,
                      <span key={`${b.name} bar`} className="relative h-3">
                        <span className={`absolute inset-y-0 left-0 rounded-sm transition-all duration-300 ${w >= 0 ? "bg-gold" : "bg-white/40"}`} style={{ width: `${(100 * Math.abs(w)) / max}%` }} />
                      </span>,
                      <span key={`${b.name} n`} className="text-right font-bold tabular-nums">
                        {signed(-w)}
                      </span>,
                    ];
                  })}
                </div>
                <a href={r.why} className="mt-2 inline-block text-sm underline opacity-80">
                  Why, in the guide
                </a>
              </div>
              <Practice rule={r.rule} n={r.puzzles} />
            </div>
          </li>
        ))}
      </ol>
      <section className="panel flex items-start gap-3 p-4">
        <div className="flex-1">
          <h2 className="m-0 text-lg font-bold">Beyond the rules</h2>
          <p className="mt-1 mb-0 text-sm opacity-85">Positions where Medium&apos;s rules miss the best move.</p>
        </div>
        <Practice rule="beyond" n={beyond} />
      </section>
    </Trainer>
  );
}
