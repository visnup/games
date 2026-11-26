# TODO

## Check the model

- [x] An engine: deal, tricks, the magenta 5, scoring, four hands, a heuristic player (`game.ts`).
- [x] Tests of the booklet's rules and its scoring example (`game.test.ts`).
- [x] A fast engine, 2026-11-19: 0.47 ms a default game, from 3.0 (shared plays, `top()`, loops).
- [x] Playouts to the end of the hand, scored by `chance` (`scripts/chance.ts`), 2026-11-19: 32
      deals win 96.6% at 3 players and 92.1% at 4 against the default, more than 32 full-game
      playouts (95.3%, 82.4%), at about a quarter of the cost.
- [ ] A better `defaultPolicy`, from playouts (`decisions.ts`, `variants.ts`). The default is
      weak: 16-deal hand playouts win 94.9% and 86.1% against it.
  - [x] `leadDown`, 2026-11-20, from `scripts/overrules.ts` on round 9: lead the highest card face
        down with 5+ to go. 65.3% and 49.4% against the previous default (40,000 games), 44.8%
        and 33.6% against the league.
  - [x] Trump first in `leadDown`, 2026-11-20: +8.3 and +11.3 points, +5.8 and +6.6 against the
        league.
  - [x] `take` waits when last early at 4 players, more than 12 from 25, 2026-11-20: +3.5 at 4
        players (40,000 games), +4.3 against the league, nothing at 3.
  - [x] Mine round 9 again against this default, 2026-11-20: its differences are spread under 1%
        of decisions each; the two screened (duck low when last, take high when second) lost.
  - [x] `decisions.ts` against this default, 2026-11-21 (400 games a player count): most of
        what playouts prefer is leading face up where `leadDown` flips, which games already
        refute. Leading the lowest card face down with under 5 to go, the one new rule, lost:
        4.0% and 14.1% (2,000 games).
  - [x] Shallow trees on round 9's picks (`scripts/distill.ts`, `distill.py`), 2026-11-21: it
        mostly keeps high cards, ducking and taking with lower ones; six rules from that and
        from the trees all lost or tied, against the default and learned players. Search on top
        of Hard isn't worth it either: 64-deal playouts among its rollout players win 27.1% at
        4 players against it (2026-11-20).
  - [x] Drop each rule to measure it, for the README rewrite, 2026-11-21: never taking a sure
        trick gains 4.2 points at 3 players and nothing at 4 (40,000 games), 4.4 and 1.8 against
        the league, 3.1 and 0 against the learned player. A sure 25 and dumping once busted were
        worth nothing. The default is now `leadDown`, `duck`, `least`.
  - [x] `duck` leads a card over 5 face down within 5 of 25, 2026-11-22, from production games:
        at a hand's last lead, flipping a silver 8, 9 or 12 won 8 to 74 points more than leading
        it face up (200 deals each). +0.2 and +0.8 points (200,000 games), +0.3 and +1.1 against
        the league, +0.1 and +0.1 against the learned player. Only over 5: leading any lowest card
        face down lost (2026-11-21, above). The playouts rows weren't rerun. Their noise at 2,000
        games is bigger than the effect.
  - [x] `leadDown` flips the highest magenta first when none is under 5, 2026-11-24, from a game
        against the bots (`scripts/play.ts`): a lone magenta 13 had to take a led magenta 5.
        +10.7 and +5.5 points (40,000 games), +3.9 and +2.2 against the league, +1.4 and −0.2
        against the learned player (10,000). Keeping your last silver when leading face down, to
        trump a late run of magenta 5s, did nothing (2,000 games). Hard reads the default's pick;
        told the new one, it ties Hard told the old one (33.5% and 25.3%, 10,000 games), so the
        README's tables of Hard's games weren't rerun. Refitting `chance` moved no weight by more
        than 0.1, so it wasn't changed. A second game, a subagent's against three Hard bots, busted
        twice after trumping to 24 with 5 or more cards left. Avoiding 23 or 24 when forced to
        take, with more than 3 or 6 cards left, tied the default (2,000 games).
  - [x] `least` takes with the biggest that leaves 5 to go, 2026-11-24, from two subagent games
        against Medium bots: +0.2 and +2.8 points (40,000 games), +0.6 and +6.4 against the
        league, +0.2 and +0.9 against the learned player (10,000). Leaving 3 or 7 gained less.
        Ducking by flipping your highest silver tied; not leading face down once everyone else is
        out of magenta lost 1.4 and 2.0 (2,000 games). Hard told the new pick ties Hard told the
        old one (33.3% and 25.2%, 10,000 games).
  - [x] Medium's costliest decisions (`scripts/costly.ts`), 2026-11-24: 200 four-player games,
        the top 10 a hand read by a subagent. Of six rules from it, five lost or tied at 2,000
        games. Leading your last card face down unless it fits gained +0.2 and +1.1 (40,000), and
        −0.4 and +1.4 against the league, but lost 1.4 and 0.4 against the learned player
        (10,000). Taking sure tricks when last, the top-ranked, lost 3.3 and 1.1. Single costly
        decisions don't make rules: each fits the decisions shown and costs elsewhere.
  - [x] Two patterns a subagent saw in Hard's play, 2026-11-24: leading face down within 4 of 25,
        and taking to exactly 25 with 2+ cards left when it could duck. Hand playouts among Hard's
        rollout players (1,000 games a player count) put Hard's pick ahead of its best
        alternative by 2.8 to 5.8 points of win chance each time. Neither is a flaw.
  - [x] Rerun the playouts rows of the README's players table against the new default,
        2026-11-21 (800 games, 15 minutes): 32-deal hand playouts win 63.1% and 62.3%, level with
        round 9.
  - [x] Rerun the README's searchers table against today's Medium, 2026-11-25 (800 games): 32-deal
        hand playouts win 65.8% and 41.3%, Hard 55.1% and 45.0%. At 4 players the playouts fell
        21 points and Hard 18. Does Hard have a blind spot against today's Medium (2,000 games)?
        No. Hand playouts on 16 deals, simulating their own seat as Hard's rollout model and every
        other seat as Medium, won 57.2% and 31.6% against Medium, where Hard won 55.6% and 45.0%.
        The same playouts simulating every seat as Hard won 31.8% and 18.5%. So no training round
        for the new Medium.
  - [x] Rules from `decisions.ts`'s features, 2026-11-25 (40,000 games). In the last hand, taking
        every sure win, taking sure wins that leave 5, taking a sure 25 and never leading face down
        all lost 0.2 to 5.9 points, whether gated on being behind or ahead on chips. Trumping with
        the lowest silver when you can't follow lost 1.3 to 5.2 at 3 players. At 4 players only,
        leaving 8, it gained 3.4 against Medium but lost 0.9 against the league (leaving 3, 5 or
        12 lost 0.9 to 2.3). None adopted.
  - [x] Round 10, 2026-11-20, labeled with the new default's flag (`FROM=10`, `HANDS=2`, 1,500
        trees of 127 leaves): lost to round 9 (29.8%, 23.7%). Refit to rounds 7–10
        (`model-r10refit.json`) it ties round 9 (32.8%, 24.8%). Not adopted; rounds have stopped
        gaining.
