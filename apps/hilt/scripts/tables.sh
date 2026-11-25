#!/bin/bash
# Reruns every README table played by or against today's default, after the default changes: each
# run at a tiny size first, so a mistake shows in a minute, then for real. The rounds' own tables
# and the fate-card playouts are history and stay as they are. Logs to dataset/r$ROUND/log.txt and
# the tables to dataset/r$ROUND/tables.md.
#   ROUND=t1 bash ../../packages/kit/queue.sh bash scripts/tables.sh
set -eo pipefail
cd "$(dirname "$0")/.."
L=dataset/r${ROUND:?}
mkdir -p "$L"
exec > >(tee -a "$L/log.txt") 2>&1

STRONG="the default|Crows while leading|deny every|with nobody else in, only|press with the strongest|no 1 once|behind with others in, Bait back a 1|Crows whenever|open with a 1 or Fury with nobody|pass when ahead with an empty|no Bait back after|pass only at|open with a 1 or Fury before|pass when ahead with something|open battles|the first default"
DENY="deny every winning chip (previous)"
OPEN="open battles (previous)"
DEAL="deal: the next player denies"

tables() {
  for p in 3 4 5 6; do job "seats $p" sim --players $p --n 100000; done
  job cards cards
  job rules rules
  job strategies strategies
  job chips variants --n 40000 --only "the default|chip"
  job discard variants --n 40000 --only "the default|never discard|discard by"
  job "fate cards" variants --n 10000 --only "the default|never play"
  job "fate cards, league" variants --n 10000 --field league --only "the default|never play"
  job "the Crows fix" variants --n 40000 --only "the default|Crows while leading"
  job "the Crows fix, league" variants --n 40000 --field league --only "the default|Crows while leading"
  job "free riders: table denies" variants --n 40000 --players 4,5,6 --field "$DENY" --only "the default"
  job "free riders: table leaves it" variants --n 40000 --players 4,5,6 --only "$DENY"
  job "free riders: table opens" variants --n 40000 --players 4,5,6 --field "$OPEN" --only "the default|$DENY"
  job "deals: at a table of the deal" variants --n 10000 --field "$DEAL" --only "$DEAL|the default"
  job "deals: never denies" variants --n 10000 --field "$DEAL" --only "deal: the next player denies, but"
  job "deals: at a table of defaults" variants --n 10000 --only "$DEAL"
  job "Hard against the default" variants --n 20000 --only "the learned player"
  job "Hard against the league" variants --n 20000 --field league --only "the learned player"
  job "playouts" strategies --n 4000 --only "deep playouts,playouts,quick playouts,racing playouts,pruned racing playouts,long racing playouts,long pruned racing playouts"
  job "knowing the table" variants --n 4000 --field league --only "the default|playouts on 8|playouts on 32"
  job strong variants --n 6000 --players 3,6 --field playouts --only "$STRONG"
}

echo "$(date) tables ${ROUND}: smoke test"
job() {
  shift
  local s=$1
  shift
  local a=()
  while [ $# -gt 0 ]; do
    if [ "$1" = --n ]; then shift; else a+=("$1"); fi
    shift
  done
  timeout 10m node "scripts/$s.ts" "${a[@]}" --n 8 >/dev/null
}
tables

echo "$(date) tables ${ROUND}: the real thing"
: >"$L/tables.md"
start=$(date +%s)
job() {
  local name=$1 s=$2
  shift 2
  echo "### $name" >>"$L/tables.md"
  timeout 6h node "scripts/$s.ts" "$@" | tee -a "$L/tables.md"
  echo "  [$((($(date +%s) - start) / 60)) min, $(date +%H:%M)] $name"
}
tables
echo "$(date) tables ${ROUND}: done"
