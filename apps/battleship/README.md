# Battleship

Battleship is the guessing game Milton Bradley turned into plastic pegs. Each player hides five
ships on a 10×10 grid. Then the players take turns calling out cells ("B7!") until one fleet is
gone. Battleship looks like pure luck. The game isn't quite luck. Some cells are likelier to hold
a ship. Some ways of hunting waste fewer shots. Some ways of hiding are easy to read.

This repo counts every legal arrangement of the fleet exactly. It also plays millions of games
between simulated shooters and hiders. Those games answer the questions that come up at the
table: where ships usually are, how to hunt them, where to hide yours, and what to do when your
opponent always hides along the edges. There's also a [cheat sheet](https://battleship.visnup.com)
to play with.

The answers come from the model. They don't come from real tables. We made up the hiders' habits.
Nobody measured them from real players.

We wrote the simulator and this analysis with Claude Opus 5.5 in Claude Code.

## A quick refresher

Hasbro's rules use a 10×10 grid with rows A–J and columns 1–10. Each player has five ships. Ships
lie in straight lines, horizontal or vertical. Ships may touch each other. They may not overlap.

| ship | length |
| --- | --- |
| Carrier | 5 |
| Battleship | 4 |
| Cruiser | 3 |
| Submarine | 3 |
| Destroyer | 2 |

That's 17 cells of ship in 100. Each shot is answered hit or miss. The shot that finishes a ship
is answered with the ship's name ("You sank my battleship!").

## How to read the numbers

**Shots** is the measure throughout: how many shots it takes to sink the whole fleet. Fewer is
better for the shooter. More is better for the hider. Every ship cell must be hit. Shots are
always 17 plus the misses.

**Most tables come from one big dataset.** The dataset has 50,000 games for every pair of shooter
and hider. Every shooter faces the same fleets. Averages from the dataset are good to about ±0.1
shots. The smaller experiments say how big a difference has to be before it means something.

The raw data is in `results/` as Parquet. It has a row per arrangement count, sampled fleet, game
or shot. `make` regenerates the data and redraws `charts/`. That takes about 90 seconds on 20
cores. Each section names the script behind it. The tables below are from 2026-11-05.

## Where ships are

*From `node scripts/count.ts`.*

There are exactly **30,093,975,536** ways to lay out the fleet. That's too many to visit one by
one. Instead, the count lays the first three ships every way it can. Then it counts the last two
ships' non-overlapping pairs from how many of their placements cover each cell. A test checks the
method against brute force on a 5×5 board.

If every arrangement is equally likely, this is the chance each cell holds a ship:

![Exact chance each cell holds a ship](charts/heat.svg)

**The middle is almost three times as likely as a corner:** 21% against 8%. More placements cross
a central cell than an edge one. A ship can reach a corner only two ways. The bigger the ship,
the stronger the pull. The carrier sits on a center cell 7.5% of the time against 2.1% for a
corner. The destroyer barely cares: 2.4% against 1.3%.

![Exact chance each cell holds each ship](charts/ships.svg)

**Most programs don't place ships at random.** The usual way to place a random fleet drops each
ship somewhere. If the ship overlaps one already down, the program tries that ship again. That
isn't uniform. The big ships go first. They land on an empty board whose middle isn't crowded
yet. Naive placement puts up to 1.1 points too much in the middle. It puts about as much too
little on the rim. Sampling noise here is about 0.1 points. Redrawing the whole fleet on any
overlap is uniform. Redrawing costs little: 39% of tries fit.

