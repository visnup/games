import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { parallel } from "kit/parallel.ts";
import { unpack } from "kit/trees.ts";
import { step } from "../src/advice.ts";
import { defaultPolicy, mulberry32, type Policy } from "../src/game.ts";
import { hard } from "../src/hard.ts";
import { ranked } from "../src/learned.ts";
import rollout from "../src/packed/rollout.ts";
import { type Choice, replay, type Setup } from "../src/replay.ts";
import { options, pack, practiced, type Puzzle, type Puzzles, review, type Reviewed } from "../src/review.ts";

type Found = { setup: Setup; log: Choice[]; puzzles: Omit<Puzzle, "game">[] }[];

/** `seat`'s reviewed decision `r` in the game `log` plays, as a puzzle. */
export function puzzle(setup: Setup, log: Choice[], seat: number, r: Pick<Reviewed, "n" | "kind" | "chose" | "hint" | "options">): Omit<Puzzle, "game"> {
  const { game, prompt } = replay({ ...setup, bots: setup.bots.map(() => false) }, log.slice(0, r.n));
  const keys = options(game, game.players[seat], prompt!);
  if (keys.join("\n") !== r.options.map((o) => o.key).join("\n")) throw new Error(`decision ${r.n}'s options aren't the ones the page lists`);
  const p = {
    n: r.n,
    seat,
    kind: r.kind as Puzzle["kind"],
    wins: r.options.map((o) => Math.round(1000 * o.win) / 1000),
    hard: keys.indexOf(r.chose),
    medium: keys.indexOf(r.hint),
    step: prompt?.kind === "move" ? step(game, game.players[seat], prompt.left) : undefined,
  };
  return { ...p, rules: practiced(p, keys) };
}

/**
 * Plays `n` games of `players` Hard bots and reviews one seat's plays and Just Say No answers in
 * each on `deals` deals, everyone playing on as Hard. The playouts' Hard is the browser review's
 * 200-tree model. Keeps the decisions where the best option beats the next by at least `gap`: a
 * puzzle with an answer.
 */
export function puzzles(players: number, deals: number, gap: number, seed: number, n: number): Found {
  const rng = mulberry32(seed * 1000 + players);
  const rank = ranked(unpack(rollout));
  const fast: Record<string, Policy> = { learned: { ...defaultPolicy, move: (game, p, left) => rank(game, p, left)[0] } };
  const found: Found = [];
  for (let i = 0; i < n; i++) {
    const setup: Setup = { players, seed: Math.floor(rng() * 2 ** 32), first: Math.floor(rng() * players), bots: Array(players).fill("learned") };
    const log = replay(setup, [], { learned: hard() }).decisions.map((d) => d.choice);
    const seat = Math.floor(rng() * players);
    const kept: Omit<Puzzle, "game">[] = [];
    for (const r of review(setup, log, seat, { deals, bots: fast, self: true, kinds: ["move", "sayNo"] })) {
      const [a, b] = r.options.map((o) => o.win).sort((x, y) => y - x);
      if (a - b >= gap) kept.push(puzzle(setup, log, seat, r));
    }
    if (kept.length) found.push({ setup, log: log.slice(0, kept.at(-1)!.n), puzzles: kept });
  }
  return found;
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: { games: { type: "string", default: "70" }, deals: { type: "string", default: "100" }, gap: { type: "string", default: "0.05" }, out: { type: "string", default: "public/puzzles.json" } },
  });
  const all: Puzzles = { games: [], puzzles: [] };
  for (const players of [2, 3, 4, 5]) {
    const started = Date.now();
    const found = await parallel<Found>(import.meta.filename, "puzzles", [players, +values.deals, +values.gap], +values.games, (a, b) => a.concat(b));
    for (const { setup, log, puzzles } of found) {
      for (const p of puzzles) all.puzzles.push({ game: all.games.length, ...p });
      all.games.push({ setup, log: log.map(pack) });
    }
    console.error(`${players} players: ${found.reduce((s, g) => s + g.puzzles.length, 0)} puzzles from ${values.games} games in ${Math.round((Date.now() - started) / 1000)} s`);
  }
  writeFileSync(values.out, JSON.stringify(all));
}
