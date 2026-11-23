import { useMutation } from "convex/react";
import Head from "next/head";
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { chime } from "kit/chime.ts";
import { SPEEDS, stepSpeed } from "kit/speed.ts";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import type { bot } from "../../convex/schema";
import type { Infer } from "convex/values";
import { type Card as CardType, COLORS } from "../cards.ts";
import { decisive, defaultPolicy, type Game, type Move, type Player } from "../game.ts";
import { advice, after, gamePoints, leaders, type Standing, standing } from "../read.ts";
import { type Battle, type Choice, choose, onBoard, type Prompt, replay, setup } from "../replay.ts";
import { Backs, Card, Chip, label } from "./Card";
import { Review } from "./Review";

type Props = { game: Doc<"games"> & { log: Choice[]; names: (string | null)[] }; me?: Id<"players"> };

/** Floats over the table, just above the bottom bar. */
const floating = "panel absolute -right-[0.8em] bottom-full -left-[0.8em] mb-[1.2em] p-[0.8em] max-sm:right-0 max-sm:left-0 max-sm:mb-[0.4em] max-sm:p-[0.5em]";

/** The game through its first `n` decisions, stopped there even when a bot is next. */
const until = (game: Props["game"], n: number) => {
  const s = setup(game);
  return replay({ ...s, bots: s.bots.map(() => false) }, game.log.slice(0, n));
};

