import { useMutation } from "convex/react";
import type { Infer } from "convex/values";
import Head from "next/head";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import type { bot } from "../../convex/schema";
import { type Card as CardType, COLORS } from "../cards.ts";
import { defaultPolicy, face, type Game, type Play, type Player, type Scored, sure, TARGET, total, type Trick, winning } from "../game.ts";
import { type Choice, choose, type Prompt, replay, setup } from "../replay.ts";
import { Card, Chips, PAINT } from "./Card";
import { Review } from "./Review";

type Props = { game: Doc<"games"> & { log: Choice[]; names: (string | null)[] }; me?: Id<"players"> };

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

const cardName = (s: string) => s.replace(/^(\w)/, (c) => c.toUpperCase());

/** The engine's log by hand, each with a heading, in words, with nobody's dealt hand. */
function entries(lines: string[], who: (n: number) => string) {
  const groups: { heading: string; line: number; lines: { text: string; line: number }[] }[] = [];
  const verb = (n: number, v: string) => `${who(n)} ${who(n) === "You" ? v.replace(/s$/, "") : v}`;
  for (const [i, line] of lines.entries()) {
    let m;
    if ((m = line.match(/^hand (\d+): /))) groups.push({ heading: `Hand ${m[1]}`, line: i, lines: [] });
    else {
      const text = (m = line.match(/^ {2}(\d) plays a magenta 5 face down/))
        ? `${verb(+m[1], "plays")} a magenta 5, face down.`
        : (m = line.match(/^ {2}(\d) plays (\w+ \d+)/))
          ? `${verb(+m[1], "plays")} ${cardName(m[2])}.`
          : (m = line.match(/^ {2}(\d) wins the trick: (\d+)/))
            ? `${verb(+m[1], "wins")} the trick: ${m[2]}${+m[2] > TARGET ? ", bust" : ""}.`
            : (m = line.match(/^hand (\d+) scores: (.*?)(?:; (\d+) in the pot)?$/))
              ? `Hand ${m[1]}: ${m[2]
                  .split(", ")
                  .map((s) => s.match(/(\d): (\d+) ([+-]\d+)/)!)
                  .map(([, s, t, g]) => `${who(+s)} ${t} (${g})`)
                  .join(", ")}${m[3] ? `; ${m[3]} in the pot` : ""}.`
              : line.trim();
      if (!groups.length) groups.push({ heading: "", line: i, lines: [] });
      groups.at(-1)!.lines.push({ text, line: i });
    }
  }
  return groups;
}

/** Two soft rising notes. Browsers keep audio off until the page has been clicked, which joining a table does. */
function chime() {
  try {
    const audio = new AudioContext();
    [660, 880].forEach((hz, i) => {
      const at = audio.currentTime + i * 0.12;
      const tone = audio.createOscillator();
      const volume = audio.createGain();
      tone.frequency.value = hz;
      volume.gain.setValueAtTime(0.08, at);
      volume.gain.exponentialRampToValueAtTime(0.001, at + 0.3);
      tone.connect(volume).connect(audio.destination);
      tone.start(at);
      tone.stop(at + 0.3);
    });
    setTimeout(() => audio.close(), 1000);
  } catch {}
}

