# TODO

## Check the model

- [x] An engine: deal, battles, the fate cards, rounds and redeals, a heuristic player (`game.ts`).
- [x] Tests of the booklet's rules (`game.test.ts`).
- [x] Whole-game strategies head to head (`strategies.ts`).
- [x] A better `defaultPolicy`, from playouts (`decisions.ts`, `variants.ts`), 2026-11-18: nine
      rounds. Against the first default, 32-deal playouts won 84% at 3 players and 76% at 6;
      against the ninth, 63.9% and 40.5%. Rules cycle (wait, then open, then wait), so from
      round five a rule had to win against the league of earlier defaults too.
- [x] Racing playouts (drop a move 2 standard errors behind): 128 deals in 0.6× the time, about
      a point weaker.
- [x] Recheck the adopted rules against strong players (`variants.ts --field playouts`): two are
      bets on how the others play (deny, wait), the rest hold up.
- [x] The Favor holder's chip choice and the discard on passing, played out (`colorPlayouts`,
      `dumpPlayouts`), 2026-11-19: both rules are within half a point of playouts on 32 deals.
- [ ] Remember what's been played: `game.pile` holds every face-up card since the deal, but
      playouts deal the hidden cards from everything unseen, which already accounts for it.
      A player that reads others' likely hands from what they've played and passed on.
