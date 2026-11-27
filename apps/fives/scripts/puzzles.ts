import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { parallel } from "kit/parallel.ts";
import { unpack } from "kit/trees.ts";
import { mulberry32 } from "../src/game.ts";
import { hard } from "../src/hard.ts";
import { learned } from "../src/learned.ts";
import rollout from "../src/packed/rollout.ts";
import { reason } from "../src/read.ts";
import { replay, type Setup } from "../src/replay.ts";
import { pack, type Puzzle, review } from "../src/review.ts";

/**
 * Plays `n` games of `players` Hard bots and reviews one seat's decisions in each on `deals` deals,
 * with everyone playing on as Hard's rollout model, as the site's review does.
 * Keeps the ones where the best option beats the next by at least `gap`: a puzzle with an answer.
 */
export function puzzles(players: number, deals: number, gap: number, seed: number, n: number): Puzzle[] {
  const rng = mulberry32(seed * 1000 + players);
  const bots = { learned: learned(unpack(rollout)) };
  const found: Puzzle[] = [];
  for (let i = 0; i < n; i++) {
    const setup: Setup = { players, seed: Math.floor(rng() * 2 ** 32), bots: Array(players).fill("learned") };
    const { decisions: log } = replay(setup, [], { learned: hard() });
    const seat = Math.floor(rng() * players);
    for (const r of review(setup, log, seat, { deals, bots, self: true })) {
      const [a, b] = r.options.map((o) => o.win).sort((x, y) => y - x);
      if (a - b < gap) continue;
      const before = log.slice(0, r.n);
      const { game } = replay({ ...setup, bots: setup.bots.map(() => false) }, before);
      const { rule } = reason(game, game.players[seat]);
      found.push({ setup, log: pack(before), seat, options: r.options.map((o) => ({ ...o, win: Math.round(1000 * o.win) / 1000 })), hard: r.chose, medium: r.hint, rule });
    }
  }
  return found;
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: { games: { type: "string", default: "100" }, deals: { type: "string", default: "200" }, gap: { type: "string", default: "0.05" }, out: { type: "string", default: "public/puzzles.json" } },
  });
  const all: Puzzle[] = [];
  for (const players of [3, 4]) {
    const start = performance.now();
    const found = await parallel<Puzzle[]>(import.meta.filename, "puzzles", [players, +values.deals, +values.gap], +values.games, (a, b) => a.concat(b));
    console.error(`${players} players: ${found.length} puzzles from ${values.games} games in ${((performance.now() - start) / 1000).toFixed(0)}s`);
    all.push(...found);
  }
  writeFileSync(values.out, JSON.stringify(all));
}
