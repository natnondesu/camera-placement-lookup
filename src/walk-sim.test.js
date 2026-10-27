import { test } from "node:test";
import assert from "node:assert/strict";
import { crossingDirection } from "./walk-sim.js";

test("walking toward the camera across the line counts in", () => {
  assert.equal(crossingDirection(4.7, 4.55, 4.6), "in");
});

test("walking away from the camera across the line counts out", () => {
  assert.equal(crossingDirection(4.5, 4.65, 4.6), "out");
});

test("landing exactly on the line counts once, in the direction of travel", () => {
  assert.equal(crossingDirection(4.7, 4.6, 4.6), "in");
  assert.equal(crossingDirection(4.6, 4.55, 4.6), null);
});

test("moving without reaching the line counts nothing", () => {
  assert.equal(crossingDirection(5.2, 5.0, 4.6), null);
  assert.equal(crossingDirection(3.0, 3.2, 4.6), null);
});
