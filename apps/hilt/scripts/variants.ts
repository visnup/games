import { existsSync, readdirSync, statSync } from "node:fs";
import { parseArgs } from "node:util";
import { type Card, COLORS } from "../src/cards.ts";
import {
  chaseWithin,
  crowsBefore,
  decisive,
  defaultPolicy,
  doveTheirs,
  finishIn,
  type Game,
  heuristic,
  mulberry32,
  needed,
  oneWithin,
  openWith,
  others,
  type Player,
  type Policy,
  stall,
  STEPS,
  type Step,
  waitWhile,
} from "../src/game.ts";
import { parallel } from "kit/parallel.ts";
import { learned } from "../src/learned.ts";
import { CHEAT_SHEET } from "../src/read.ts";
import { colorPlayouts, crowsAhead, dumpPlayouts, headToHead, playouts, STRATEGIES } from "../src/strategies.ts";
import { header } from "kit/table.ts";

const steps = Object.keys(STEPS) as (keyof typeof STEPS)[];

/** `chase` in every default before 2026-11-24. */
const chase3 = chaseWithin(3);
/** `open` in every default before 2026-11-24, after `wait`. */
const open1 = openWith(1);
/** Steps with `stall` back before `one`, as in every default before 2026-11-25. */
const withStall = (list: (keyof typeof STEPS | Step)[]) => list.flatMap((s) => (s === "one" ? [stall, s] : [s]));

/** The default's steps with `step` before `before`. */
const insert = (step: Step, before: keyof typeof STEPS) => (): Policy => {
  const i = steps.indexOf(before);
  return heuristic(...steps.slice(0, i), step, ...steps.slice(i));
};

/** With only `k` others left in, behind, pass instead of chasing, unless the chip decides the game. */
const giveUp =
  (k: number): Step =>
  (game, p) => {
    if (game.leader() === p.seat || decisive(game, p) || others(game, p).some((q) => decisive(game, q))) return undefined;
    return others(game, p).filter((q) => !q.passed).length <= k && !p.row.length ? null : undefined;
  };

type Kind = "one" | "fury" | "top";
/** The first card of `kinds` in hand: a force 1, a Fury `p` can play, or the strongest force card or Legend. */
const pick = (game: Game, p: Player, kinds: Kind[]): Card | undefined => {
  for (const k of kinds) {
    const card =
      k === "one"
        ? p.hand.find((c) => c.kind === "force" && c.value === 1)
        : k === "fury"
          ? p.hand.find((c) => c.kind === "fury" && game.playable(p, c))
          : p.hand.filter((c) => c.kind === "force" || c.kind === "legend").sort((a, b) => b.value - a.value)[0];
    if (card) return card;
  }
};

/** Ahead with others still in and at most `row` cards played, the first of `kinds` in hand instead of passing. */
const ahead =
  (kinds: Kind[], row = Infinity): Step =>
  (game, p) => {
    if (p.row.length > row || game.leader() !== p.seat || others(game, p).every((q) => q.passed)) return undefined;
    const card = pick(game, p, kinds);
    return card ? { card } : undefined;
  };

/** Ahead with others still in, Bait back a 1; with `keep`, only if that leaves `p` ahead. */
const stallAhead =
  (keep: boolean): Step =>
  (game, p) => {
    const bait = p.hand.find((c) => c.kind === "bait");
    const take = p.row.find((c) => c.kind === "force" && c.value === 1);
    if (!bait || !take || game.leader() !== p.seat || others(game, p).every((q) => q.passed)) return undefined;
    if (keep) {
      const i = p.row.indexOf(take);
      p.row.splice(i, 1);
      const leads = game.leader() === p.seat;
      p.row.splice(i, 0, take);
      if (!leads) return undefined;
    }
    return { card: bait, take };
  };

const oneIn = (game: Game, p: Player) => others(game, p).filter((q) => !q.passed).length === 1;
/**
 * Playouts on `n` deals with each other seat played on by the default `--field league` actually
 * seated there (`headToHead` seeds seat j's field player with the hero's seed + j): an opponent
 * model that's always right, for how much knowing the table could be worth.
 */
