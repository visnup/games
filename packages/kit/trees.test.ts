import assert from "node:assert/strict";
import { test } from "node:test";
import { flatten, pack, score, scoreAll, unpack } from "./trees.ts";

const leaf = (leaf_value: number) => ({ leaf_value });
const json = {
  v: 3,
  tree_info: [
    { tree_structure: { split_feature: 0, threshold: 0.5, left_child: leaf(1), right_child: { split_feature: 1, threshold: 2, left_child: leaf(10), right_child: leaf(100) } } },
    { tree_structure: { split_feature: 1, threshold: 1, left_child: leaf(-0.25), right_child: leaf(0.25) } },
    { tree_structure: leaf(1000) },
  ],
};
const xs = [
  [0, 0],
  [0.5, 3],
  [1, 2],
  [1, 3],
].map((x) => Float64Array.from(x));
const scores = [1000.75, 1001.25, 1010.25, 1100.25];

test("a forest scores by each tree's leaf", () => {
  assert.deepEqual(
    xs.map((x) => score(flatten(json), x)),
    scores,
  );
});

test("scoreAll matches score, whatever the shared features", () => {
  const forest = flatten(json);
  const same = xs.map((x) => Float64Array.of(x[0], x[1]));
  for (const x of same) x[0] = same[0][0];
  for (const shared of [0, 1]) {
    assert.deepEqual(
      [...scoreAll(forest, same, shared)],
      same.map((x) => score(forest, x)),
    );
  }
});

test("a forest survives being packed", () => {
  const forest = flatten(json);
  const back = unpack(pack(forest));
  assert.equal(back.v, 3);
  for (const key of ["roots", "feature", "threshold", "right"] as const) assert.deepEqual([...back[key]], [...forest[key]]);
  assert.deepEqual(
    xs.map((x) => score(back, x)),
    scores,
  );
});

test("a model from before versions is version 1", () => {
  assert.equal(flatten({ tree_info: json.tree_info }).v, 1);
});
