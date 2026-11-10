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
  offsetM: -1.25,
  panDeg: null,
  landing: "top",
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

test("a pan set by hand is carried; a camera aimed at the middle leaves it out", () => {
  const panned = { ...full, panDeg: -12.5 };
  assert.deepEqual(decodePlacement(encodePlacement(panned)), panned);
  assert.doesNotMatch(encodePlacement(full), /(^|&)p=/);
  assert.equal(decodePlacement("s=open_door&h=4&d=4.6").panDeg, null);
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

test("a link from before the camera could sit off-centre decodes with no offset", () => {
  assert.equal(decodePlacement("s=open_door&h=4&d=4.6").offsetM, null);
});

test("a centred camera leaves the offset out of the link", () => {
  assert.doesNotMatch(encodePlacement({ ...full, offsetM: 0 }), /(^|&)o=/);
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

test("the landing is written only for the Escalator scene and survives the round trip", () => {
  const escalator = { ...full, scene: "escalator", landing: "bottom", entranceM: 2.6 };
  assert.match(encodePlacement(escalator), /(^|&)l=bottom(&|$)/);
  assert.deepEqual(decodePlacement(encodePlacement(escalator)), escalator);
  assert.doesNotMatch(encodePlacement({ ...full, landing: "bottom" }), /(^|&)l=/);
});

test("a landing that is missing or not top or bottom decodes as the top landing", () => {
  assert.equal(decodePlacement("s=escalator&h=4&d=4.6").landing, "top");
  assert.equal(decodePlacement("s=escalator&h=4&d=4.6&l=sideways").landing, "top");
  assert.equal(decodePlacement("s=escalator&h=4&d=4.6&l=bottom").landing, "bottom");
});
