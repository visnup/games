import { parseArgs } from "node:util";
import { parallel } from "kit/parallel.ts";
import { header } from "kit/table.ts";
import { Game, mulberry32, type Policy } from "../src/game.ts";
import { learned } from "../src/learned.ts";

/** What battles and games look like among Hard bots: sums over `n` games of `players`, turned into rates below. */
export function run(players: number, seed: number, n: number) {
  const hard = learned();
  const s = { games: 0, battles: 0, rounds: 0, threeOfAColor: 0, oneOfEach: 0, strength: 0, winnerRow: 0, played: 0, seats: 0, sitOut: 0, favorWins: 0, crows: 0, doves: 0 };
  for (let i = 0; i < n; i++) {
    let plays: number[] = [];
    const policy: Policy = {
      ...hard,
      move(game, p) {
        const m = hard.move(game, p);
        if (m) plays[p.seat]++;
        return m;
      },
    };
    const game = new Game({ players, rng: mulberry32(seed * 1_000_003 + i), policies: policy, first: i % players });
    const begin = game.begin.bind(game);
    game.begin = () => {
      begin();
      plays = game.players.map(() => 0);
    };
    const settle = game.settle.bind(game);
    game.settle = () => {
      const favor = game.favor;
      const w = game.ended === "doves" ? null : game.leader();
      s.battles++;
      if (game.ended === "crows") s.crows++;
      if (game.ended === "doves") s.doves++;
      if (w !== null) {
        s.strength += game.strength(game.players[w]);
        s.winnerRow += game.players[w].row.length;
        if (w === favor) s.favorWins++;
      }
      for (const [k, q] of game.players.entries()) {
        s.played += plays[k];
        if (q.hand.length + q.row.length > 0 || plays[k]) {
          s.seats++;
          if (!plays[k]) s.sitOut++;
        }
      }
      return settle();
    };
    game.run();
    const chips = game.players[game.winner!].chips;
    s.games++;
    s.rounds += game.rounds;
    if (chips.some((c) => c >= 3)) s.threeOfAColor++;
    else s.oneOfEach++;
  }
  return s;
}

if (import.meta.main) {
  const { values: args } = parseArgs({ options: { n: { type: "string", default: "4000" }, players: { type: "string", default: "3,4,5,6" } } });
  const counts = args.players.split(",").map(Number);
  const results = [];
  for (const players of counts) results.push(await parallel<ReturnType<typeof run>>(import.meta.url, "run", [players], Number(args.n)));
  console.log(`${args.n} games each among Hard bots.\n`);
  header(["among Hard bots"], counts);
  const row = (label: string, f: (s: (typeof results)[number]) => number, digits = 1, unit = "") => console.log(`| ${label} | ${results.map((s) => `${f(s).toFixed(digits)}${unit}`).join(" | ")} |`);
  row("battles a game", (s) => s.battles / s.games);
  row("rounds a game", (s) => s.rounds / s.games);
  row("games won with three of a color", (s) => (100 * s.threeOfAColor) / s.games, 0, "%");
  row("games won with one of each", (s) => (100 * s.oneOfEach) / s.games, 0, "%");
  row("cards played a battle, everyone together", (s) => s.played / s.battles);
  row("players who sit a battle out without playing", (s) => (100 * s.sitOut) / s.seats, 0, "%");
  row("the winner's strength", (s) => s.strength / (s.battles - s.doves));
  row("cards in the winner's row", (s) => s.winnerRow / (s.battles - s.doves));
  row("battles the Favor holder wins", (s) => (100 * s.favorWins) / s.battles, 0, "%");
  row("battles Crows ends", (s) => (100 * s.crows) / s.battles, 0, "%");
  row("battles Doves ends", (s) => (100 * s.doves) / s.battles, 0, "%");
}
