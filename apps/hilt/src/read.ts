import type { Card, Color } from "./cards.ts";
import { decisive, type Game, type Move, others, type Player, type Step, STEPS } from "./game.ts";

const FORCES = [1, 2, 3, 4, 5, 6, 10];

/** Where playing `card` would leave `p`: their strength, and whether they'd lead. */
export function after(game: Game, p: Player, card: Card) {
  const g = game.clone();
  const q = g.players[p.seat];
  q.hand = q.hand.filter((c) => c !== card);
  if (card.kind === "winter") g.winter = true;
  else q.row.push(card);
  return { strength: g.strength(q), leads: g.leader() === p.seat };
}

const cost = (c: Card) => (c.kind === "force" ? c.value : c.kind === "legend" ? 10 : 11);

/** The cards in `p`'s hand that would put them in the lead, cheapest first. Crows, Doves and Bait aren't among them. */
export function leaders(game: Game, p: Player) {
  return p.hand.filter((c) => c.kind !== "crows" && c.kind !== "doves" && c.kind !== "bait" && game.playable(p, c) && after(game, p, c).leads).sort((a, b) => cost(a) - cost(b));
}

export type Standing = { kind: "win" } | { kind: "lead"; by: number } | { kind: "behind"; by: number; need?: number; have?: Card };

/** Where `p` stands in the battle: about to win it, leading, or behind with the lowest force card that would lead and their cheapest card that does. */
export function standing(game: Game, p: Player): Standing {
  const rest = others(game, p);
  const top = Math.max(...rest.map((q) => game.strength(q)));
  const by = game.strength(p) - top;
  if (game.leader() === p.seat) return rest.every((q) => q.passed) ? { kind: "win" } : { kind: "lead", by };
  const need = FORCES.find((value) => after(game, p, { kind: "force", value }).leads);
  return { kind: "behind", by: -by, need, have: leaders(game, p)[0] };
}

/** The seats that would win the game by winning a battle over `color`. */
export function gamePoints(game: Game, color: Color) {
  const g = game.clone();
  g.color = color;
  return g.players.filter((q) => decisive(g, q)).map((q) => q.seat);
}

/** Each default rule, as advice at the table. */
const WHY: Record<keyof typeof STEPS, string> = {
  harvest: "Everyone's passed. Bait back the biggest card that keeps you ahead.",
  stop: "Everyone's passed and you lead. Pass to win the chip.",
  keep: "You lead by plenty. Bait back the biggest card that keeps you more than 4 ahead.",
  crows: "You lead with a card down. Crows ends the battle before anyone can answer.",
  doves: "You can't afford to lose this chip. Doves voids the battle, and the chip is fought over again.",
  press: "You're ahead with nothing played. Play a Fury or your strongest card before they answer.",
  fury: "You lead. A Fury doubles what you've played.",
  hold: "You lead. Play your weakest force card: a pass would leave them to overtake you.",
  deny: "This chip wins someone else the game. Deny it with your strongest card.",
  rival: "The leader wins the game with this chip, and few are left to stop them. Take the lead with the cheapest card that does it.",
  wait: "Two or more others are still in. Pass and let them spend their cards.",
  finish: "Nobody else is in, and your hand can overtake. Play your strongest card.",
  one: "Play a 1 before anything that would take the lead.",
  chase: "Take the lead with the cheapest card that does it.",
  allIn: "This chip wins you the game. Play your strongest card.",
  bait: "Before giving up this battle, Bait back your biggest card.",
};

/** Medium's move, which is the Hint, and the rule that picks it, in words. */
export function advice(game: Game, p: Player): { move: Move; why: string } {
  for (const [name, step] of Object.entries(STEPS) as [keyof typeof STEPS, Step][]) {
    const move = step(game, p);
    if (move !== undefined) return { move, why: WHY[name] };
  }
  return { move: null, why: "Nothing here is worth another card. Pass." };
}