- [x] Learn a move scorer from playouts, as in monopoly-deal (`dataset.ts`, `learn.py`,
      `learned.ts`), 2026-11-19: 74.7% at 3 players and 50.3% at 6 against the default, as good
      as 128-deal playouts. Round 1 (the learned player's games) +3 to +5 against round 0's
      players, adopted as `src/model.json`; round 2 ties.
- [x] Labels from learned players inside the playouts (`dataset.ts --rollout`), 25× the cost
      a decision, 3,000 games a player count on 16 deals, about 35 minutes a round. Round 3
      beats rounds 0–1's players by 12 to 20 points (and wins less against the default); each
      round after is fit to every round's games from round 3 on: round 4 beats round 3's by 11
      to 20; round 5 beats round 4's by 3.6 to 6; round 6 beats round 5's by 1.7 to 3.8
      (2026-11-19).
- [x] Round 7: beats round 6's by 1.3 to 2.3 and every older model by more than round 6 did,
      adopted as `src/model.json` (2026-11-19). The README's "rounds" tables
      and `charts/rounds.svg` track every round.
- [x] Round 8: beats round 7's by 1.0 to 1.7 and every older model by more than round 7 did, adopted as `src/model.json` (2026-11-19). `scripts/round.sh 9` runs the
      next round, and `scripts/status.ts --round 9` shows its progress.
- [x] Round 9: beats round 8's by 0.5 to 0.9 at 4 to 6 players and ties at 3, adopted
      (2026-11-20). The gains are levelling off.
- [x] Round 10, on twice the games: 0.3 to 0.7 over round 9, within the noise, not adopted
      (2026-11-20). More of the same games no longer helps; the next gain needs something new
      (more deals a label, features, or labels from playouts against a league).
- [x] Rules from the learned player: where its moves differ from the default's, grouped by
      the default's rule (2026-11-20). Ahead with a card down and others in, the default passed
      and the model played: `hold` plays the weakest force card, +17 to +5 points against the
      previous default and +6 to +0.8 against the league. Adopted. The models still read the
      previous default's pick (`hint` in `learned.ts`) until a round is trained on the new one.
- [x] `finish` costs 2.7 points at 3 players against quick playouts since `hold`, but dropping it
      loses 1.4 to 4.8 against the default and 3.9 to 7.5 against the league. Counting the whole
      hand instead of the best 4: +1.1 at 3 players, adopted (2026-11-20).
- [x] `wait` is the model's biggest disagreement at 3 players, but never waiting there loses 5.3
      points against the default and 1.5 against the league. Baiting back the strongest force card
      when behind (the model's Bait over the default's 1) wins against the league and loses to
      today's default: a bet (2026-11-20).
- [x] Mined the mixed-table Hard model (2026-11-21): at 3 players it denies a winning chip with
      a 10 where the default waits or opens with a 1; adopted as `deny`, +6.4 against the
      default, +3.5 against the league. Holding Doves and Bait back a 1 while ahead are noise.
- [x] Rerun the README's tables for today's default (`scripts/tables.sh`, 2026-11-23, 206 minutes). The rounds' own tables and the fate-card playouts stay as history.
- [x] How much knowing the table is worth (README "Knowing the table", 2026-11-20): at a league
      table, 32-deal playouts that know each seat's default win 24 to 31 points more than ones
      that assume today's default; knowing only the league's makeup gets about half.
- [x] Opponent modeling, learned (`o1`, 2026-11-20, README "Knowing the table"): mixed tables
      with true rollouts gain 19 to 29 points against the league, as much as playouts that know
      every seat; the features for what each player has shown add nothing (same data without
      them ties). It loses badly to round 9's tables (7 to 20%).
- [x] A Hard bot for people (README "Knowing the table", 2026-11-21): rounds 3–9 with `o1` and
      `o2`, adopted in ae34a09. A third mixed round against today's league (`o3`), fit with the
      rest, ties at round 9's tables and against the default, and gains 1.5 to 1.9 against the
      league at 4 to 6 players. Adopted.
- [x] Mined Hard against today's default (2026-11-23): no pattern is over 3.1% of decisions.
      The biggest, Bait where rule 8 plays a 1, loses 0.4 to 1.2 against the default and gains
      0.6 to 0.9 against the league (4,000 games): a bet, not adopted.
- [x] Headroom (2026-11-23): 16-deal playouts among Hard's 200-tree rollout players win 19.6% at
      3 players and 5.6% at 6 against Hard (3,000 games). On 64 deals they win 33.4% and 10.4%:
      even with Hard at 3 and still short at 6. On 256 deals they win 17.6% at 6 players
      (2026-11-24), even with Hard within the noise (±1.4). Playouts only catch up to Hard
      at 16 times the cost a label. Hard beats the 16-deal playouts it learned from, so this doesn't
      say whether labels on more deals would make a better Hard: untested.
- [x] Faster learned moves, same moves (2026-11-23): `ranked` scores through `kit/trees.ts`'s
      `scoreFast` into reused buffers. A 200-tree game went from 3.05 to 1.9 ms once warm, a
      full Hard game from 8.7 to 6.6 ms, and 16-deal playouts among rollout players from 4.0 to
      2.4 s a game. Trees are still about 70% of a learned game.
- [ ] Only if playouts need 10× more: the engine and playouts in Rust. A guess of 5–20×, since
      the engine allocates arrays and objects per move. The site, Convex and the review worker
      all run the TypeScript engine, so it'd exist twice or go to WASM for the browser. A Rust or
      WASM scorer alone caps at about 1.5× more: the trees are compiled already.
- [ ] More from the learned player: at 6 players it passes on 1s the default opens with, and
      plays 10s where it plays 1s.
- [x] Use the model to prune playouts to its top moves, and race on more deals, 2026-11-19:
      racing on 512 deals wins 75.7% at 3 players and 56.7% at 6; pruning to the model's top 3
      loses 1 to 5 points at 128 deals and at 512. Against today's default it ties (2026-11-23).
- [ ] A smaller model: 1,000 trees are 24 MB; 200 trees lose 3 to 4 points against the default.
- [x] A mixed strategy: waiting 25%, 50% or 75% of the time loses 1.6 to 7.3 points against the
      default and up to 3.6 against the league (2026-11-24, 4,000 games).
- [x] Non-binding deals on who denies (README "Deals", 2026-11-21): the named denier who reneges
      loses 3 to 11 points, so the deal keeps itself; a player outside it gains 1 to 4 at 3 to 5
      players, and making it alone costs 3 to 5.
- [ ] Why an outsider gains at a deal table: it isn't the battles deal players abandon (only
      holding off opening plays the same). Then a deal outsiders can't exploit, or punishment of
      whoever skipped their turn to deny.
