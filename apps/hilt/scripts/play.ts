/**
 * Play a game against bots from the command line, one decision a call, as seat 0. The game is its
 * setup and decisions in `dataset/play.json` (or `$PLAY`), replayed each call as the site does.
 *
 *   node scripts/play.ts new <seed> [bots]   bots for seats 1 on, default "learned,learned,learned"
 *   node scripts/play.ts show | pass | play <card> [take] | color <color> | dump <y|n>
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { COLORS, name } from "../src/cards.ts";
import { hard } from "../src/hard.ts";
import { type Choice, replay, type Setup } from "../src/replay.ts";
import { STRATEGIES } from "../src/strategies.ts";

const LEVELS: Record<string, string> = { "first default": "Easy", default: "Medium", learned: "Hard" };
const file = process.env.PLAY ?? new URL("../dataset/play.json", import.meta.url).pathname;
const [cmd = "show", a, b] = process.argv.slice(2);
let state: { setup: Setup; log: Choice[] };
if (cmd === "new") {
  const bots = (b ?? "learned,learned,learned").split(",");
  state = { setup: { players: bots.length + 1, seed: Number(a), first: Number(a) % (bots.length + 1), bots: [false, ...bots] }, log: [] };
} else state = JSON.parse(readFileSync(file, "utf8"));
if (cmd !== "new" && !existsSync(file)) throw new Error(`no game in ${file}: start one with new <seed>`);

const policies = { "first default": STRATEGIES["first default"](0), learned: hard() };
const choice: Choice | undefined =
  cmd === "color"
    ? { kind: "color", seat: 0, color: a as (typeof COLORS)[number] }
    : cmd === "dump"
      ? { kind: "dump", seat: 0, dump: a === "y" }
      : cmd === "pass" || cmd === "play"
        ? { kind: "move", seat: 0, card: cmd === "pass" ? null : Number(a), ...(b !== undefined && { take: Number(b) }) }
        : undefined;
let r = replay(state.setup, state.log, policies);
if (choice) {
  state.log.push(...r.decisions, choice);
  r = replay(state.setup, state.log, policies);
}
state.log.push(...r.decisions);
writeFileSync(file, JSON.stringify(state));

const g = r.game;
const names = state.setup.bots.map((bot, i) => (bot ? `${LEVELS[bot]} ${i}` : "Me"));
// the last battle and this one, without the dealt hands
const battles = r.lines.flatMap((l, i) => (l.startsWith("battle ") ? [i] : []));
const lines = r.lines.slice(battles.at(-2) ?? 0).filter((l) => !l.startsWith("round "));
console.log(lines.join("\n").replace(/\b(\d) (plays|passes|wins)/g, (_, s, v) => `${names[s]} ${v}`));
console.log(`\n${g.color ?? "no"} chip, ${names[g.favor]} holds the Favor${g.winter ? ", Winter" : ""}`);
for (const p of g.players) {
  const chips = COLORS.map((c, i) => `${p.chips[i]} ${c}`).join(", ");
  console.log(`${names[p.seat].padEnd(9)} ${chips} | ${String(p.hand.length).padStart(2)} in hand | strength ${g.strength(p)}${p.row.length ? ` from ${p.row.map(name).join(" ")}` : ""}${p.passed ? ", passed" : ""}`);
}
console.log(`\nhand: ${g.players[0].hand.map((c, i) => `${i}:${name(c)}`).join("  ")}`);
console.log(r.result ? `${names[r.result.winner!] ?? "nobody"} won after ${r.result.battles} battles` : `you're up: ${r.prompt?.kind}`);
