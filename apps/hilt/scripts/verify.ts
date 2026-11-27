import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { parallel } from "kit/parallel.ts";
import { COLORS } from "../src/cards.ts";
import { moves, mulberry32 } from "../src/game.ts";
import { hard } from "../src/hard.ts";
import { replay } from "../src/replay.ts";
import { label, type Puzzle, top } from "../src/review.ts";
import { sample } from "../src/strategies.ts";

/**
 * Plays every option of puzzles `[from, from + n)` of `file` again, on `deals` fresh deals with
 * everyone as Hard. Each comes back with the new chances of winning and the paired standard error
 * of the new best's lead over the runner-up, or null when the stored best isn't best any more.
 */
export function verify(file: string, deals: number, total: number, seed: number, n: number): (Puzzle | null)[] {
  const all: Puzzle[] = JSON.parse(readFileSync(file, "utf8"));
  // parallel's chunks are sized this way, in order
  const k = Math.min(256, total);
  const from = Array.from({ length: seed - 1 }, (_, i) => Math.floor(total / k) + (i < total % k ? 1 : 0)).reduce((a, b) => a + b, 0);
  const policy = hard();
  return all.slice(from, from + n).map((puzzle, j) => {
    const { setup, log, seat } = puzzle;
    const { game } = replay({ ...setup, bots: setup.bots.map(() => false) }, log);
    const p = game.players[seat];
    const rng = mulberry32(1e6 + from + j);
    const seeds = Array.from({ length: deals }, () => Math.floor(rng() * 2 ** 32));
    const byLabel = new Map(moves(game, p).map((m) => [label(m), m]));
    const wins = puzzle.options.map((o) =>
      seeds.map((s) => {
        const g = sample(game, p, mulberry32(s), policy);
        if (puzzle.kind === "color") g.color = o.label as (typeof COLORS)[number];
        return +(g.run(puzzle.kind === "color" ? undefined : byLabel.get(o.label)).winner === seat);
      }),
    );
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const order = wins.map((w, i) => i).sort((a, b) => mean(wins[b]) - mean(wins[a]));
    const [b, r] = order;
    if (puzzle.options[b].label !== top(puzzle).label) return null;
    const diff = wins[b].map((w, d) => w - wins[r][d]);
    const m = mean(diff);
    const se = Math.sqrt(diff.reduce((s, x) => s + (x - m) ** 2, 0) / (deals - 1) / deals);
    return { ...puzzle, options: puzzle.options.map((o, i) => ({ ...o, win: Math.round(1000 * mean(wins[i])) / 1000 })), se: Math.round(1000 * se) / 1000 };
  });
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { deals: { type: "string", default: "1000" }, z: { type: "string", default: "2.5" }, file: { type: "string", default: "public/puzzles.json" } } });
  const all: Puzzle[] = JSON.parse(readFileSync(values.file, "utf8"));
  const checked = await parallel<(Puzzle | null)[]>(import.meta.filename, "verify", [values.file, +values.deals, all.length], all.length, (a, b) => a.concat(b));
  const kept = checked.filter((p): p is Puzzle & { se: number } => {
    if (!p) return false;
    const [a, b] = p.options.map((o) => o.win).sort((x, y) => y - x);
    return a - b >= +values.z * p.se;
  });
  for (const n of [3, 4, 5, 6])
    console.error(
      `${n} players: kept ${kept.filter((p) => p.setup.players === n).length} of ${all.filter((p) => p.setup.players === n).length}, ${checked.filter((p, i) => !p && all[i].setup.players === n).length} with another best`,
    );
  writeFileSync(values.file, JSON.stringify(kept));
}