- [ ] Other kinds of deals. So far only "you stop this one" (the next player, or the one furthest
      from winning, denies a winning chip). Try others: taking turns to fight battles, splitting
      colors so two players don't race for the same chip, ganging up on the leader until they
      drop back, and promises to stay out of a battle in exchange for staying out of the next.
      Measure each at a table that makes it, for a player outside it and for one who breaks it.
- [x] What Doves is for (2026-11-21, README "Playing the fate cards", `scripts/fates.ts`): a
      second chance at your own winning chip (+5.4 a chance), keeping the Favor (+4.2), and
      wiping out a battle the others have spent on (+2.7 to +3.4). Rule 2 now plays it for your
      winning chip, or theirs with nobody else in: +2.6 at 3 players. Adding the Favor or spent
      battles to the rule gained nothing more.
- [x] Every fate card the same way (`scripts/fates.ts --card`, 2026-11-21, README "Playing the
      fate cards"): Crows, Winter and Doves lose wherever the default doesn't play them. Crows
      gains once it counts as a card (2026-11-23). Bait back
      while leading by more than 4 with others in, and a Fury before the weakest card while
      leading, adopted into rules 1 and 4: +3.4 to +1.0 against the default, +2.4 to +0.6 against
      the league.
- [ ] Legend gains +3.8 where Winter's out and 1.8 to 2.2 a little behind, where the default plays
      something else. Too thin and scattered for a rule yet.
- [ ] Doves as an option to keep: playouts value a Doves held for a later winning chip? Check
      whether holding it when it would only gain 2 to 4 now pays later.
- [x] The default's waiting leaves stopping a rival to the others, and when everyone waits nobody
      does. In `onyx` (2026-11-19), passing with a chip that would win Bot 1 the game cost 54 and
      66 points. Adopted as `rival` (2026-11-24): take the lead from a leader on game point with
      fewer than 3 others in, +1.9 to +3.9 against the default, +0.3 to +1.9 against the league.
- [ ] Passing on a chip that would have set up a win of our own cost 44 in `onyx`. Not waiting
      for your own setup chip loses 3.7 to 6.5 points against the default, and a 10 there loses
      2.4 to 4.6. Denying another's setup chip loses 3.3 to 8.6 (2026-11-24, 4,000 games). `rival`
      for a leader's setup chip too gains 0.7 to 1.2 at 4–6 players and loses 0.9 at 3, within
      the noise. At 4+ players, against the default without `open`, it gains 0.1 to 0.5 (40,000
      games) and 0.5 to 1.5 against the league, and loses 0.7 to 1.2 against Hard at 4–5 (4,000):
      a bet on weak players, not adopted.
- [x] Played the bots by hand with `scripts/play.ts` (2026-11-24). Medium gave up after 3 cards
      one on one; `chase` without the limit gains 1.5 to 3.3 against the default and 0.6 to 1.7
      against the league, adopted. Hard leaves a rival's game point to the others; making it
      stop the rival itself loses 2.1 at a table of two Hards and Medium, and up to 8.7 against
      the league. Forcing it only when it's the last one in changes nothing: the same win count
      at every table and player count (52,000 games).
- [x] Hard hoards: against three Hards, one passed four battles at once and won the last two chips
      with a full hand. The punishment is being left with cards when a round ends. Among three
      Mediums, Hard is left holding cards in 15.3% of rounds, twice Medium's rate. It throws away
      3.1 cards then, 4.4% of what it's dealt, and still wins 49.7% (2026-11-24, 3,000 games).
      Two other punishments don't pay (4,000 games). Giving up sooner while a big hand sits out
      ties or loses up to 0.6 points against Hard, up to 3.3 against the default and up
      to 2.5 against the league. Doves or Winter on
      a big hand's late spend ties everywhere.
- [x] Dropped each rule for the guide (2026-11-24, 40,000 games). Without `open`, Medium wins 0.4
      to 1.0 points more against the previous default, ties the league and gains 0.1 to 0.6
      against Hard: dropped. Without `press` or `stall` it wins against today's default and loses
      against the league: the cycle, so both stay. `hint` had followed `STEPS` since `rival` and
      the chase limit's removal, so Hard read a pick it wasn't trained on. It's frozen now: 0 of
      369,587 decisions differ from the default the models were trained on.
- [x] Reran the README's tables for the default without `open` (2026-11-25, 302 minutes, in
      `dataset/rt3/`).
