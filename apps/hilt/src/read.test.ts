import assert from "node:assert/strict";
import { test } from "node:test";
import type { Card } from "./cards.ts";
import { defaultPolicy, Game, mulberry32 } from "./game.ts";
import { advice, gamePoints, leaders, standing } from "./read.ts";

const force = (value: number): Card => ({ kind: "force", value });

function battle() {
  const game = new Game({ players: 3, rng: mulberry32(1) });
  game.fighting = true;
  game.color = "pink";
  game.favor = 2;
  for (const p of game.players) p.hand = [];
  return game;
}

test("standing names the lowest force card that leads, and the cheapest in hand", () => {
  const game = battle();
  const [me, rival] = game.players;
  rival.row = [force(4)];
  me.hand = [force(2), force(6), force(10)];
  // a 4 ties on strength, cards played and highest card, and seat 0 is first clockwise from the Favor
  assert.deepEqual(standing(game, me), { kind: "behind", by: 4, need: 4, have: me.hand[1] });
  assert.deepEqual(leaders(game, me), [me.hand[1], me.hand[2]]);
});

test("standing says when passing wins, and when no one card leads", () => {
  const game = battle();
  const [me, rival, third] = game.players;
  me.row = [force(3)];
  rival.passed = third.passed = true;
  assert.deepEqual(standing(game, me), { kind: "win" });
  me.row = [];
  rival.row = [force(10), force(10)];
  me.hand = [force(6)];
  assert.deepEqual(standing(game, me), { kind: "behind", by: 20, need: undefined, have: undefined });
});

test("game points are the seats a chip would win the game for", () => {
  const game = battle();
  game.players[1].chips = [2, 0, 0];
  game.players[2].chips = [0, 1, 1];
  assert.deepEqual(gamePoints(game, "pink"), [1, 2]);
  assert.deepEqual(gamePoints(game, "orange"), []);
});

test("advice is the default's move", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const game = new Game({ players: 4, rng: mulberry32(seed) });
    game.fighting = true;
    game.color = "pink";
    const p = game.players[(game.favor + 1) % 4];
    assert.deepEqual(advice(game, p).move, defaultPolicy.move(game, p));
  }
});
