import * as Plot from "@observablehq/plot";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { JSDOM } from "jsdom";

/** Draws the charts in README.md into charts/, from the README's own tables, as in monopoly-deal. */
type Row = Record<string, string>;

const dir = new URL("../charts/", import.meta.url);
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const { document } = new JSDOM("").window;

/** The markdown table whose first header cell is `first`, as rows keyed by header. */
function table(first: string): Row[] {
  const lines = readme.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`| ${first} |`));
  if (start < 0) throw new Error(`no table starting with "${first}"`);
  const cells = (l: string) =>
    l
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
  const head = cells(lines[start]);
  const rows: Row[] = [];
  for (let i = start + 2; lines[i]?.startsWith("|"); i++) rows.push(Object.fromEntries(cells(lines[i]).map((c, j) => [head[j], c])));
  return rows;
}
/** A cell's leading number: "56.8%", "+2.1" or "−0.3". */
const num = (cell: string) => Number(cell.replace("−", "-").match(/^[-+]?[\d.]+/)?.[0]);

/** The booklet's inks: the magenta of the Magenta line, and its blue. */
const art = { magenta: "#de35a2", blue: "#2f5db1", paper: "#ffffff", ink: "#1a1a1a", gray: "#8c8c8c" };
const ns = "http://www.w3.org/2000/svg";

/** Dark mode flips lightness and keeps hue, so paper goes dark and ink light. */
function save(name: string, options: Plot.PlotOptions) {
  const svg = Plot.plot({ document, style: { background: art.paper, color: art.ink }, ...options }) as unknown as SVGSVGElement;
  svg.setAttribute("xmlns", ns);
  const dark = document.createElementNS(ns, "style");
  dark.textContent = "@media (prefers-color-scheme: dark) { :root { filter: invert(1) hue-rotate(180deg); background: none !important } }";
  svg.prepend(dark);
  writeFileSync(new URL(`${name}.svg`, dir), svg.outerHTML + "\n");
}

mkdirSync(dir, { recursive: true });