- [x] Dropped `stall` (2026-11-25). The cycle reading above was wrong for `stall`: I had only
      measured it together with `one`. Alone, dropping it wins +1.3, +1.7, +1.1 and +0.8 points
      at 3–6 players against the default (40,000 games). It ties the league and Hard (10,000).
      Dropping `one` loses 3.5 to 7.6 points against the league, so `one` stays.
- [x] `one` is a bet on weak players (2026-11-25). Without `stall`, dropping it wins 0.6 to 1.7
      at 4–6 players against the default and 2.3 at 3 against Hard, and loses 2.9 to 5.5
      against the league (40,000 and 10,000 games). Both effects are one on one: a 1 only with
      2+ others in plays like no `one` at all, and a 1 only with 1 other in like the default.
      Limits on cards played (0, 1 or 2) tie or lose (4,000 games).
- [x] Reran the README's tables for the default without `stall` (2026-11-25, 299 minutes, in
      `dataset/rt4/`, rule worths in `rules.md`).
- [x] Card counting (v2 features). On the same data (`dataset/data-c1`), v2 beats v1 by +1.2,
      +0.6, +0.3 and +0.1 at 3–6 players (20,000 games). Both c1 models win 40% at 3 players
      against the previous Hard. c1 is Hard's own games, labeled among Hard's players.
- [x] Round 11, adopted as Hard (2026-11-25, 46 minutes): a mixed round on v2 rows (`data-o4`,
      6,000 games a player count), fit with rounds 3–9, `o1` to `o3` and c1
      (`model-r3456789o1234c`). learn.py fills v1 rows' card counts as missing. At a table of the
      previous Hard it wins 40.6%, 27.7%, 22.7% and 18.6% at 3–6 players. Against the default it
      gains 6.7, 3.2, 3.7 and 5.3 points over the previous Hard. Against the league it gains 5.3
      at 3 players and ties at 4–6 (20,000 games). The same fit without card counting
      (`V1=1`, `model-v1r3456789o1234c`) wins 31.2%, 24.3%, 19.7% and 16.4% at a table of round
      11, and 36.7%, 26.0%, 21.4% and 17.9% at a table of the previous Hard. So card counting is
      about half the gain at 3 players and a third or less at 4–6. Against the league the
      version without it does 0.4 to 1.2 points better at 4–6 players.

## Analysis

- [x] Who wins by seat, and how long games last, at 3 to 6 players.
- [x] What each card is worth in an opening hand, and how that changes with the player.
- [ ] How much is luck: the strongest playouts against the default, and against each other.
- [x] Which color the Favor holder should pick: `pickColor` gets nearly all of the 7 to 10 points.
- [x] Rule readings: each `Rules` flag both ways (`scripts/rules.ts`), 2026-11-19: `emptyFavor`
      comes up in 1.3% to 4% of battles and changes nothing beyond the noise.

## Online

- [x] Play online with bots, as in monopoly-deal (`replay.ts`, `convex/`, `src/components/`).
- [x] Deploy to hilt.visnup.com, 2026-11-19: Convex project `hilt` (team visnup), Vercel project
      `hilt` (team visnu), deployed from GitHub on every push to `main`.