const knowing =
  (n: number) =>
  (seed: number): Policy => {
    let inner: Policy | undefined;
    return {
      ...defaultPolicy,
      move(game, p) {
        inner ??= playouts(
          n,
          seed,
          game.players.map((_, j) => (j === p.seat ? defaultPolicy : league(seed + j))),
        );
        return inner.move(game, p);
      },
    };
  };

/** Playouts on `n` deals with each other seat a default from `LEAGUE` at random, drawn again each deal: the table's makeup without who sits where. */
const guessing =
  (n: number) =>
  (seed: number): Policy => {
    const rng = mulberry32(seed);
    const tables = new WeakMap<Game, Policy[]>();
    const draw = (game: Game) =>
      tables.get(game) ??
      tables
        .set(
          game,
          game.players.map(() => LEAGUE[Math.floor(rng() * LEAGUE.length)]),
        )
        .get(game)!;
    const seat = (j: number): Policy => ({
      color: (game, p) => draw(game)[j].color(game, p),
      move: (game, p) => draw(game)[j].move(game, p),
      dump: (game, p) => draw(game)[j].dump(game, p),
    });
    let inner: Policy | undefined;
    return {
      ...defaultPolicy,
      move(game, p) {
        inner ??= playouts(
          n,
          seed,
          game.players.map((_, j) => (j === p.seat ? defaultPolicy : seat(j))),
        );
        return inner.move(game, p);
      },
    };
  };

/**
 * A denial deal: when the battle's chip would win someone else the game, one player still in
 * denies it and the rest stay out, so nobody waits on anyone. Every player at the table works out
 * the same denier: the threat is the first player the chip wins the game for, from the Favor
 * holder clockwise, and `who` picks among the others still in.
 */
type Who = "next" | "furthest";
const denier = (game: Game, who: Who): Player | undefined => {
  const n = game.players.length;
  const order = game.players.map((_, i) => game.players[(game.favor + i) % n]);
  const threat = order.find((q) => decisive(game, q));
  if (!threat) return undefined;
  const after = game.players.map((_, i) => game.players[(threat.seat + 1 + i) % n]).filter((q) => q !== threat && !q.passed && q.hand.length);
  return who === "next" ? after[0] : after.reduce<Player | undefined>((a, q) => (!a || needed(q.chips) > needed(a.chips) ? q : a), undefined);
};
/** In place of `wait`: with a threat and nothing at stake for `p` itself, deny if it's `p`'s turn under the deal, else pass while behind; `keep` false agrees to the deal and never denies. */
const deal =
  (who: Who, keep = true): Step =>
  (game, p) => {
    if (decisive(game, p)) return STEPS.wait(game, p);
    const d = denier(game, who);
    if (!d) return STEPS.wait(game, p);
    if (game.leader() === p.seat) return undefined;
    return keep && d === p ? undefined : null;
  };

const bump = (chips: number[], i: number) => chips.map((c, j) => c + +(i === j));

/** A default from before today's: the steps without `drop`, and with `swap`'s steps in place of today's. */
const past = (drop: (keyof typeof STEPS)[], swap: Partial<Record<keyof typeof STEPS, Step>>) =>
  heuristic(...withStall(steps.filter((s) => !drop.includes(s)).flatMap((s) => (s === "wait" ? ["wait" as const, open1] : [swap[s] ?? (s === "crows" ? crowsBefore : s)]))));

/** The default's steps without `drop`. */
const without =
  (...drop: (keyof typeof STEPS)[]) =>
  (): Policy =>
    heuristic(...steps.filter((s) => !drop.includes(s)));

/** The default's steps with `step` in place of `old`. */
const replace = (old: keyof typeof STEPS, step: Step) => (): Policy => heuristic(...steps.map((s) => (s === old ? step : s)));

