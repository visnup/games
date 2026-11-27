import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { Board } from "../../components/Board";
import { Nav, Players } from "../../components/Learn";
import { advice } from "../../read.ts";
import { type Choice, replay, resolve } from "../../replay.ts";
import { label, practices, type Puzzle, top } from "../../review.ts";

const pct = (x: number) => `${Math.round(100 * x)}%`;
const say = (l: string) => (l === "pass" ? "Pass" : /^\d+$/.test(l) ? `The ${l}` : l[0].toUpperCase() + l.slice(1));
const SCORE = "hilt puzzles";

type Answer = { mine: string; why: string };

function Reveal({ puzzle, answer, next, hide }: { puzzle: Puzzle; answer: Answer; next: () => void; hide: () => void }) {
  const best = top(puzzle);
  const mine = puzzle.options.find((o) => o.label === answer.mine)!;
  const lost = Math.round(100 * (best.win - mine.win));
  const options = [...puzzle.options].sort((a, b) => b.win - a.win);
  return (
    <div className="panel fixed inset-x-2 bottom-2 z-30 mx-auto max-w-xl animate-rise p-4 text-white">
      <p className="m-0 text-lg font-bold">
        {mine === best ? "🎯 The best move." : lost <= 2 ? `Close: ${say(best.label).toLowerCase()} was ${lost} point${lost === 1 ? "" : "s"} better.` : `${say(best.label)} wins more often: ${lost} points more.`}
      </p>
      <ul className="my-3 flex flex-col gap-1 text-sm">
        {options.map((o) => (
          <li key={o.label} className="grid grid-cols-[8rem_1fr_3rem] items-center gap-2">
            <span className={o === best ? "font-bold" : ""}>{say(o.label)}</span>
            <span className="relative h-5 rounded-sm bg-white/10">
              <span className={`absolute inset-y-0 left-0 rounded-sm ${o === best ? "bg-accent" : "bg-white/40"}`} style={{ width: `${(100 * o.win) / best.win}%` }} />
              <span className="absolute inset-y-0 left-1.5 flex items-center gap-1 text-xs font-bold">
                {o.label === answer.mine && <span className="rounded bg-white px-1 text-black">you</span>}
                {o.label === puzzle.hard && <span className="rounded bg-black/40 px-1">Hard</span>}
                {o.label === puzzle.medium && <span className="rounded bg-black/40 px-1">Medium</span>}
              </span>
            </span>
            <span className="font-numbers text-right">{pct(o.win)}</span>
          </li>
        ))}
      </ul>
      <p className="m-0 text-sm opacity-80">Chances of winning the game, with everyone playing on as Hard. Medium&apos;s rule: {answer.why}</p>
      <div className="mt-3 flex justify-end gap-2">
        <button className="quiet" onClick={hide}>
          See the table
        </button>
        <button className="primary" onClick={next} autoFocus>
          Next puzzle
        </button>
      </div>
    </div>
  );
}

export default function Puzzles() {
  const router = useRouter();
  const [all, setAll] = useState<Puzzle[]>();
  const [players, setPlayers] = useState<number>();
  const [rule, setRule] = useState<string>();
  const [at, setAt] = useState<number>();
  const [answer, setAnswer] = useState<Answer>();
  const [hidden, setHidden] = useState(false);
  // shown only once the puzzles load, so the server's page matches the browser's
  const [score, setScore] = useState(() => {
    try {
      if (typeof window !== "undefined") return JSON.parse(localStorage.getItem(SCORE)!) ?? { best: 0, tried: 0, streak: 0 };
    } catch {}
    return { best: 0, tried: 0, streak: 0 };
  });
  const next = (from = all, only: { rule?: string; players?: number } = { rule, players }) => {
    const pool = from?.flatMap((p, i) => (practices(p, only.rule) && (!only.players || p.setup.players === only.players) ? [i] : [])) ?? [];
    setAnswer(undefined);
    setHidden(false);
    setAt(pool.length ? pool[Math.floor(Math.random() * pool.length)] : -1);
  };
  useEffect(() => {
    void fetch("/puzzles.json")
      .then((r) => r.json())
      .then((puzzles: Puzzle[]) => {
        const r = new URLSearchParams(location.search).get("rule") ?? undefined;
        setAll(puzzles);
        setRule(r);
        next(puzzles, { rule: r, players: undefined });
      });
    // once, on load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const filter = (only: { rule?: string; players?: number }) => {
    setRule(only.rule);
    setPlayers(only.players);
    next(all, only);
  };
  const puzzle = at === undefined || at < 0 ? undefined : all?.[at];
  const decide = (c: Choice) => {
    if (!puzzle || answer) return Promise.resolve(false);
    const { setup, log, seat } = puzzle;
    const { game } = replay({ ...setup, bots: setup.bots.map(() => false) }, log);
    const p = game.players[seat];
    const mine = c.kind === "move" ? label(resolve(game, p, c)) : c.kind === "color" ? c.color : String(c.dump);
    const why = c.kind === "move" ? advice(game, p).why : "Pick the chip that leaves you fewest from winning.";
    const best = mine === top(puzzle).label;
    const s = { best: score.best + +best, tried: score.tried + 1, streak: best ? score.streak + 1 : 0 };
    setScore(s);
    localStorage.setItem(SCORE, JSON.stringify(s));
    setAnswer({ mine, why });
    return Promise.resolve(true);
  };
  const game = useMemo(
    () =>
      puzzle && {
        _id: `puzzle-${at}` as Id<"games">,
        _creationTime: 0,
        table: "puzzle",
        seed: puzzle.setup.seed,
        first: puzzle.setup.first,
        seats: puzzle.setup.bots.map((b, s) => (s === puzzle.seat ? { player: "you" as Id<"players"> } : { bot: b as "learned" })),
        log: puzzle.log,
        names: [],
      },
    [puzzle, at],
  );
  return (
    <>
      <Head>
        <title>Puzzles · Hilt</title>
        <meta name="description" content="Positions from games among Hilt's Hard bots. Find the move that wins most often, then see every option's chance of winning." />
      </Head>
      <div className="mx-auto flex max-w-[90em] flex-col gap-2 px-[0.8em] pt-[0.8em]">
        <Nav />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="m-0 text-xl font-bold">Find the best move</h1>
          <Players value={players} set={(n) => filter({ rule, players: n })} any />
          {rule && (
            <button
              className="quiet text-sm"
              onClick={() => {
                void router.replace("/learn/puzzles", undefined, { shallow: true });
                filter({ players });
              }}
            >
              Practicing: {rule === "chip" ? "which chip" : rule === "beyond" ? "beyond the rules" : rule} ✕
            </button>
          )}
          {all && (
            <span className="ml-auto text-sm opacity-80">
              {score.best} best of {score.tried}
              {score.streak > 1 && ` · ${score.streak} in a row`}
            </span>
          )}
        </div>
        {at === -1 && <p>No puzzles here yet.</p>}
      </div>
      {game && <Board key={at} game={game} me={"you" as Id<"players">} onDecide={decide} />}
      {puzzle && answer && !hidden && <Reveal puzzle={puzzle} answer={answer} next={() => next()} hide={() => setHidden(true)} />}
      {answer && hidden && (
        <button className="primary fixed right-4 bottom-4 z-30" onClick={() => setHidden(false)}>
          Back to the answer
        </button>
      )}
    </>
  );
}
