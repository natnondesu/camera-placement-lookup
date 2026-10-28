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
  horizontalFov,
  evaluatePlacement,
  lookupTable,
  validateProfile,
  toCsv,
  entranceCoverage,
  pixelDensity,
  fisheyeProjection,
  walkableSpan,
  solveDistance,
  solveHeight,
} from "./placement-rule.js";

const rules = JSON.parse(readFileSync(new URL("../rules/scene-profiles.json", import.meta.url), "utf8"));
const openDoor = rules.profiles.find((p) => p.id === "open_door");
const corridor = rules.profiles.find((p) => p.id === "corridor");

const wideCamera = { sensorWidthMm: 4.8, focalLengthMm: 2.7, resolution: { w: 2592, h: 1944 } };
// vertical FOV about 19 deg: frames the person at the counting line but not a far face line
const narrowCamera = { sensorWidthMm: 4.8, focalLengthMm: 8, resolution: { w: 1920, h: 1080 } };
const telephotoCamera = { sensorWidthMm: 4.8, focalLengthMm: 100, resolution: { w: 1920, h: 1080 } };
// Ceiling fisheye looking straight down; 2992 px image circle over 180 deg
const fisheyeCamera = { lens: "fisheye", fovDeg: 180, resolution: { w: 2992, h: 2992 } };
const fisheyePxPerRad = 1496 / (Math.PI / 2);

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

test("a ceiling fisheye looks straight down with its full field of view", () => {
  const result = evaluatePlacement({ profile: openDoor, heightM: 4, distanceM: 4.6, camera: fisheyeCamera });
  assert.equal(result.tilt.value, 90);
  assert.equal(result.tilt.recommended, 90);
  assert.equal(result.optics.verticalFovDeg, 180);
  assert.equal(result.optics.horizontalFovDeg, 180);
  assert.equal(result.optics.lens, "fisheye");
  assert.equal(result.countingLine.framed, true);
  assert.equal(result.verdict, "best");
});

test("a person beyond 80 deg off a fisheye's axis is not framed", () => {
  // Feet at atan(4 / 40) = 5.7 deg below level, 84.3 deg off the axis
  const result = evaluatePlacement({ profile: openDoor, heightM: 4, distanceM: 40, camera: fisheyeCamera });
  assert.equal(result.countingLine.framed, false);
  assert.equal(result.verdict, "out_of_range");
});

test("a tilt override does not move a ceiling fisheye", () => {
  const result = evaluatePlacement({ profile: openDoor, heightM: 4, distanceM: 4.6, camera: fisheyeCamera, tiltDeg: 30 });
  assert.equal(result.tilt.value, 90);
});

test("fisheye pixel density on the axis is pixels per radian over distance", () => {
  close(pixelDensity(fisheyeCamera, 4, 0), fisheyePxPerRad / 4, 1e-9);
});

test("fisheye pixel density off the axis follows the equidistant lens", () => {
  const theta = (49 * Math.PI) / 180;
  close(pixelDensity(fisheyeCamera, 6.1, 49), (fisheyePxPerRad * theta) / (6.1 * Math.sin(theta)), 1e-9);
});

test("rectilinear pixel density is the image width over the width covered at that distance", () => {
  // 90 deg horizontal view at 5 m covers 10 m, so 1920 px over 10 m
  const camera = { sensorWidthMm: 4, focalLengthMm: 2, resolution: { w: 1920, h: 1080 } };
  close(pixelDensity(camera, 5, 0), 192, 1e-9);
});

test("counting line pixel density uses the lens model of the camera", () => {
  const heightM = 4;
  const distanceM = 4.6;
  const slant = Math.hypot(heightM, distanceM);
  const rectilinear = evaluatePlacement({ profile: openDoor, heightM, distanceM, camera: wideCamera });
  close(rectilinear.optics.pixelsPerMetre, pixelDensity(wideCamera, slant, 0), 1e-9);
  const fisheye = evaluatePlacement({ profile: openDoor, heightM, distanceM, camera: fisheyeCamera });
  close(fisheye.optics.pixelsPerMetre, pixelDensity(fisheyeCamera, slant, 90 - fisheye.feet.angleDeg), 1e-9);
});

