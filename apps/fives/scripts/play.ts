/**
 * Play a game against bots from the command line, one decision a call, as seat 0. The game is its
 * setup and decisions in `dataset/play.json` (or `$PLAY`), replayed each call as the site does.
 *
 *   node scripts/play.ts new <seed> [bots]   bots for seats 1 on, default "learned,learned,learned"
 *   node scripts/play.ts show | play <card> [down]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { name } from "../src/cards.ts";
import { hard } from "../src/hard.ts";
import { type Choice, replay, type Setup } from "../src/replay.ts";
import { STRATEGIES } from "../src/strategies.ts";

const LEVELS: Record<string, string> = { "face up": "Easy", default: "Medium", learned: "Hard" };
const file = process.env.PLAY ?? new URL("../dataset/play.json", import.meta.url).pathname;
const [cmd = "show", a, b] = process.argv.slice(2);
if (cmd !== "new" && !existsSync(file)) throw new Error(`no game in ${file}: start one with new <seed>`);
const bots = (b ?? "learned,learned,learned").split(",");
const state: { setup: Setup; log: Choice[] } = cmd === "new" ? { setup: { players: bots.length + 1, seed: Number(a), bots: [false, ...bots] }, log: [] } : JSON.parse(readFileSync(file, "utf8"));

const policies = { "face up": STRATEGIES["face up"](0), learned: hard() };
let r = replay(state.setup, state.log, policies);
if (cmd === "play") {
  state.log.push(...r.decisions, { kind: "play", seat: 0, card: Number(a), down: b === "down" });
  r = replay(state.setup, state.log, policies);
}
state.log.push(...r.decisions);
writeFileSync(file, JSON.stringify(state));

const g = r.game;
const names = state.setup.bots.map((bot, i) => (bot ? `${LEVELS[bot]} ${i}` : "Me"));
// the last hand's scores and this hand's plays, without the dealt hands
const deals = r.lines.flatMap((l, i) => (/^hand \d+:/.test(l) ? [i] : []));
let lines = r.lines.slice((deals.at(r.result ? -1 : -2) ?? 0) + 1).filter((l) => !/^hand \d+:/.test(l));
if (!r.result) lines = lines.slice(lines.findLastIndex((l) => l.includes("scores:")));
console.log(lines.join("\n").replace(/\b(\d)(: | plays| wins| and| share)/g, (_, s, v) => `${names[s]}${v}`));
console.log(`\nhand ${g.hand}${g.pot ? `, ${g.pot} in the pot` : ""}`);
for (const p of g.players) {
  const won = p.won.map((w) => (w.down ? "m5" : w.card.value)).join("+");
  console.log(`${names[p.seat].padEnd(9)} ${p.chips} chips | ${String(p.points).padStart(2)} points${won ? ` (${won})` : ""} | ${p.hand.length} in hand${p.voids.length ? ` | out of ${p.voids.join(", ")}` : ""}`);
}
if (g.trick.length) console.log(`trick: ${g.trick.map((t) => `${names[t.seat]} ${t.play.down ? "magenta 5 (down)" : name(t.play.card)}`).join(", ")}`);
const me = g.players[0];
console.log(`\nhand: ${me.hand.map((c, i) => `${i}:${name(c)}`).join("  ")}`);
if (r.result) console.log(`${r.result.winners.map((w) => names[w]).join(" and ")} won with ${r.result.chips.join("/")} chips`);
else {
  const legal = g.legal(me);
  const up = legal.filter((l) => !l.down).map((l) => me.hand.indexOf(l.card));
  const down = legal.filter((l) => l.down).map((l) => me.hand.indexOf(l.card));
  console.log(`you're up: play ${up.join(" ")}${down.length ? ` | down ${down.join(" ")}` : ""}`);
}