![Naive placement's bias against the exact chances](charts/naive.svg)

## Shooting

*From `node scripts/games.ts`, against uniformly random fleets.*

Four shooters (`src/shooters.ts`):

- **random** fires anywhere it hasn't yet.
- **hunt** fires at random until it hits. Then it works through the hit's neighbors.
- **parity** is hunt that hunts only on one color of a checkerboard. Every ship covers both
  colors.
- **density** counts how many placements of the ships still afloat could cover each unshot cell.
  A placement can't cross a miss or a sunk ship. Density fires at the cell with the most. While
  there are hits no sunk ship accounts for, placements through them count 100× per hit. Jeremy
  Berry and DataGenetics popularized this method.

![Distribution of shots to sink the fleet](charts/shots.svg)

| shooter | average | median | 10th–90th percentile | fewest | most |
| --- | --- | --- | --- | --- | --- |
| random | 95.4 | 97 | 89–100 | 57 | 100 |
| hunt | 66.0 | 66 | 49–83 | 24 | 100 |
| parity | 61.0 | 62 | 49–72 | 27 | 82 |
| density | 44.8 | 44 | 33–58 | 20 | 73 |

**Random fire nearly always clears the board:** the last ship cell is, on average, the 95th of
100. **Hunting halves that.** Parity saves another 5 shots by cutting off the long games. Hunting
only half the board can't run long: parity's 90th percentile is 72 against hunt's 83. **Density
saves 16 more.**

This chart shows each shot's chance of hitting among games still going. It's a 5-shot moving
average:

![Hit rate by shot](charts/hit-rate.svg)

Random sits at the 17% base rate until the end. At the end, the only cells left are ship. The
others spike after the first hits. Then they slowly decay as the easy ships go. Density's first
shot lands on a center cell and hits 21.5% of the time. Density's hit rate peaks at 52% on shot
6.

This chart shows where each shooter fires in its first 20 shots. Density works outward from the
four center cells along a checkerboard. Each center cell is density's first shot a quarter of the
time. Parity's checkerboard shows. Hunt and random spread evenly.

![Where each shooter fires first](charts/first-shots.svg)

Density sinks the carrier first because the carrier sits where the heat is. The average carrier
sink comes on shot 18. Density sinks the destroyer last. The average destroyer sink comes on shot
35. Random sinks the destroyer first only because the destroyer has the fewest cells to find.

![When each ship sinks](charts/sinks.svg)

### Seeking information instead of hits

*From `node scripts/posterior.ts`, 2,000 uniform fleets, about three minutes.*

Density only approximates the odds. Its 100× per hit is a rule of thumb. The rule isn't a
probability. `posterior` computes the odds exactly. It keeps 1,000 fleets drawn uniformly from
every arrangement still consistent with the shots, the sinks, and the order the ships sank in.
From those fleets it can fire for hits or for information:

- **exact** fires where the most of those fleets have a ship.
- **info** fires where the answer is least predictable. The answer is miss, hit, or which ship
  sank. Info takes a sure hit only when nothing else is uncertain.

| shooter | shots | first hit |
| --- | --- | --- |
| density | 45.0 | 4.2 |
| exact | 44.8 | 4.3 |
| info | 45.3 | 4.1 |

**Neither exact odds nor information beats the rule of thumb.** All three are within ±0.55 shots
of each other. Seeking information can't help much in this game:

- Every ship cell has to be shot anyway. Knowledge pays only when it prevents a later miss.
- While searching, no cell is more than about 21% likely to hold a ship. Below 50%, the least
  predictable cell is simply the likeliest one. Exact and info fire at the same cells.
- Exact and info only part ways after a hit. There info prefers a 50/50 cell to a near-sure hit.
  That mostly reorders shots that have to be taken anyway.

## Hiding

*From `node scripts/placements.ts` and `node scripts/games.ts`.*

Five ways to hide a fleet (`src/fleets.ts`):

- **uniform**: every arrangement is equally likely.
- **edges**: every ship lies along the outer ring.
- **spread**: no two ships touch orthogonally or diagonally.
- **clustered**: each ship touches one already placed.
- **cold**: the coldest of 100 uniform fleets on the exact heat map above. That puts the fleet
  where a density shooter looks last.

![Where each placer puts ships](charts/placers.svg)

There are two more kinds of shooter. **tuned** knows your habit. Tuned is density that weighs
each placement of each ship by how often the hider uses it. "Tuned edges" expects a fleet on the
rim. **adaptive** doesn't know your habit. Adaptive works out the habit as it goes (see the next
section).

This chart puts every shooter against every hider. Blue means more shots than density against
uniform. Red means fewer:

![Every shooter against every hider](charts/matrix.svg)