/** The README's cheat sheet: each rule in a player's words, and the steps it covers. */
const VARIANTS: Record<string, (seed: number) => Policy> = {
  "the default": () => defaultPolicy,
  "the first default (previous)": STRATEGIES["first default"],
  "open battles (previous)": without("wait"),
  "pass only at a single card's reach of the lead (previous)": without("allIn"),
  "deny every winning chip (previous)": replace("wait", waitWhile(2)),
  "no Bait back after winning (previous)": without("harvest"),
  "pass when ahead with an empty row (previous)": without("press"),
  "open with a 1 or Fury before waiting (previous)": insert(open1, "wait"),
  ...Object.fromEntries([1, 3].map((k) => [`pass with an empty row while ${k}+ others are in`, replace("wait", waitWhile(k, 3))])),
  "wait even against a winning chip": replace("wait", waitWhile(2, 0)),
  "no 1 once something's played (previous)": without("one"),
  "behind with others in, Bait back a 1 (previous)": insert(stall, "one"),
  "give up one on one with an empty row": insert(giveUp(1), "chase"),
  "pass when ahead with something played (previous)": without("hold"),
  "ahead with something played, a 1 or Fury instead of the weakest force card": replace("hold", ahead(["one", "fury"])),
  "ahead with something played, the strongest card instead of the weakest": replace("hold", ahead(["top"])),
  "ahead with something played, the weakest force card only with 1 other in": replace("hold", (game, p) => (oneIn(game, p) ? STEPS.hold(game, p) : undefined)),
  "ahead with something played, Bait back a 1 if still ahead before the weakest force card": insert(stallAhead(true), "hold"),
  "open with a 1 or Fury with nobody else in (previous)": insert(openWith(0), "finish"),
  "open with a 1 or Fury only with 2+ others in": insert(openWith(2), "finish"),
  "never Crows": without("crows"),
  "Crows whenever ahead (previous)": replace("crows", crowsAhead),
  "Crows while leading before it's played (previous)": replace("crows", crowsBefore),
  "Crows only for a chip that wins the game": replace("crows", (game, p) => (decisive(game, p) ? STEPS.crows(game, p) : undefined)),
  "never Doves": without("doves"),
  "with nobody else in, only overtake with a single card (previous)": without("finish"),
  "with nobody else in, overtake in up to 4 cards, strongest first (previous)": replace("finish", finishIn(4)),
  "Bait back a 1 ahead too, before Crows": insert(stallAhead(false), "crows"),
  "Bait back a 1 ahead too, before Crows, if still ahead after": insert(stallAhead(true), "crows"),
  "Bait back a 1 ahead too, after Crows": insert(stallAhead(false), "doves"),
  "press with the strongest card, not a Fury (previous)": replace("press", ahead(["top"], 0)),
  "press with a 1 first": insert(ahead(["one"], 0), "press"),
  "press only with 2+ others in": replace("press", (game, p) => (others(game, p).filter((q) => !q.passed).length >= 2 ? STEPS.press(game, p) : undefined)),
  ...Object.fromEntries(
    [8, 32].flatMap((n) => [
      [`playouts on ${n} deals`, (seed: number) => playouts(n, seed)] as const,
      [`playouts on ${n} deals, knowing each league seat's default`, knowing(n)] as const,
      [`playouts on ${n} deals, each other seat a league default at random`, guessing(n)] as const,
    ]),
  ),
  "the learned player": () => learned(),
  "playouts on 16 deals among Hard's rollout players": (seed) => playouts(16, seed, learned("src/packed/rollout.ts")),
  "playouts on 16 deals among Hard players": (seed) => playouts(16, seed, learned()),
  "playouts on 64 deals among Hard's rollout players": (seed) => playouts(64, seed, learned("src/packed/rollout.ts")),
  "playouts on 256 deals among Hard's rollout players": (seed) => playouts(256, seed, learned("src/packed/rollout.ts")),
  // every model in dataset/, oldest first, as `learned r34s` for dataset/model-r34s.json
  ...Object.fromEntries(
    (existsSync("dataset") ? readdirSync("dataset") : [])
      .filter((f) => /^model-.*\.json$/.test(f))
      .sort((a, b) => statSync(`dataset/${a}`).mtimeMs - statSync(`dataset/${b}`).mtimeMs)
      .map((f) => [`learned ${f.slice(6, -5)}`, () => learned(`dataset/${f}`)]),
  ),
  "chip at random": (seed) => {
    const rng = mulberry32(seed);
    return { ...defaultPolicy, color: () => COLORS[Math.floor(rng() * 3)] };
  },
  "chip for our own progress only": () => ({ ...defaultPolicy, color: (game, p) => COLORS[[0, 1, 2].reduce((a, b) => (needed(bump(p.chips, b)) < needed(bump(p.chips, a)) ? b : a))] }),
  "chip that helps the closest opponent least, first": () => ({
    ...defaultPolicy,
    color: (game, p) => {
      const score = (i: number) => -10 * Math.min(...others(game, p).map((q) => needed(bump(q.chips, i)))) + needed(bump(p.chips, i));
      return COLORS[[0, 1, 2].reduce((a, b) => (score(b) < score(a) ? b : a))];
    },
  }),
  "chip by playouts on 32 deals": (seed) => colorPlayouts(defaultPolicy, 32, seed),
  "never discard a hand of no force cards": () => ({ ...defaultPolicy, dump: () => false }),
  "discard by playouts on 32 deals": (seed) => dumpPlayouts(defaultPolicy, 32, seed),
  "Doves only with 1 other in": replace("doves", (game, p) => (others(game, p).filter((q) => !q.passed).length <= 1 ? STEPS.doves(game, p) : undefined)),
  ...Object.fromEntries(
    (["next", "furthest"] as const).flatMap((who) => [
      [`deal: the ${who} player denies`, replace("wait", deal(who))],
      [`deal: the ${who} player denies, but this one never does`, replace("wait", deal(who, false))],
    ]),
  ),
  "at 3 players, deny a winning chip with the cheapest card (previous)": without("deny"),
  ...Object.fromEntries(
    (["bait", "fury", "legend", "winter", "crows", "doves"] as const).map((kind) => [
      `never play ${kind}`,
      (): Policy => ({
        ...defaultPolicy,
        move(game, p) {
          const hand = p.hand;
          p.hand = hand.filter((c) => c.kind !== kind);
          const m = p.hand.length ? defaultPolicy.move(game, p) : null;
          p.hand = hand;
          return m;
        },
      }),
    ]),
  ),
  "Doves whenever the chip wins the leader the game (previous)": replace("doves", doveTheirs),
  "don't open with 1 other in at 5+ players": insert((game, p) => (game.players.length >= 5 && oneIn(game, p) ? undefined : open1(game, p)), "finish"),
  "no Bait back or Fury while leading with others in (previous)": without("keep", "fury"),
  ...Object.fromEntries(
    (["strongest", "weakest"] as const).map((which) => [
      `behind with others in, Bait back the ${which} force card before a 1`,
      insert((game, p) => {
        const bait = p.hand.find((c) => c.kind === "bait");
        const row = p.row.filter((c) => c.kind === "force").sort((a, b) => (which === "strongest" ? b.value - a.value : a.value - b.value));
        return bait && row.length && game.leader() !== p.seat && others(game, p).some((q) => !q.passed) ? { card: bait, take: row[0] } : undefined;
      }, "one"),
    ]),
  ),
  "behind a rival's winning chip, a 1 or a wait before taking the lead (previous)": without("rival"),
  "chase only while the battle has cost fewer than 3 cards (previous)": replace("chase", chase3),
  // the README's cheat sheet, a rule at a time, and each step alone
  ...Object.fromEntries(Object.entries(CHEAT_SHEET).map(([rule, drop]) => [`without this rule: ${rule}`, without(...drop)])),
  ...Object.fromEntries(steps.map((s) => [`without the step: ${s}`, without(s)])),
  "open with a 1 or Fury after waiting (previous)": insert(open1, "finish"),
};

