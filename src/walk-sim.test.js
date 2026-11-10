import { test } from "node:test";
import assert from "node:assert/strict";
import { crossingDirection, placeLabels, occlusionOf } from "./walk-sim.js";

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

const label = (text, centreX, top, bottom, priority) => ({ text, width: 40, height: 12, centreX, top, bottom, priority });

test("labels that do not touch both sit above their boxes", () => {
  const placed = placeLabels([label("a", 50, 100, 160, 1), label("b", 200, 100, 160, 2)], [], 400);
  assert.deepEqual(placed.map((p) => [p.text, p.y]), [["b", 85], ["a", 85]]);
});

test("when two labels would overlap, the nearer person keeps the spot above and the other moves below", () => {
  const placed = placeLabels([label("far", 60, 100, 140, 40), label("near", 70, 100, 200, 100)], [], 400);
  const byText = Object.fromEntries(placed.map((p) => [p.text, p]));
  assert.equal(byText.near.y, 85);
  assert.equal(byText.far.y, 143);
});

test("a label blocked above and below is left out", () => {
  const blocked = [{ x: 0, y: 80, w: 400, h: 20 }, { x: 0, y: 140, w: 400, h: 20 }];
  assert.deepEqual(placeLabels([label("hidden", 60, 100, 140, 1)], blocked, 400), []);
});

test("a label never leaves the canvas", () => {
  const placed = placeLabels([label("edge", 10, 100, 160, 1)], [], 400);
  assert.equal(placed[0].x, 0);
});

const person = (x, y, depth, w = 20, h = 60) => ({ box: { x, y, w, h }, depth });

test("someone standing right behind a nearer person, head covered, is hidden", () => {
  // The nearer person is bigger in the picture and reaches up past the farther one's head.
  const [near, far] = occlusionOf([person(100, -5, 3, 20, 80), person(100, 0, 6)]);
  assert.equal(near, false);
  assert.equal(far, true);
});

test("the nearer of two people is never hidden by the farther one", () => {
  const [near] = occlusionOf([person(100, 0, 3), person(100, 10, 6)]);
  assert.equal(near, false);
});

test("people side by side, heads clear of each other, are not hidden", () => {
  assert.deepEqual(occlusionOf([person(100, 0, 3), person(125, 0, 3.2)]), [false, false]);
});

test("a nearer person's arm reach at the edge of their box does not count as covering", () => {
  // Only the middle 60% of the nearer box covers; a head just inside its outer edge stays clear.
  const [, far] = occlusionOf([person(100, -5, 3, 20, 80), person(114, 0, 6)]);
  assert.equal(far, false);
});
