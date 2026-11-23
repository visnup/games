import assert from "node:assert/strict";
import { test } from "node:test";
import { hard } from "./hard.ts";
import { headToHead } from "./strategies.ts";

test("the packed Hard bot beats a table of Medium bots", () => {
  const { wins, stalled } = headToHead(hard, 4, 1, 200);
  assert.equal(stalled, 0);
  assert.ok(wins > (1.25 * 200) / 4, `${wins} of 200`);
});
