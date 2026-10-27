import { test } from "node:test";
import assert from "node:assert/strict";
import { crossingDirection, pixelsPerMetre } from "./walk-sim.js";
import { evaluatePlacement, recommendedDistance } from "./placement-rule.js";
import { readFileSync } from "node:fs";

const rules = JSON.parse(readFileSync(new URL("../rules/scene-profiles.json", import.meta.url), "utf8"));
const openDoor = rules.profiles.find((p) => p.id === "open_door");

test("pixels per metre is the image width over the width covered at that distance", () => {
  // 90 deg horizontal view at 5 m covers 10 m, so 1920 px spread over 10 m
  assert.ok(Math.abs(pixelsPerMetre(1920, 90, 5) - 192) < 1e-9);
});

test("pixels per metre halves when the distance doubles", () => {
  assert.ok(Math.abs(pixelsPerMetre(2592, 61.9, 10) * 2 - pixelsPerMetre(2592, 61.9, 5)) < 1e-9);
});

test("pixels per metre at the counting line matches the console's resolution density", () => {
  const camera = { sensorWidthMm: 4.8, focalLengthMm: 4, resolution: { w: 2592, h: 1944 } };
  const heightM = 4;
  const distanceM = recommendedDistance(heightM, openDoor);
  const result = evaluatePlacement({ profile: openDoor, heightM, distanceM, camera });
  const slant = Math.hypot(heightM, distanceM);
  assert.ok(Math.abs(pixelsPerMetre(2592, result.optics.horizontalFovDeg, slant) - result.optics.pixelsPerMetre) < 1e-9);
});

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