test("fisheye coverage at the counting line is the floor within 80 deg of straight down", () => {
  const result = evaluatePlacement({ profile: openDoor, heightM: 4, distanceM: 4.6, camera: fisheyeCamera });
  const reach = 4 * Math.tan((80 * Math.PI) / 180);
  close(result.optics.coverageWidthM, 2 * Math.sqrt(reach * reach - 4.6 * 4.6), 1e-9);
});

test("rectilinear effective width is the middle 80% of the covered width", () => {
  const result = evaluatePlacement({ profile: openDoor, heightM: 4, distanceM: 4.6, camera: wideCamera });
  close(result.optics.effectiveWidthM, result.optics.coverageWidthM * 0.8, 1e-9);
});

test("fisheye effective width is the floor inside 80% of the image radius", () => {
  // 80% of a 180 deg image radius is 72 deg off the axis
  const result = evaluatePlacement({ profile: openDoor, heightM: 4, distanceM: 4.6, camera: fisheyeCamera });
  const reach = 4 * Math.tan((72 * Math.PI) / 180);
  close(result.optics.effectiveWidthM, 2 * Math.sqrt(reach * reach - 4.6 * 4.6), 1e-9);
});

test("an entrance is judged against the effective width when one is given", () => {
  assert.equal(entranceCoverage(15, 40, 20).status, "covered");
  assert.equal(entranceCoverage(25, 40, 20).status, "tight");
  assert.equal(entranceCoverage(45, 40, 20).status, "too_wide");
});

test("a fisheye entrance check uses the fisheye's effective width", () => {
  const result = evaluatePlacement({ profile: openDoor, heightM: 4, distanceM: 4.6, camera: fisheyeCamera, entranceWidthM: 30 });
  assert.deepEqual(result.entrance, entranceCoverage(30, result.optics.coverageWidthM, result.optics.effectiveWidthM));
  assert.equal(result.entrance.status, "tight");
});

test("straight below a ceiling fisheye is the centre of the image", () => {
  const p = fisheyeProjection({ x: 0, y: -4, z: 0 }, 180);
  close(p.u, 0, 1e-9);
  close(p.v, 0, 1e-9);
  close(p.offAxisDeg, 0, 1e-9);
  assert.equal(p.inside, true);
});

test("the horizon ahead lands on the top edge of a 180 degree image circle", () => {
  const p = fisheyeProjection({ x: 0, y: 0, z: 5 }, 180);
  close(p.u, 0, 1e-9);
  close(p.v, 1, 1e-9);
  assert.equal(p.inside, true);
});

test("an equidistant lens puts 45 degrees halfway out", () => {
  const p = fisheyeProjection({ x: 0, y: -1, z: 1 }, 180);
  close(p.v, 0.5, 1e-9);
  close(p.offAxisDeg, 45, 1e-9);
});

test("the camera's right lands on the image's left, as seen looking down", () => {
  const p = fisheyeProjection({ x: 1, y: -1, z: 0 }, 180);
  close(p.u, -0.5, 1e-9);
  close(p.v, 0, 1e-9);
});

test("above the horizon is outside the image circle", () => {
  assert.equal(fisheyeProjection({ x: 0, y: 1, z: 1 }, 180).inside, false);
});

test("a tilt override replaces the recommended tilt", () => {
  const result = evaluatePlacement({ profile: openDoor, heightM: 4, distanceM: 4.6, camera: wideCamera, tiltDeg: 80 });
  assert.equal(result.tilt.value, 80);
  assert.notEqual(result.tilt.recommended, 80);
  assert.equal(result.countingLine.framed, false);
});

