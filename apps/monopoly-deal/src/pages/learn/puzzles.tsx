import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { CHEAT_SHEET, why, whyNo } from "../../advice.ts";
import { Board, saying } from "../../components/Board";
import { money } from "../../components/Card";
import { Nav, Players } from "../../components/Learn";
import { type Choice, encode, key, replay, resolve } from "../../replay.ts";
import { options, practices, type Puzzle, type Puzzles as File, top, unpack } from "../../review.ts";

const pct = (x: number) => `${Math.round(100 * x)}%`;
const SCORE = "monopoly deal puzzles";
const SHOWN = 8;

/** The option you picked, by its index in the puzzle's, and why Medium picks its own. */
type Answer = { mine: number; why: string };

/** The decisions before `p`'s. */
const before = (file: File, p: Puzzle) => file.games[p.game].log.slice(0, p.n).map(unpack);

/** The position at `p`'s decision, and its options' keys. */
const position = (file: File, p: Puzzle) => {
  const { setup } = file.games[p.game];
  const { game, prompt } = replay({ ...setup, bots: setup.bots.map(() => false) }, before(file, p));
  const me = game.players[p.seat];
  return { game, prompt, me, keys: options(game, me, prompt!) };
};

function Reveal({ file, puzzle, answer, next, hide }: { file: File; puzzle: Puzzle; answer: Answer; next: () => void; hide: () => void }) {
  const { game, prompt, me, keys } = useMemo(() => position(file, puzzle), [file, puzzle]);
  const say = (i: number) => saying(game, me, prompt, keys[i], (n) => (n === puzzle.seat ? "You" : `Bot ${n + 1}`));
  const { wins } = puzzle;
  const best = top(puzzle);
  const lost = Math.round(100 * (wins[best] - wins[answer.mine]));
  const marked = [answer.mine, puzzle.hard, puzzle.medium];
  const shown = wins
    .map((_, i) => i)
    .sort((a, b) => wins[b] - wins[a])
    .filter((o, k) => k < SHOWN || marked.includes(o));
  return (
    <div className="panel fixed inset-x-2 bottom-2 z-30 mx-auto max-h-[80dvh] max-w-xl overflow-y-auto p-4 text-white">
      <p className="m-0 text-lg font-bold">
        {wins[answer.mine] === wins[best] ? (
          "🎯 The best play."
        ) : lost <= 2 ? (
          <>
            Close: {money(say(best))} was {lost} point{lost === 1 ? "" : "s"} better.
          </>
        ) : (
          <>
            {money(say(best))} wins more often: {lost} points more.
          </>
        )}
      </p>
      <ul className="my-3 flex flex-col gap-1 text-sm">
        {shown.map((o) => (
          <li key={o} className="grid grid-cols-[minmax(0,13rem)_1fr_3rem] items-center gap-2">
            <span className={o === best ? "font-bold" : ""}>{money(say(o))}</span>
            <span className="relative h-5 rounded-sm bg-white/10">
              <span className={`absolute inset-y-0 left-0 rounded-sm ${o === best ? "bg-gold" : "bg-white/40"}`} style={{ width: `${(100 * wins[o]) / wins[best]}%` }} />
              <span className="absolute inset-y-0 left-1.5 flex items-center gap-1 text-xs font-bold">
                {o === answer.mine && <span className="rounded bg-white px-1 text-black">you</span>}
                {o === puzzle.hard && <span className="rounded bg-black/50 px-1">Hard</span>}
                {o === puzzle.medium && <span className="rounded bg-black/50 px-1">Medium</span>}
              </span>
            </span>
            <span className="text-right tabular-nums">{pct(wins[o])}</span>
          </li>
        ))}
      </ul>
      {wins.length > shown.length && <p className="mt-0 text-xs opacity-60">and {wins.length - shown.length} more</p>}
      <p className="m-0 text-sm opacity-80">Each bar is the chance of winning the game if everyone plays on as Hard. Medium&apos;s rule: {money(answer.why)}</p>
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
  const [file, setFile] = useState<File>();
  const [players, setPlayers] = useState<number>();
  const [rule, setRule] = useState<string>();
  const [at, setAt] = useState<number>();
  const [answer, setAnswer] = useState<Answer>();
  const [hidden, setHidden] = useState(false);
  // shown only once the puzzles load, so the server's page matches the browser's
  const [score, setScore] = useState(() => {
    try {
      // Node 26 has a localStorage of its own that warns when the build prerenders this
      return JSON.parse((typeof window !== "undefined" && window.localStorage.getItem(SCORE)) || "null") ?? { best: 0, tried: 0, streak: 0 };
    } catch {
      return { best: 0, tried: 0, streak: 0 };
    }
  });
  const next = (from = file, only: { rule?: string; players?: number } = { rule, players }) => {
    const pool = from?.puzzles.flatMap((p, i) => (practices(p, only.rule) && (!only.players || from.games[p.game].setup.players === only.players) ? [i] : [])) ?? [];
    setAnswer(undefined);
    setHidden(false);
    setAt(pool.length ? pool[Math.floor(Math.random() * pool.length)] : -1);
  };
  useEffect(() => {
    void fetch("/puzzles.json")
      .then((r) => r.json())
      .then((f: File) => {
        const r = new URLSearchParams(location.search).get("rule") ?? undefined;
        setFile(f);
        setRule(r);
        next(f, { rule: r, players: undefined });
      });
    // once, on load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const filter = (only: { rule?: string; players?: number }) => {
    setRule(only.rule);
    setPlayers(only.players);
    next(file, only);
  };
  const puzzle = at === undefined || at < 0 ? undefined : file?.puzzles[at];
  const decide = (c: Choice) => {
    if (!file || !puzzle || answer) return;
    const { game, prompt, me, keys } = position(file, puzzle);
    let k: string, reason: string;
    if (c.kind === "move" && prompt?.kind === "move") [k, reason] = [key(encode(game, me, resolve(game, me, prompt.left, c.move))), why(game, me, prompt.left)];
    else if (c.kind === "sayNo" && prompt?.kind === "sayNo") [k, reason] = [String(c.no), whyNo(game, prompt.move)];
    else return;
    const mine = keys.indexOf(k);
    const best = puzzle.wins[mine] === puzzle.wins[top(puzzle)];
    const s = { best: score.best + +best, tried: score.tried + 1, streak: best ? score.streak + 1 : 0 };
    setScore(s);
    try {
      localStorage.setItem(SCORE, JSON.stringify(s));
    } catch {}
    setAnswer({ mine, why: reason });
  };
  const game = useMemo(() => {
    if (!file || !puzzle) return;
    const { setup } = file.games[puzzle.game];
    return {
      _id: `puzzle-${at}` as Id<"games">,
      _creationTime: 0,
      table: "puzzle",
      seed: setup.seed,
      first: setup.first,
      seats: setup.bots.map((_, s) => (s === puzzle.seat ? { player: "you" as Id<"players"> } : { bot: "learned" as const })),
      deck: [],
      log: before(file, puzzle),
      names: [],
    };
  }, [file, puzzle, at]);
  const lead = rule && (rule === "beyond" ? "beyond the rules" : CHEAT_SHEET[rule]?.lead.toLowerCase());
  return (
    <>
      <Head>
        <title>Puzzles · Monopoly Deal</title>
        <meta name="description" content="Positions from games among Monopoly Deal's Hard bots. Find the play that wins most often, then see every option's chance of winning." />
      </Head>
      <div className="mx-auto flex max-w-[90em] flex-col gap-2 px-[0.8em] pt-[0.8em]">
        <Nav />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="m-0 text-xl font-bold">Find the best play</h1>
          <Players value={players} set={(n) => filter({ rule, players: n })} any />
          {lead && (
            <button
              className="quiet text-sm"
              onClick={() => {
                void router.replace("/learn/puzzles", undefined, { shallow: true });
                filter({ players });
              }}
            >
              Practicing: {lead} ✕
            </button>
          )}
          {file && (
            <span className="ml-auto text-sm opacity-80">
              {score.best} best of {score.tried}
              {score.streak > 1 && ` · ${score.streak} in a row`}
            </span>
          )}
        </div>
        {at === -1 && <p>No puzzles here yet.</p>}
      </div>
      {game && <Board key={at} game={game} me={"you" as Id<"players">} onDecide={decide} />}
      {file && puzzle && answer && !hidden && <Reveal file={file} puzzle={puzzle} answer={answer} next={() => next()} hide={() => setHidden(true)} />}
      {answer && hidden && (
        <button className="primary fixed right-4 bottom-4 z-30" onClick={() => setHidden(false)}>
          Back to the answer
        </button>
      )}
    </>
  );
}
