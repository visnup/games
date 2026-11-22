import { existsSync, readdirSync, statSync } from "node:fs";
import { parseArgs } from "node:util";
import { defaultPolicy, face, heuristic, mulberry32, type Play, type Policy, STEPS, type Step, sure, takeWithin, TARGET, total, TRUMP, winning } from "../src/game.ts";
import { learned } from "../src/learned.ts";
import { parallel } from "kit/parallel.ts";
import { headToHead, playouts, STRATEGIES } from "../src/strategies.ts";
import { header } from "kit/table.ts";

const steps = Object.keys(STEPS) as (keyof typeof STEPS)[];

/** The default's steps with `step` before `before`. */
export const insert = (step: Step, before: keyof typeof STEPS) => (): Policy => {
  const i = steps.indexOf(before);
  return heuristic(...steps.slice(0, i), step, ...steps.slice(i));
};

/** The default's steps without `drop`. */
const without =
  (...drop: (keyof typeof STEPS)[]) =>
  (): Policy =>
    heuristic(...steps.filter((s) => !drop.includes(s)));

/** The default's steps with `step` in place of `old`. */
const replace = (old: keyof typeof STEPS, step: Step) => (): Policy => heuristic(...steps.map((s) => (s === old ? step : s)));

/** Once busted, dump the biggest card. */
const busted: Step = (game, p, plays) => (TARGET - total(p) < 0 ? plays.reduce((b, x) => (x.card.value >= b.card.value ? x : b)) : undefined);

/** A sure win that makes exactly 25. */
const exact: Step = (game, p, plays) => plays.find((x) => face(x).value === TARGET - total(p) && sure(game, p, x));

/** A sure win that doesn't bust, except last to play early in a hand at 4 players, more than 12 from 25. */
const take: Step = (game, p, plays) => (game.players.length === 4 && game.trick.length === 3 && p.hand.length > 8 && TARGET - total(p) > 12 ? undefined : takeWithin(0)(game, p, plays));

/** The default before it stopped taking sure wins. */
const taking = heuristic(busted, "leadDown", exact, take, "duck", "least");

/** The default before `leadDown`. */
const previous = heuristic(busted, exact, takeWithin(0), "duck", "least");

/** Leading, with `min` or more to go: the highest card face down, as a magenta 5. */
const leadDown =
  (min: number): Step =>
  (game, p, plays) =>
    !game.trick.length && TARGET - total(p) >= min ? plays.reduce<Play | undefined>((b, x) => (x.down && (!b || x.card.value > b.card.value) ? x : b), undefined) : undefined;

/** The default before `leadDown` flipped trump first. */
const highest = heuristic(busted, leadDown(5), exact, takeWithin(0), "duck", "least");

/** The default before `take` waited when last early at 4 players. */
const eager = heuristic(busted, "leadDown", exact, takeWithin(0), "duck", "least");

