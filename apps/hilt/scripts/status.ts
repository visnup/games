import { count, serve, trees } from "kit/status.ts";

// rough minutes for each player count's games, from round 8, which weigh them in the labeling
const counts = [
  [3, 19],
  [4, 9],
  [5, 13],
  [6, 17],
] as const;

serve({
  port: 3021,
  counts,
  minutes: { data: counts.reduce((s, [, m]) => s + m, 0), train: 5, compare: 8, "train 200": 2 }, // from round 8
  progress(run, stage, dir) {
    if (stage === "train") return trees(`${dir}/trees.txt`, run.trees);
    if (stage === "compare") return count(`${dir}/compare.txt`, /^\| learned /gm) / run.compares!;
    if (stage === "train 200") return trees(`${dir}/trees-200.txt`, 200);
  },
  colors: { background: "#3a1430", ink: "#ffffff", bar: "#ffffff26", accent: "#de35a2", temp: "#ffab91" },
});
