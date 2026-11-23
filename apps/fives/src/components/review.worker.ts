import type { Policy } from "../game.ts";
import { learned } from "../learned.ts";
import type { Choice, Setup } from "../replay.ts";
import { again, deals, review } from "../review.ts";
import { STRATEGIES } from "../strategies.ts";
import { unpack } from "../trees.ts";

// Plays out its share of a finished game's decisions off the page's thread, posting each as it's
// done, then null. Hard bots play by the 50-tree rollout model, loaded only when a game has one.
self.onmessage = async ({ data: [setup, log, seat, part, only] }: MessageEvent<[Setup, Choice[], number, [number, number], Record<number, string[]>?]>) => {
  const bots: Record<string, Policy> = { "face up": STRATEGIES["face up"](0) };
  if (setup.bots.includes("learned")) bots.learned = learned(unpack((await import("../packed/rollout.ts")).default));
  for (const r of review(setup, log, seat, { deals: only ? again(setup) : deals(setup), bots, part, only })) self.postMessage(r);
  self.postMessage(null);
};