**Against a density shooter that doesn't know your habit, hug the edges:** 51.4 shots. That's 6.6
more than a uniform fleet. Cold gets 4.8 more. Edges and cold both hide where density looks last.
Density's first hit takes 15.8 shots against an edge fleet. It takes 10.1 against a cold one and
4.2 against uniform.

**If they know, edges is the worst choice there is:** 23.8 shots. That's not far above the 17
cells of ship. Cold falls to 39.3. A habit that beats the standard shooter is exactly what a
shooter learns to exploit.

**Against hunt, spread out. Against density, it doesn't matter.** Hunt chews through a cluster in
37.1 shots. Every neighbor of a hit is likely another ship. Hunt wastes shots around spread
fleets: 73.9. Density assumes neither pattern. Against density, spread and clustered are both
within half a shot of uniform.

**A uniform fleet can't be exploited much.** Its worst case is 44.7 shots against the shooter
tuned for it. That's only 0.1 fewer than plain density. Being uniform buys exactly that: no habit
to learn.

### Working out the opponent's habit

`adaptive` keeps 100,000 sampled fleets of each habit. After every shot, adaptive drops the
fleets the shot rules out. The share of each habit's fleets still standing is how likely that
habit is. Adaptive fires as density tuned to a blend of the habits. Each habit's weight is its
likelihood. Once fewer than 20 fleets of every habit fit, those shares are noise. Then adaptive
stops updating them.

| hider | density | tuned to the true habit | adaptive |
| --- | --- | --- | --- |
| uniform | 44.8 | 44.7 | 45.7 |
| edges | 51.4 | 23.8 | 24.4 |
| spread | 45.2 | 44.2 | 45.4 |
| clustered | 44.9 | 42.7 | 44.2 |
| cold | 49.6 | 39.3 | 41.7 |

**Adaptive gets nearly all of a tuned shooter's gain without being told the habit.** Against an
edge fleet adaptive takes 24.4 shots. Tuned edges takes 23.8. Against cold adaptive takes 41.7.
Tuned cold takes 39.3. **Not knowing costs about a shot** against fleets with no habit to find:
adaptive takes 45.7 against a uniform fleet. Density takes 44.8.

#### Making it better

*From `node scripts/adaptive.ts`, 2,000 fleets per hider, about 2 minutes.*

These variants of adaptive play the same fleets. The table shows each variant as shots more or
fewer than adaptive. It adds four hiders adaptive has never seen. **naive** is naive placement.
**half edges** puts the carrier and battleship on the rim and the rest anywhere. The last two
rows are dial settings between the grid's (see below).

| hider | adaptive | density | 20,000 fleets | mostly-uniform prior | probing | dials |
| --- | --- | --- | --- | --- | --- | --- |
| uniform | 45.7 | −0.8 | +0.2 | −0.8 | +4.1 | +0.5 |
| edges | 24.6 | +26.9 | +0.4 | +0.2 | +9.1 | −0.7 |
| spread | 45.4 | −0.2 | +0.3 | −0.4 | +5.1 | −0.4 |
| clustered | 44.5 | +0.7 | +0.4 | +0.1 | +2.0 | +1.8 |
| cold | 41.9 | +7.7 | −0.1 | +1.4 | +1.0 | +0.3 |
| naive | 45.5 | −0.6 | +0.2 | −0.2 | +4.1 | +0.8 |
| half edges | 47.3 | −1.7 | +0.4 | −0.5 | +1.5 | −0.2 |
| rim 0.4, clustered | 46.2 | +1.6 | −0.8 | 0.0 | +1.0 | −2.2 |
| rim 0.6, spread | 40.8 | +8.3 | −0.2 | +0.4 | +2.9 | −2.7 |

Differences are good to about ±0.5 shots.

**More sample fleets help a little.** With only 20,000 fleets per habit, the shares run out
sooner. Adaptive stops learning earlier. That costs a few tenths of a shot.

**A prior is a trade.** A prior isn't a gain. Starting 60% sure the fleet is uniform wins back up
to 0.8 shots against fleets with no habit. That prior loses more against the habits it's meant to
catch: 1.4 shots against cold. Adaptive starts with the habits equally likely.

**Probing costs shots everywhere.** One version fires where the habits disagree most until one
habit is 95% likely. That version gives up 1 to 9 shots. The habit gives itself away without
probing: a few misses in the middle betray an edge fleet. Probe shots are mostly misses.

