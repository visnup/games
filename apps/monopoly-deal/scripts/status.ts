import { existsSync, readdirSync } from "node:fs";
import { count, serve, trees } from "kit/status.ts";

const lines = (file: string, of: number) => count(file, / deals, /g) / of;

serve({
  port: 3011,
  // labeling is by game-seats
  counts: [
    [2, 2],
    [3, 3],
    [4, 4],
    [5, 5],
  ],
  minutes: { "rollout model": 3, data: 90, extract: 1, train: 4, "compare learned": 3, "compare playouts": 10 },
  progress(run, stage, dir) {
    const features = `dataset/features-r${run.round}`;
    if (stage === "rollout model") return trees(`${dir}/rollout.txt`, run.strong!);
    if (stage === "extract") return existsSync(features) ? readdirSync(features).length / (run.shards! * 4 * 3) : 0;
    if (stage === "train") return trees(`${dir}/trees.txt`, run.trees);
    if (stage === "compare learned") return lines(`${dir}/compare.txt`, 4);
    if (stage === "compare against learned") return lines(`${dir}/field.txt`, 4);
    if (stage === "compare playouts") return lines(`${dir}/playouts.txt`, 2);
    if (stage.startsWith("compare against r")) return lines(`${dir}/base.txt`, 4);
  },
  colors: { background: "#1d6b4a", ink: "#ffffff", bar: "#ffffff26", accent: "#f2c94c", temp: "#ffab91" },
});
