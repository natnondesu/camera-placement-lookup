import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  feetAngle,
  faceAngle,
  judgeFeet,
  judgeFace,
  recommendedDistance,
  faceLineDistance,
  recommendedTilt,
  verticalFov,
  evaluatePlacement,
  lookupTable,
  validateProfile,
  toCsv,
} from "./placement-rule.js";

const rules = JSON.parse(readFileSync(new URL("../rules/scene-profiles.json", import.meta.url), "utf8"));
const openDoor = rules.profiles.find((p) => p.id === "open_door");
const corridor = rules.profiles.find((p) => p.id === "corridor");

const wideCamera = { sensorWidthMm: 4.8, focalLengthMm: 2.7, resolution: { w: 2592, h: 1944 } };
// vertical FOV about 19 deg: frames the person at the counting line but not a far face line
const narrowCamera = { sensorWidthMm: 4.8, focalLengthMm: 8, resolution: { w: 1920, h: 1080 } };
const telephotoCamera = { sensorWidthMm: 4.8, focalLengthMm: 100, resolution: { w: 1920, h: 1080 } };

const close = (actual, expected, tolerance = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

test("feet angle is the downward angle to the feet", () => {
  close(feetAngle(2, 2), 45, 1e-9);
});

test("face angle is measured to the face point", () => {
  close(faceAngle(2.5, 1, 1.5), 45, 1e-9);
});

test("feet band edges are inclusive after rounding to 0.1 deg", () => {
  assert.equal(judgeFeet(43.0, openDoor), "best");
  assert.equal(judgeFeet(43.04, openDoor), "best");
  assert.equal(judgeFeet(43.06, openDoor), "acceptable");
  assert.equal(judgeFeet(38.0, openDoor), "best");
  assert.equal(judgeFeet(37.96, openDoor), "best");
  assert.equal(judgeFeet(48.0, openDoor), "acceptable");
  assert.equal(judgeFeet(48.1, openDoor), "out_of_range");
});

test("open door has no acceptable zone farther than the best band", () => {
  assert.equal(judgeFeet(37.9, openDoor), "out_of_range");
});

test("corridor accepts a flatter feet angle down to 33 deg", () => {
  assert.equal(judgeFeet(34, corridor), "acceptable");
  assert.equal(judgeFeet(33, corridor), "acceptable");
  assert.equal(judgeFeet(32.9, corridor), "out_of_range");
});

test("face best excludes 25 deg, and a too-flat face is acceptable", () => {
  assert.equal(judgeFace(9.9, openDoor), "acceptable");
  assert.equal(judgeFace(10, openDoor), "best");
  assert.equal(judgeFace(24.9, openDoor), "best");
  assert.equal(judgeFace(25, openDoor), "acceptable");
  assert.equal(judgeFace(30, openDoor), "acceptable");
  assert.equal(judgeFace(30.1, openDoor), "out_of_range");
});

test("recommended distance matches the Book1 rule tabs", () => {
  assert.equal(recommendedDistance(2, openDoor), 2.3);
  assert.equal(recommendedDistance(8.5, openDoor), 9.78);
  assert.equal(recommendedDistance(2, corridor), 2.56);
  assert.equal(recommendedDistance(8.5, corridor), 10.88);
});

test("face line coincides with the counting line when the face is already best", () => {
  assert.equal(faceLineDistance(2, 2.3, openDoor), 2.3);
});

test("face line moves farther, to the first face-best distance, on a high mount", () => {
  const d = faceLineDistance(6, 6.9, openDoor);
  assert.ok(d > 6.9);
  assert.equal(judgeFace(faceAngle(6, d, 1.5), openDoor), "best");
  assert.notEqual(judgeFace(faceAngle(6, d - 0.01, 1.5), openDoor), "best");
});

test("face line moves closer when the face is too flat at the counting line", () => {
  const d = faceLineDistance(2, 3.0, corridor);
  assert.ok(d < 3.0);
  assert.equal(judgeFace(faceAngle(2, d, 1.5), corridor), "best");
  assert.notEqual(judgeFace(faceAngle(2, d + 0.01, 1.5), corridor), "best");
});

test("no face line when the camera is not above the face point", () => {
  assert.equal(faceLineDistance(1.4, 2, openDoor), null);
});

test("recommended tilt aims at half the human height at the counting line", () => {
  close(recommendedTilt(4, 4.6, openDoor), (Math.atan((4 - 0.85) / 4.6) * 180) / Math.PI, 1e-9);
});

test("vertical FOV follows sensor height from the resolution aspect", () => {
  close(verticalFov(wideCamera), (2 * Math.atan(1.8 / 2.7) * 180) / Math.PI, 1e-9);
});

test("a framed counting line at the target is a best verdict", () => {
  const result = evaluatePlacement({ profile: openDoor, heightM: 2, distanceM: 2.3, camera: wideCamera });
  assert.equal(result.feet.status, "best");
  assert.equal(result.countingLine.framed, true);
  assert.equal(result.verdict, "best");
  assert.equal(result.faceLine.visible, true);
  assert.deepEqual(result.warnings, []);
});

test("verdict follows the feet status, never the face", () => {
  const result = evaluatePlacement({ profile: openDoor, heightM: 8, distanceM: recommendedDistance(8, openDoor), camera: wideCamera });
  assert.equal(result.face.status, "out_of_range");
  assert.equal(result.verdict, "best");
});

test("feet out of range gives an out of range verdict", () => {
  const result = evaluatePlacement({ profile: openDoor, heightM: 4, distanceM: 8, camera: wideCamera });
  assert.equal(result.feet.status, "out_of_range");
  assert.equal(result.verdict, "out_of_range");
});

test("a person cut off at the counting line gives an out of range verdict", () => {
  const result = evaluatePlacement({ profile: openDoor, heightM: 4, distanceM: recommendedDistance(4, openDoor), camera: telephotoCamera });
  assert.equal(result.feet.status, "best");
  assert.equal(result.countingLine.framed, false);
  assert.equal(result.verdict, "out_of_range");
});

test("face line outside the frame is not visible, verdict unchanged", () => {
  const result = evaluatePlacement({ profile: openDoor, heightM: 6, distanceM: 6.9, camera: narrowCamera });
  assert.equal(result.countingLine.framed, true);
  assert.equal(result.faceLine.visible, false);
  assert.equal(result.faceLine.reason, "outside_frame");
  assert.equal(result.verdict, "best");
});

test("face line beyond the available depth is not visible", () => {
  const result = evaluatePlacement({ profile: openDoor, heightM: 6, distanceM: 6.9, camera: wideCamera, availableDepthM: 8 });
  assert.equal(result.faceLine.visible, false);
  assert.equal(result.faceLine.reason, "beyond_available_depth");
});

test("a tilt override replaces the recommended tilt", () => {
  const result = evaluatePlacement({ profile: openDoor, heightM: 4, distanceM: 4.6, camera: wideCamera, tiltDeg: 80 });
  assert.equal(result.tilt.value, 80);
  assert.notEqual(result.tilt.recommended, 80);
  assert.equal(result.countingLine.framed, false);
});

test("heights outside the profile range are judged with a warning", () => {
  const result = evaluatePlacement({ profile: openDoor, heightM: 12, distanceM: recommendedDistance(12, openDoor), camera: wideCamera });
  assert.equal(result.verdict, "best");
  assert.deepEqual(result.warnings, ["height_outside_range"]);
});

test("lookup table covers the height range in 0.1 m steps", () => {
  const rows = lookupTable(openDoor);
  assert.equal(rows.length, 81);
  assert.equal(rows[0].heightM, 2);
  assert.equal(rows.at(-1).heightM, 10);
  assert.equal(rows[0].recommendedDistanceM, 2.3);
  assert.equal(rows[0].feetStatus, "best");
  assert.equal(rows[0].faceLineDistanceM, 2.3);
});

test("the shipped scene profiles are valid", () => {
  rules.profiles.forEach((profile) => assert.doesNotThrow(() => validateProfile(profile)));
});

test("a target outside the best band is rejected", () => {
  const broken = { ...openDoor, feetAngleDeg: { ...openDoor.feetAngleDeg, target: 44 } };
  assert.throws(() => validateProfile(broken), /target/);
});

test("a best band wider than the acceptable band is rejected", () => {
  const broken = { ...corridor, feetAngleDeg: { ...corridor.feetAngleDeg, best: { min: 30, max: 43 } } };
  assert.throws(() => validateProfile(broken), /best band/);
});

test("csv export has a header and one line per row", () => {
  const lines = toCsv(lookupTable(corridor)).trim().split("\n");
  assert.equal(lines.length, 82);
  assert.match(lines[0], /^height_m,recommended_distance_m,/);
});