- [x] Learn a play scorer from playouts, as in hilt (`dataset.ts`, `learn.py`, `learned.ts`),
      then rounds of it on learned players' games (`round.sh`, `status.ts`), 2026-11-20: round 0
      wins 87.0% and 79.6% against the default; rounds 1–4 each beat the one before by 2 to 15
      points; rounds 5–7 by 0 to 1.5.
- [x] Rollout models of 50 trees and 31 leaves, 2026-11-20: a learned game at 8 times the
      default's cost, where 200 trees of 63 were 50 times.
- [x] Headroom, 2026-11-20: 16-deal hand playouts among round 6's rollout players lose to round 6
      (25.3% at 3 players, 17.4% at 4), so the labels, not the model, cap it.
- [x] Card counting features (version 2), 2026-11-20: round 7, on its own round's games, ties
      round 6, which had six rounds' (+0.2 and +1.0).
- [x] Refit `chance` to learned players' games, 2026-11-20: a chip is worth 40–60% more there.
      Round 8 is the first labeled with it.
- [x] Round 8 didn't gain (+0.2, +0.8 against round 7). Refit to rounds 7–8 with 1,500 trees
      of 127 leaves, it beats round 8 by 1.8 and 0.5, so the model was some of the limit; that
      bigger model is `model-r8.json` now (the first fit is `model-r8small.json`).
- [x] Round 9, 2026-11-20: labels from playouts two hands deep (`HANDS=2`), 1,500 trees of 127
      leaves fit to rounds 7–9. +0.4 and +0.9 over round 8's refit, short of twice the noise, and
      91.0% and 88.6% against the default. Adopted; the 1,500-tree fit hadn't stopped improving.
- [x] What playouts beat round 9, 2026-11-20 (400 games at 4 players, against round 9 in every
      other seat, fair 25%): hand playouts among its rollout players on 16 deals win 16.4%, on 64
      deals 27.1%; full-game playouts on 16, 6.5%; hand playouts among its full model on 2 deals,
      3.0% (100 games), at 13 times a rollout game's cost. So more deals, not deeper or stronger
      playouts.
- [x] Round 11, 2026-11-20: labels on 64 deals, one hand deep, fit to rounds 10–11. Beats round
      10 (36.2%, 26.3%) and loses to round 9 (31.7%, 24.6%). Not adopted.

## Analysis

- [x] Who wins by seat, and how often hands bust or hit 25, 2026-11-21: seats within half a point
      of fair; busts and 25s unchanged by the new default.
- [x] When to play a card as a magenta 5 (`scripts/flips.ts`), 2026-11-21: in the README.
- [x] Variants from where round 9 flips and the default doesn't, or the reverse, 2026-11-21:
      none adopted (README, "When to play a magenta 5").
- [x] Rule readings: `tiesLow` both ways (`scripts/rules.ts`), 2026-11-21: decides 10–14% of
      hands' chips, no player's wins move beyond the noise.
- [x] Leading versus holding the magenta 0 (`scripts/leads.ts`), 2026-11-21, among learned
      players: at 4 players only the lead helps. At 3 players the lead and the card each help a
      little, and they add up.

## Online

- [x] Play online with bots, as in hilt (`replay.ts`, `convex/`, `src/components/`), at a round
      table.
- [x] The Hard bot on the learned model, and in the review, 2026-11-21: round 9 (`hard.ts`, the
      review's Hard bots on its rollout version) ties 32-deal hand playouts.
- [x] Deploy, 2026-11-20: fives.visnup.com, from `main`.
- [x] The pot on the table, 2026-11-25: a chip and its count in the trick's bottom-left corner,
      the one cell no trick card uses at 3 or 4 players, in place of the header's "N in the pot".