**Which ship sank doesn't help.** One variant also dropped sample fleets whose sunk ship didn't
match. In an earlier run that variant did worse by 1.4 shots against clustered fleets. So few
sample fleets match a sink exactly that the shares get noisy. Adaptive goes by hits and misses
only.

**A hider adaptive doesn't know costs it about what a uniform one does.** Against half edges,
adaptive is 1.7 shots behind density. Against uniform it's 0.8 behind. A partial habit doesn't
fool adaptive into a worse blend. The habit just isn't worth chasing.

**Habits as dials fit more hiders.** They also blur the habits adaptive knew. The **dials**
variant knows a grid of habits in place of the five. One dial is the chance each ship goes on the
rim: 0, ¼, ½, ¾ or 1. The other dial says whether each ship after the carrier must touch one
already placed, must not touch any, or may do either. That's 15 settings plus cold. Each setting
has 100,000 sample fleets (`dialed` in `src/fleets.ts`). Against settings between the grid's,
dials saves 2.2 to 2.7 shots. Against edges it saves 0.7. Dials gives back 1.8 against clustered
fleets. It gives back up to 0.8 against fleets with no habit. Its belief spreads over neighbors
of the right habit. Against half edges, dials doesn't help. Half edges is a habit outside both
families. Adaptive keeps the five habits. The grid is the better bet only if real players turn
out to sit between them.

### The best mix

*From `node scripts/equilibrium.ts`.*

If both players know each other's options, Battleship is a zero-sum game. The hider picks a habit
to maximize shots. The shooter picks a shooter to minimize them. Each player mixes so the other
can't exploit the mix. `equilibrium.ts` leaves out random. It solves the game by fictitious play
over the matrix above:

![Best mixes for hider and shooter](charts/equilibrium.svg)

**Hide uniformly most of the time:** 72% uniform, 19% clustered and 9% cold. The shooter mixes
density tuned for uniform (57%), adaptive (39%) and tuned clustered (4%). That mix holds the
shooter to **45.1 shots**. That's only 0.3 more than a uniform fleet gets against plain density.

Without adaptive, the best mix was quite different. The hider clustered 58% of the time and went
cold 38% of the time. That held the shooter to 46.2 shots. Habits pay only against a shooter that
can't learn them mid-game. Adaptive's worst case is 45.7. That's barely more than the 45.1 the
best mix promises.

## Going first

*From `node scripts/games.ts`.*

Both players shoot in turn. Whoever sinks the other's fleet in fewer shots wins. The player who
shoots first wins ties. Two density shooters against uniform fleets tie 3.1% of the time. So
**going first wins 51.5%**. Going first wins 51.1% for hunt and 51.6% for parity. It wins 54.8%
for random. Random's games bunch up near 100 shots and tie most.

## More findings

**Touching ships used to send density off the rails.** When ships touch, more than one line of
hits can explain a sink. Density used to commit to one line. When density picked the wrong line,
the ship left afloat no longer fit anywhere. Then density fired cell by cell. One game against a
cluster took 95 shots. In that game the destroyer sank at B6. Density claimed B6–B7. B7 was the
battleship's. 16 of 250,000 games took more than 75 shots. Now density reconsiders its claims
after every shot. It keeps claims that leave every ship afloat somewhere to be and every other
hit explained. Density's longest of 250,000 games is now 75 shots. Its averages didn't move.

## Cheat sheet

[battleship.visnup.com](https://battleship.visnup.com) (`cheat/`) is a page to play a real game
with. Tap the cell you fired at. Then say miss, hit, or which ship sank. The page greys out
answers no fleet could give. The page shades the board by the algorithm you pick. It lists every
algorithm's next shot. Beside each tuned shooter, it shows adaptive's odds on that shooter's
habit. To keep the download small, the page's adaptive uses 20,000 sample fleets per habit. That
costs a few tenths of a shot. `pnpm dev` serves the page with Vite. `pnpm build` builds it into
`cheat/dist/`.

## Next

`TODO.md` has what's left: lookahead, rule variants, and shooters that learn across a series of
games.
