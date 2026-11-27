import { type Game, type Move, type Player, rent, STEPS } from "./game.ts";

export type StepName = keyof typeof STEPS;

/** The step of `STEPS` that makes Medium's move, the Hint, or undefined when Medium ends the turn. */
export function step(game: Game, p: Player, left: number): StepName | undefined {
  for (const [name, s] of Object.entries(STEPS) as [StepName, (typeof STEPS)[StepName]][]) if (s(game, p, left)) return name;
}

/** Each step of `STEPS` in words. */
export const WHY: Record<StepName, string> = {
  bankForcedDeal: "In the first round at 3+ players, bank a Forced Deal.",
  passGo: "Play Pass Go while a play is left after it.",
  complete: "Lay down a property that completes a set.",
  dealBreaker: "Take the best full set of a color you don't have. Take it first from whoever is one set from winning.",
  slyDeal: "Steal the loose property that helps you most. At 3+ players, steal only one that completes a set.",
  rent: "Charge the rent that collects the most. Aim the any-color Rent at someone who has to pay in property.",
  debtCollector: "Aim Debt Collector at someone who has to pay in property.",
  birthday: "Play Birthday after the first round.",
  forcedDeal: "Swap your least-built loose property for one that helps more.",
  placeWhenBanked: "With $10M banked, lay a property down before banking more.",
  bankDoubleRent: "Bank Double the Rent when there's no rent worth doubling.",
  bank: "Bank money before laying properties down.",
  bankBuildings: "Bank houses and hotels. Don't build.",
  place: "With nothing to charge or bank, lay down a property. Plain properties go before wilds.",
  passGoLast: "Play Pass Go with the last play.",
  emptyHand: "When the plays left can empty your hand, bank the rest. Then you draw 5 next turn.",
};

/** Why Medium makes its move in `game`. */
export const why = (game: Game, p: Player, left: number) => {
  const s = step(game, p, left);
  return s ? WHY[s] : "Nothing else is worth a play. End the turn.";
};

/** Why Medium says no to `move`, or lets it through. */
export function whyNo(game: Game, move: Move) {
  if (move.card.kind === "action" && move.card.action === "dealBreaker") return "Always say no to a Deal Breaker.";
  if (move.type === "rent") return `Say no to rent of $5M or more. This one is $${rent(game, game.players[game.current], move.color) * 2 ** move.doubles.length}M.`;
  if (move.card.kind === "action" && (move.card.action === "slyDeal" || move.card.action === "forcedDeal")) return "Say no to a steal from a set that's half done or more.";
  if (move.card.kind === "action" && move.card.action === "debtCollector") return "Say no to Debt Collector.";
  return "Let it through.";
}

type Option = { type: string; target: number | null };

/**
 * The README's advice under "Playing well", by a key for `?rule=`: the start of its bold lead,
 * the steps (or Just Say No answers) its puzzles practice, a test of the best option among all of
 * them, and the rows of the "variant" table that break it.
 */
export const CHEAT_SHEET: Record<string, { lead: string; steps?: string[]; sayNo?: boolean; test?: (best: Option, all: Option[]) => boolean; breaks: string[] }> = {
  charge: {
    lead: "Charge before you lay properties down",
    steps: ["rent", "debtCollector", "birthday", "bank"],
    test: (_, all) => all.some((o) => o.type === "place"),
    breaks: ["lay down properties before charging (previous)", "lay down properties before banking (previous)"],
  },
  build: { lead: "Don't build", steps: ["bankBuildings"], breaks: ["build houses and hotels, never bank them (previous)"] },
  target: {
    lead: "Charge one player who has to pay in property",
    steps: ["rent", "debtCollector"],
    test: (best) => best.target !== null,
    breaks: ["any-color Rent and Debt Collector on the leader (previous)", "Debt Collector on the richest (previous)"],
  },
  passGo: { lead: "Don't save Pass Go", steps: ["passGo"], breaks: ["Pass Go only as the last play", "bank Pass Go"] },
  bank10: { lead: "Bank about $10M", steps: ["placeWhenBanked"], breaks: ["bank all money before laying down properties (previous)", "lay down properties once $5M is banked"] },
  rent1: { lead: "Charge even $1M at 2 players", breaks: ["charge rent worth $2M or more at 2 players (previous)"] },
  bankEarly: { lead: "Bank a Forced Deal in the first round", steps: ["bankForcedDeal", "bankDoubleRent"], breaks: ["play Forced Deal in the first round (previous)", "hold Double the Rent (previous)"] },
  empty: {
    lead: "Empty your hand when you can",
    steps: ["emptyHand", "place"],
    breaks: ["end the turn holding what it won't play (previous)", "Birthday in the first round too (previous)", "lay down the first in hand, wild or not (previous)"],
  },
  complete: { lead: "Two pieces of table advice lose", steps: ["complete"], breaks: ["hold the card that completes a set unless it wins", "keep one Just Say No for a Deal Breaker"] },
  sayNo: { lead: "Say no to whatever costs you", sayNo: true, breaks: ["Just Say No only against Deal Breaker", "keep one Just Say No for a Deal Breaker"] },
};