test("an entrance inside the effective 80% of the view is fully covered", () => {
  assert.deepEqual(entranceCoverage(3, 10), { widthM: 3, status: "covered", uncoveredM: 0 });
  assert.equal(entranceCoverage(8, 10).status, "covered");
});

test("an entrance in the outer 20% of the view is covered but tight", () => {
  assert.deepEqual(entranceCoverage(9, 10), { widthM: 9, status: "tight", uncoveredM: 0 });
  assert.equal(entranceCoverage(10, 10).status, "tight");
});

test("an entrance wider than the view reports how much is missed", () => {
  const result = entranceCoverage(12, 10);
  assert.equal(result.status, "too_wide");
  close(result.uncoveredM, 2, 1e-9);
});

test("no entrance width means no entrance check", () => {
  const result = evaluatePlacement({ profile: openDoor, heightM: 4, distanceM: 4.6, camera: wideCamera });
  assert.equal(result.entrance, null);
});

test("an entrance wider than the view warns but never fails the verdict", () => {
  // A portrait stream with a 14 deg horizontal view covers about 3 m of a 6 m entrance
  const portrait = { sensorWidthMm: 2, focalLengthMm: 8, resolution: { w: 1080, h: 1920 } };
  const result = evaluatePlacement({ profile: openDoor, heightM: 8, distanceM: 9.2, camera: portrait, entranceWidthM: 6 });
  assert.deepEqual(result.entrance, entranceCoverage(6, result.optics.coverageWidthM));
  assert.equal(result.entrance.status, "too_wide");
  assert.equal(result.verdict, "best");
});