const VARIANTS: Record<string, (seed: number) => Policy> = {
  "the default": () => defaultPolicy,
  "face up only": STRATEGIES["face up"],
  ...Object.fromEntries(steps.filter((s) => s !== "least").map((s) => [`without ${s}`, without(s)])),
  "take sure wins, dump once busted (previous)": () => taking,
  "never lead face down (previous)": () => previous,
  ...Object.fromEntries([3, 7, 10].map((k) => [`lead the highest card face down with ${k}+ to go`, replace("leadDown", leadDown(k))])),
  "lead the highest card face down, trump or not (previous)": () => highest,
  "lead the lowest trump face down, if any, else the highest card": replace("leadDown", (game, p, plays) => {
    if (game.trick.length || TARGET - total(p) < 5) return undefined;
    return plays.filter((x) => x.down && x.card.color === TRUMP).sort((a, b) => a.card.value - b.card.value)[0] ?? leadDown(5)(game, p, plays);
  }),
  "take every sure win that doesn't bust (previous)": () => eager,
  ...Object.fromEntries(
    [6, 12].map((k) => [
      `last, early, ${k}+ from 25: duck with the lowest losing card`,
      insert((game, p, plays) => {
        if (game.trick.length !== game.players.length - 1 || p.hand.length <= 8 || TARGET - total(p) <= k) return undefined;
        return plays.filter((x) => !x.down && !winning(game, x)).sort((a, b) => a.card.value - b.card.value)[0];
      }, "duck"),
    ]),
  ),
  ...Object.fromEntries(
    [6, 12].map((k) => [
      `2nd, early, ${k}+ from 25: take with the highest of the led color`,
      insert((game, p, plays) => {
        if (game.trick.length !== 1 || p.hand.length <= 8 || TARGET - total(p) <= k) return undefined;
        return plays.filter((x) => !x.down && x.card.color === game.led() && winning(game, x) && x.card.value <= TARGET - total(p)).sort((a, b) => b.card.value - a.card.value)[0];
      }, "duck"),
    ]),
  ),
  // from people's games: a last silver led face up within 5 of 25 is sure to take, and a magenta 5 can be beaten
  ...Object.fromEntries(
    (
      [
        ["any card", 13, () => true],
        ["a silver", 13, (x) => x.card.color === TRUMP],
        ["a silver, last card only", 1, (x) => x.card.color === TRUMP],
        ["any card, last card only", 1, () => true],
      ] as [string, number, (x: Play) => boolean][]
    ).map(([what, left, which]) => [
      `within 5 of 25, lead the lowest card face down if it's ${what} over 5`,
      insert((game, p, plays) => {
        const room = TARGET - total(p);
        if (game.trick.length || room < 0 || room >= 5 || p.hand.length > left) return undefined;
        const low = STEPS.duck(game, p, plays);
        return low && low.card.value > 5 && which(low) ? plays.find((x) => x.card === low.card && x.down) : undefined;
      }, "duck"),
    ]),
  ),
  "the learned player": () => learned(),
  "the learned player, told the previous default's pick": () => learned(undefined, taking),
  "hand playouts among learned players": (seed) => playouts(16, seed, learned("dataset/model-r6-rollout.json"), 1),
  "hand playouts among round 9's rollout players": (seed) => playouts(16, seed, learned("dataset/model-r9-rollout.json"), 1),
  ...Object.fromEntries([2, 4].map((k) => [`hand playouts on ${k} deals among round 9's full players`, (seed: number) => playouts(k, seed, learned("dataset/model-r9.json"), 1)])),
  "hand playouts on 64 deals among round 9's rollout players": (seed) => playouts(64, seed, learned("dataset/model-r9-rollout.json"), 1),
  "full-game playouts among round 9's rollout players": (seed) => playouts(16, seed, learned("dataset/model-r9-rollout.json")),
  // every model in dataset/, oldest first, as `learned r3` for dataset/model-r3.json
  ...Object.fromEntries(
    (existsSync("dataset") ? readdirSync("dataset") : [])
      .filter((f) => /^model-.*\.json$/.test(f) && !f.includes("-rollout"))
      .sort((a, b) => statSync(`dataset/${a}`).mtimeMs - statSync(`dataset/${b}`).mtimeMs)
      .map((f) => [`learned ${f.slice(6, -5)}`, () => learned(`dataset/${f}`)]),
  ),
};

/** Every default so far, each adopted as the best answer to the one before. */
const LEAGUE: Policy[] = [previous, highest, eager, taking, defaultPolicy];

/** Each other seat a default from `LEAGUE` at random, so a rule that only beats the latest one doesn't look good. */
const league = (seed: number) => LEAGUE[Math.floor(mulberry32(seed)() * LEAGUE.length)];

/** Who sits in the other seats: the default, a default from `LEAGUE`, playouts, or the learned player. */
const FIELDS: Record<string, [string, ((seed: number) => Policy) | undefined]> = {
  default: ["the default player", undefined],
  league: ["a default from every round so far", league],
  playouts: ["hand playouts on 16 deals", (seed) => playouts(16, seed, defaultPolicy, 1)],
  "learned playouts": ["hand playouts on 16 deals among learned players", (seed) => playouts(16, seed, learned("dataset/model-r6-rollout.json"), 1)],
  learned: ["the learned player", () => learned()],
};

const fieldOf = (field: string): [string, ((seed: number) => Policy) | undefined] => FIELDS[field] ?? [`"${field}"`, VARIANTS[field]];

export const run = (variant: string, players: number, field: string, seed: number, n: number) => headToHead(VARIANTS[variant], players, seed, n, fieldOf(field)[1]);

if (import.meta.main) {
  const { values: args } = parseArgs({
    options: { n: { type: "string", default: "40000" }, players: { type: "string", default: "3,4" }, only: { type: "string" }, field: { type: "string", default: "default" } },
  });
  const n = Number(args.n);
  const counts = args.players.split(",").map(Number);
  console.log(`${n} games each: one player's wins against ${fieldOf(args.field)[0]} in every other seat.\n`);
  header(["variant"], counts, true);
  for (const name of Object.keys(VARIANTS).filter((v) => !args.only || args.only.split("|").some((o) => (o in VARIANTS ? v === o : v.startsWith(o))))) {
    const cells = [];
    for (const players of counts) cells.push(`${((100 * (await parallel<ReturnType<typeof run>>(import.meta.url, "run", [name, players, args.field], n)).wins) / n).toFixed(1)}%`);
    console.log(`| ${name} | ${cells.join(" | ")} |`);
  }
}
