import { count, serve, trees } from "kit/status.ts";

// rough minutes for each player count's games, which weigh them in the labeling; update from a round's log
const counts = [
  [3, 10],
  [4, 10],
] as const;

serve({
  port: 3031,
  counts,
  minutes: { data: counts.reduce((s, [, m]) => s + m, 0), train: 5, compare: 8, "train rollout": 1 },
  progress(run, stage, dir) {
    if (stage === "train") return trees(`${dir}/trees.txt`, run.trees);
    if (stage === "compare") return count(`${dir}/compare.txt`, /^\| learned /gm) / run.compares!;
    if (stage === "train rollout") return trees(`${dir}/trees-rollout.txt`, 50);
  },
  colors: { background: "#fbf7f9", ink: "#2a1022", bar: "#2a102214", accent: "#de35a2", temp: "#e0662f" },
});