const counts = [3, 4];
const fair = (players: number) => 100 / players;
const dashed = { stroke: art.ink, strokeDasharray: "3,3" };
const halo = { fill: "currentColor", stroke: art.paper };
const signed = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x)}`;
const fairCell = (r: Row, k: number) => num(r[`${k} players`] ?? r[`${k} players (fair ${fair(k).toFixed(1)}%)`]);
// Player counts are ordered, so they're one hue, light to dark.
const playerColor = { domain: counts.map((k) => `${k} players`), range: ["#e576be", "#8a1462"] };

/** `ds` with `y`, their `key` pushed apart to at least `gap`, top down, so labels don't overlap. */
function apart<T extends Record<K, number>, K extends string>(ds: T[], key: K, gap: number) {
  const out = [...ds].sort((a, b) => b[key] - a[key]).map((d) => ({ ...d, y: d[key] }));
  for (let i = 1; i < out.length; i++) out[i].y = Math.min(out[i].y, out[i - 1].y - gap);
  return out;
}

// The players: each one's wins against Medium, as a multiple of a fair share.
const playerRows = table("player");
const kind = (s: string) => (s === "Hard" ? art.magenta : art.gray);
const players = playerRows.flatMap((r) => counts.map((k) => ({ player: r.player, players: k, shares: fairCell(r, k) / fair(k) })));
save("players", {
  width: 640,
  height: 360,
  marginRight: 260,
  x: { label: "Players", type: "point", domain: counts, padding: 0.4 },
  y: { label: "Wins against Medium, in fair shares", grid: true },
  marks: [
    Plot.ruleY([1], dashed),
    Plot.line(players, { x: "players", y: "shares", z: "player", stroke: (d) => kind(d.player), strokeWidth: 2, marker: true }),
    Plot.text(
      apart(
        players.filter((d) => d.players === counts.at(-1)),
        "shares",
        0.09,
      ),
      { x: "players", y: "y", text: (d) => `${d.player} ${d.shares.toFixed(2)}`, fill: (d) => kind(d.player), textAnchor: "start", dx: 8, stroke: art.paper },
    ),
  ],
});

// The learned player's rounds: each model at a table of the one before it, and against the old Medium, over a fair share.
const versus = ["at a table of the model before", "against the old Medium"];
const roundNames = table("round, against the default").map((r) => r["round, against the default"]);
const rounds = [
  ...table("round").flatMap((r) => counts.map((k) => ({ round: r.round, against: versus[0], players: `${k} players`, over: num(r[`${k} players`]) - fair(k) }))),
  ...table("round, against the default").flatMap((r) => counts.map((k) => ({ round: r["round, against the default"], against: versus[1], players: `${k} players`, over: num(r[`${k} players`]) - fair(k) }))),
];
save("rounds", {
  width: 760,
  height: 320,
  x: { label: "Round", type: "point", domain: roundNames, padding: 0.3, insetLeft: 60 },
  y: { label: "Wins over a fair share (points)", grid: true, tickFormat: signed },
  fx: { label: null, domain: versus },
  color: playerColor,
  marks: [
    Plot.ruleY([0], dashed),
    Plot.line(rounds, { fx: "against", x: "round", y: "over", stroke: "players", strokeWidth: 2, marker: true }),
    Plot.text(
      rounds.filter((d) => d.against === versus[1]),
      Plot.selectFirst({ fx: "against", x: "round", y: "over", z: "players", text: "players", textAnchor: "end", dx: -8, ...halo }),
    ),
  ],
});

// A chip lead: the chance to win by chips ahead of the next best player, a line for each number of hands left.
const ahead = "chips ahead of the next best";
const left = ["3 hands left", "2 hands left", "1 hand left"];
const chips = table(ahead).flatMap((r) => counts.flatMap((k) => left.map((l) => ({ lead: num(r[ahead]), players: `${k} players`, left: l, win: num(r[`${k} players, ${l}`]) }))).filter((d) => !Number.isNaN(d.win)));
save("chips", {
  width: 760,
  height: 320,
  x: { label: "Chips ahead of the next best player", tickFormat: signed },
  y: { label: "Chance to win (%)", grid: true, domain: [0, 100] },
  fx: { label: null },
  marginRight: 90,
  color: { domain: left, range: ["#f0a8d6", "#de35a2", "#8a1462"] },
  marks: [
    Plot.ruleY(counts, { fx: (k) => `${k} players`, y: fair, ...dashed }),
    Plot.line(chips, { fx: "players", x: "lead", y: "win", stroke: "left", strokeWidth: 2, marker: true }),
    Plot.text(chips, Plot.selectLast({ fx: "players", x: "lead", y: "win", z: "left", text: "left", textAnchor: "start", dx: 8, ...halo })),
  ],
});

// A hand's total: how often each one happens, and what it gains, among learned players.
const handTotal = "a hand's total";
const totals = table(handTotal).flatMap((r) =>
  counts.map((k) => ({ total: num(r[handTotal]), label: r[handTotal].replace(" (bust)", ""), players: `${k} players`, hands: num(r[`${k} players, hands`]), chips: num(r[`${k} players, chips`]) })),
);
const totalColor = (d: { total: number }) => (d.total > 25 ? art.gray : d.total === 25 ? "#8a1462" : art.magenta);
save("totals", {
  width: 760,
  height: 300,
  x: { label: "A hand's total (40 and over in the last bar)", ticks: [0, 5, 10, 15, 20, 25, 30, 35, 40], tickFormat: (t: number) => (t === 40 ? "40+" : String(t)) },
  y: { label: "Share of hands (%)", grid: true },
  fx: { label: null },
  marks: [Plot.rectY(totals, { fx: "players", x1: (d) => d.total - 0.45, x2: (d) => d.total + 0.45, y: "hands", fill: totalColor }), Plot.ruleX([25.5], dashed)],
});
save("payoff", {
  width: 760,
  height: 300,
  x: { label: "A hand's total (40 and over in the last point)", ticks: [0, 5, 10, 15, 20, 25, 30, 35, 40], tickFormat: (t: number) => (t === 40 ? "40+" : String(t)) },
  y: { label: "Chips gained that hand", grid: true, tickFormat: signed },
  fx: { label: null },
  marks: [
    Plot.ruleY([0], dashed),
    Plot.ruleX([25.5], dashed),
    Plot.line(
      totals.filter((d) => !Number.isNaN(d.chips)),
      { fx: "players", x: "total", y: "chips", stroke: art.ink, strokeWidth: 1 },
    ),
    Plot.dot(
      totals.filter((d) => !Number.isNaN(d.chips)),
      { fx: "players", x: "total", y: "chips", fill: totalColor, stroke: art.paper, strokeWidth: 1.5, r: 3.5 },
    ),
  ],
});

// Each rule: one player without it, at a table of default players, in points under a fair share.
const missing = "without this rule";
const rules = table(missing)
  .filter((r) => r[missing] !== "nothing missing (the default)")
  .flatMap((r) => counts.map((k) => ({ rule: r[missing], players: `${k} players`, over: num(r[`${k} players`]) - fair(k) })));
save("rules", {
  width: 640,
  height: 360,
  marginLeft: 240,
  marginRight: 70,
  x: { label: "Wins over a fair share (points)", grid: true, tickFormat: signed },
  y: { label: null, axis: "right", tickSize: 0 },
  fy: { label: null, domain: [...new Set(rules.map((d) => d.rule))], axis: "left" },
  color: playerColor,
  marks: [Plot.barX(rules, { fy: "rule", y: "players", x: "over", fill: "players" }), Plot.ruleX([0], { stroke: art.ink })],
});

// Who leads the first trick of a hand, and who holds the magenta 0: busts a hand.
const who = "who";
const leads = table(who).flatMap((r) => counts.map((k) => ({ who: r[who], players: `${k} players`, busts: num(r[`busts, ${k} players`]) })));
save("leads", {
  width: 640,
  height: 260,
  marginLeft: 200,
  marginRight: 70,
  x: { label: "Hands busted (%)", grid: true },
  y: { label: null, axis: "right", tickSize: 0 },
  fy: { label: null, domain: table(who).map((r) => r[who]), axis: "left" },
  color: playerColor,
  marks: [Plot.barX(leads, { fy: "who", y: "players", x: "busts", fill: "players" }), Plot.ruleX([0], { stroke: art.ink })],
});

// How often Hard flips, by situation: a range where the table gives one.
const when = "when";
const range = (cell: string) => {
  const [lo, hi = lo] = cell.replace("%", "").split("–").map(Number);
  return { lo, hi };
};
const flips = table(when).flatMap((r) => counts.map((k) => ({ when: r[when], players: `${k} players`, ...range(r[`flips, ${k} players`]) })));
save("flips", {
  width: 640,
  height: 300,
  marginLeft: 300,
  marginRight: 70,
  x: { label: "How often Hard flips (%)", grid: true, domain: [0, 100] },
  y: { label: null, axis: "right", tickSize: 0 },
  fy: { label: null, domain: table(when).map((r) => r[when]), axis: "left" },
  color: playerColor,
  marks: [Plot.ruleX([0], { stroke: art.ink }), Plot.barX(flips, { fy: "when", y: "players", x1: "lo", x2: (d) => Math.max(d.hi, d.lo + 1), fill: "players" })],
});