/** How many of a game's decisions it takes for its log to reach `line`. */
function decisionsTo(game: Props["game"], line: number) {
  let [lo, hi] = [0, game.log.length];
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (until(game, mid).lines.length > line) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

const cardName = (s: string) => (/^\d+$/.test(s) ? s : s[0].toUpperCase() + s.slice(1));

/** The engine's log by round and battle, each with a heading, in words, with nobody's dealt hand. */
function entries(lines: string[], who: (n: number) => string) {
  const groups: { heading: string; line: number; lines: { text: string; line: number }[] }[] = [];
  const verb = (n: number, v: string) => `${who(n)} ${who(n) === "You" ? v.replace(/(ss)es$|s$/, "$1") : v}`;
  for (const [i, line] of lines.entries()) {
    let m;
    if ((m = line.match(/^round (\d+):/))) groups.push({ heading: `Round ${m[1]}`, line: i, lines: [{ text: "Everyone's dealt 10 cards, plus one a chip.", line: i }] });
    else if ((m = line.match(/^battle (\d+) over (\w+), favor (\d)/))) groups.push({ heading: `Battle ${m[1]}: the ${m[2]} chip`, line: i, lines: [{ text: `${verb(+m[3], "holds")} the Favor.`, line: i }] });
    else {
      const text = (m = line.match(/^ {2}(\d) plays bait for (\w+): (\d+)/))
        ? `${verb(+m[1], "Baits")} back a ${m[2]}: ${m[3]} strength.`
        : (m = line.match(/^ {2}(\d) plays (\w+): (\d+)/))
          ? `${verb(+m[1], "plays")} ${cardName(m[2])}: ${m[3]} strength.`
          : (m = line.match(/^ {2}(\d) passes(?:, discarding (.*))?/))
            ? `${verb(+m[1], "passes")}${m[2] ? `, discarding ${m[2].split(" ").map(cardName).join(", ")}` : ""}.`
            : (m = line.match(/^ {2}doves: no one wins the (\w+) chip/))
              ? `Doves: nobody wins the ${m[1]} chip.`
              : (m = line.match(/^ {2}(\d) wins the (\w+) chip with (\d+)/))
                ? `${verb(+m[1], "wins")} the ${m[2]} chip with ${m[3]}.`
                : line.trim();
      if (!groups.length) groups.push({ heading: "", line: i, lines: [] });
      groups.at(-1)!.lines.push({ text, line: i });
    }
  }
  return groups;
}

/** Two soft rising notes. Browsers keep audio off until the page has been clicked, which joining a table does. */
export function Board({ game, me }: Props) {
  const decide = useMutation(api.games.decide);
  const [error, setError] = useState<string>();
  const state = useMemo(() => until(game, game.log.length), [game]);
  const seat = game.seats.findIndex((s) => "player" in s && s.player === me);
  // Others' decisions shown one at a time, so each play can be seen. A long gap, like opening the page, jumps to now.
  const [shown, setShown] = useState(game.log.length);
  const [step] = useState(() => SPEEDS[stepSpeed()]);
  const stepping = shown < game.log.length;
  // A past board, replayed up to the decision that wrote the log line clicked
  const [past, setPast] = useState<{ decisions: number; line: number }>();
  const view = useMemo(() => (past ? until(game, past.decisions) : stepping ? until(game, shown) : state), [past, stepping, shown, game, state]);
  const visit = (line: number) => {
    const decisions = decisionsTo(game, line);
    setPast(decisions >= game.log.length ? undefined : { decisions, line });
  };
  const who = (n: number) => (n === seat ? "You" : "bot" in game.seats[n] ? `Bot ${n + 1}` : (game.names[n] ?? `Player ${n + 1}`));
  /** Sends a decision; whether it went through. */
  const send = (choice: Choice) => {
    setError(undefined);
    return decide({ game: game._id, player: me!, choice }).then(
      () => true,
      (e) => {
        setError(String(e.message ?? e));
        return false;
      },
    );
  };
  const { prompt, result } = state;
  const replaceGone = useMutation(api.games.replaceGone);
  const waiting = !result && prompt && prompt.seat !== seat ? ("bot" in game.seats[prompt.seat] ? "bot" : "person") : undefined;
  // while someone else is up, check every so often whether they've left; a bot should never be
  // up for long, since the server plays bots as soon as it's their turn
  useEffect(() => {
    if (!waiting) return;
    const interval = setInterval(() => replaceGone({ game: game._id }), waiting === "bot" ? 3e3 : 10e3);
    return () => clearInterval(interval);
  }, [waiting, replaceGone, game._id]);
  // when it comes to you, say so in the tab's title and chime, since you might be in another tab
  const up = !stepping && !result && prompt?.seat === seat;
  const wasUp = useRef(up);
  useEffect(() => {
    if (up && !wasUp.current) chime();
    wasUp.current = up;
  }, [up]);
  const log = useRef<HTMLDivElement>(null);
  const height = useRef(0);
  // the whole log while looking back, so later lines can be clicked too
  const logged = (past ? state : view).lines;
  const lines = logged.length;
  // follow new lines only when already at the bottom, so scrolling back through it stays put
  useLayoutEffect(() => {
    const el = log.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= height.current - 4) el.scrollTo({ top: el.scrollHeight });
    height.current = el.scrollHeight;
  }, [lines]);
  const g = view.game;
  const battle = onBoard(g, view.lines);
  // A battle that Doves or Crows ended holds the playback, and your next move, until you've seen
  // it, since it's over in a moment; not the ones before the page opened.
  const [seen, setSeen] = useState(() => state.game.battles);
  const ended = !past && !battle.current && view.last?.ended && view.last.battle > seen ? view.last : undefined;
  const endedBy = ended && battle.lines.map((l) => l.match(/^ {2}(\d) plays (?:doves|crows)/)).find(Boolean);
  useEffect(() => {
    if (!stepping || ended) return;
    const jump = !step || game.log.length - shown > 40;
    const t = setTimeout(() => setShown((n) => (jump ? game.log.length : n + 1)), jump || game.log[shown].seat === seat ? 0 : step);
    return () => clearTimeout(t);
  }, [stepping, step, shown, game.log, seat, ended]);
  const others = Array.from({ length: g.players.length }, (_, i) => (seat < 0 ? i : seat + 1 + i) % g.players.length).filter((n) => n !== seat);
  return (
    // on a phone, the hand's cards run off the screen's bottom edge, clipped here so the page can't scroll to them
    <div className="mx-auto flex min-h-dvh max-w-[90em] flex-col gap-[0.8em] p-[0.8em] max-sm:gap-[0.4em] max-sm:overflow-y-clip">
      <Head>
        <title>{up ? "Your move · Hilt" : "Hilt"}</title>
      </Head>
      <section className="panel sticky top-[0.8em] z-10 flex items-start gap-[1em] p-[0.8em] max-sm:top-0 max-sm:-mx-[0.8em] max-sm:-mt-[0.8em] max-sm:gap-[0.4em] max-sm:rounded-none max-sm:px-[0.4em] max-sm:py-[0.2em]">
        {/* pushed down to the baseline of the log's sticky heading beside it */}
        <div className="flex w-[9em] shrink-0 flex-col items-center gap-[0.3em] pt-[0.4rem] text-center max-sm:w-[7em] max-sm:gap-[0.1em] max-sm:pt-[0.2rem]">
          {g.fighting && g.color ? (
            <>
              <span className="label">Battle {g.battles}</span>
              <span className="flex items-center gap-[0.3em] text-sm font-semibold capitalize">
                <Chip color={g.color} />
                {g.color}
                {g.winter && <span title="Winter: force cards are 1">❄️</span>}
              </span>
              <span className="max-w-full truncate text-xs opacity-80">
                {who(g.leader())} {g.leader() === seat ? "lead" : "leads"} with {g.strength(g.players[g.leader()])}
              </span>
            </>
          ) : (
            <>
              <span className="label">Round {g.rounds}</span>
              <span className="text-sm">{view.result ? "Game over" : `${who(g.favor)} ${g.favor === seat ? "pick" : "picks"} the next chip`}</span>
            </>
          )}
        </div>
        <div className="h-[6.65rem] flex-1 overflow-y-auto text-sm text-white/80 max-sm:h-[4.65rem]" ref={log}>
          {entries(logged, who).map(({ heading, line: first, lines }, i) => (
            <section key={i}>
              {heading && (
                <h3
                  onClick={() => visit(first)}
                  className="sticky top-0 m-0 flex cursor-pointer items-center gap-[0.5em] px-[0.3em] pt-[0.3em] text-sm font-semibold before:flex-1 before:border-t before:border-white/40 before:content-[''] after:flex-1 after:border-t after:border-white/40 after:content-['']"
                  style={{ background: "var(--bar)" }}
                >
                  {heading}
                </h3>
              )}
              <ul>
                {lines.map(({ text, line }) => (
                  <li key={line} onClick={() => visit(line)} className={`cursor-pointer rounded-sm px-[0.3em] hover:bg-white/10 ${past?.line === line ? "bg-white/20" : ""}`}>
                    {text}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </section>
      {result && seat >= 0 && <Review key={game._id} setup={setup(game)} log={game.log} seat={seat} show={(n) => setPast({ decisions: n, line: until(game, n).lines.length - 1 })} />}
      <div className="mb-[10em] grid flex-1 grid-cols-[repeat(auto-fill,minmax(min(28em,100%),1fr))] content-start gap-[0.8em] max-sm:mb-[3.5em] max-sm:gap-[0.4em]">
        {(seat >= 0 ? [...others, seat] : others).map((n) => (
          <Seat
            key={n}
            game={g}
            p={g.players[n]}
            name={`${who(n)}${view.result?.winner === n ? " 🏆" : ""}`}
            level={"bot" in game.seats[n] ? game.seats[n].bot : undefined}
            current={!view.result && view.prompt?.seat === n}
            point={g.fighting && !view.result && decisive(g, g.players[n])}
            fighting={battle.current}
            last={view.last}
            played={discarded(battle.lines).get(n) ?? []}
          />
        ))}
      </div>
      <section className="panel sticky bottom-0 z-10 text-white max-sm:-mx-[0.8em] max-sm:-mb-[0.8em] max-sm:rounded-none">
        <div className="px-[0.8em] pb-[0.8em] max-sm:px-[0.4em] max-sm:pb-0">
          {past ? (
            <div className="flex items-end gap-[0.8em] max-sm:flex-col-reverse max-sm:items-stretch max-sm:gap-0">
              <div className="min-w-0 flex-1">{seat >= 0 && <Hand cards={g.players[seat].hand} />}</div>
              <div className="flex shrink-0 flex-col items-center justify-center gap-[0.4em] self-stretch pt-[0.8em] max-sm:flex-row max-sm:justify-between max-sm:pt-[0.3em]">
                <span className="label">After an earlier play</span>
                <button className="primary" onClick={() => setPast(undefined)}>
                  Back to now
                </button>
              </div>
            </div>
          ) : view.result ? (
            <p className="m-0 pt-[0.8em] font-bold max-sm:pb-[0.5em]">{view.result.winner === null ? "Nobody won." : `${who(view.result.winner)} won!`}</p>
          ) : ended ? (
            <p className="m-0 flex animate-rise items-center justify-between gap-[0.8em] pt-[0.8em] max-sm:pb-[0.5em]">
              <span>
                {ended.ended === "doves"
                  ? `🕊️ ${endedBy ? who(+endedBy[1]) : "Someone"} played Doves: nobody wins the ${ended.color} chip, and the Favor stays with ${who(g.favor)}.`
                  : `🐦 ${endedBy ? who(+endedBy[1]) : "Someone"} played Crows: ${who(ended.winner!)} ${ended.winner === seat ? "win" : "wins"} the ${ended.color} chip with ${ended.strengths[ended.winner!]}.`}
              </span>
              <button className="primary shrink-0" onClick={() => setSeen(ended.battle)}>
                Continue
              </button>
            </p>
          ) : !stepping && prompt && prompt.seat === seat ? (
            <Ask key={game.log.length} game={g} p={g.players[seat]} prompt={prompt} send={send} who={who} deal={`${game._id}:${g.rounds}`} />
          ) : (
            <div className="flex items-end gap-[0.8em] max-sm:flex-col-reverse max-sm:items-stretch max-sm:gap-0">
              <div className="min-w-0 flex-1">{seat >= 0 && <Hand key={g.rounds} cards={g.players[seat].hand} deal={`${game._id}:${g.rounds}`} />}</div>
              <div className="flex shrink-0 flex-col items-center justify-center self-stretch pt-[0.8em] max-sm:min-h-[2.3em] max-sm:flex-row max-sm:justify-between max-sm:pt-[0.3em]">
                <span className="label">Waiting for {view.prompt ? who(view.prompt.seat) : "…"}</span>
                {stepping && (
                  <button className="quiet mt-[0.4em] px-3 py-1 text-sm max-sm:mt-0" onClick={() => setShown(game.log.length)}>
                    Skip
                  </button>
                )}
              </div>
            </div>
          )}
          {error && <p className="text-[#ff8a8a]">{error}</p>}
        </div>
      </section>
    </div>
  );
}

const ORDER: CardType["kind"][] = ["force", "legend", "fury", "bait", "winter", "crows", "doves"];
const rank = (c: CardType) => ORDER.indexOf(c.kind) * 100 + c.value;

/**
 * A hand, sorted. On a phone, its cards overlap only as much as they need to fit the width, down to each card's corner. A full hand there shows only the last card's big face.
 * With `onClick`, a hovered card rises and the others move aside. On a touch screen, slide to pick a card and release to play it. `tag` labels a card from above. A new `deal`
 * deals the cards in. `onClick` and the rest take places in the hand as dealt, not as shown.
 */
export function Hand({
  cards,
  onClick,
  onHover,
  selected,
  focus,
  hinted,
  dim,
  tag,
  deal,
}: {
  cards: CardType[];
  /** Whether the card was played. */
  onClick?: (i: number) => boolean;
  onHover?: (i: number | undefined) => void;
  selected?: number;
  /** A card chosen from the keyboard, lifted like a hovered one. */
  focus?: number;
  hinted?: number;
  dim?: (c: CardType) => boolean;
  tag?: (i: number) => ReactNode;
  deal?: string;
}) {
  const [hover, setHover] = useState<number>();
  const [lift, setLift] = useState(0.8);
  const ref = useRef<HTMLDivElement>(null);
  const press = useRef<{ lefts: number[]; right: number; area: DOMRect; i?: number }>(undefined);
  const touched = useRef(false);
  // fixed at mount, since dropping the class would stop the animation part way
  const [fresh] = useState(() => deal !== undefined && deal !== lastDeal);
  useEffect(() => {
    lastDeal = deal;
  }, [deal]);
  const hovered = (i: number | undefined) => {
    setHover(i);
    onHover?.(i);
  };
  const sorted = cards.map((_, i) => i).sort((a, b) => rank(cards[a]) - rank(cards[b]));
  // the cards that can't be played now, held apart to the right
  const playable = sorted.filter((i) => !dim?.(cards[i]));
  const order = [...playable, ...sorted.filter((i) => dim?.(cards[i]))];
  const groups = playable.length && playable.length < order.length ? 2 : 1;
  const overlap = `clamp(0.5rem, calc((${order.length} * 3.825rem + ${groups - 1} * var(--gap) - 100cqw) / ${Math.max(1, order.length - groups)}), 2.72rem)`;
  const lifted = hover ?? focus;
  const at = lifted === undefined ? -1 : order.indexOf(lifted);
  const under = (x: number, y: number) => {
    const p = press.current!;
    if (x > p.right || y < p.area.top || y > p.area.bottom) return undefined;
    const k = p.lefts.findLastIndex((l) => l <= x);
    return k < 0 ? undefined : order[k];
  };
  const pick = (i: number | undefined) => {
    const p = press.current!;
    if (i === p.i) return;
    p.i = i;
    hovered(i);
  };
  const touch = onClick && {
    onPointerDown: (e: React.PointerEvent) => {
      touched.current = e.pointerType === "touch";
      setLift(touched.current ? 3 : 0.8);
      if (!touched.current) return;
      // the cards' places before they move aside
      const rects = [...ref.current!.children].map((c) => c.getBoundingClientRect());
      press.current = { lefts: rects.map((r) => r.left), right: rects.at(-1)?.right ?? 0, area: ref.current!.getBoundingClientRect() };
      pick(under(e.clientX, e.clientY));
    },
    onPointerMove: (e: React.PointerEvent) => press.current && pick(under(e.clientX, e.clientY)),
    onPointerUp: (e: React.PointerEvent) => {
      const p = press.current;
      if (!p) return;
      const i = under(e.clientX, e.clientY) === p.i ? p.i : undefined;
      press.current = undefined;
      // a played card stays up until it leaves the hand
      if (i === undefined || !onClick(i)) hovered(undefined);
    },
    onPointerCancel: () => {
      press.current = undefined;
      hovered(undefined);
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
  return (
    <div
      ref={ref}
      className={`@container flex justify-center pt-[1.2em] [--gap:1rem] *:hover:z-10 max-sm:-mb-[2.4em] max-sm:pt-[1em] max-sm:[--gap:0.4rem] ${onClick ? "touch-none" : ""} ${order.length > 8 ? "@max-[34rem]:[&>div:not(:last-child)_.big]:opacity-0" : ""}`}
      // Chromium ends a tap's emulated mouse events with a mouseleave, which would drop the card it just played. iOS Safari doesn't.
      onMouseLeave={() => press.current || touched.current || hovered(undefined)}
      {...touch}
    >
      {order.map((i, k) => (
        <div
          key={i}
          className={`relative transition-transform duration-150 select-none [-webkit-touch-callout:none] ${selected === i || lifted === i ? "z-10" : ""} ${fresh ? "dealt" : ""}`}
          style={
            {
              "--k": k,
              marginLeft: !k ? 0 : k === playable.length ? "var(--gap)" : `calc(-1 * ${overlap})`,
              ...(onClick && at >= 0 ? { translate: `${aside(k - at)}em ${lifted === i ? -lift : 0}em` } : {}),
            } as React.CSSProperties
          }
          onMouseEnter={onClick && (() => touched.current || hovered(i))}
        >
          <Card card={cards[i]} selected={selected === i} hinted={hinted === i} dim={dim?.(cards[i])} onClick={onClick && (() => touched.current || onClick(i))} />
          {tag?.(i)}
        </div>
      ))}
    </div>
  );
}

/** How far the card `d` places from the hovered one moves aside, in em: most for its neighbors, none from 4 away. */
const aside = (d: number) => (d === 0 ? 0 : Math.sign(d) * 1.2 * Math.max(0, 1 - (Math.abs(d) - 1) / 3));

/** The last hand dealt in, by game and round, so a hand animates its deal once however often it's drawn again. */
let lastDeal: string | undefined;

/** A bot's kind of player, as the lobby and its seat name it. */
export type Level = Infer<typeof bot>;
export const LEVELS: Record<Level, { name: string; title: string }> = {
  "first default": { name: "Easy", title: "Fights every battle, like a new player" },
  default: { name: "Medium", title: "Plays by rules tuned against playouts" },
  learned: { name: "Hard", title: "Plays by the learned model" },
};

/** The Winters and Baits each seat played in a battle's log lines. They're discarded as they're played, so only the log knows. */
function discarded(lines: string[]) {
  const out = new Map<number, { card: CardType; took?: CardType }[]>();
  for (const line of lines) {
    const m = line.match(/^ {2}(\d) plays (winter|bait)(?: for (\d+))?/);
    if (m) out.set(+m[1], [...(out.get(+m[1]) ?? []), { card: { kind: m[2] as "winter" | "bait", value: 0 }, ...(m[3] && { took: { kind: "force", value: +m[3] } }) }]);
  }
  return out;
}

/** Winters and Baits played and discarded this battle, each Bait with the card it took back peeking out above it, grayed, since it's back in hand. */
export function Played({ played, className = "" }: { played: { card: CardType; took?: CardType }[]; className?: string }) {
  return (
    <div
      className={`flex *:not-first:-ml-[calc(var(--small)*1.9/0.65)] ${className}`}
      title="Played and discarded: not in the row, and not counted as cards played. A Bait shows the card it took back above it, grayed, since it's back in hand."
    >
      {played.map(({ card, took }, i) => (
        <div key={i} className="relative">
          {took && (
            <div className="absolute -top-[calc(1.7*var(--small))] left-[calc(0.3*var(--small))]">
              <Card card={took} small dim />
            </div>
          )}
          <div className="relative">
            <Card card={card} small />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A player's place at the table: chips, the Favor, cards in hand, and their row in the battle `onBoard` picks. */
function Seat({
  game,
  p,
  name,
  level,
  current,
  point,
  fighting,
  last,
  played,
}: {
  game: Game;
  p: Player;
  name: string;
  level?: Level;
  current: boolean;
  /** Whether winning this battle wins them the game. */
  point: boolean;
  fighting: boolean;
  last?: Battle;
  played: { card: CardType; took?: CardType }[];
}) {
  const row = fighting ? p.row : (last?.rows[p.seat] ?? []);
  const strength = fighting ? game.strength(p) : last?.strengths[p.seat];
  const leads = fighting ? game.leader() === p.seat : last?.winner === p.seat;
  // a finished battle, or a player who passed and isn't winning it
  const muted = !fighting || (p.passed && !leads) ? "opacity-50" : "";
  const chips = COLORS.map((c, i) => <Chip key={c} color={c} n={p.chips[i]} faded={!p.chips[i]} />);
  // on phones the name runs up the left side, with the Favor as a dot, and the chips stack at the right
  return (
    <section className={`seat flex gap-[0.4em] py-[0.6em] max-sm:items-center max-sm:px-[0.4em] sm:flex-col ${current ? "current" : ""}`}>
      <h2 className="m-0 flex flex-wrap items-center gap-x-[0.5em] gap-y-[0.2em] text-base font-bold max-sm:text-xs whitespace-nowrap max-sm:[writing-mode:sideways-lr]">
        <span>
          {name}
          {level && (
            <small className="ml-[0.3em] font-normal opacity-60 sm:hidden" title={LEVELS[level].title}>
              {LEVELS[level].name[0]}
            </small>
          )}
          {level && (
            <small className="ml-[0.5em] text-sm font-normal opacity-60 max-sm:hidden" title={LEVELS[level].title}>
              {LEVELS[level].name}
            </small>
          )}
        </span>
        {game.favor === p.seat && (
          <span className="rounded-full bg-accent px-[0.6em] py-[0.1em] text-xs font-bold max-sm:size-[0.8em] max-sm:p-0" title="The Favor: picks the chip, has 1 strength before playing anything, and acts last">
            <span className="max-sm:hidden">Favor</span>
          </span>
        )}
        <span className="ml-auto flex items-center gap-[0.3em] max-sm:hidden">{chips}</span>
      </h2>
      <div className="flex min-h-[calc(6.3*var(--small))] flex-1 flex-wrap items-center gap-[0.5em] sm:gap-[0.8em]">
        {strength !== undefined && (fighting || last) && (
          <span className={`flex min-w-[3em] sm:min-w-[4.5em] flex-col items-center gap-[0.2em] whitespace-nowrap ${muted}`}>
            <span className={`text-xl leading-none font-extrabold ${leads ? "text-accent" : ""}`}>{strength}</span>
            <span className="label">{leads ? (fighting ? "leads" : "won") : " "}</span>
          </span>
        )}
        <div className={`flex *:not-first:-ml-[calc(var(--small)*1.9/0.65)] ${muted}`}>
          {row.map((c, i) => (
            <Card key={i} card={c} small />
          ))}
        </div>
        {played.length > 0 && <Played played={played} className={muted} />}
        {fighting && p.passed && (
          <span className={`label ${muted}`} title="Passed for the rest of the battle; their cards still count">
            Passed
          </span>
        )}
        {point && (
          <span className="animate-pop rounded-full bg-white px-[0.6em] py-[0.1em] text-xs font-bold whitespace-nowrap text-black" title="Winning this battle wins them the game">
            Game point
          </span>
        )}
        <span className="ml-auto flex items-center gap-[0.6em]">
          <span className="relative">
            <Backs n={p.hand.length} />
            {/* on phones, the count sits on the top card instead of beside the stack */}
            <span className="absolute inset-y-0 right-0 grid w-[calc(4.5*var(--small))] place-items-center text-base font-extrabold [text-shadow:0_1px_3px_rgb(0_0_0/0.9)] sm:hidden">{p.hand.length}</span>
          </span>
          <span className="flex min-w-[4.5em] flex-col items-center gap-[0.2em] max-sm:hidden">
            <span className="text-xl leading-none font-extrabold">{p.hand.length}</span>
            <span className="label text-[0.6rem] whitespace-nowrap">in hand</span>
          </span>
          <span className="flex flex-col gap-[0.15em] text-[0.7em] sm:hidden">{chips}</span>
        </span>
      </div>
    </section>
  );
}

/** A question floating over the table with its answers, and the hand in the bar below. */
function Asking({ question, answers, children }: { question: ReactNode; answers: ReactNode; children: ReactNode }) {
  return (
    <div className="relative">
      <div className={`${floating} flex flex-wrap items-center justify-center gap-[0.6em]`}>
        <span>{question}</span>
        {answers}
      </div>
      {children}
    </div>
  );
}

const ringed = (on: boolean) => (on ? "outline-3 outline-accent" : "");

function Ask({ game, p, prompt, send, who, deal }: { game: Game; p: Player; prompt: Prompt; send: (c: Choice) => Promise<boolean>; who: (n: number) => string; deal: string }) {
  const [hint, setHint] = useState<{ color?: string; dump?: boolean }>();
  const hinted = ringed;
  if (prompt.kind === "color")
    return (
      <Asking
        question="Pick the chip for the next battle:"
        answers={
          <>
            {COLORS.map((c) => {
              const points = gamePoints(game, c);
              return (
                <button key={c} aria-label={c} className={`quiet flex items-center gap-[0.4em] ${hinted(hint?.color === c)}`} onClick={() => send({ kind: "color", seat: p.seat, color: c })}>
                  <Chip color={c} /> {c}
                  {points.length > 0 && <small className="opacity-70">game point: {points.map(who).join(", ")}</small>}
                </button>
              );
            })}
            <button className="quiet" onClick={() => setHint({ color: defaultPolicy.color(game, p) })}>
              Hint
            </button>
          </>
        }
      >
        <Hand cards={p.hand} deal={deal} />
      </Asking>
    );
  if (prompt.kind === "dump")
    return (
      <Asking
        question="You've no force cards left. Show your hand and discard it?"
        answers={
          <>
            <button className={hinted(hint?.dump === true)} onClick={() => send({ kind: "dump", seat: p.seat, dump: true })}>
              Discard it
            </button>
            <button className={hinted(hint?.dump === false)} onClick={() => send({ kind: "dump", seat: p.seat, dump: false })}>
              Keep it
            </button>
            <button className="quiet" onClick={() => setHint({ dump: defaultPolicy.dump(game, p) })}>
              Hint
            </button>
          </>
        }
      >
        <Hand cards={p.hand} deal={deal} />
      </Asking>
    );
  return <AskMove game={game} p={p} send={send} deal={deal} />;
}

/** Where you stand in the battle, in a few words. */
function reading(s: Standing) {
  if (s.kind === "win") return "Pass to win the chip";
  if (s.kind === "lead") return s.by ? `You lead by ${s.by}` : "You lead on the tie";
  if (s.have && s.have.kind !== "force" && s.have.kind !== "legend") return `Your ${label(s.have)} takes the lead`;
  if (s.need === undefined) return `${s.by} behind: no one card leads`;
  const card = s.need === 10 ? "10" : `${s.need}+`;
  return s.have ? `${card} takes the lead` : `You'd need ${card} to lead`;
}

/** Above a card in your hand: what it would bring you to if it takes the lead, solid on the cheapest that does. */
function Outcome({ text, solid }: { text: string | number; solid: boolean }) {
  return (
    <span
      className={`absolute -top-[0.95rem] left-[0.6375rem] z-10 -translate-x-1/2 animate-pop rounded-full px-[0.35em] text-[0.7rem] leading-[1.4] font-bold whitespace-nowrap ring-1 ring-accent ${solid ? "bg-accent text-white" : "bg-[var(--bar)] text-white"}`}
      title={solid ? "The cheapest card that takes the lead" : "Takes the lead"}
    >
      {text}
    </span>
  );
}

function AskMove({ game, p, send, deal }: { game: Game; p: Player; send: (c: Choice) => Promise<boolean>; deal: string }) {
  // a play on its way, so a second tap before the table catches up doesn't send another
  const [sent, setSent] = useState(false);
  const [baiting, setBaiting] = useState<number>();
  const [hint, setHint] = useState<ReturnType<typeof advice>>();
  const [note, setNote] = useState<string>();
  const [hover, setHover] = useState<number>();
  const [focus, setFocus] = useState<number>();
  const pointer = hover ?? focus;
  const stands = useMemo(() => standing(game, p), [game, p]);
  const leading = useMemo(() => leaders(game, p), [game, p]);
  const submit = (m: Move) => {
    if (sent) return;
    setSent(true);
    void send({ kind: "move", seat: p.seat, ...choose(p, m) }).then((ok) => ok || setSent(false));
  };
  // Bait can take back any force card in the row, so one option for each value there
  const takes = [...new Map(p.row.filter((c) => c.kind === "force").map((c) => [c.value, c])).values()].sort((a, b) => b.value - a.value);
  const play = (i: number) => {
    const card = p.hand[i];
    setNote(undefined);
    if (!game.playable(p, card)) {
      setNote(card.kind === "bait" ? "Bait needs a force card in your row to take back." : `You can't play ${label(card)} again this battle.`);
      return false;
    }
    if (card.kind === "bait" && takes.length > 1) {
      setBaiting(i);
      return false;
    }
    submit(card.kind === "bait" ? { card, take: takes[0] } : { card });
    return true;
  };
  const toggleHint = () => {
    if (hint) {
      setHint(undefined);
      setBaiting(undefined);
      return;
    }
    const a = advice(game, p);
    setHint(a);
    setNote(undefined);
    setBaiting(a.move?.take ? p.hand.indexOf(a.move.card) : undefined);
  };
  // the arrows move between the cards you can play, as the hand shows them; Enter plays, P passes, H hints
  const keys = useRef<(e: KeyboardEvent) => void>(undefined);
  useEffect(() => {
    keys.current = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.target instanceof HTMLInputElement) return;
      const playable = p.hand
        .map((_, i) => i)
        .sort((a, b) => rank(p.hand[a]) - rank(p.hand[b]))
        .filter((i) => game.playable(p, p.hand[i]));
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && playable.length) {
        e.preventDefault();
        const k = pointer === undefined ? -1 : playable.indexOf(pointer);
        const next = k < 0 ? (e.key === "ArrowLeft" ? playable.length - 1 : 0) : (k + (e.key === "ArrowLeft" ? -1 : 1) + playable.length) % playable.length;
        setHover(undefined);
        setFocus(playable[next]);
      } else if ((e.key === "Enter" || e.key === " ") && pointer !== undefined) {
        e.preventDefault();
        play(pointer);
      } else if (e.key === "p") submit(null);
      else if (e.key === "h") toggleHint();
    };
  });
  useEffect(() => {
    const key = (e: KeyboardEvent) => keys.current?.(e);
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);
  const bait = baiting === undefined ? undefined : p.hand[baiting];
  const message = note ?? hint?.why;
  return (
    <div className="relative">
      <div className="flex items-end gap-[0.8em] max-sm:flex-col-reverse max-sm:items-stretch max-sm:gap-0">
        <div className="min-w-0 flex-1">
          <Hand
            cards={p.hand}
            deal={deal}
            selected={baiting}
            focus={focus}
            hinted={hint?.move ? p.hand.indexOf(hint.move.card) : undefined}
            dim={(c) => !game.playable(p, c)}
            onClick={play}
            onHover={(i) => {
              setHover(i);
              if (i !== undefined) setFocus(undefined);
            }}
            tag={(i) => {
              const c = p.hand[i];
              if (c.kind === "crows" && game.leader() === p.seat) return <Outcome text="wins" solid />;
              return stands.kind === "behind" && leading.includes(c) ? <Outcome text={after(game, p, c).strength} solid={c === stands.have} /> : null;
            }}
          />
        </div>
        <div className="flex w-[14em] shrink-0 flex-col items-center justify-center gap-[0.4em] self-stretch pt-[0.8em] text-center max-sm:w-auto max-sm:flex-row max-sm:justify-end max-sm:pt-[0.3em] max-sm:text-left">
          <span className={`min-w-0 text-sm font-bold max-sm:mr-auto ${stands.kind === "behind" ? "" : "text-accent"}`}>{reading(stands)}</span>
          <div className="flex shrink-0 gap-[0.4em]">
            <button className={ringed(hint?.move === null)} onClick={() => submit(null)} title="Passing is for the rest of the battle (P)">
              Pass
            </button>
            <button className={`quiet ${hint ? "ring-2 ring-white/50" : ""}`} aria-pressed={!!hint} title="Medium's move, and why (H)" onClick={toggleHint}>
              Hint
            </button>
          </div>
        </div>
      </div>
      {bait ? (
        <div className={`${floating} flex animate-rise flex-wrap items-center justify-center gap-[0.6em]`}>
          {hint && <span className="w-full text-center">{hint.why}</span>}
          {takes.map((t) => (
            <button key={t.value} className={`primary ${ringed(hint?.move?.card.kind === "bait" && hint.move.take?.value === t.value)}`} onClick={() => submit({ card: bait, take: t })}>
              Take back the {t.value}
            </button>
          ))}
          <button className="quiet" onClick={() => setBaiting(undefined)}>
            Cancel
          </button>
        </div>
      ) : (
        message && (
          <div key={message} className={`${floating} animate-rise text-center`}>
            {message}
          </div>
        )
      )}
    </div>
  );
}
