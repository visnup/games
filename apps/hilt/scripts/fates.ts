import { parseArgs } from "node:util";
import type { Fate } from "../src/cards.ts";
import { decisive, defaultPolicy, Game, type Move, moves, mulberry32, needed, others, type Player, type Policy } from "../src/game.ts";
import { parallel } from "kit/parallel.ts";
import { playout } from "../src/strategies.ts";

type Groups = Record<string, { n: number; gain: number; better: number }>;

/** The default's move as if no `kind` were in `p`'s hand. */
function without(game: Game, p: Player, kind: Fate): Move {
  const hand = p.hand;
  p.hand = hand.filter((c) => c.kind !== kind);
  const m = p.hand.length ? defaultPolicy.move(game, p) : null;
  p.hand = hand;
  return m;
}

const bucket = (x: number, cuts: number[]) => (cuts.findIndex((c) => x <= c) < 0 ? `>${cuts.at(-1)}` : `≤${cuts[cuts.findIndex((c) => x <= c)]}`);

/** Where `p` stands when about to play `m`, along several dimensions, each a key to group by. */
function where(game: Game, p: Player, m: NonNullable<Move>, picked: boolean): string[] {
  const leader = game.players[game.leader()];
  const rest = others(game, p);
  const alive = rest.filter((q) => !q.passed);
  const mine = decisive(game, p);
  const theirs = rest.some((q) => decisive(game, q));
  const stakes = mine && theirs ? "both" : mine ? "yours" : theirs ? "theirs" : "neither";
  const gap = game.strength(p) - Math.max(...rest.map((q) => game.strength(q)));
  const force = p.hand.filter((c) => c.kind === "force" || c.kind === "legend").reduce((s, c) => s + c.value, 0);
  return [
    `the default plays it here: ${picked ? "yes" : "no"}`,
    `you lead: ${leader === p ? "yes" : "no"}`,
    `your strength over the best other: ${bucket(gap, [-10, -4, -1, 0, 4, 10])}`,
    `chip wins the game for: ${stakes}`,
    `others still in: ${alive.length}`,
    `your cards down: ${Math.min(p.row.length, 3)}`,
    `others' cards down: ${bucket(
      rest.reduce((s, q) => s + q.row.length, 0),
      [0, 2, 4],
    )}`,
    `Favor: ${game.favor === p.seat ? "yours" : "not yours"}`,
    `Winter: ${game.winter ? "yes" : "no"}`,
    `Fury in your row: ${p.row.some((c) => c.kind === "fury") ? "yes" : "no"}`,
    `your hand's strength: ${bucket(force, [10, 20, 30])}`,
    `cards in your hand: ${bucket(p.hand.length, [3, 6, 10])}`,
    `chips you need: ${needed(p.chips)}`,
    `battle: ${bucket(game.battles, [2, 5, 9])}`,
    `players: ${game.players.length}`,
    ...(m.take ? [`takes back: ${m.take.value}`] : []),
  ];
}

/**
 * Plays `n` default games of `players`, and at every decision of seat `i % players` where it can play
 * `kind`, plays out each such move and the default's move without `kind` on `deals` shared deals.
 * Groups the difference by where the player stands.
 */
export function fates(players: number, deals: number, kind: Fate, seed: number, n: number) {
  const rng = mulberry32(seed);
  const groups: Groups = {};
  let total = 0;
  for (let i = 0; i < n; i++) {
    const seat = i % players;
    const watcher: Policy = {
      ...defaultPolicy,
      move(game, p) {
        const pick = defaultPolicy.move(game, p);
        if (p.seat !== seat) return pick;
        const options = moves(game, p).filter((m) => m?.card.kind === kind);
        if (!options.length) return pick;
        const other = without(game, p, kind);
        const seeds = Array.from({ length: deals }, () => Math.floor(rng() * 2 ** 32));
        const base = playout(game, p, other, seeds);
        for (const m of options) {
          const gain = (playout(game, p, m, seeds) - base) / deals;
          total++;
          const picked = pick?.card === m!.card && pick.take === m!.take;
          const keys = where(game, p, m!, picked);
          for (const k of picked ? keys : [...keys, ...keys.slice(1).map((k) => `not the default's, ${k}`)]) {
            const g = (groups[k] ??= { n: 0, gain: 0, better: 0 });
            g.n++;
            g.gain += gain;
            g.better += +(gain > 0);
          }
        }
        return pick;
      },
    };
    new Game({ players, rng: mulberry32(Math.floor(rng() * 2 ** 32)), policies: watcher, first: 0 }).run();
  }
  return { total, groups };
}

function combine(a: ReturnType<typeof fates>, b: ReturnType<typeof fates>) {
  for (const [k, v] of Object.entries(b.groups)) {
    const g = (a.groups[k] ??= { n: 0, gain: 0, better: 0 });
    g.n += v.n;
    g.gain += v.gain;
    g.better += v.better;
  }
  return { total: a.total + b.total, groups: a.groups };
}

if (import.meta.main) {
  const { values: args } = parseArgs({
    options: { card: { type: "string", default: "doves" }, n: { type: "string", default: "4000" }, players: { type: "string", default: "3,4,5,6" }, deals: { type: "string", default: "64" } },
  });
  const kind = args.card as Fate;
  let all = { total: 0, groups: {} as Groups };
  let games = 0;
  for (const players of args.players.split(",").map(Number)) {
    all = combine(all, await parallel<ReturnType<typeof fates>>(import.meta.url, "fates", [players, Number(args.deals), kind], Number(args.n), combine));
    games += Number(args.n);
  }
  console.log(`${kind}: ${games} games, ${all.total} chances to play it.\n`);
  console.log(`| where you stand | chances | per game | ${kind} over your other move, points | ${kind} better |\n| --- | --- | --- | --- | --- |`);
  for (const [k, v] of Object.entries(all.groups).sort((a, b) => a[0].localeCompare(b[0], "en", { numeric: true })))
    console.log(`| ${k} | ${v.n} | ${(v.n / games).toFixed(2)} | ${((100 * v.gain) / v.n).toFixed(1)} | ${((100 * v.better) / v.n).toFixed(0)}% |`);
}
