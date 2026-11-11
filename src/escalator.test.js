import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ESCALATOR,
  BOXED_RIDE_M,
  pastBoxCutoff,
  escalatorLayout,
  surfaceHeight,
  stepCentres,
  stepUnder,
  faceLineSurface,
  floorWells,
  sideOutline,
  pitDepthM,
  slopeBand,
  slopeSkirt,
  floorPieces,
  gridSegments,
} from "./escalator.js";

const rules = JSON.parse(readFileSync(new URL("../rules/scene-profiles.json", import.meta.url), "utf8"));
const profile = (id) => rules.profiles.find((p) => p.id === id);
const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, actual + " is not " + expected);

test("the escalator profile judges with exactly the open door thresholds", () => {
  const escalator = profile("escalator");
  const openDoor = profile("open_door");
  assert.ok(escalator, "rules/scene-profiles.json has an escalator profile");
  for (const key of ["heightRangeM", "facePointM", "humanHeightM", "feetAngleDeg", "faceAngleDeg", "minPixelsPerMetre"]) {
    assert.deepEqual(escalator[key], openDoor[key], key);
  }
});

test("no other scene profile still names an escalator as its example", () => {
  for (const p of rules.profiles.filter((p) => p.id !== "escalator")) {
    assert.doesNotMatch(p.description, /escalator/i, p.id);
  }
});

test("a standard pair is two one-metre escalators with a divider between them", () => {
  const layout = escalatorLayout({ widthM: ESCALATOR.defaultWidthM, landing: "top" });

  assert.equal(layout.widthM, 2.6);
  assert.equal(layout.stepWidthM, 1);
  near(layout.dividerM, 0.6);
  const [leave, arrive] = layout.lanes;
  assert.equal(leave.role, "leave");
  assert.equal(arrive.role, "arrive");
  near(leave.minX, -1.3);
  near(leave.maxX, -0.3);
  near(arrive.minX, 0.3);
  near(arrive.maxX, 1.3);
  near(arrive.centreX, 0.8);
});

test("people arrive on the camera's right and leave on its left", () => {
  const { lanes } = escalatorLayout({ widthM: 2.6, landing: "bottom" });

  assert.ok(lanes.find((lane) => lane.role === "arrive").centreX > 0);
  assert.ok(lanes.find((lane) => lane.role === "leave").centreX < 0);
});

test("no width, or one that is not a width, draws the standard pair", () => {
  for (const widthM of [undefined, null, 0, -3, Number.NaN]) {
    assert.equal(escalatorLayout({ widthM, landing: "top" }).widthM, ESCALATOR.defaultWidthM);
  }
});

test("a wider pair keeps one-metre steps and widens the divider", () => {
  const layout = escalatorLayout({ widthM: 5, landing: "top" });

  assert.equal(layout.stepWidthM, 1);
  near(layout.dividerM, 3);
  near(layout.lanes[1].maxX, 2.5);
});

test("a pair too narrow for one-metre steps narrows the steps, never the divider below its minimum", () => {
  const layout = escalatorLayout({ widthM: 1.9, landing: "top" });

  near(layout.dividerM, ESCALATOR.minDividerM);
  near(layout.stepWidthM, 0.8);
  near(layout.lanes[0].minX, -0.95);
});

const LANDINGS = ["top", "bottom"];

test("an unknown landing is the top landing", () => {
  assert.equal(escalatorLayout({ widthM: 2.6, landing: "sideways" }).landing, "top");
  assert.equal(escalatorLayout({ widthM: 2.6 }).landing, "top");
});

test("the landing is flat to the comb plate and across the flat steps, then the incline starts", () => {
  const layout = escalatorLayout({ widthM: 2.6, landing: "bottom" });

  assert.equal(layout.combU, ESCALATOR.landingRunM);
  near(layout.inclineU, ESCALATOR.landingRunM + ESCALATOR.flatRunM);
  near(layout.endU, layout.inclineU + ESCALATOR.riseM / Math.tan((ESCALATOR.inclineDeg * Math.PI) / 180));
  assert.equal(surfaceHeight(layout, 0), 0);
  assert.equal(surfaceHeight(layout, layout.combU), 0);
  assert.equal(surfaceHeight(layout, layout.inclineU), 0);
});

