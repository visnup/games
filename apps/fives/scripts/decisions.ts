import { parseArgs } from "node:util";
import { defaultPolicy, Game, HANDS, mulberry32, type Play, type Player, type Policy, STEPS, type Step, sure, TARGET, total, TRUMP, winning } from "../src/game.ts";
import { parallel } from "kit/parallel.ts";
import { playout } from "../src/strategies.ts";

/** A play by what it does: taking the trick or under it, face down or up, trump, led or off color, and the card's rank in hand. */
export function role(game: Game, p: Player, play: Play) {
  const led = game.led();
  const color = play.card.color === TRUMP ? "trump" : !led || play.card.color === led ? "led" : "off";
  const values = p.hand.map((c) => c.value).sort((a, b) => a - b);
  const rank = play.card.value === values[0] ? "lowest" : play.card.value === values.at(-1) ? "highest" : play.card.value > values[values.length >> 1] ? "high" : "low";
  return `${winning(game, play) ? "taking" : "under"} ${play.down ? `with the ${rank} ${color} face down` : `${rank} ${color}`}`;
}

/** Where `p` stands at a decision, coarsely. */
export function situation(game: Game, p: Player) {
  const room = TARGET - total(p);
  const place = game.trick.length ? (game.trick.length === game.players.length - 1 ? "last" : `${game.trick.length + 1}${game.trick.length === 1 ? "nd" : "rd"}`) : "leading";
  const left = p.hand.length > 8 ? "early" : p.hand.length > 3 ? "middle" : "late";
  return [place, room < 0 ? "busted" : room === 0 ? "at 25" : room <= 5 ? "within 5" : room <= 12 ? "within 12" : "far", left].join(", ");
}

/** Facts about `p`'s hand and the table that a rule could test, each true or false. */
export function features(game: Game, p: Player, options: Play[]): string[] {
  const room = TARGET - total(p);
  const led = game.led();
  const magenta = p.hand.filter((c) => c.color === "magenta");
  const silvers = p.hand.filter((c) => c.color === TRUMP);
  const out: [string, boolean][] = [
    ["any", true],
    ["no magenta under 5", magenta.length > 0 && magenta.every((c) => c.value > 5)],
    ["no magenta", !magenta.length],
    ["a magenta under 5", magenta.some((c) => c.value < 5)],
    ["no silver", !silvers.length],
    ["one silver", silvers.length === 1],
    ["2+ silvers", silvers.length > 1],
    ["a silver of 9+", silvers.some((c) => c.value >= 9)],
    ["holds the card that makes 25", room > 0 && p.hand.some((c) => c.value === room)],
    ["a sure take", options.some((x) => sure(game, p, x))],
    ["every play takes", options.every((x) => winning(game, x))],
    ["can't follow", !!led && !p.hand.some((c) => c.color === led)],
    ["a face-down card in the trick", game.trick.some((t) => t.play.down)],
    ["magenta led", led === "magenta"],
    ["everyone else out of magenta", game.players.every((q) => q === p || q.voids.includes("magenta"))],
    ["someone else within 5 of 25", game.players.some((q) => q !== p && TARGET - total(q) >= 0 && TARGET - total(q) < 5)],
    ["leads on chips", game.players.every((q) => q.chips <= p.chips)],
    ["last hand", game.hand === HANDS],
  ];
  return out.filter(([, on]) => on).map(([name]) => name);
}

/** The step of the default's that picks at a decision. */
const stepOf = (game: Game, p: Player, plays: Play[]) => (Object.entries(STEPS) as [string, Step][]).find(([, s]) => s(game, p, plays))?.[0] ?? "none";

/**
 * Plays `n` default games of `players`, and at every decision of seat `i % players` with a choice,
 * plays out each legal play on `deals` shared deals. Tallies, by situation and by the default's
 * pick and the best play, how often playouts prefer another play by more than 2 standard errors
 * of the paired difference, and the wins it gains. Also tallies, by the default's step and each of
 * `features`, what switching to the play playouts prefer gains, measured on a second set of deals
 * so the choice's luck doesn't count.
 */
