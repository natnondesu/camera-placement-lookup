import { test } from "node:test";
import assert from "node:assert/strict";
import { placeTourPopover } from "./tour-placement.js";

const viewport = { width: 1440, height: 900 };
const pop = { width: 320, height: 140 };

test("the caption sits below a control that has room under it", () => {
  const spot = placeTourPopover({ left: 100, top: 120, width: 200, height: 40 }, pop, viewport);
  assert.equal(spot.side, "below");
  assert.equal(spot.top, 120 + 40 + 14);
  assert.equal(spot.left, 100);
});

test("the caption goes above a control near the bottom of the screen", () => {
  const spot = placeTourPopover({ left: 100, top: 780, width: 200, height: 60 }, pop, viewport);
  assert.equal(spot.side, "above");
  assert.equal(spot.top, 780 - 14 - 140);
});

test("the caption stays inside the screen at the right edge", () => {
  const spot = placeTourPopover({ left: 1300, top: 120, width: 120, height: 40 }, pop, viewport);
  assert.equal(spot.left, 1440 - 12 - 320);
});

test("a control taller than the free space gets the caption pinned inside the screen's bottom", () => {
  const spot = placeTourPopover({ left: 0, top: 60, width: 1440, height: 800 }, pop, viewport);
  assert.equal(spot.side, "inside");
  assert.equal(spot.top, 900 - 12 - 140);
});

test("on a narrow phone the caption spans the screen less the margins", () => {
  const phone = { width: 400, height: 800 };
  const spot = placeTourPopover({ left: 20, top: 100, width: 360, height: 60 }, { width: 600, height: 150 }, phone);
  assert.equal(spot.left, 12);
  assert.equal(spot.width, 400 - 24);
});
