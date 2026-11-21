import { parseArgs } from "node:util";
import { parallel } from "kit/parallel.ts";
import { Game, mulberry32, TARGET } from "../src/game.ts";
import { learned } from "../src/learned.ts";

/** Totals above this are counted with it. */
const CAP = 40;

type Tally = { hands: number[]; chips: number[] };

/** Plays `n` games of `players` among round 9's learned players, or default players, and tallies each hand's totals and the chips each total gained. */
export function totals(players: number, who: string, seed: number, n: number): Tally {
  const rng = mulberry32(seed);
  const policies = who === "learned" ? learned() : undefined;
  const t: Tally = { hands: Array(CAP + 1).fill(0), chips: Array(CAP + 1).fill(0) };
  for (let i = 0; i < n; i++) {
    const game = new Game({ players, rng: mulberry32(Math.floor(rng() * 2 ** 32)), policies });
    game.run();
    for (const s of game.scores)
      s.totals.forEach((total, seat) => {
        const k = Math.min(total, CAP);
        t.hands[k]++;
        t.chips[k] += s.gained[seat];
      });
  }
  return t;
}

const combine = (a: Tally, b: Tally) => ({ hands: a.hands.map((x, i) => x + b.hands[i]), chips: a.chips.map((x, i) => x + b.chips[i]) });

if (import.meta.main) {
  const { values: args } = parseArgs({ options: { n: { type: "string", default: "10000" }, players: { type: "string", default: "3,4" }, who: { type: "string", default: "learned" } } });
  const counts = args.players.split(",").map(Number);
  const ts = [];
  for (const players of counts) ts.push(await parallel<Tally>(import.meta.url, "totals", [players, args.who], Number(args.n), combine));
  console.log(`${args.n} games a player count among ${args.who} players: how often a hand ends on each total, and the chips it gains.\n`);
  console.log(`| a hand's total | ${counts.map((k) => `${k} players, hands | ${k} players, chips`).join(" | ")} |\n|${" --- |".repeat(1 + 2 * counts.length)}`);
  for (let k = 0; k <= CAP; k++) {
    const cells = ts.flatMap((t) => {
      const all = t.hands.reduce((a, b) => a + b);
      return [`${((100 * t.hands[k]) / all).toFixed(1)}%`, t.hands[k] ? (t.chips[k] / t.hands[k]).toFixed(2) : ""];
    });
    console.log(`| ${k === CAP ? `${CAP}+` : k}${k > TARGET ? " (bust)" : ""} | ${cells.join(" | ")} |`);
  }
}
