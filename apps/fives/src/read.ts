import { face, type Game, type Play, type Player, type Step, STEPS, TARGET, total, TRUMP } from "./game.ts";

/** The README's cheat sheet, in order, by the name `/learn/puzzles?rule=` gives each rule. */
export const CHEAT_SHEET = ["lead", "duck", "take"] as const;
export type Rule = (typeof CHEAT_SHEET)[number];

/** Medium's play, which is the Hint, the rule of the README's cheat sheet that picks it, and why, in words. */
export function reason(game: Game, p: Player): { play: Play; rule?: Rule; why: string } {
  const plays = game.legal(p);
  if (plays.length === 1) return { play: plays[0], why: "It's your only play." };
  const room = TARGET - total(p);
  for (const [name, step] of Object.entries(STEPS) as [keyof typeof STEPS, Step][]) {
    const play = step(game, p, plays);
    if (!play) continue;
    const why =
      name === "leadDown"
        ? play.card.color === "magenta" && play.card.value > 5 && !p.hand.some((c) => c.color === "magenta" && c.value < 5)
          ? "You're 5 or more from 25, so lead face down. You have no magenta under 5, so flip your highest magenta: a magenta 5 led would force you to take with it."
          : `You're 5 or more from 25, so lead your highest ${play.card.color === TRUMP ? "silver" : "card"} face down. It counts 5 at most.`
        : name === "duck"
          ? !game.trick.length
            ? room < 0
              ? "You've busted, so this hand's total no longer matters. Lead your lowest card face up."
              : play.down
                ? "You're within 5 of 25, so lead your lowest card. It's over 5, so flip it: it counts 5 at most, and a higher magenta can take it."
                : "You're within 5 of 25, so lead your lowest card face up."
            : `Duck: ${play.down ? "flip" : "play"} your biggest card that loses the trick. Tricks will come to you anyway.`
          : face(play).value <= room - 5
            ? "Every card you can play takes the trick, so play the biggest that leaves you 5 to go. More tricks will be forced on you."
            : face(play).value <= room
              ? "Every card you can play takes the trick, so play the biggest that doesn't bust you."
              : room < 0
                ? "You've busted, so play your smallest card."
                : "Every card you can play takes the trick and busts you, so play the smallest.";
    return { play, rule: name === "leadDown" || !game.trick.length ? "lead" : name === "duck" ? "duck" : "take", why };
  }
  return { play: plays[0], why: "" };
}