/** Where each seat sits around the table, by how far clockwise it is from the bottom: in the grid's rows and columns. */
const PLACES: Record<number, string[]> = {
  3: ["col-start-2 row-start-3", "col-start-1 row-start-1 row-span-2", "col-start-3 row-start-1 row-span-2"],
  4: ["col-start-2 row-start-3", "col-start-1 row-start-2", "col-start-2 row-start-1", "col-start-3 row-start-2"],
};
/** Whether the seat at each place sits at a side, laid out tall. */
const SIDES: Record<number, boolean[]> = { 3: [false, true, true], 4: [false, true, false, true] };
/** Where each seat's card goes in the trick, toward its seat. */
const SLOTS: Record<number, string[]> = {
  3: ["col-start-2 row-start-3", "col-start-1 row-start-1", "col-start-3 row-start-1"],
  4: ["col-start-2 row-start-3", "col-start-1 row-start-2", "col-start-2 row-start-1", "col-start-3 row-start-2"],
};
/** Where a card played into the trick comes from, in em, toward its seat. */
const FROM: Record<number, [number, number][]> = {
  3: [
    [0, 5],
    [-5, -1],
    [5, -1],
  ],
  4: [
    [0, 5],
    [-5, 0],
    [0, -5],
    [5, 0],
  ],
};

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
  const send = (choice: Choice) => {
    setError(undefined);
    decide({ game: game._id, player: me!, choice }).catch((e) => setError(String(e.message ?? e)));
  };
  const { prompt, result } = state;
  const replaceGone = useMutation(api.games.replaceGone);
  const waiting = !result && prompt && prompt.seat !== seat ? ("bot" in game.seats[prompt.seat] ? "bot" : "person") : undefined;
  // while someone else is up, check every so often whether they've left
  useEffect(() => {
    if (!waiting) return;
    const interval = setInterval(() => replaceGone({ game: game._id }), waiting === "bot" ? 3e3 : 10e3);
    return () => clearInterval(interval);
  }, [waiting, replaceGone, game._id]);
  const up = !stepping && !result && prompt?.seat === seat;
  const wasUp = useRef(up);
  useEffect(() => {
    if (up && !wasUp.current) chime();
    wasUp.current = up;
  }, [up]);
  const log = useRef<HTMLDivElement>(null);
  const height = useRef(0);
  const logged = (past ? state : view).lines;
  const lines = logged.length;
  useLayoutEffect(() => {
    const el = log.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= height.current - 4) el.scrollTo({ top: el.scrollHeight });
    height.current = el.scrollHeight;
  }, [lines]);
  const g = view.game;
  // A finished hand holds the playback, and your next play, on its scores until you've seen them; not the ones before the page opened.
  const [seenHands, setSeenHands] = useState(() => state.game.scores.length);
  const scored = !past && g.scores.length > seenHands ? g.scores[seenHands] : undefined;
  useEffect(() => {
    if (!stepping || scored) return;
    const jump = !step || game.log.length - shown > 40;
    const t = setTimeout(() => setShown((n) => (jump ? game.log.length : n + 1)), jump || game.log[shown].seat === seat ? 0 : step);
    return () => clearTimeout(t);
  }, [stepping, step, shown, game.log, seat, scored]);
  const n = g.players.length;
  const bottom = Math.max(0, seat);
  // the trick under way, or the last one to end until the next has a card in it, within the hand
  const trick: { plays: Trick["plays"]; winner?: number } = g.trick.length || !view.tricks.length || g.players.every((p) => !p.won.length) ? { plays: g.trick } : view.tricks.at(-1)!;
  const taking = g.trick.length ? g.taking() : undefined;
  return (
    <div className="mx-auto flex min-h-dvh max-w-[64em] flex-col gap-[0.8em] p-[0.8em]">
      <Head>
        <title>{up ? "Your play · Fives" : "Fives"}</title>
      </Head>
      <section className="panel sticky top-[0.8em] z-10 flex items-start gap-[1em] p-[0.8em] max-sm:top-0 max-sm:-mx-[0.8em] max-sm:-mt-[0.8em] max-sm:rounded-none max-sm:p-[0.4em]">
        <div className="flex w-[7em] shrink-0 flex-col items-center gap-[0.2em] pt-[0.3rem] text-center">
          <span className="label">Hand {g.hand} of 4</span>
          <span className="text-sm">{view.result ? "Game over" : `Trick ${Math.min(n === 3 ? 12 : 13, g.players.reduce((s, p) => s + p.won.length, 0) + 1)}`}</span>
          {g.pot > 0 && <span className="text-xs opacity-70">{g.pot} in the pot</span>}
        </div>
        <div className="h-[5rem] flex-1 overflow-y-auto text-sm max-sm:h-[3.4rem]" ref={log}>
          {entries(logged, who).map(({ heading, line: first, lines }, i) => (
            <section key={i}>
              {heading && (
                <h3
                  onClick={() => visit(first)}
                  className="sticky top-0 m-0 flex cursor-pointer items-center gap-[0.5em] bg-bar px-[0.3em] pt-[0.3em] text-sm font-semibold before:flex-1 before:border-t before:border-ink/20 before:content-[''] after:flex-1 after:border-t after:border-ink/20 after:content-['']"
                >
                  {heading}
                </h3>
              )}
              <ul>
                {lines.map(({ text, line }) => (
                  <li key={line} onClick={() => visit(line)} className={`cursor-pointer rounded-sm px-[0.3em] hover:bg-ink/5 ${past?.line === line ? "bg-ink/10" : ""}`}>
                    {text}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </section>
      {result && seat >= 0 && <Review key={game._id} setup={setup(game)} log={game.log} seat={seat} show={(n) => setPast({ decisions: n, line: until(game, n).lines.length - 1 })} />}
      <div className="grid flex-1 grid-cols-[1fr_auto_1fr] grid-rows-[auto_auto_auto] content-center items-center gap-[0.6em] max-sm:gap-[0.3em]">
        <div className="col-start-2 row-start-2 grid aspect-square w-[min(21em,50vw,36dvh)] grid-cols-3 grid-rows-3 place-items-center rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--color-magenta)_9%,transparent),transparent)]">
          {trick.plays.map(({ seat: s, play }) => {
            const place = (s - bottom + n) % n;
            const [dx, dy] = FROM[n][place];
            const badge = trick.winner === s ? "wins" : taking === s ? "taking" : undefined;
            return (
              <div key={`${s}:${play.card.id}`} className={`${SLOTS[n][place]} played relative`} style={{ "--dx": dx, "--dy": dy } as React.CSSProperties}>
                <Card card={play.down && s !== seat ? undefined : play.card} down={play.down} className={`trick ${badge ? "outline-2 outline-offset-2 outline-ink" : ""}`} />
                {badge && (
                  <span
                    key={badge}
                    className={`absolute -top-[0.7em] -right-[0.7em] animate-pop rounded-full px-[0.45em] text-[0.65rem] font-bold ${badge === "wins" ? "bg-ink text-bar" : "bg-bar text-ink ring-1 ring-ink/40"}`}
                  >
                    {badge}
                  </span>
                )}
              </div>
            );
          })}
          {!trick.plays.length && <span className="col-start-2 row-start-2 animate-rise text-center text-xs opacity-60">{view.result ? "" : `${who(g.current)} ${g.current === seat ? "lead" : "leads"}`}</span>}
        </div>
        {g.players.map((p) => (
          <Seat
            key={p.seat}
            className={PLACES[n][(p.seat - bottom + n) % n]}
            tall={SIDES[n][(p.seat - bottom + n) % n]}
            p={p}
            name={`${who(p.seat)}${view.result?.winners.includes(p.seat) ? " 🏆" : ""}`}
            level={(game.seats[p.seat] as { bot?: Level }).bot}
            current={!view.result && view.prompt?.seat === p.seat}
            mine={p.seat === seat}
          />
        ))}
      </div>
      <section className="panel sticky bottom-0 z-10 mb-[0.4em] max-sm:-mx-[0.8em] max-sm:-mb-[0.8em] max-sm:rounded-none">
        <div className="px-[0.8em] pb-[0.8em] max-sm:px-[0.4em] max-sm:pb-[0.4em]">
          {past ? (
            <p className="m-0 flex items-center justify-between pt-[0.8em]">
              Viewing the table after an earlier play.{" "}
              <button className="primary" onClick={() => setPast(undefined)}>
                Back to now
              </button>
            </p>
          ) : scored ? (
            <HandScores scored={scored} who={who} chips={g.players.map((p) => p.chips)} done={() => setSeenHands(seenHands + 1)} />
          ) : view.result ? (
            <p className="m-0 pt-[0.8em] font-bold">{view.result.winners.length > 1 ? `${view.result.winners.map(who).join(" and ")} share the win.` : `${who(view.result.winners[0])} won!`}</p>
          ) : !stepping && prompt && prompt.seat === seat ? (
            <Ask key={game.log.length} game={g} p={g.players[seat]} send={send} prompt={prompt} deal={`${game._id}:${g.hand}`} />
          ) : (
            <div className="flex items-end gap-[0.8em] max-sm:flex-col-reverse max-sm:items-stretch max-sm:gap-0">
              <div className="min-w-0 flex-1">{seat >= 0 && <Hand key={g.hand} cards={g.players[seat].hand} deal={`${game._id}:${g.hand}`} />}</div>
              <div className="flex shrink-0 flex-col items-center justify-center self-stretch pt-[0.8em] max-sm:flex-row max-sm:justify-between max-sm:pt-[0.4em]">
                <span className="label">Waiting for {view.prompt ? who(view.prompt.seat) : "…"}</span>
                {stepping && (
                  <button className="quiet mt-[0.4em] px-3 py-1 text-sm" onClick={() => setShown(game.log.length)}>
                    Skip
                  </button>
                )}
              </div>
            </div>
          )}
          {error && <p className="text-bust">{error}</p>}
        </div>
      </section>
    </div>
  );
}

/** A hand's scores: each player's total, and the chips it won or cost them. */
function HandScores({ scored, who, chips, done }: { scored: Scored; who: (n: number) => string; chips: number[]; done: () => void }) {
  return (
    <div className="flex animate-rise flex-wrap items-center justify-between gap-[0.8em] pt-[0.8em]">
      <div>
        <h3 className="label m-0">Hand {scored.hand} scores</h3>
        <ul className="mt-[0.3em] flex flex-wrap gap-x-[1.2em] gap-y-[0.2em]">
          {scored.totals.map((t, i) => (
            <li key={i}>
              {who(i)}: <b className={t > TARGET ? "text-bust" : t === TARGET ? "text-magenta" : ""}>{t > TARGET ? `${t}, bust` : t}</b>{" "}
              <span className="opacity-70">{scored.gained[i] >= 0 ? `+${scored.gained[i]}` : `−${-scored.gained[i]}`}</span> <span className="text-xs opacity-50">({chips[i]})</span>
            </li>
          ))}
        </ul>
        {scored.pot > 0 && <p className="m-0 mt-[0.2em] text-xs opacity-70">{scored.pot} chips carried over to the next hand&apos;s closest player.</p>}
      </div>
      <button className="primary shrink-0" onClick={done}>
        Continue
      </button>
    </div>
  );
}

const rank = (c: CardType) => COLORS.indexOf(c.color) * 100 + c.value;

/** How far the card `d` places from the hovered one moves aside, in em: most for its neighbors, none from 4 away. */
const aside = (d: number) => (d === 0 ? 0 : Math.sign(d) * 1.2 * Math.max(0, 1 - (Math.abs(d) - 1) / 3));

/** The last hand dealt in, by game and hand, so a hand animates its deal once however often it's drawn again. */
let lastDeal: string | undefined;

/**
 * A hand, sorted by color in a row, overlapped only as much as it needs to fit, up to 3.2em of each card under the next, which
 * still shows a two-digit index. Once the cards overlap past their middles, only the last shows its big number. With `onClick`,
 * a hovered card rises and the others move aside. `tag` labels a card from above. `onClick` and the rest take places in the hand
 * as dealt, not as shown. A new `deal` deals the cards in.
 */
export function Hand({
  cards,
  onClick,
  onHover,
  onFlip,
  hinted,
  dim,
  down,
  tag,
  deal,
}: {
  cards: CardType[];
  onClick?: (i: number) => void;
  onHover?: (i: number | undefined) => void;
  /** A held touch on a touch screen. */
  onFlip?: (i: number) => void;
  tag?: (i: number) => React.ReactNode;
  deal?: string;
  hinted?: number;
  dim?: (c: CardType) => boolean;
  down?: (i: number) => boolean;
}) {
  const order = cards.map((_, i) => i).sort((a, b) => rank(cards[a]) - rank(cards[b]));
  const [hover, setHover] = useState<number>();
  const at = hover === undefined ? -1 : order.indexOf(hover);
  const hovered = (i: number | undefined) => {
    setHover(i);
    onHover?.(i);
  };
  // a touch: slide to pick a card, release to play it, hold still to flip it, slide off the hand to cancel
  const press = useRef<{ lefts: number[]; right: number; area: DOMRect; i?: number; timer?: number; flipped?: boolean }>(undefined);
  const touched = useRef(false);
  // under a finger, lift more
  const [lift, setLift] = useState(0.8);
  const ref = useRef<HTMLDivElement>(null);
  const under = (x: number, y: number) => {
    const p = press.current!;
    if (x > p.right || y < p.area.top || y > p.area.bottom) return undefined;
    const k = p.lefts.findLastIndex((l) => l <= x);
    return k < 0 ? undefined : order[k];
  };
  const pick = (i: number | undefined) => {
    const p = press.current!;
    if (i === p.i) return;
    clearTimeout(p.timer);
    p.i = i;
    p.flipped = false;
    hovered(i);
    if (i !== undefined && onFlip)
      p.timer = window.setTimeout(() => {
        p.flipped = true;
        onFlip(i);
      }, 800);
  };
  const touch = onClick && {
    onPointerDown: (e: React.PointerEvent) => {
      touched.current = e.pointerType === "touch";
      setLift(touched.current ? 3 : 0.8);
      if (!touched.current) return;
      // the cards' places before the fisheye moves them
      const cards = [...ref.current!.children].map((c) => c.getBoundingClientRect());
      press.current = { lefts: cards.map((r) => r.left), right: cards.at(-1)?.right ?? 0, area: ref.current!.getBoundingClientRect() };
      pick(under(e.clientX, e.clientY));
    },
    onPointerMove: (e: React.PointerEvent) => press.current && pick(under(e.clientX, e.clientY)),
    onPointerUp: (e: React.PointerEvent) => {
      const p = press.current;
      if (!p) return;
      clearTimeout(p.timer);
      const i = under(e.clientX, e.clientY) === p.i ? p.i : undefined;
      press.current = undefined;
      // a played card stays up until it leaves the hand
      if (i !== undefined && !p.flipped) onClick(i);
      else hovered(undefined);
    },
    onPointerCancel: () => {
      clearTimeout(press.current?.timer);
      press.current = undefined;
      hovered(undefined);
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
  // a touch plays on release, not on the click after it
  const click = (i: number) => touched.current || onClick?.(i);
  // fixed at mount, since dropping the class would stop the animation part way
  const [fresh] = useState(() => deal !== undefined && deal !== lastDeal);
  useEffect(() => {
    lastDeal = deal;
  }, [deal]);
  return (
    <div
      ref={ref}
      className="@container flex touch-none justify-center pt-[1.6em] pb-[1.2em] text-[0.85rem] max-sm:pb-[0.4em] *:not-first:-ml-[clamp(0.6em,calc(4.875em-8.33cqw),3.2em)] @max-[34rem]:[&>div:not(:last-child)_.big]:opacity-0"
      onMouseLeave={() => press.current || hovered(undefined)}
      {...touch}
    >
      {order.map((i, k) => (
        <div
          key={i}
          className={`relative transition-transform duration-150 select-none [-webkit-touch-callout:none] ${hover === i ? "z-10" : ""} ${fresh ? "dealt" : ""}`}
          style={{ "--k": k, ...(onClick && at >= 0 ? { translate: `${aside(k - at)}em ${hover === i ? -lift : 0}em` } : {}) } as React.CSSProperties}
          onMouseEnter={onClick && (() => touched.current || hovered(i))}
        >
          {tag?.(i)}
          <Card card={cards[i]} down={down?.(i)} hinted={hinted === i} dim={dim?.(cards[i])} onClick={onClick && (() => click(i))} />
        </div>
      ))}
    </div>
  );
}

/** How long each of others' plays shows before the next, in ms, or 0 for all at once. */
const SPEEDS = { off: 0, fast: 500, slow: 1000 };
export type Speed = keyof typeof SPEEDS;

/** This browser's speed, as last chosen in the lobby. */
export function stepSpeed(): Speed {
  try {
    const s = localStorage.getItem("step");
    return s && s in SPEEDS ? (s as Speed) : "fast";
  } catch {
    return "fast";
  }
}

export function setStepSpeed(s: Speed) {
  try {
    localStorage.setItem("step", s);
  } catch {}
}

/** Whether this browser asked, in the lobby, to have cards counted for it: which of your cards are sure to take a trick. */
export function counting(): boolean {
  try {
    return localStorage.getItem("count") === "1";
  } catch {
    return false;
  }
}

export function setCounting(on: boolean) {
  try {
    localStorage.setItem("count", on ? "1" : "0");
  } catch {}
}

/** A bot's kind of player, as the lobby and its seat name it. */
export type Level = Infer<typeof bot>;
export const LEVELS: Record<Level, { name: string; title: string }> = {
  "face up": { name: "Easy", title: "Never plays a card as a magenta 5" },
  default: { name: "Medium", title: "Plays by a few hand-written rules" },
  learned: { name: "Hard", title: "Plays by the learned model" },
};

/** A player's place at the table: name, chips, this hand's winning cards and total. `tall` stacks it all, for a seat at the side. */
function Seat({ p, name, level, current, mine, className, tall }: { p: Player; name: string; level?: Level; current: boolean; mine: boolean; className: string; tall?: boolean }) {
  const t = total(p);
  return (
    <section className={`panel flex min-w-0 flex-col gap-[0.4em] p-[0.6em] ${current ? "current" : ""} ${className} ${tall ? "justify-self-center pb-[1.2em]" : "justify-self-stretch"}`}>
      <h2 className={`m-0 flex flex-wrap gap-x-[0.5em] text-sm font-bold ${tall ? "flex-col items-center gap-y-[0.3em] text-center" : "items-center"}`}>
        <span className={tall ? "flex max-w-full flex-col" : "truncate"}>
          <span className="truncate">{name}</span>
          {level && (
            <small className={`font-normal opacity-60 ${tall ? "" : "ml-[0.4em]"}`} title={LEVELS[level].title}>
              {LEVELS[level].name}
            </small>
          )}
        </span>
        <span key={p.chips} className={`animate-pop ${tall ? "" : "ml-auto"}`}>
          <Chips n={p.chips} />
        </span>
      </h2>
      <div className={`flex gap-[0.5em] ${tall ? "flex-col items-center" : "items-center"}`}>
        <span className="flex min-w-[2.6em] flex-col items-center" title="This hand's total: the cards that won tricks">
          <span key={t} className={`animate-pop text-xl leading-none font-extrabold ${t > TARGET ? "text-bust" : t === TARGET ? "text-magenta" : ""}`}>
            {t}
          </span>
          <span className={`label text-[0.55rem] ${t > TARGET ? "text-bust opacity-100" : t === TARGET ? "text-magenta opacity-100" : ""}`}>{t > TARGET ? "bust" : t === TARGET ? "on 25" : `${TARGET - t} to go`}</span>
        </span>
        {tall ? (
          <div className="flex flex-col *:not-first:-mt-[calc(var(--small)*2.2)]">
            {p.won.map((w, i) => (
              <div key={i} className="grid h-[calc(4.5*var(--small))] w-[calc(6.3*var(--small))] animate-pop place-items-center">
                <div className="rotate-90">
                  <Card card={w.down && !mine ? undefined : w.card} down={w.down} small />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex min-h-[calc(6.3*var(--small))] min-w-0 flex-wrap *:not-first:-ml-[calc(var(--small)*2.2)]">
            {p.won.map((w, i) => (
              <Card key={i} card={w.down && !mine ? undefined : w.card} down={w.down} small className="animate-pop" />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Ask({ game, p, send, prompt, deal }: { game: Game; p: Player; send: (c: Choice) => void; prompt: Prompt; deal: string }) {
  const legal = game.legal(p);
  const [hint, setHint] = useState<Play>();
  const [hover, setHover] = useState<number>();
  // cards flipped face down, by place in hand
  const [flipped, setFlipped] = useState<number[]>([]);
  // every card that can be, face down
  const [allDown, setAllDown] = useState(false);
  const [note, setNote] = useState<string>();
  const flip = (i: number) => setFlipped((f) => (f.includes(i) ? f.filter((x) => x !== i) : [...f, i]));
  const canDown = (c: CardType) => legal.some((l) => l.card === c && l.down);
  const anyDown = legal.some((l) => l.down);
  const down = (i: number) => (allDown ? canDown(p.hand[i]) : flipped.includes(i));
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "f" || e.metaKey || e.ctrlKey || e.target instanceof HTMLInputElement) return;
      if (hover !== undefined) flip(hover);
      else if (anyDown) setAllDown((d) => !d);
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [hover, anyDown]);
  const play = (i: number) => {
    const card = p.hand[i];
    if (legal.some((l) => l.card === card && l.down === down(i))) return send({ kind: prompt.kind, seat: p.seat, ...choose(p, { card, down: down(i) }) });
    setNote(
      down(i) || allDown
        ? "You can't play that one as a magenta 5 now."
        : game.led() && legal.some((l) => l.card === card)
          ? "Only face down, as a magenta 5: turn on Face down, press F, or long-press it."
          : game.led()
            ? `You have to follow ${game.led()}.`
            : "You can't play that now.",
    );
  };
  const led = game.led();
  const t = total(p);
  const [count] = useState(counting);
  // what the card under the pointer would do, in words
  const pointed = hover !== undefined && legal.some((l) => l.card === p.hand[hover] && l.down === down(hover)) ? { card: p.hand[hover], down: down(hover) } : undefined;
  const preview =
    pointed && game.trick.length
      ? winning(game, pointed)
        ? `${count && sure(game, p, pointed) ? "Takes it" : "Takes it for now"}:${t + face(pointed).value}${t + face(pointed).value > TARGET ? ", bust" : ""}`
        : "Ducks"
      : undefined;
  return (
    <div className="relative">
      <div className="flex items-end gap-[0.8em] max-sm:flex-col-reverse max-sm:items-stretch max-sm:gap-0">
        <div className="min-w-0 flex-1">
          <Hand
            cards={p.hand}
            deal={deal}
            down={down}
            hinted={hint ? p.hand.indexOf(hint.card) : undefined}
            dim={(c) => !legal.some((l) => l.card === c && (!allDown || l.down))}
            onClick={play}
            onFlip={flip}
            onHover={(i) => {
              setHover(i);
              setNote(undefined);
            }}
            tag={(i) => <Outcome game={game} p={p} play={{ card: p.hand[i], down: down(i) }} legal={legal} count={count} />}
          />
        </div>
        <div className="flex w-[9em] shrink-0 flex-col items-center justify-center gap-[0.4em] self-stretch pt-[0.8em] text-center max-sm:w-auto max-sm:flex-row max-sm:justify-between max-sm:pt-[0.4em]">
          <span className="label flex items-center gap-[0.4em]">
            {!led ? (
              "Your lead"
            ) : p.hand.some((c) => c.color === led) ? (
              <>
                <span className="size-[0.8em] rounded-full" style={{ background: PAINT[led] }} />
                Follow {led}
              </>
            ) : (
              "Any card"
            )}
          </span>
          <span className={`text-xs font-bold whitespace-nowrap ${preview ? "" : t > TARGET ? "text-bust" : t === TARGET ? "text-magenta" : "opacity-70"}`}>
            {preview ?? (t > TARGET ? `${t}, bust` : `${t} · ${TARGET - t} to go`)}
          </span>
          <div className="flex flex-wrap justify-center gap-[0.3em]">
            {anyDown && (
              <button className={`quiet px-[0.6em] ${allDown ? "ring-2 ring-magenta" : ""}`} aria-pressed={allDown} title="Play cards face down, as magenta 5s (F)" onClick={() => setAllDown(!allDown)}>
                Face down
              </button>
            )}
            <button
              className="quiet px-[0.6em]"
              onClick={() => {
                const m = defaultPolicy.play(game, p);
                const i = p.hand.indexOf(m.card);
                setHint(m);
                setAllDown(false);
                setFlipped(m.down ? [i] : []);
              }}
            >
              Hint
            </button>
          </div>
        </div>
      </div>
      {note && <div className="panel absolute -right-[0.8em] bottom-full -left-[0.8em] mb-[0.8em] animate-rise p-[0.6em] text-center">{note}</div>}
    </div>
  );
}

/**
 * Above a card in your hand when you follow: if it would take the trick as it stands, your total after it. With `count`, solid
 * when no card you haven't seen could beat it. Nothing over a card that ducks, or one you can't play.
 */
function Outcome({ game, p, play, legal, count }: { game: Game; p: Player; play: Play; legal: Play[]; count: boolean }) {
  if (!game.trick.length || !legal.some((l) => l.card === play.card && l.down === play.down) || !winning(game, play)) return null;
  const after = total(p) + face(play).value;
  const color = after > TARGET ? "var(--color-bust)" : after === TARGET ? "var(--color-magenta)" : "var(--ink)";
  const certain = count && sure(game, p, play);
  return (
    <span
      className="absolute -top-[1.5em] left-[0.1em] z-10 animate-pop rounded-full px-[0.35em] text-[0.7em] sm:left-1/2 sm:-translate-x-1/2 sm:text-[0.8em] leading-[1.4] font-bold whitespace-nowrap"
      style={certain ? { background: color, color: "var(--bar)" } : { boxShadow: `inset 0 0 0 1.5px ${color}`, color, background: "var(--bar)" }}
      title={certain ? "Takes the trick" : count ? "Takes the trick unless someone after you beats it" : "Takes the trick as it stands"}
    >
      {after > TARGET ? `${after}✕` : after}
    </span>
  );
}
