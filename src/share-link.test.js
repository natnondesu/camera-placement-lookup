import { test } from "node:test";
import assert from "node:assert/strict";
import { encodePlacement, decodePlacement } from "./share-link.js";

const full = {
  rulesVersion: "2026-10-27",
  scene: "open_door",
  camera: "dahua_hdbw2531r_zs_s2",
  focalMm: 2.7,
  resolution: { w: 2592, h: 1944 },
  sensor: null,
  solve: "distance",
  heightM: 4,
  distanceM: 4.6,
  tiltDeg: null,
  entranceM: 5,
  verdict: "best",
  site: "Central World",
  location: "ทางเข้า A, camera 1",
};

test("a placement survives the round trip through a link", () => {
  assert.deepEqual(decodePlacement(encodePlacement(full)), full);
});

test("a hand-set tilt and a custom sensor are carried when present", () => {
  const custom = { ...full, camera: "custom", sensor: "1/2.7", tiltDeg: 31.5, solve: "manual", distanceM: 5.25 };
  assert.deepEqual(decodePlacement(encodePlacement(custom)), custom);
});

test("the link stays short: numbers drop trailing zeros and empty fields are left out", () => {
  const hash = encodePlacement({ ...full, site: "", location: "" });
  assert.match(hash, /(^|&)h=4(&|$)/);
  assert.match(hash, /(^|&)d=4\.6(&|$)/);
  assert.doesNotMatch(hash, /site=|loc=|t=|sn=/);
});

test("no entrance width decodes as no entrance check", () => {
  assert.equal(decodePlacement(encodePlacement({ ...full, entranceM: null })).entranceM, null);
});

test("a hash with or without the leading # decodes the same", () => {
  const hash = encodePlacement(full);
  assert.deepEqual(decodePlacement("#" + hash), decodePlacement(hash));
});

test("a hash that is not a placement decodes as nothing", () => {
  assert.equal(decodePlacement(""), null);
  assert.equal(decodePlacement("#top"), null);
});

test("unreadable numbers are dropped rather than guessed", () => {
  const placement = decodePlacement("s=open_door&h=abc&d=4.6");
  assert.equal(placement.heightM, null);
  assert.equal(placement.distanceM, 4.6);
});
