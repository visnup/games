import Link from "next/link";
import { useMemo, useState } from "react";
import { num } from "kit/markdown.ts";
import { guide } from "kit/readme.ts";
import { type Card as CardType, DECK } from "../../cards.ts";
import { mulberry32, name } from "../../game.ts";
import { Card } from "../../components/Card";
import { Players, signed, Trainer } from "../../components/Learn";

const COUNTS = [2, 3, 4, 5];

type Props = { rows: { card: string; worth: number[] }[] };

export function getStaticProps(): { props: Props } {
  const rows = guide()
    .table("card")
    .map((r) => ({ card: r.card, worth: COUNTS.map((n) => num(r[`${n} players`])) }));
  return { props: { rows } };
}

const camel = (s: string) => s.replace(/ (\w)/g, (_, c: string) => c.toUpperCase());
const colors = (s: string) => (s === "any color" ? "any" : s.split("/").map(camel).join("/"));

/** A card as the README's table names it: "Rent, dark blue/green", "dark blue", "$5M" or "It's My Birthday". */
function card(label: string): CardType {
  const [, kind, of] = label.match(/^(Rent|Property Wild), (.+)$/) ?? [];
  const wanted = kind ? `${kind === "Rent" ? "rent" : "wild"}(${colors(of)})` : label === "It's My Birthday" ? "birthday" : label.startsWith("$") ? label : camel(label.toLowerCase().replace("the ", ""));
  return DECK.find((c) => name(c) === wanted)!;
}

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
  const at = COUNTS.indexOf(players);
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
    setQuiz(pair(rows, COUNTS.indexOf(n)));
  };
  return (
    <Trainer title="What each card is worth" description="Guess which Monopoly Deal card is worth more in an opening hand, then see every card's worth at 2 to 5 players.">
      <h1 className="text-3xl font-bold">What each card is worth</h1>
      <p className="m-0 opacity-80">A card&apos;s worth here is the games it wins you. Its $M is only what it pays. Deal Breaker is worth a fortune. $10M is worth barely more than $1M.</p>
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
        <div className="flex items-start justify-center gap-6 [&_.card]:text-[1.3rem]">
          {quiz.map((i, k) => (
            <div key={k} className={`flex flex-col items-center gap-2 transition-opacity ${picked !== undefined && i !== better ? "opacity-50" : ""}`}>
              <Card card={card(rows[i].card)} onClick={() => pick(i)} selected={picked === i} />
              <span className="text-sm font-bold">{rows[i].card}</span>
              <span className={`text-base font-bold tabular-nums transition-opacity ${picked === undefined ? "opacity-0" : ""}`}>{signed(rows[i].worth[at])} points</span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex min-h-[2.5em] items-center justify-center gap-3">
          {picked === undefined ? (
            <span className="text-sm opacity-70">Tap a card</span>
          ) : (
            <>
              <span className="font-bold">{picked === better ? "Right!" : `${rows[better].card} is worth more.`}</span>
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
              <li key={r.card} className="grid grid-cols-[2rem_minmax(0,11rem)_1fr_3rem] items-center gap-2 text-sm sm:gap-3">
                <span className="[&_.card]:text-[0.4rem]">
                  <Card card={card(r.card)} />
                </span>
                <span className="font-bold">{r.card}</span>
                <span className="relative h-4">
                  <span className="absolute inset-y-0 left-1/4 w-px bg-white/30" />
                  <span
                    className={`absolute inset-y-0 rounded-sm transition-all duration-300 ${w >= 0 ? "bg-gold" : "bg-white/40"}`}
                    style={w >= 0 ? { left: "25%", width: `${(75 * w) / max}%` } : { right: "75%", width: `${(75 * -w) / max}%` }}
                  />
                </span>
                <span className="text-right font-bold tabular-nums">{signed(w)}</span>
              </li>
            );
          })}
        </ol>
        <p className="mb-0 text-sm opacity-70">
          Points of win chance one more copy in your opening hand adds. Medium plays every seat. The noise is about ±0.5 points.{" "}
          <Link href="/learn#what-each-card-is-worth" className="underline">
            Why, in the guide
          </Link>
        </p>
      </section>
    </Trainer>
  );
}
