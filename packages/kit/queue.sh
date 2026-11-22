#!/bin/bash
# Runs a command once no round or other queued job holds the cores:
#   bash ../../packages/kit/queue.sh node scripts/strong.ts
. "$(dirname "$0")/lock.sh"
lock "$*"
exec "$@"
