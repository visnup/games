import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { parallel } from "kit/parallel.ts";
import { mulberry32 } from "../src/game.ts";
import { hard } from "../src/hard.ts";
import { advice } from "../src/read.ts";
import { replay, type Setup } from "../src/replay.ts";
import { type Puzzle, review } from "../src/review.ts";

/**
 * Plays `n` games of `players` Hard bots and reviews one seat's decisions in each on `deals` deals.
 * Keeps the ones where the best option beats the next by at least `gap`: a puzzle with an answer.
 */
export function puzzles(players: number, deals: number, gap: number, seed: number, n: number): Puzzle[] {
  const rng = mulberry32(seed * 1000 + players);
  const bots = { learned: hard() };
  const found: Puzzle[] = [];
  for (let i = 0; i < n; i++) {
    const setup: Setup = { players, seed: Math.floor(rng() * 2 ** 32), first: Math.floor(rng() * players), bots: Array(players).fill("learned") };
    const { decisions: log } = replay(setup, [], bots);
    const seat = Math.floor(rng() * players);
    for (const r of review(setup, log, seat, { deals, bots, self: true })) {
      if (r.kind === "dump" || r.options.length < 2) continue;
      const [a, b] = r.options.map((o) => o.win).sort((x, y) => y - x);
      if (a - b < gap) continue;
      const before = log.slice(0, r.n);
      const { game } = replay({ ...setup, bots: setup.bots.map(() => false) }, before);
      const step = r.kind === "move" ? advice(game, game.players[seat]).step : undefined;
      found.push({ setup, log: before, seat, kind: r.kind, options: r.options.map((o) => ({ ...o, win: Math.round(1000 * o.win) / 1000 })), hard: r.chose, medium: r.hint, step });
    }
  }
  return found;
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: { games: { type: "string", default: "200" }, deals: { type: "string", default: "200" }, gap: { type: "string", default: "0.05" }, out: { type: "string", default: "public/puzzles.json" } },
  });
  const all: Puzzle[] = [];
  for (const players of [3, 4, 5, 6]) {
    const found = await parallel<Puzzle[]>(import.meta.filename, "puzzles", [players, +values.deals, +values.gap], +values.games, (a, b) => a.concat(b));
    console.error(`${players} players: ${found.length} puzzles from ${values.games} games`);
    all.push(...found);
  }
  writeFileSync(values.out, JSON.stringify(all));
}
