import Link from "next/link";
import { useState } from "react";
import { num } from "kit/markdown.ts";
import { guide } from "kit/readme.ts";
import { mulberry32 } from "../../game.ts";
import { Players, Trainer } from "../../components/Learn";

type Row = { total: string; bust: boolean; hands: number[]; chips: number[] };
type Props = { rows: Row[] };

export function getStaticProps(): { props: Props } {
  const rows = guide()
    .table("a hand's total")
    .map((r) => ({
      total: r["a hand's total"].replace(" (bust)", ""),
      bust: r["a hand's total"].includes("bust"),
      hands: [3, 4].map((n) => num(r[`${n} players, hands`])),
      chips: [3, 4].map((n) => num(r[`${n} players, chips`])),
    }));
  return { props: { rows } };
}

/** Totals rarer than this, in percent of hands, are too few to quiz on. */
const RARE = 0.5;
const signed = (x: number) => (x > 0 ? `+${x.toFixed(2)}` : x < 0 ? `−${(-x).toFixed(2)}` : "0.00");

/** Two common totals at least a fifth of a chip apart, so the answer isn't noise. */
function pair(rows: Row[], at: number, rng = Math.random): [number, number] {
  const common = rows.flatMap((r, i) => (r.hands[at] >= RARE ? [i] : []));
  for (;;) {
    const a = common[Math.floor(rng() * common.length)];
    const b = common[Math.floor(rng() * common.length)];
    if (Math.abs(rows[a].chips[at] - rows[b].chips[at]) >= 0.2) return [a, b];
  }
}

function Total({ row, size = "big" }: { row: Row; size?: "big" | "small" }) {
  const color = row.bust ? "text-bust" : row.total === "25" ? "text-magenta" : "";
  return size === "big" ? (
    <span className={`flex flex-col items-center font-numbers leading-none ${color}`}>
      <span className="text-6xl font-extrabold">{row.total}</span>
      <span className="label mt-1 opacity-100">{row.bust ? "bust" : row.total === "25" ? "on 25" : `${25 - +row.total} under`}</span>
    </span>
  ) : (
    <span className={`font-numbers font-bold ${color}`}>
      {row.total}
      {row.bust && <span className="text-xs font-normal"> bust</span>}
    </span>
  );
}

export default function Totals({ rows }: Props) {
  const [players, setPlayers] = useState(4);
  const at = players - 3;
  // the first pair is seeded, so the server's page matches the browser's
  const [quiz, setQuiz] = useState(() => pair(rows, at, mulberry32(1)));
  const [picked, setPicked] = useState<number>();
  const [score, setScore] = useState({ right: 0, tried: 0, streak: 0 });
  const max = Math.max(...rows.flatMap((r) => r.chips));
  const better = rows[quiz[0]].chips[at] > rows[quiz[1]].chips[at] ? quiz[0] : quiz[1];
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
    <Trainer title="What each total earns" description="Guess which Fives hand total earns more chips, then see what every total earns at 3 and 4 players.">
      <h1 className="m-0 text-3xl font-bold">What each total earns</h1>
      <p className="m-0 opacity-80">The cards you win tricks with add up to your total. Closest to 25 without going over earns the most chips. Some totals earn more than you&apos;d guess.</p>
      <Players
        value={players}
        set={(n) => {
          setPlayers(n!);
          next(n);
        }}
      />

      <section className="panel p-5 text-center">
        <h2 className="m-0 text-lg font-bold">Which total earns more?</h2>
        <p className="mt-1 mb-5 text-sm opacity-70">The chips a hand earns on average, at {players} players</p>
        <div className="flex items-start justify-center gap-6">
          {quiz.map((i, k) => (
            <div key={k} className="flex flex-col items-center gap-2">
              <button
                className={`quiet grid h-32 w-28 place-items-center rounded-xl transition-opacity ${picked === i ? "ring-3 ring-ink/50" : ""} ${picked !== undefined && i !== better ? "opacity-50" : ""}`}
                onClick={() => pick(i)}
                aria-label={`${rows[i].total}${rows[i].bust ? ", bust" : ""}`}
              >
                <Total row={rows[i]} />
              </button>
              <span className={`font-numbers text-base font-bold transition-opacity ${picked === undefined ? "opacity-0" : ""}`}>{signed(rows[i].chips[at])} chips</span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex min-h-[2.5em] items-center justify-center gap-3">
          {picked === undefined ? (
            <span className="text-sm opacity-70">Tap a total</span>
          ) : (
            <>
              <span className="font-bold">{picked === better ? "Right!" : `${rows[better].total}${rows[better].bust ? ", bust," : ""} earns more.`}</span>
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
        <h2 className="mt-0 mb-3 text-lg font-bold">Every total at {players} players</h2>
        <div className="mb-1 grid grid-cols-[3.5rem_1fr_3.5rem_3rem] gap-3 text-xs opacity-60">
          <span>total</span>
          <span className="text-center">chips</span>
          <span />
          <span className="text-right">hands</span>
        </div>
        <ol className="flex flex-col gap-0.5">
          {rows.map((r, i) => {
            const w = r.chips[at];
            const lit = picked !== undefined && quiz.includes(i);
            return (
              <li key={r.total} className={`grid grid-cols-[3.5rem_1fr_3.5rem_3rem] items-center gap-3 rounded-sm text-sm ${r.hands[at] < RARE ? "opacity-45" : ""} ${lit ? "bg-ink/10" : ""}`}>
                <Total row={r} size="small" />
                <span className="relative h-3">
                  <span className="absolute inset-y-0 left-1/5 w-px bg-ink/30" />
                  <span
                    className={`absolute inset-y-0 rounded-sm transition-all duration-300 ${r.bust ? "bg-bust" : r.total === "25" ? "bg-magenta" : "bg-ink/40"}`}
                    style={w >= 0 ? { left: "20%", width: `${(80 * w) / max}%` } : { right: "80%", width: `${(20 * -w) / 1}%` }}
                  />
                </span>
                <span className="text-right font-numbers font-bold">{signed(w)}</span>
                <span className="text-right font-numbers text-xs opacity-70">{r.hands[at].toFixed(1)}%</span>
              </li>
            );
          })}
        </ol>
        <p className="mb-0 text-sm opacity-70">
          The chips each total earns that hand, on average, from 10,000 games among Hard bots. Faded totals come up in under {RARE}% of hands.{" "}
          <Link href="/learn#what-a-hand-looks-like" className="underline">
            Why, in the guide
          </Link>
        </p>
      </section>
    </Trainer>
  );
}