/** Every default so far, each adopted as the best answer to the one before. */
export const LEAGUE: Policy[] = [
  STRATEGIES["first default"](0),
  heuristic("stop", crowsAhead, doveTheirs, waitWhile(2), chase3, "allIn", "bait"),
  heuristic("stop", crowsAhead, doveTheirs, waitWhile(2, 3), oneWithin(0), chase3, "allIn", "bait"),
  heuristic("harvest", "stop", crowsAhead, doveTheirs, "press", open1, "wait", chase3, "allIn", "bait"),
  heuristic("harvest", "stop", crowsAhead, doveTheirs, "press", "wait", open1, chase3, "allIn", "bait"),
  heuristic("harvest", "stop", crowsBefore, doveTheirs, "press", "wait", open1, chase3, "allIn", "bait"),
  heuristic("harvest", "stop", crowsBefore, doveTheirs, "press", "wait", open1, finishIn(4), chase3, "allIn", "bait"),
  heuristic("harvest", "stop", crowsBefore, doveTheirs, ahead(["top"], 0), "wait", open1, finishIn(4), stall, "one", chase3, "allIn", "bait"),
  past(["hold", "deny", "keep", "fury", "rival"], { chase: chase3, finish: finishIn(4), doves: doveTheirs }),
  past(["deny", "keep", "fury", "rival"], { chase: chase3, finish: finishIn(4), doves: doveTheirs }),
  past(["deny", "keep", "fury", "rival"], { chase: chase3, doves: doveTheirs }),
  past(["keep", "fury", "rival"], { chase: chase3, doves: doveTheirs }),
  past(["keep", "fury", "rival"], { chase: chase3 }),
  past(["rival"], { chase: chase3 }),
  heuristic(...withStall(steps.filter((s) => s !== "rival").flatMap((s) => (s === "chase" ? [chase3] : s === "wait" ? ["wait" as const, open1] : [s])))),
  heuristic(...withStall(steps.flatMap((s) => (s === "chase" ? [chase3] : s === "wait" ? ["wait" as const, open1] : [s])))),
  heuristic(...withStall(steps.flatMap((s) => (s === "finish" ? [open1, s] : [s])))),
  heuristic(...withStall(steps)),
  defaultPolicy,
];

