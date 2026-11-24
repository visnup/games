import type { Card as CardType, Color } from "../cards.ts";

/** The cards' inks, from the booklet. */
export const PAINT: Record<Color, string> = { blue: "#2f5db1", green: "#3db389", silver: "#808080", magenta: "#de35a2" };

/** How far right of center a number's ink sits in Futura Bold, in em, where it shows: a leading 1's bearing, and the 7's. */
const OFF: Record<number, number> = { 7: 0.05, 10: 0.08, 12: 0.065, 13: 0.065 };

/** The corner index. */
const corner = "absolute top-[0.25em] left-[0.2em] flex flex-col items-center font-numbers text-[0.85em] leading-none font-bold tracking-tighter";

/**
 * A card face up, in its color with its number in white; or `down`, the light back with its
 * magenta 5, with the card's own number under the corner when it's yours. `dim` is for a card
 * that can't be played now.
 */
export function Card({ card, down, hinted, dim, small, className = "", onClick }: { card?: CardType; down?: boolean; hinted?: boolean; dim?: boolean; small?: boolean; className?: string; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  const back = down || !card;
  const value = back ? 5 : card.value;
  return (
    <Tag
      className={`card ${small ? "small" : ""} relative m-0 inline-flex items-center justify-center p-0 font-numbers transition-[translate,filter,opacity] duration-150 ${back ? "bg-back text-magenta ring-1 ring-black/10" : "text-white"} ${hinted ? "outline-3 outline-offset-2 outline-ink/50" : ""} ${dim ? "brightness-125 saturate-35 dark:brightness-50" : ""} ${className}`}
      style={back ? undefined : { background: PAINT[card.color] }}
      onClick={onClick}
      data-hinted={hinted || undefined}
      aria-label={back ? (card ? `${card.color} ${card.value} face down` : "magenta 5") : `${card.color} ${card.value}`}
    >
      <span className={corner}>
        {value}
        {back && card && (
          <span className="mt-[0.3em] rounded-[0.2em] px-[0.15em] py-[0.1em] text-[0.8em] text-white" style={{ background: PAINT[card.color] }}>
            {card.value}
          </span>
        )}
      </span>
      <span className="big text-[2.6em] leading-none font-bold tracking-tight" style={OFF[value] ? { translate: `${-OFF[value]}em` } : undefined}>
        {value}
      </span>
    </Tag>
  );
}

/** A point chip, with a count. */
export function Chips({ n }: { n: number }) {
  return (
    <span title={`${n} point chip${n === 1 ? "" : "s"}`} className="inline-flex items-center gap-[0.3em] font-bold">
      <span className="inline-block size-[1.1em] rounded-full border-2 border-dashed border-white/70 bg-magenta" />
      {n}
    </span>
  );
}