test("at the bottom landing the escalators rise away, at the top landing they drop away", () => {
  const bottom = escalatorLayout({ widthM: 2.6, landing: "bottom" });
  const top = escalatorLayout({ widthM: 2.6, landing: "top" });
  const oneMetreIn = bottom.inclineU + 1;

  near(surfaceHeight(bottom, oneMetreIn), Math.tan(Math.PI / 6));
  near(surfaceHeight(top, oneMetreIn), -Math.tan(Math.PI / 6));
  near(surfaceHeight(bottom, bottom.endU + 5), ESCALATOR.riseM);
  near(surfaceHeight(top, top.endU + 5), -ESCALATOR.riseM);
});

test("steps tile the escalator from the comb plate to its far end, one step depth apart", () => {
  const layout = escalatorLayout({ widthM: 2.6, landing: "bottom" });
  const centres = stepCentres(layout, 0);

  near(centres[0], layout.combU + ESCALATOR.stepDepthM / 2);
  near(centres[1] - centres[0], ESCALATOR.stepDepthM);
  assert.ok(centres.at(-1) <= layout.endU);
  assert.ok(centres.at(-1) > layout.endU - ESCALATOR.stepDepthM);
});

test("moving the belt slides every step and wraps after one step depth", () => {
  const layout = escalatorLayout({ widthM: 2.6, landing: "bottom" });

  near(stepCentres(layout, 0.1)[0], layout.combU + 0.1 + ESCALATOR.stepDepthM / 2 - ESCALATOR.stepDepthM, 1e-9);
  assert.deepEqual(stepCentres(layout, ESCALATOR.stepDepthM).map((u) => u.toFixed(6)), stepCentres(layout, 0).map((u) => u.toFixed(6)));
  assert.deepEqual(stepCentres(layout, -0.3).map((u) => u.toFixed(6)), stepCentres(layout, 0.1).map((u) => u.toFixed(6)));
});

test("a rider stands on the top of the step under them, not on the slope between steps", () => {
  const layout = escalatorLayout({ widthM: 2.6, landing: "bottom" });
  const u = layout.inclineU + 1.03;
  const step = stepUnder(layout, u, 0);

  assert.ok(Math.abs(step.centreU - u) <= ESCALATOR.stepDepthM / 2 + 1e-9);
  near(step.topY, surfaceHeight(layout, step.centreU));
  assert.notEqual(step.topY, surfaceHeight(layout, u));
});

test("nobody is on a step before the comb plate or past the far end", () => {
  const layout = escalatorLayout({ widthM: 2.6, landing: "top" });

  assert.equal(stepUnder(layout, layout.combU - 0.01, 0), null);
  assert.equal(stepUnder(layout, layout.endU + 1, 0), null);
  assert.equal(stepUnder(layout, layout.combU + 0.2, 0).topY, 0);
});

test("the face line is named by what it falls on: the landing, the flat steps or the incline", () => {
  const layout = escalatorLayout({ widthM: 2.6, landing: "top" });

  assert.equal(faceLineSurface(layout, -0.4), "landing");
  assert.equal(faceLineSurface(layout, 0), "landing");
  assert.equal(faceLineSurface(layout, 0.78), "landing");
  assert.equal(faceLineSurface(layout, 1.78), "steps");
  assert.equal(faceLineSurface(layout, 2.78), "incline");
  assert.equal(faceLineSurface(layout, null), "landing");
});

test("the top landing opens a well in the floor under each escalator; the bottom landing opens none", () => {
  const top = escalatorLayout({ widthM: 2.6, landing: "top" });
  const wells = floorWells(top);

  assert.equal(wells.length, 2);
  for (const [index, well] of wells.entries()) {
    const lane = top.lanes[index];
    near(well.minX, lane.minX - ESCALATOR.balustradeM);
    near(well.maxX, lane.maxX + ESCALATOR.balustradeM);
    assert.equal(well.minU, top.inclineU);
    assert.ok(well.maxU > top.endU);
  }
  assert.ok(wells[0].maxX < wells[1].minX, "the divider keeps its floor");
  assert.deepEqual(floorWells(escalatorLayout({ widthM: 2.6, landing: "bottom" })), []);
});

test("the side outline starts at the comb plate, steps down or up with the incline and carries a handrail above it", () => {
  for (const landing of LANDINGS) {
    const layout = escalatorLayout({ widthM: 2.6, landing });
    const { treads, handrail, underside } = sideOutline(layout);

    near(treads[0].u, layout.combU);
    assert.equal(treads[0].y, 0);
    assert.ok(treads.every((point, i) => i === 0 || point.u >= treads[i - 1].u - 1e-9), "runs away from the line");
    assert.ok(treads.every((point) => point.y * layout.direction >= -1e-9), "drops at the top landing, rises at the bottom");
    near(handrail[0].y, ESCALATOR.handrailM);
    near(handrail[handrail.length - 1].y, surfaceHeight(layout, layout.endU) + ESCALATOR.handrailM);
    underside.forEach((point) => near(point.y, surfaceHeight(layout, point.u) - ESCALATOR.trussM));
  }
});