/** Each other seat a default from `LEAGUE` at random, so a rule that only beats the latest one doesn't look good. */
const league = (seed: number) => LEAGUE[Math.floor(mulberry32(seed)() * LEAGUE.length)];

/** Who sits in the other seats: the default, a default from `LEAGUE`, or playouts on 8 deals. */
const FIELDS: Record<string, [string, ((seed: number) => Policy) | undefined]> = {
  default: ["the default player", undefined],
  league: ["a default from every round so far", league],
  playouts: ["playouts on 8 deals", (seed) => playouts(8, seed)],
  learned: ["the learned player", () => learned()],
  // headToHead asks for the other seats in turn order, so at 4 players every third is Medium
  hhm: ["Hard, Hard and Medium (4 players only)", () => (hhm++ % 3 === 2 ? defaultPolicy : learned())],
};
let hhm = 0;

const fieldOf = (field: string): [string, ((seed: number) => Policy) | undefined] => FIELDS[field] ?? [`"${field}"`, VARIANTS[field]];

export const run = (variant: string, players: number, field: string, seed: number, n: number) => headToHead(VARIANTS[variant], players, seed, n, fieldOf(field)[1]);

if (import.meta.main) {
  const { values: args } = parseArgs({
    options: { n: { type: "string", default: "100000" }, players: { type: "string", default: "3,4,5,6" }, only: { type: "string" }, field: { type: "string", default: "default" } },
  });
  const n = Number(args.n);
  const counts = args.players.split(",").map(Number);
  console.log(`${n} games each: one player's wins against ${fieldOf(args.field)[0]} in every other seat.\n`);
  header(["variant"], counts, true);
  for (const name of Object.keys(VARIANTS).filter((v) => !args.only || args.only.split("|").some((o) => v.startsWith(o)))) {
    const cells = [];
    for (const players of counts) cells.push(`${((100 * (await parallel<ReturnType<typeof run>>(import.meta.url, "run", [name, players, args.field], n)).wins) / n).toFixed(1)}%`);
    console.log(`| ${name} | ${cells.join(" | ")} |`);
  }
}