export function decisions(players: number, deals: number, seed: number, n: number) {
  const rng = mulberry32(seed);
  const groups: Record<string, { n: number; gain: number }> = {};
  const facts: Record<string, { n: number; gain: number }> = {};
  let count = 0;
  for (let i = 0; i < n; i++) {
    const seat = i % players;
    const watcher: Policy = {
      play(game, p) {
        const pick = defaultPolicy.play(game, p);
        if (p.seat !== seat) return pick;
        const options = game.legal(p);
        if (options.length < 2) return pick;
        count++;
        const seeds = Array.from({ length: deals }, () => Math.floor(rng() * 2 ** 32));
        const wins = options.map((m) => seeds.map((s) => playout(game, p, m, [s])));
        const d = options.findIndex((m) => m.card === pick.card && m.down === pick.down);
        const b = wins.reduce((a, _, j) => (sum(wins[j]) > sum(wins[a]) ? j : a), d);
        let held = 0;
        if (b !== d) for (const s of Array.from({ length: deals }, () => Math.floor(rng() * 2 ** 32))) held += (playout(game, p, options[b], [s]) - playout(game, p, pick, [s])) / deals;
        const step = stepOf(game, p, options);
        for (const f of features(game, p, options)) {
          const g = (facts[`${step}: ${f}`] ??= { n: 0, gain: 0 });
          g.n++;
          g.gain += held;
        }
        if (b !== d) {
          const diff = wins[b].map((w, k) => w - wins[d][k]);
          const mean = sum(diff) / deals;
          const se = Math.sqrt(diff.reduce((s, x) => s + (x - mean) ** 2, 0) / (deals - 1) / deals);
          if (mean > 2 * se) {
            const key = `${situation(game, p)}: ${role(game, p, pick)} → ${role(game, p, options[b])}`;
            const g = (groups[key] ??= { n: 0, gain: 0 });
            g.n++;
            g.gain += mean;
          }
        }
        return pick;
      },
    };
    new Game({ players, rng: mulberry32(Math.floor(rng() * 2 ** 32)), policies: watcher }).run();
  }
  return { total: count, groups, facts };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function combine(a: ReturnType<typeof decisions>, b: ReturnType<typeof decisions>) {
  for (const key of ["groups", "facts"] as const)
    for (const [k, v] of Object.entries(b[key])) {
      const g = (a[key][k] ??= { n: 0, gain: 0 });
      g.n += v.n;
      g.gain += v.gain;
    }
  return { total: a.total + b.total, groups: a.groups, facts: a.facts };
}

if (import.meta.main) {
  const { values: args } = parseArgs({
    options: { n: { type: "string", default: "400" }, players: { type: "string", default: "3,4" }, deals: { type: "string", default: "64" }, top: { type: "string", default: "25" } },
  });
  for (const players of args.players.split(",").map(Number)) {
    const n = Number(args.n);
    const { total, groups, facts } = await parallel<ReturnType<typeof decisions>>(import.meta.url, "decisions", [players, Number(args.deals)], n, combine);
    console.log(`\n## ${players} players: ${n} games, ${total} decisions with a choice\n`);
    console.log("| situation: default → playouts | times | per game | points each |\n| --- | --- | --- | --- |");
    for (const [k, v] of Object.entries(groups)
      .sort((a, b) => b[1].gain - a[1].gain)
      .slice(0, Number(args.top)))
      console.log(`| ${k} | ${v.n} | ${(v.n / n).toFixed(2)} | ${((100 * v.gain) / v.n).toFixed(1)} |`);
    // above what the step's decisions gain on average, so a common fact doesn't top the list by being common
    const excess = (k: string, v: { n: number; gain: number }) => {
      const any = facts[`${k.split(":")[0]}: any`];
      return v.gain - (v.n * any.gain) / any.n;
    };
    console.log("\n| the default's step: when | decisions a game | what playouts' play gains a game | points each | above the step's average, a game |\n| --- | --- | --- | --- | --- |");
    for (const [k, v] of Object.entries(facts)
      .sort((a, b) => excess(...b) - excess(...a))
      .slice(0, Number(args.top)))
      console.log(`| ${k} | ${(v.n / n).toFixed(2)} | ${((100 * v.gain) / n).toFixed(2)} | ${((100 * v.gain) / v.n).toFixed(1)} | ${((100 * excess(k, v)) / n).toFixed(2)} |`);
  }
}