test("the side outline's treads are level and joined by risers, so the incline reads as stairs", () => {
  const rise = ESCALATOR.stepDepthM * Math.tan((ESCALATOR.inclineDeg * Math.PI) / 180);
  for (const landing of LANDINGS) {
    const layout = escalatorLayout({ widthM: 2.6, landing });
    const { treads } = sideOutline(layout);
    assert.equal(treads.length % 2, 0);
    for (let i = 0; i < treads.length; i += 2) {
      assert.equal(treads[i].y, treads[i + 1].y, "each tread is level");
      near(treads[i + 1].u - treads[i].u, ESCALATOR.stepDepthM);
    }
    for (let i = 1; i + 1 < treads.length; i += 2) {
      near(treads[i + 1].u, treads[i].u);
      const step = treads[i + 1].y - treads[i].y;
      assert.ok(Math.abs(step) <= rise + 1e-9, "a riser is never taller than one incline step");
      if (treads[i - 1].u > layout.inclineU) near(step, layout.direction * rise);
    }
    assert.ok(treads.some((point, i) => i % 2 === 1 && i + 1 < treads.length && Math.abs(treads[i + 1].y - point.y) > 1e-6), "the incline has risers");
  }
});

test("the pit is deeper than the lowest point of the truss, so the well reads as depth", () => {
  const layout = escalatorLayout({ widthM: 2.6, landing: "top" });
  assert.ok(pitDepthM(layout) > ESCALATOR.riseM + ESCALATOR.trussM);
});

test("a slope band follows the surface at fixed offsets above and below it", () => {
  for (const landing of LANDINGS) {
    const layout = escalatorLayout({ widthM: 2.6, landing });
    const band = slopeBand(layout, ESCALATOR.handrailM, -ESCALATOR.trussM);
    assert.equal(band.length, 6, "three points on each edge");
    const top = band.slice(0, 3);
    const bottom = band.slice(3);
    assert.deepEqual(top.map((point) => point.u), [layout.combU, layout.inclineU, layout.endU]);
    top.forEach((point) => near(point.y, surfaceHeight(layout, point.u) + ESCALATOR.handrailM));
    bottom.forEach((point) => near(point.y, surfaceHeight(layout, point.u) - ESCALATOR.trussM));
    assert.deepEqual(bottom.map((point) => point.u), [layout.endU, layout.inclineU, layout.combU], "returns along the bottom edge");
  }
});

test("a skirt runs from the handrail line down to a fixed floor, however high the slope climbs", () => {
  const layout = escalatorLayout({ widthM: 2.6, landing: "bottom" });
  const skirt = slopeSkirt(layout, ESCALATOR.handrailM, 0);
  const bottom = skirt.slice(3);
  bottom.forEach((point) => assert.equal(point.y, 0));
  near(skirt[2].y, ESCALATOR.riseM + ESCALATOR.handrailM);
});

const area = (rects) => rects.reduce((sum, r) => sum + (r.maxX - r.minX) * (r.maxU - r.minU), 0);
const overlap = (a, b) => Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) > 1e-9 && Math.min(a.maxU, b.maxU) - Math.max(a.minU, b.minU) > 1e-9;
const bounds = { minX: -45, maxX: 45, minU: -15, maxU: 75 };

test("with no wells the floor is one piece", () => {
  assert.deepEqual(floorPieces(bounds, []), [bounds]);
});

test("floor pieces tile everything except the wells, with no gap and no overlap", () => {
  const wells = floorWells(escalatorLayout({ widthM: 2.6, landing: "top" }));
  const sceneWells = wells.map((w) => ({ ...w, minU: w.minU + 5, maxU: w.maxU + 5 }));
  const pieces = floorPieces(bounds, sceneWells);

  near(area(pieces), area([bounds]) - area(sceneWells));
  for (const well of sceneWells) assert.ok(pieces.every((piece) => !overlap(piece, well)), "no floor over a well");
  pieces.forEach((a, i) => pieces.slice(i + 1).forEach((b) => assert.ok(!overlap(a, b), "pieces do not overlap")));
});

