import { name } from "./cards.ts";
import { defaultPolicy, mulberry32, type Play, type Policy, share } from "./game.ts";
import type { Rule } from "./read.ts";
import { type Choice, replay, resolve, type Setup } from "./replay.ts";
import { sample } from "./strategies.ts";

/** A decision a player made, with each option's chance of winning when played out. */
export type Reviewed = { n: number; hand: number; trick: number; chose: string; hint: string; deals: number; options: { label: string; win: number }[] };

/**
 * A decision from a game among Hard bots, with each option's chance of winning when everyone plays on as Hard (`scripts/puzzles.ts`).
 * `log` is the decisions before it, `pack`ed. `rule` is the cheat sheet's rule that picks Medium's play.
 */
export type Puzzle = { setup: Setup; log: number[]; seat: number; options: { label: string; win: number }[]; hard: string; medium: string; rule?: Rule };

/** A log as a number a decision, to keep `public/puzzles.json` small. */
export const pack = (log: Choice[]) => log.map((c) => c.seat * 32 + c.card * 2 + +c.down);
export const unpack = (log: number[]): Choice[] => log.map((x) => ({ kind: "play", seat: x >> 5, card: (x & 31) >> 1, down: !!(x & 1) }));

/** A puzzle's best option. */
export const top = (p: Puzzle) => p.options.reduce((a, b) => (b.win > a.win ? b : a));

/** Whether `p` practices `rule`, a cheat sheet rule: Medium's play is the best option and that rule picks it. `beyond` is where Medium misses the best and Hard finds it. */
export function practices(p: Puzzle, rule?: string) {
  if (!rule) return true;
  if (rule === "beyond") return p.medium !== top(p).label && p.hard === top(p).label;
  return p.medium === top(p).label && p.rule === rule;
}

/** The deals each option is played out on in a game's review: fewer with Hard bots, which cost more a game. */
export const deals = (setup: Setup) => (setup.bots.includes("learned") ? 100 : 200);

/** The deals a decision that may have cost or gained points is played out on again, after the first pass. */
export const again = (setup: Setup) => 5 * deals(setup);

export const label = (play: Play) => `${name(play.card)}${play.down ? " face down" : ""}`;

/**
 * Every decision `seat` made in `log` with a choice, each option played out to the end on `deals`
 * deals of the cards they couldn't see, the same deals for every option. Each bot plays as its
 * kind in `bots`, or the default player, and everyone else as the default. `seat` plays on as the
 * default too, unless `self`, when it plays as its own kind. With `part: [i, k]`, only every `k`th
 * decision from the `i`th, so `k` workers can share the review. With `only`, just those decisions,
 * by their place in `log`, and just the options it names for each.
 */
export function* review(
  setup: Setup,
  log: Choice[],
  seat: number,
  { deals = 200, bots = {}, part = [0, 1], only, self = false }: { deals?: number; bots?: Record<string, Policy>; part?: [number, number]; only?: Record<number, string[]>; self?: boolean } = {},
): Generator<Reviewed> {
  const people = { ...setup, bots: setup.bots.map(() => false as const) };
  const policies = setup.bots.map((b, i) => ((i !== seat || self) && b && bots[b]) || defaultPolicy);
  let mine = 0;
  for (const [n, choice] of log.entries()) {
    if (choice.seat !== seat || (only && !only[n])) continue;
    const { game } = replay(people, log.slice(0, n));
    const p = game.players[seat];
    const options = game.legal(p);
    if (options.length < 2 || (!only && mine++ % part[1] !== part[0])) continue;
    const rng = mulberry32(n + 1);
    const seeds = Array.from({ length: deals }, () => Math.floor(rng() * 2 ** 32));
    const odds = (play: Play) => seeds.reduce((w, s) => w + share(sample(game, p, mulberry32(s), policies).run(play).winners, seat), 0) / deals;
    yield {
      n,
      hand: game.hand,
      trick: game.players.reduce((s, q) => s + q.won.length, 0) + 1,
      chose: label(resolve(game, p, choice)),
      hint: label(defaultPolicy.play(game, p)),
      deals,
      options: options.filter((o) => !only || only[n].includes(label(o))).map((o) => ({ label: label(o), win: odds(o) })),
    };
  }
}