test("heights outside the profile range are judged with a warning", () => {
  const result = evaluatePlacement({ profile: openDoor, heightM: 12, distanceM: recommendedDistance(12, openDoor), camera: wideCamera });
  assert.equal(result.verdict, "best");
  assert.ok(result.warnings.includes("height_outside_range"));
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

// A fixed 2.8 mm lens: the datasheet's view is the same at both ends
const fixedEnd = { focalLengthMm: 2.8, hFovDeg: 107, vFovDeg: 57 };
const datasheetCamera = {
  focalLengthMm: 2.8, sensorWidthMm: 4.8, resolution: { w: 1920, h: 1080 },
  datasheetFov: { aspect: { w: 16, h: 9 }, wide: fixedEnd, tele: fixedEnd },
};

test("a camera with a datasheet field of view uses it instead of sensor and focal length", () => {
  assert.equal(horizontalFov(datasheetCamera), 107);
  assert.equal(verticalFov(datasheetCamera), 57);
});

test("pixel density with a datasheet field of view spreads the image width across it", () => {
  close(pixelDensity(datasheetCamera, 5, 0), 1920 / (2 * 5 * Math.tan((53.5 * Math.PI) / 180)), 1e-9);
});

test("a placement with a datasheet camera reports the datasheet field of view", () => {
  const result = evaluatePlacement({ profile: openDoor, heightM: 4, distanceM: 4.6, camera: datasheetCamera });
  assert.equal(result.optics.horizontalFovDeg, 107);
  assert.equal(result.optics.verticalFovDeg, 57);
  assert.equal(result.countingLine.framed, true);
});

// Dahua DH-IPC-HDBW2531R-ZS-S2 datasheet: 100 x 72 deg at 2.7 mm, 26 x 20 deg at 13.5 mm, quoted for the 4:3 stream
const dahuaView = {
  aspect: { w: 4, h: 3 },
  wide: { focalLengthMm: 2.7, hFovDeg: 100, vFovDeg: 72 },
  tele: { focalLengthMm: 13.5, hFovDeg: 26, vFovDeg: 20 },
};
const zoomAt = (focalLengthMm, resolution = { w: 2592, h: 1944 }) => ({ focalLengthMm, resolution, datasheetFov: dahuaView });
const effectiveSize = (focalMm, deg) => 2 * focalMm * Math.tan((deg * Math.PI) / 360);
const viewFrom = (sizeMm, focalMm) => (2 * Math.atan(sizeMm / (2 * focalMm)) * 180) / Math.PI;

test("a zoom lens matches its datasheet view at the wide end", () => {
  close(horizontalFov(zoomAt(2.7)), 100, 1e-9);
  close(verticalFov(zoomAt(2.7)), 72, 1e-9);
});

test("a zoom lens matches its datasheet view at the tele end", () => {
  close(horizontalFov(zoomAt(13.5)), 26, 1e-9);
  close(verticalFov(zoomAt(13.5)), 20, 1e-9);
});

test("between the ends the effective sensor width moves in step with the focal length", () => {
  const midWidth = (effectiveSize(2.7, 100) + effectiveSize(13.5, 26)) / 2;
  close(horizontalFov(zoomAt(8.1)), viewFrom(midWidth, 8.1), 1e-9);
});

test("a 16:9 stream keeps the horizontal view and crops the vertical", () => {
  const camera = zoomAt(2.7, { w: 2688, h: 1520 });
  close(horizontalFov(camera), 100, 1e-9);
  close(verticalFov(camera), viewFrom(effectiveSize(2.7, 72) * (4 / 3) / (2688 / 1520), 2.7), 1e-9);
});

test("pixel density on a calibrated zoom uses the datasheet view", () => {
  close(pixelDensity(zoomAt(2.7), 5, 0), 2592 / (2 * 5 * Math.tan((50 * Math.PI) / 180)), 1e-9);
});

// 90 deg horizontal view over 1920 px: 960 / slant distance pixels per metre
const ninetyDegCamera = { sensorWidthMm: 4, focalLengthMm: 2, resolution: { w: 1920, h: 1080 } };

test("a counting line below the counting pixel floor warns but keeps the verdict", () => {
  // 9 m mount, line at 10.35 m: about 70 px/m against an 80 px/m floor
  const result = evaluatePlacement({ profile: openDoor, heightM: 9, distanceM: 10.35, camera: ninetyDegCamera });
  assert.equal(result.verdict, "best");
  assert.ok(result.optics.pixelsPerMetre < openDoor.minPixelsPerMetre.counting);
  assert.ok(result.warnings.includes("low_pixel_density"));
});

test("a counting line above the counting pixel floor has no density warning", () => {
  const result = evaluatePlacement({ profile: openDoor, heightM: 4, distanceM: 4.6, camera: ninetyDegCamera });
  assert.ok(!result.warnings.includes("low_pixel_density"));
});

test("a visible face line below the face pixel floor is too small", () => {
  // Face line at 5.38 m from a 4 m mount: about 162 px/m at the face against a 200 px/m floor
  const result = evaluatePlacement({ profile: openDoor, heightM: 4, distanceM: 4.6, camera: ninetyDegCamera });
  assert.equal(result.faceLine.visible, true);
  close(result.faceLine.pixelsPerMetre, 960 / Math.hypot(2.5, 5.38), 0.01);
  assert.equal(result.faceLine.tooSmall, true);
});

test("a face line with enough pixels is not too small", () => {
  const result = evaluatePlacement({ profile: openDoor, heightM: 4, distanceM: 4.6, camera: wideCamera });
  assert.equal(result.faceLine.visible, true);
  assert.equal(result.faceLine.tooSmall, false);
});

test("a profile without pixel floors is rejected", () => {
  const { minPixelsPerMetre, ...broken } = openDoor;
  assert.throws(() => validateProfile(broken), /pixel/);
});

test("csv export has a header and one line per row", () => {
  const lines = toCsv(lookupTable(corridor)).trim().split("\n");
  assert.equal(lines.length, 82);
  assert.match(lines[0], /^height_m,recommended_distance_m,/);
});

// ---------- Off-centre camera, judged across the walkable width ----------

test("the walkable width keeps 0.35 m clear of each door frame", () => {
  assert.deepEqual(walkableSpan(5), { leftM: -2.15, rightM: 2.15 });
  assert.deepEqual(walkableSpan(0.5), { leftM: 0, rightM: 0 });
  assert.deepEqual(walkableSpan(undefined), { leftM: 0, rightM: 0 });
});

test("a centred camera with no entrance width is judged at the middle, as before", () => {
  const result = evaluatePlacement({ profile: openDoor, heightM: 4, distanceM: 4.6, camera: wideCamera });
  close(result.feet.angleDeg, feetAngle(4, 4.6), 1e-9);
  assert.equal(result.feet.point, "aim");
  close(result.countingLine.points.far.floorDistanceM, 4.6, 1e-9);
});

test("a centred camera over a 5 m entrance is decided at the edge of the walkable width", () => {
  const result = evaluatePlacement({ profile: openDoor, heightM: 4, distanceM: 4.6, camera: wideCamera, entranceWidthM: 5 });
  assert.equal(result.feet.point, "far");
  close(result.feet.angleDeg, feetAngle(4, Math.hypot(2.15, 4.6)), 1e-9);
  assert.equal(result.verdict, "best");
});

test("an off-centre camera is decided at whichever walkable point is worst", () => {
  // Nearest point straight ahead at 4 m (45 deg); farthest at the left edge, 5.22 m away (37.5 deg)
  const result = evaluatePlacement({ profile: openDoor, heightM: 4, distanceM: 4, offsetM: 1.2, camera: wideCamera, entranceWidthM: 5 });
  const { near, far } = result.countingLine.points;
  close(near.xM, 1.2, 1e-9);
  assert.equal(near.status, "acceptable");
  close(far.xM, -2.15, 1e-9);
  assert.equal(far.status, "out_of_range");
  assert.equal(result.feet.point, "far");
  assert.equal(result.verdict, "out_of_range");
});

test("between two Best points the one nearer a band edge decides", () => {
  const result = evaluatePlacement({ profile: openDoor, heightM: 4, distanceM: 4.4, camera: wideCamera, entranceWidthM: 5 });
  assert.equal(result.countingLine.points.aim.status, "best");
  assert.equal(result.countingLine.points.far.status, "best");
  // 42.3 deg at the middle is 0.7 deg inside the band; 39.2 deg at the edge is 1.2 deg inside
  assert.equal(result.feet.point, "aim");
});

test("an off-centre camera pans to the entrance centre and tilts for the floor distance to it", () => {
  const result = evaluatePlacement({ profile: openDoor, heightM: 4, distanceM: 4, offsetM: 3, camera: wideCamera });
  close(result.pan.deg, 36.87, 0.01);
  assert.equal(result.pan.toward, "left");
  close(result.tilt.recommended, recommendedTilt(4, 5, openDoor), 1e-9);
});

test("a ceiling fisheye is never panned", () => {
  const result = evaluatePlacement({ profile: openDoor, heightM: 4, distanceM: 4.6, offsetM: 2, camera: fisheyeCamera });
  assert.equal(result.pan.deg, 0);
  assert.equal(result.pan.toward, null);
  assert.equal(result.tilt.value, 90);
});

test("a person at the far edge of the walkable width must be wholly in frame", () => {
  // Panned 12 deg, the counting line slopes across the image; about 19 deg of vertical view loses the far edge
  const narrow = evaluatePlacement({ profile: corridor, heightM: 4, distanceM: 4.6, offsetM: 1, camera: narrowCamera, entranceWidthM: 6 });
  const wide = evaluatePlacement({ profile: corridor, heightM: 4, distanceM: 4.6, offsetM: 1, camera: wideCamera, entranceWidthM: 6 });
  assert.equal(narrow.countingLine.points.far.status, "acceptable");
  assert.equal(narrow.countingLine.points.far.framed, false);
  assert.equal(narrow.verdict, "out_of_range");
  assert.equal(wide.verdict, "acceptable");
});

test("an off-centre camera covers a shifted stretch of the counting line", () => {
  const centred = evaluatePlacement({ profile: openDoor, heightM: 4, distanceM: 4.6, camera: wideCamera, entranceWidthM: 8 });
  const shifted = evaluatePlacement({ profile: openDoor, heightM: 4, distanceM: 4.6, offsetM: 2, camera: wideCamera, entranceWidthM: 8 });
  assert.ok(shifted.optics.inEffective.leftM < centred.optics.inEffective.leftM);
  assert.equal(centred.entrance.status, "covered");
  assert.notEqual(shifted.entrance.status, "covered");
});

test("solving the distance keeps today's answer when the whole walkable width is Best", () => {
  const solved = solveDistance({ profile: openDoor, heightM: 4, entranceWidthM: 5 });
  assert.equal(solved.distanceM, recommendedDistance(4, openDoor));
  assert.equal(solved.judgedBy, "best");
});

test("solving the distance with no entrance width is the target distance", () => {
  assert.equal(solveDistance({ profile: corridor, heightM: 8.5 }).distanceM, recommendedDistance(8.5, corridor));
});

test("solving the distance off-centre lands inside the Best window", () => {
  const solved = solveDistance({ profile: openDoor, heightM: 4, offsetM: 0.6, entranceWidthM: 5 });
  assert.equal(solved.judgedBy, "best");
  assert.ok(solved.distanceM >= solved.best.minM && solved.distanceM <= solved.best.maxM);
  const result = evaluatePlacement({ profile: openDoor, heightM: 4, distanceM: solved.distanceM, offsetM: 0.6, camera: wideCamera, entranceWidthM: 5 });
  assert.equal(result.verdict, "best");
});

test("an off-centre camera with no Best distance falls back to the Acceptable window", () => {
  const solved = solveDistance({ profile: openDoor, heightM: 4, offsetM: 1.2, entranceWidthM: 5 });
  assert.equal(solved.best, null);
  assert.equal(solved.judgedBy, "acceptable");
  const result = evaluatePlacement({ profile: openDoor, heightM: 4, distanceM: solved.distanceM, offsetM: 1.2, camera: wideCamera, entranceWidthM: 5 });
  assert.equal(result.verdict, "acceptable");
});

test("an entrance too wide for one camera at that height has no distance that works", () => {
  const solved = solveDistance({ profile: openDoor, heightM: 4, entranceWidthM: 12 });
  assert.equal(solved.best, null);
  assert.equal(solved.acceptable, null);
  assert.equal(solved.judgedBy, null);
});

test("solving the height with no entrance width is the target angle over the distance", () => {
  close(solveHeight({ profile: openDoor, distanceM: 4.6 }).heightM, 4.6 * Math.tan((41 * Math.PI) / 180), 0.01);
});

test("solving the height off-centre makes every walkable point Best", () => {
  const solved = solveHeight({ profile: openDoor, distanceM: 4.6, offsetM: 1, entranceWidthM: 4 });
  assert.equal(solved.judgedBy, "best");
  const result = evaluatePlacement({ profile: openDoor, heightM: solved.heightM, distanceM: 4.6, offsetM: 1, camera: wideCamera, entranceWidthM: 4 });
  assert.equal(result.feet.status, "best");
});

test("an off-centre face line is found along the middle of the entrance", () => {
  const result = evaluatePlacement({ profile: openDoor, heightM: 6, distanceM: 6.5, offsetM: 2, camera: wideCamera });
  const d = result.faceLine.distanceM;
  assert.equal(judgeFace(faceAngle(6, Math.hypot(2, d), 1.5), openDoor), "best");
  assert.notEqual(judgeFace(faceAngle(6, Math.hypot(2, d - 0.01), 1.5), openDoor), "best");
});
