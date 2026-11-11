import { test } from "node:test";
import assert from "node:assert/strict";
import { ESCALATOR, escalatorLayout, stepCentres, stepUnder, surfaceHeight, beltDirection, boardingU, riderAt, freeBoarding, rideSeconds } from "./escalator.js";

const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, actual + " is not " + expected);
const top = escalatorLayout({ widthM: 2.6, landing: "top" });
const bottom = escalatorLayout({ widthM: 2.6, landing: "bottom" });

test("the arriving belt runs toward the landing and the leaving belt away from it", () => {
  assert.equal(beltDirection("arrive"), -1);
  assert.equal(beltDirection("leave"), 1);
});

test("a ride takes the length of the incline over the belt speed", () => {
  near(rideSeconds(top), (top.endU - top.combU) / ESCALATOR.beltSpeedMps);
});

test("an arrival boards on a step centre at the far end, whatever the belt has moved", () => {
  for (const travel of [0, 0.13, 0.4, 1.77]) {
    for (const layout of [top, bottom]) {
      const u = boardingU(layout, "arrive", travel);
      assert.ok(u <= layout.endU + 1e-9 && u > layout.endU - ESCALATOR.stepDepthM - 1e-9, "within a step of the end");
      assert.ok(stepCentres(layout, -travel).some((c) => Math.abs(c - u) < 1e-9), "is a step centre");
    }
  }
});

test("a leaver boards on the first step centre at or past the comb plate", () => {
  for (const travel of [0, 0.13, 0.4, 1.77]) {
    const u = boardingU(top, "leave", travel);
    assert.ok(u >= top.combU - 1e-9 && u < top.combU + ESCALATOR.stepDepthM + 1e-9);
    assert.ok(stepCentres(top, travel).some((c) => Math.abs(c - u) < 1e-9));
  }
});

test("a rider stays on the same step for the whole ride", () => {
  for (const [role, layout] of [["arrive", top], ["arrive", bottom], ["leave", top], ["leave", bottom]]) {
    const travel0 = 0.27;
    const board = boardingU(layout, role, travel0);
    for (let since = 0; since < 12; since += 0.37) {
      const pose = riderAt(layout, role, board, since);
      if (pose.status !== "riding") break;
      const under = stepUnder(layout, pose.u, beltDirection(role) * (travel0 + since));
      near(under.centreU, pose.u, 1e-6);
      near(pose.y, surfaceHeight(layout, pose.u), 1e-9);
    }
  }
});

test("an arrival comes up out of the well at the top landing and down the incline at the bottom", () => {
  const start = riderAt(top, "arrive", boardingU(top, "arrive", 0), 0);
  assert.ok(start.y < -3.5, "deep in the well");
  const high = riderAt(bottom, "arrive", boardingU(bottom, "arrive", 0), 0);
  assert.ok(high.y > 3.5, "high up at the bottom landing");
});

test("an arrival is off the belt at the comb plate on the level and a leaver is off at the far end", () => {
  const board = boardingU(top, "arrive", 0);
  const metres = board - top.combU;
  assert.equal(riderAt(top, "arrive", board, metres - 0.05).status, "riding");
  assert.equal(riderAt(top, "arrive", board, metres + 0.01).status, "off");
  const leaver = boardingU(top, "leave", 0);
  const end = top.endU - leaver;
  assert.equal(riderAt(top, "leave", leaver, end - 0.05).status, "riding");
  assert.equal(riderAt(top, "leave", leaver, end + 0.01).status, "off");
});

test("a rider queued past the far end is hidden until the belt brings them on", () => {
  const queued = riderAt(top, "arrive", top.endU + 1.2, 0);
  assert.equal(queued.hidden, true);
  assert.equal(riderAt(top, "arrive", top.endU + 1.2, 2.5).hidden, false);
});

test("a leaver waits while the step just past the comb plate is crowded", () => {
  const gap = ESCALATOR.rideGapM;
  const c = boardingU(top, "leave", 0);
  assert.equal(freeBoarding(top, "leave", 0, [c + gap - 0.1], gap), null);
  assert.equal(freeBoarding(top, "leave", 0, [c + gap], gap), c);
  assert.equal(freeBoarding(top, "leave", 0, [], gap), c);
});

test("an arrival joins at the far end, or queues behind the last rider a gap apart", () => {
  const gap = ESCALATOR.rideGapM;
  const c = boardingU(top, "arrive", 0);
  assert.equal(freeBoarding(top, "arrive", 0, [], gap), c);
  assert.equal(freeBoarding(top, "arrive", 0, [c - gap], gap), c);
  near(freeBoarding(top, "arrive", 0, [c - gap + 0.4], gap), c + 0.4);
  near(freeBoarding(top, "arrive", 0, [c + 1.2], gap), c + 1.2 + gap);
});

test("a steady stream of boarders never shares a step, queued arrivals included, however the belt phase falls", () => {
  const gap = ESCALATOR.rideGapM;
  for (const role of ["leave", "arrive"]) {
    for (const layout of [top, bottom]) {
      for (const phase of [0, 0.1, 0.23, 0.39]) {
        const riders = [];
        let travel = phase;
        for (let tick = 0; tick < 1200; tick += 1) {
          travel += ESCALATOR.beltSpeedMps * 0.1;
          const poses = riders.map((r) => riderAt(layout, role, r.boardU, travel - r.boardTravel)).filter((pose) => pose.status === "riding");
          const board = freeBoarding(layout, role, travel, poses.map((pose) => pose.u), gap);
          if (board !== null && tick % 3 === 0) riders.push({ boardU: board, boardTravel: travel });
          const steps = poses.filter((pose) => !pose.hidden).map((pose) => stepUnder(layout, pose.u, beltDirection(role) * travel).centreU.toFixed(6));
          assert.equal(new Set(steps).size, steps.length, role + ": two riders on one step at tick " + tick);
        }
        assert.ok(riders.length > 10, "the stream kept boarding");
      }
    }
  }
});
