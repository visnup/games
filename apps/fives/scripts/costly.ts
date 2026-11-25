import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { COLORS, type Card } from "../src/cards.ts";
import { defaultPolicy, Game, HANDS, mulberry32, type Play, type Player, type Policy, STEPS, type Step, TARGET, total, unseen } from "../src/game.ts";
import { parallel } from "kit/parallel.ts";
import { playout } from "../src/strategies.ts";
import { role, situation } from "./decisions.ts";

/** A decision where Medium's pick lost to another play, written out for a reader to find patterns in. */
type Costly = { hand: number; gain: number; se: number; text: string };

const short = (c: Card) => `${c.color[0]}${c.value}`;
const cards = (cs: readonly Card[]) =>
  [...cs]
    .sort((a, b) => COLORS.indexOf(a.color) - COLORS.indexOf(b.color) || a.value - b.value)
    .map(short)
    .join(" ") || "none";
const play = (x: Play) => (x.down ? `${short(x.card)} face down` : short(x.card));

/**
 * Plays `n` games of default players, and at every decision with a choice plays out each legal
 * play to the end of the hand on `deals` deals with the default everywhere. The best other play
 * is picked on one set of deals and measured against the default's pick on another, so a lucky
 * set doesn't make it look better. Keeps the decisions it beats by more than 2 standard errors.
 */
export function costly(players: number, deals: number, seed: number, n: number): Costly[] {
  const rng = mulberry32(seed);
  const seeds = () => Array.from({ length: deals }, () => Math.floor(rng() * 2 ** 32));
  const out: Costly[] = [];
  for (let i = 0; i < n; i++) {
    const deal = Math.floor(rng() * 2 ** 32);
    const watcher: Policy = {
      play(game, p) {
        const pick = defaultPolicy.play(game, p);
        const options = game.legal(p);
        if (options.length < 2) return pick;
        const a = seeds();
        let best: Play | undefined;
        let most = -Infinity;
        for (const x of options)
          if (x !== pick) {
            const v = playout(game, p, x, a, defaultPolicy, 1);
            if (v > most) [best, most] = [x, v];
          }
        const diff = seeds().map((s) => playout(game, p, best!, [s], defaultPolicy, 1) - playout(game, p, pick, [s], defaultPolicy, 1));
        const mean = diff.reduce((s, x) => s + x, 0) / deals;
        const se = Math.sqrt(diff.reduce((s, x) => s + (x - mean) ** 2, 0) / (deals - 1) / deals);
        if (mean > 2 * se) out.push({ hand: game.hand, gain: mean, se, text: describe(game, p, pick, best!, deal) });
        return pick;
      },
    };
    new Game({ players, rng: mulberry32(deal), policies: watcher }).run();
  }
  return out;
}

/** The decision as a reader needs it: the table, the hand, what's unseen, and the two plays. */
function describe(game: Game, p: Player, pick: Play, best: Play, deal: number) {
  const step = (Object.entries(STEPS) as [string, Step][]).find(([, s]) => s(game, p, game.legal(p)))?.[0] ?? "none";
  const seats = game.players.map((q) => `seat ${q.seat}${q === p ? " (to play)" : ""}: ${q.chips} chips, ${total(q)} points, ${q.hand.length} cards${q.voids.length ? `, out of ${q.voids.join(", ")}` : ""}`);
  const trick = game.trick.map((t) => `seat ${t.seat} ${play(t.play)}`).join(", ") || "none, leading";
  return [
    `deal ${deal}, hand ${game.hand}, ${situation(game, p)}, ${TARGET - total(p)} to go`,
    ...seats.map((s) => `  ${s}`),
    `  trick: ${trick}`,
    `  hand: ${cards(p.hand)}`,
    `  unseen: ${cards(unseen(game, p))}`,
    `  Medium (${step}): ${play(pick)}, ${role(game, p, pick)}`,
    `  better: ${play(best)}, ${role(game, p, best)}`,
  ].join("\n");
}

if (import.meta.main) {
  const { values: args } = parseArgs({ options: { n: { type: "string", default: "200" }, players: { type: "string", default: "4" }, deals: { type: "string", default: "64" }, top: { type: "string", default: "40" } } });
  const players = Number(args.players);
  const n = Number(args.n);
  const found = await parallel<Costly[]>(import.meta.url, "costly", [players, Number(args.deals)], n, (a, b) => a.concat(b));
  found.sort((a, b) => b.gain - a.gain);
  const file = `dataset/costly-${players}p.md`;
  const head = `# Medium's costliest decisions, ${players} players\n\n${n} games, ${found.length} decisions where another play wins more by over 2 standard errors. Gains are points of win chance, hand playouts on ${args.deals} deals among Medium bots. The last hand's swings are the biggest, so each hand gets its own top decisions. Cards are color and value: b blue, g green, s silver (trump), m magenta.\n`;
  const each = Math.ceil(Number(args.top) / HANDS);
  const body = Array.from({ length: HANDS }, (_, h) => [
    `## Hand ${h + 1}\n`,
    ...found
      .filter((c) => c.hand === h + 1)
      .slice(0, each)
      .map((c) => `### +${(100 * c.gain).toFixed(1)} ± ${(100 * c.se).toFixed(1)}\n\n\`\`\`\n${c.text}\n\`\`\`\n`),
  ]).flat();
  writeFileSync(file, [head, ...body].join("\n"));
  console.log(`${found.length} costly decisions in ${n} games, the top ${each} of each hand in ${file}`);
}
