import Link from "next/link";
import { useMemo, useState } from "react";
import { num } from "kit/markdown.ts";
import { guide } from "kit/readme.ts";
import type { Card as CardType, Fate } from "../../cards.ts";
import { mulberry32 } from "../../game.ts";
import { Card } from "../../components/Card";
import { Players, Trainer } from "../../components/Learn";

type Props = { rows: { card: string; worth: number[] }[] };

export function getStaticProps(): { props: Props } {
  const rows = guide()
    .table("card")
    .map((r) => ({ card: r.card, worth: [3, 4, 5, 6].map((n) => num(r[`${n} players`])) }));
  return { props: { rows } };
}

const card = (name: string): CardType => (/^\d+$/.test(name) ? { kind: "force", value: +name } : { kind: name.toLowerCase() as Fate, value: name === "Legend" ? 10 : 0 });
const signed = (x: number) => (x > 0 ? `+${x.toFixed(1)}` : x < 0 ? `−${(-x).toFixed(1)}` : "0.0");

/** Two cards worth at least a point apart, so the answer isn't noise. */
function pair(rows: Props["rows"], at: number, rng = Math.random): [number, number] {
  for (;;) {
    const a = Math.floor(rng() * rows.length);
    const b = Math.floor(rng() * rows.length);
    if (Math.abs(rows[a].worth[at] - rows[b].worth[at]) >= 1) return [a, b];
  }
}

export default function Cards({ rows }: Props) {
  const [players, setPlayers] = useState(4);
  const at = players - 3;
  // the first pair is seeded, so the server's page matches the browser's
  const [quiz, setQuiz] = useState(() => pair(rows, at, mulberry32(1)));
  const [picked, setPicked] = useState<number>();
  const [score, setScore] = useState({ right: 0, tried: 0, streak: 0 });
  const sorted = useMemo(() => rows.map((r, i) => ({ ...r, i })).sort((a, b) => b.worth[at] - a.worth[at]), [rows, at]);
  const max = Math.max(...rows.flatMap((r) => r.worth.map(Math.abs)));
  const better = rows[quiz[0]].worth[at] > rows[quiz[1]].worth[at] ? quiz[0] : quiz[1];
  const pick = (i: number) => {
    if (picked !== undefined) return;
    setPicked(i);
    const right = i === better;
    setScore((s) => ({ right: s.right + +right, tried: s.tried + 1, streak: right ? s.streak + 1 : 0 }));
  };
  const next = (n = players) => {
    setPicked(undefined);
    setQuiz(pair(rows, n - 3));
  };
  return (
    <Trainer title="What each card is worth" description="Guess which Hilt card is worth more in an opening hand, then see every card's worth at 3 to 6 players.">
      <h1 className="text-3xl font-bold">What each card is worth</h1>
      <p className="m-0 opacity-80">Nobody draws in Hilt, so your opening hand is all you get. Some cards win you games. Others are worse than a random card.</p>
      <Players
        value={players}
        set={(n) => {
          setPlayers(n!);
          next(n);
        }}
      />

      <section className="panel p-5 text-center">
        <h2 className="m-0 text-lg font-bold">Which would you rather be dealt?</h2>
        <p className="mt-1 mb-4 text-sm opacity-70">One more in your opening hand, at {players} players</p>
        {quiz && (
          <div className="flex items-start justify-center gap-6 [&_.card]:text-[1.4rem]">
            {quiz.map((i, k) => (
              <div key={k} className="flex flex-col items-center gap-2">
                <Card card={card(rows[i].card)} onClick={() => pick(i)} selected={picked === i} dim={picked !== undefined && i !== better} />
                <span className={`font-numbers text-base font-bold transition-opacity ${picked === undefined ? "opacity-0" : ""}`}>{signed(rows[i].worth[at])} points</span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 flex min-h-[2.5em] items-center justify-center gap-3">
          {picked === undefined ? (
            <span className="text-sm opacity-70">Tap a card</span>
          ) : (
            <>
              <span className="font-bold">{picked === better ? "Right!" : `The ${rows[better!].card} is worth more.`}</span>
              <button className="primary" onClick={() => next()} autoFocus>
                Next
              </button>
            </>
          )}
        </div>
        <p className="mt-3 mb-0 text-sm opacity-70">
          {score.right} of {score.tried} right{score.streak > 1 && ` · ${score.streak} in a row`}
        </p>
      </section>

      <section className="panel p-5">
        <h2 className="mt-0 mb-3 text-lg font-bold">Every card at {players} players</h2>
        <ol className="flex flex-col gap-1">
          {sorted.map((r) => {
            const w = r.worth[at];
            return (
              <li key={r.card} className="grid grid-cols-[2rem_4.5rem_1fr_3.5rem] items-center gap-3">
                <span className="[&_.card]:text-[0.45rem]">
                  <Card card={card(r.card)} />
                </span>
                <span className="font-bold">{r.card}</span>
                <span className="relative h-4">
                  <span className="absolute inset-y-0 left-1/2 w-px bg-white/30" />
                  <span
                    className={`absolute inset-y-0 rounded-sm transition-all duration-300 ${w >= 0 ? "bg-accent" : "bg-white/40"}`}
                    style={w >= 0 ? { left: "50%", width: `${(50 * w) / max}%` } : { right: "50%", width: `${(-50 * w) / max}%` }}
                  />
                </span>
                <span className="font-numbers text-right font-bold">{signed(w)}</span>
              </li>
            );
          })}
        </ol>
        <p className="mb-0 text-sm opacity-70">
          Points of win chance one more copy adds in place of a random card, from 200,000 deals among Medium bots.{" "}
          <Link href="/learn#what-each-card-is-worth" className="underline">
            Why, in the guide
          </Link>
        </p>
      </section>
    </Trainer>
  );
}