test("the divider between two wells keeps its floor", () => {
  const wells = floorWells(escalatorLayout({ widthM: 2.6, landing: "top" }));
  const pieces = floorPieces(bounds, wells);
  const [leave, arrive] = wells;
  const island = pieces.find((piece) => piece.minX <= leave.maxX + 1e-9 && piece.maxX >= arrive.minX - 1e-9);
  assert.ok(island, "a piece spans the divider");
  assert.ok(island.minU <= wells[0].minU && island.maxU >= wells[0].maxU, "all along the wells");
});

test("two wells that touch leave no sliver of floor between them", () => {
  const layout = escalatorLayout({ widthM: 2 * ESCALATOR.stepWidthM + ESCALATOR.minDividerM, landing: "top" });
  const wells = floorWells(layout);
  const pieces = floorPieces(bounds, wells);
  assert.ok(pieces.every((piece) => piece.maxX - piece.minX > 1e-6), "no zero-width piece");
  near(area(pieces), area([bounds]) - area(wells), 1e-6);
});

test("grid lines sit on whole steps of the grid and run the full bounds when nothing is cut", () => {
  const segments = gridSegments({ minX: 0, maxX: 4, minU: 0, maxU: 3 }, 1, []);
  const along = segments.filter((s) => s.x0 === s.x1);
  const across = segments.filter((s) => s.u0 === s.u1);
  assert.equal(along.length, 5);
  assert.equal(across.length, 4);
  along.forEach((s) => { assert.equal(s.u0, 0); assert.equal(s.u1, 3); });
  across.forEach((s) => { assert.equal(s.x0, 0); assert.equal(s.x1, 4); });
});

test("a grid line stops at the edge of a well and picks up on the other side", () => {
  const well = { minX: 2.2, maxX: 4.8, minU: 3, maxU: 7 };
  const segments = gridSegments({ minX: 0, maxX: 8, minU: 0, maxU: 10 }, 1, [well]);
  const column = segments.filter((s) => s.x0 === 3 && s.x1 === 3).map((s) => [s.u0, s.u1]);
  assert.deepEqual(column, [[0, 3], [7, 10]]);
  const row = segments.filter((s) => s.u0 === 5 && s.u1 === 5).map((s) => [s.x0, s.x1]);
  assert.deepEqual(row, [[0, 2.2], [4.8, 8]]);
  const inside = (s) => Math.min(s.x0, s.x1) < well.maxX - 1e-9 && Math.max(s.x0, s.x1) > well.minX + 1e-9 && Math.min(s.u0, s.u1) < well.maxU - 1e-9 && Math.max(s.u0, s.u1) > well.minU + 1e-9;
  assert.ok(segments.every((s) => !(inside(s) && s.x0 > well.minX && s.x0 < well.maxX && s.u0 > well.minU && s.u0 < well.maxU)), "nothing drawn inside");
});

test("a grid line along the edge of a well is kept", () => {
  const well = { minX: 2, maxX: 5, minU: 3, maxU: 7 };
  const segments = gridSegments({ minX: 0, maxX: 8, minU: 0, maxU: 10 }, 1, [well]);
  assert.ok(segments.some((s) => s.x0 === 2 && s.x1 === 2 && s.u0 === 0 && s.u1 === 10), "the edge x=2 line runs whole");
});

test("a rider is past the box cut-off only more than BOXED_RIDE_M beyond the comb plate", () => {
  const layout = escalatorLayout({ widthM: 2.6, landing: "bottom" });
  assert.equal(BOXED_RIDE_M, 2);
  assert.equal(pastBoxCutoff(layout, layout.combU - 1), false);
  assert.equal(pastBoxCutoff(layout, layout.combU), false);
  assert.equal(pastBoxCutoff(layout, layout.combU + BOXED_RIDE_M), false);
  assert.equal(pastBoxCutoff(layout, layout.combU + BOXED_RIDE_M + 0.01), true);
});

test("a rider crossing the face line stays boxed even when it is past the box cut-off", () => {
  const layout = escalatorLayout({ widthM: 2.6, landing: "bottom" });
  const faceU = layout.combU + BOXED_RIDE_M + 1.5;
  assert.equal(pastBoxCutoff(layout, faceU, faceU), false);
  assert.equal(pastBoxCutoff(layout, faceU + 0.5, faceU), false);
  assert.equal(pastBoxCutoff(layout, faceU - 0.5, faceU), false);
  assert.equal(pastBoxCutoff(layout, faceU + 1.5, faceU), true);
  assert.equal(pastBoxCutoff(layout, layout.combU + BOXED_RIDE_M + 0.01, faceU - 3), true);
});
