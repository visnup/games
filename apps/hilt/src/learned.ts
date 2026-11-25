import { type Card, COLORS, DECK, type Fate } from "./cards.ts";
import { type Forest, flatten, scoreFast, unpack } from "kit/trees.ts";
import { chaseWithin, crowsBefore, decisive, defaultPolicy, doveTheirs, finishIn, type Game, heuristic, type Move, moves, needed, openWith, others, type Player, type Policy, stall } from "./game.ts";

/** The default every model so far was trained on, from before `hold` (2026-11-20): its pick is one of a move's numbers. */
export const hint = heuristic("harvest", "stop", crowsBefore, doveTheirs, "press", "wait", openWith(1), finishIn(4), stall, "one", chaseWithin(3), "allIn", "bait");

const KINDS: (Fate | number)[] = [1, 2, 3, 4, 5, 6, 10, "bait", "fury", "legend", "winter", "crows", "doves"];
const kindOf = (c: Card) => (c.kind === "force" ? c.value : c.kind);
const counts = (cards: Card[]) => KINDS.map((k) => cards.filter((c) => kindOf(c) === k).length);

/** What `p` sees at a decision, as numbers. */
export function board(game: Game, p: Player): number[] {
  const n = game.players.length;
  const rest = others(game, p);
  const alive = rest.filter((q) => !q.passed);
  const strengths = rest.map((q) => game.strength(q));
  const color = game.color ? COLORS.indexOf(game.color) : -1;
  return [
    n,
    ...counts(p.hand),
    p.hand.length,
    game.strength(p),
    p.row.length,
    +p.row.some((c) => c.kind === "fury"),
    p.row.filter((c) => c.kind === "force" && c.value === 1).length,
    Math.max(0, ...strengths),
    game.strength(p) - Math.max(0, ...strengths),
    +(game.leader() === p.seat),
    +(game.favor === p.seat),
    (p.seat - game.favor + n) % n,
    alive.length,
    rest.length - alive.length,
    Math.max(0, ...alive.map((q) => game.strength(q))),
    Math.min(99, ...rest.map((q) => q.hand.length)),
    rest.reduce((s, q) => s + q.hand.length, 0) / rest.length,
    Math.max(0, ...rest.map((q) => q.hand.length)),
    rest.filter((q) => q.hand.length).length,
    +game.winter,
    needed(p.chips),
    color >= 0 ? p.chips[color] : 0,
    +decisive(game, p),
    +rest.some((q) => decisive(game, q)),
    Math.min(...rest.map((q) => needed(q.chips))),
    rest.filter((q) => decisive(game, q) && !q.passed).length,
    game.battles,
    game.pile.length,
  ];
}

const IN_DECK = counts([...DECK]);

/** How many of each kind `p` hasn't seen: not in their hand, a row, or played or discarded since the deal. */
function unseen(game: Game, p: Player): number[] {
  const out = [...IN_DECK];
  const see = (c: Card) => out[KINDS.indexOf(kindOf(c))]--;
  p.hand.forEach(see);
  game.pile.forEach(see);
  for (const q of game.players) q.row.forEach(see);
  return out;
}

/** Version 2's numbers for a decision: card counting. */
const board2 = (game: Game, p: Player) => unseen(game, p);

/** Version 2's numbers for a move: how many unseen cards are stronger than the card played. */
function move2(game: Game, p: Player, m: Move): number[] {
  if (!m || (m.card.kind !== "force" && m.card.kind !== "legend")) return [0];
  const out = unseen(game, p);
  const v = m.card.value;
  return [KINDS.reduce<number>((s, k, i) => s + ((typeof k === "number" && k > v) || (k === "legend" && v < 10) ? out[i] : 0), 0)];
}

/** `move` as numbers: what it is, and where it leaves `p`. */
export function move(game: Game, p: Player, m: Move, isDefault: boolean): number[] {
  const kind = m ? KINDS.indexOf(kindOf(m.card)) : -1;
  let leads = 0;
  let strength = game.strength(p);
  if (m) {
    const row = p.row;
    const winter = game.winter;
    if (m.card.kind === "winter") game.winter = true;
    else if (m.card.kind === "bait") p.row = row.filter((c, i) => i !== row.indexOf(m.take!));
    else p.row = [...row, m.card];
    leads = +(game.leader() === p.seat);
    strength = game.strength(p);
    p.row = row;
    game.winter = winter;
  }
  return [+!m, ...KINDS.map((_, i) => +(i === kind)), m?.take ? m.take.value : 0, leads, strength, strength - game.strength(p), +isDefault];
}

/** The numbers each version of the features gives for a decision and for each move; a model says which it was fit to. */
const FEATURES = {
  1: { board, move },
  2: {
    board: (game: Game, p: Player) => [...board(game, p), ...board2(game, p)],
    move: (game: Game, p: Player, m: Move, isDefault: boolean) => {
      // whether it's the default's pick stays last, where `learn.py` looks for it
      const y = move(game, p, m, isDefault);
      const last = y.pop()!;
      y.push(...move2(game, p, m), last);
      return y;
    },
  },
};
/** The version `dataset.ts` writes. */
export const VERSION = 2;
export const features = (v: number = VERSION) => FEATURES[v as keyof typeof FEATURES];

const forests = new Map<string, Forest>();
const load = (path: string) => {
  // getBuiltinModule, so Convex's bundler, which has no file system, never sees an import of node:fs
  const fs = (globalThis as unknown as { process: { getBuiltinModule(id: "node:fs"): { readFileSync(file: string, encoding: "utf8"): string } } }).process.getBuiltinModule("node:fs");
  if (!forests.has(path)) {
    const text = fs.readFileSync(path, "utf8");
    forests.set(path, path.endsWith(".ts") ? unpack(JSON.parse(text.slice(text.indexOf('"'), text.lastIndexOf('"') + 1))) : flatten(JSON.parse(text)));
  }
  return forests.get(path)!;
};
/** `src/packed/model.ts`, found when first needed, since Convex can't evaluate `import.meta` as it loads a module. */
const MODEL = () => new URL("./packed/model.ts", import.meta.url).pathname;

/** Whether two moves are the same play. */
export const same = (a: Move, b: Move) => a === b || (!!a && !!b && a.card === b.card && a.take === b.take);

/** Every legal move, best first by the model at the path `model`, or a forest already loaded. */
export function ranked(model: string | Forest = MODEL()) {
  const forest = typeof model === "string" ? load(model) : model;
  const xs: Float64Array[] = [];
  return (game: Game, p: Player): Move[] => {
    const options = moves(game, p);
    if (options.length === 1) return options;
    const { board, move } = features(forest.v);
    const b = board(game, p);
    const pick = hint.move(game, p);
    const rows = options.map((m, k) => {
      const y = move(game, p, m, same(m, pick));
      const x = (xs[k] ??= new Float64Array(b.length + y.length));
      x.set(b);
      x.set(y, b.length);
      return x;
    });
    const scores = scoreFast(forest, rows, b.length);
    return options
      .map((m, i) => [m, scores[i]] as const)
      .sort((a, b) => b[1] - a[1])
      .map(([m]) => m);
  };
}

/** The default player, but making the move `model` ranks first. */
export function learned(model: string | Forest = MODEL()): Policy {
  const rank = ranked(model);
  return { ...defaultPolicy, move: (game, p) => rank(game, p)[0] };
}
