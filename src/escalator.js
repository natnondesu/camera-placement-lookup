// @ts-check

/**
 * The shape of an escalator pair at a landing, shared by every view that draws one. It is scenery, not a rule: the
 * Escalator scene is judged on the flat landing with the Open door thresholds (ADR 0007), and the engine never reads this.
 *
 * Coordinates, as the camera faces the escalators: x metres to the right of the centre of the pair, u metres beyond
 * the counting line (away from the camera), y metres above the landing floor.
 */

/** The dimensions of a typical mall escalator, and how the pair sits behind the counting line. */
export const ESCALATOR = Object.freeze({
  /** Counting line to the comb plate: people are counted a few steps after they step off. */
  landingRunM: 1.5,
  /** The level steps between the comb plate and the incline. */
  flatRunM: 0.8,
  inclineDeg: 30,
  /** How far the incline climbs or drops before the drawing ends. */
  riseM: 4,
  stepDepthM: 0.4,
  stepWidthM: 1,
  /** Between the two escalators of a standard pair. */
  dividerM: 0.6,
  minDividerM: 0.3,
  /** Each side panel, outside the steps. */
  balustradeM: 0.15,
  handrailM: 1,
  /** How far the truss hangs below the step tops. */
  trussM: 0.4,
  /** The low rail round the outer sides of a well at the top landing. */
  guardM: 0.7,
  /** The upper-floor slab a rising escalator ends on, beyond its far end. */
  slabM: 1.8,
  beltSpeedMps: 0.5,
  /** Along the belt between two riders: two steps, so nobody stands inside the person ahead. */
  rideGapM: 0.8,
  /** Two one-metre escalators and their divider, outer step edge to outer step edge. */
  defaultWidthM: 2.6,
});

/** The landing the camera is mounted at. */
export const LANDINGS = Object.freeze(["top", "bottom"]);

const SLOPE = Math.tan((ESCALATOR.inclineDeg * Math.PI) / 180);
const wrap = (value, size) => ((value % size) + size) % size;

/**
 * @typedef {{ role: "leave" | "arrive", minX: number, maxX: number, centreX: number }} EscalatorLane
 * @typedef {{
 *   landing: "top" | "bottom", direction: -1 | 1, widthM: number, stepWidthM: number, dividerM: number,
 *   combU: number, inclineU: number, endU: number, riseM: number, lanes: [EscalatorLane, EscalatorLane]
 * }} EscalatorLayout
 *   direction is the sign of the incline's height: -1 at the top landing (the steps drop away), 1 at the bottom.
 */

/**
 * The pair for a walkable width (both escalators and their divider, outer step edge to outer step edge). People
 * leave on the camera's left and arrive on its right. Extra width goes to the divider; a width too narrow for
 * one-metre steps narrows the steps.
 * @param {{ widthM?: number | null, landing?: string }} pair
 * @returns {EscalatorLayout}
 */
export function escalatorLayout({ widthM, landing } = {}) {
  const width = Number.isFinite(widthM) && Number(widthM) > 0 ? Number(widthM) : ESCALATOR.defaultWidthM;
  const roomy = width - 2 * ESCALATOR.stepWidthM >= ESCALATOR.minDividerM;
  const dividerM = roomy ? width - 2 * ESCALATOR.stepWidthM : ESCALATOR.minDividerM;
  const stepWidthM = roomy ? ESCALATOR.stepWidthM : Math.max(0.4, (width - ESCALATOR.minDividerM) / 2);
  const inner = dividerM / 2;
  const outer = inner + stepWidthM;
  const at = landing === "bottom" ? "bottom" : "top";
  const inclineU = ESCALATOR.landingRunM + ESCALATOR.flatRunM;
  return {
    landing: at,
    direction: at === "bottom" ? 1 : -1,
    widthM: width,
    stepWidthM,
    dividerM,
    combU: ESCALATOR.landingRunM,
    inclineU,
    endU: inclineU + ESCALATOR.riseM / SLOPE,
    riseM: ESCALATOR.riseM,
    lanes: [
      { role: "leave", minX: -outer, maxX: -inner, centreX: -(inner + outer) / 2 },
      { role: "arrive", minX: inner, maxX: outer, centreX: (inner + outer) / 2 },
    ],
  };
}

/**
 * The height of the escalator's slope line u metres beyond the counting line: level across the landing and the flat
 * steps, then along the incline to the full rise.
 * @param {EscalatorLayout} layout
 * @param {number} u
 * @returns {number}
 */
export function surfaceHeight(layout, u) {
  const along = Math.min(Math.max(u, layout.inclineU), layout.endU) - layout.inclineU;
  return along === 0 ? 0 : layout.direction * along * SLOPE;
}

/** Where the step grid starts for a belt that has moved travelM (either way): the centre of a step. */
const firstCentre = (layout, travelM) => layout.combU + ESCALATOR.stepDepthM / 2 + wrap(travelM, ESCALATOR.stepDepthM);

/**
 * The centre of every step showing between the comb plate and the far end, for a belt that has moved travelM.
 * @param {EscalatorLayout} layout
 * @param {number} travelM
 * @returns {number[]}
 */
export function stepCentres(layout, travelM) {
  const depth = ESCALATOR.stepDepthM;
  const centres = [];
  for (let u = firstCentre(layout, travelM) - depth; u <= layout.endU + 1e-9; u += depth) {
    if (u > layout.combU - depth / 2 + 1e-9) centres.push(u);
  }
  return centres;
}

/**
 * The step a person at u stands on: steps are level, so a rider's feet are at the step's top, not on the slope line.
 * @param {EscalatorLayout} layout
 * @param {number} u
 * @param {number} travelM
 * @returns {{ centreU: number, topY: number } | null} null on the landing floor or past the far end
 */
export function stepUnder(layout, u, travelM) {
  if (u < layout.combU || u > layout.endU) return null;
  const depth = ESCALATOR.stepDepthM;
  const first = firstCentre(layout, travelM);
  const centreU = first + Math.round((u - first) / depth) * depth;
  return { centreU, topY: surfaceHeight(layout, centreU) };
}

/**
 * What the face line falls on. The engine places it on a flat floor; on the incline people ride higher or lower
 * than that, so the face reading there is only approximate.
 * @param {EscalatorLayout} layout
 * @param {number | null | undefined} beyondLineM how far the face line is beyond the counting line (negative: in front of it)
 * @returns {"landing" | "steps" | "incline"}
 */
export function faceLineSurface(layout, beyondLineM) {
  if (!Number.isFinite(beyondLineM) || Number(beyondLineM) <= layout.combU) return "landing";
  return Number(beyondLineM) <= layout.inclineU ? "steps" : "incline";
}

/**
 * The openings in the landing floor: at the top landing each escalator drops through one, from where its incline
 * starts. The divider between them keeps its floor.
 * @param {EscalatorLayout} layout
 * @returns {{ minX: number, maxX: number, minU: number, maxU: number }[]}
 */
export function floorWells(layout) {
  if (layout.landing !== "top") return [];
  return layout.lanes.map((lane) => ({
    minX: lane.minX - ESCALATOR.balustradeM,
    maxX: lane.maxX + ESCALATOR.balustradeM,
    minU: layout.inclineU,
    maxU: layout.endU + 0.5,
  }));
}

/**
 * The escalator seen from the side, as polylines of { u, y }: the step treads with their risers (the teeth), the
 * handrail above them and the underside of the truss. Shared by every flat drawing so they agree.
 * @param {EscalatorLayout} layout
 * @returns {{ treads: { u: number, y: number }[], handrail: { u: number, y: number }[], underside: { u: number, y: number }[] }}
 */
export function sideOutline(layout) {
  const half = ESCALATOR.stepDepthM / 2;
  const treads = stepCentres(layout, 0).flatMap((centre) => {
    const y = surfaceHeight(layout, centre);
    return [{ u: centre - half, y }, { u: centre + half, y }];
  });
  const along = (offset) => [layout.combU, layout.inclineU, layout.endU].map((u) => ({ u, y: surfaceHeight(layout, u) + offset }));
  return { treads, handrail: along(ESCALATOR.handrailM), underside: along(-ESCALATOR.trussM) };
}

/** How far below the landing floor the bottom of a well is: under the lowest point of the truss. */
export const pitDepthM = (layout) => layout.riseM + ESCALATOR.trussM + 0.3;

const bandOffsets = (layout) => [layout.combU, layout.inclineU, layout.endU];

/**
 * A strip following the escalator's surface in side view: the top edge at topOffsetM from the surface along the
 * comb plate, the foot of the incline and the far end, then back along the bottom edge at bottomOffsetM.
 * @param {EscalatorLayout} layout
 * @returns {{ u: number, y: number }[]}
 */
export function slopeBand(layout, topOffsetM, bottomOffsetM) {
  const along = bandOffsets(layout);
  return [
    ...along.map((u) => ({ u, y: surfaceHeight(layout, u) + topOffsetM })),
    ...along.reverse().map((u) => ({ u, y: surfaceHeight(layout, u) + bottomOffsetM })),
  ];
}

/** Like slopeBand, but the bottom edge is level at floorY: a side panel that reaches down to the floor. */
export function slopeSkirt(layout, topOffsetM, floorY) {
  return slopeBand(layout, topOffsetM, 0).map((point, i) => (i < 3 ? point : { u: point.u, y: floorY }));
}

const EPSILON = 1e-9;

/**
 * Rectangles { minX, maxX, minU, maxU } that tile bounds except for the holes (the wells).
 * @param {{ minX: number, maxX: number, minU: number, maxU: number }} bounds
 * @param {{ minX: number, maxX: number, minU: number, maxU: number }[]} holes
 */
export function floorPieces(bounds, holes) {
  const clamp = (x) => Math.min(Math.max(x, bounds.minX), bounds.maxX);
  const cuts = [bounds.minX, bounds.maxX, ...holes.flatMap((h) => [clamp(h.minX), clamp(h.maxX)])].sort((a, b) => a - b);
  const pieces = [];
  for (let i = 0; i + 1 < cuts.length; i += 1) {
    const [minX, maxX] = [cuts[i], cuts[i + 1]];
    if (maxX - minX <= EPSILON) continue;
    const middle = (minX + maxX) / 2;
    const gaps = holes.filter((h) => h.minX < middle && middle < h.maxX).sort((a, b) => a.minU - b.minU);
    let from = bounds.minU;
    for (const gap of gaps) {
      if (gap.minU - from > EPSILON) pieces.push({ minX, maxX, minU: from, maxU: Math.min(gap.minU, bounds.maxU) });
      from = Math.max(from, gap.maxU);
    }
    if (bounds.maxU - from > EPSILON) pieces.push({ minX, maxX, minU: from, maxU: bounds.maxU });
  }
  return pieces;
}

/** Subtracts the open intervals in cuts from [from, to]. */
function without(from, to, cuts) {
  const kept = [];
  let at = from;
  for (const [a, b] of [...cuts].sort((p, q) => p[0] - q[0])) {
    if (a > at + EPSILON) kept.push([at, Math.min(a, to)]);
    at = Math.max(at, b);
  }
  if (to - at > EPSILON) kept.push([at, to]);
  return kept.filter(([a, b]) => b - a > EPSILON);
}

/**
 * Grid lines at whole steps (x along u and u along x) over bounds, cut where they would cross a hole. A line
 * lying along a hole's edge is kept.
 * @returns {{ x0: number, u0: number, x1: number, u1: number }[]}
 */
export function gridSegments(bounds, step, holes) {
  const segments = [];
  const first = (min) => Math.ceil(min / step - EPSILON) * step;
  for (let x = first(bounds.minX); x <= bounds.maxX + EPSILON; x += step) {
    const cuts = holes.filter((h) => h.minX < x - EPSILON && x + EPSILON < h.maxX).map((h) => [h.minU, h.maxU]);
    without(bounds.minU, bounds.maxU, cuts).forEach(([u0, u1]) => segments.push({ x0: x, u0, x1: x, u1 }));
  }
  for (let u = first(bounds.minU); u <= bounds.maxU + EPSILON; u += step) {
    const cuts = holes.filter((h) => h.minU < u - EPSILON && u + EPSILON < h.maxU).map((h) => [h.minX, h.maxX]);
    without(bounds.minX, bounds.maxX, cuts).forEach(([x0, x1]) => segments.push({ x0, u0: u, x1, u1: u }));
  }
  return segments;
}

/** Which way a belt carries people along u: toward the landing for the arriving lane, away from it for the leaving one. */
export const beltDirection = (role) => (role === "arrive" ? -1 : 1);

/** Seconds from one end of a belt to the other. */
export const rideSeconds = (layout) => (layout.endU - layout.combU) / ESCALATOR.beltSpeedMps;

/**
 * The step a person gets on at, for a belt that has moved travelM in its own direction: an arrival at the far end, a
 * leaver at the comb plate. It is a step centre, so a rider standing there stays on that step for the whole ride.
 * @param {EscalatorLayout} layout
 * @param {"arrive" | "leave"} role
 * @param {number} travelM how far the belt has run since rest (always positive)
 * @returns {number} u
 */
export function boardingU(layout, role, travelM) {
  const centres = stepCentres(layout, beltDirection(role) * travelM);
  return role === "arrive"
    ? Math.max(...centres.filter((u) => u <= layout.endU + EPSILON))
    : Math.min(...centres.filter((u) => u >= layout.combU - EPSILON));
}

/**
 * Where a rider is after the belt has carried them sinceM. The belt moves the whole step, so u moves at belt speed
 * and the feet stay on the top of the same step.
 * @param {EscalatorLayout} layout
 * @param {"arrive" | "leave"} role
 * @param {number} boardU where they got on (past the far end for an arrival still queued behind the others)
 * @param {number} sinceM belt travel since they got on
 * @returns {{ u: number, y: number, status: "riding" | "off", hidden: boolean }}
 *   hidden: queued past the far end, not yet on the steps
 */
export function riderAt(layout, role, boardU, sinceM) {
  const u = boardU + beltDirection(role) * sinceM;
  const off = role === "arrive" ? u <= layout.combU + EPSILON : u >= layout.endU - EPSILON;
  return { u, y: surfaceHeight(layout, u), status: off ? "off" : "riding", hidden: role === "arrive" && u > layout.endU + EPSILON };
}

/**
 * The step a newcomer may get on at given where the riders are now (their u), or null if they must wait. A leaver
 * waits at the comb plate until the one ahead is a gap along; an arrival takes the far end or queues, out of sight,
 * a gap behind the last rider.
 * @param {EscalatorLayout} layout
 * @param {"arrive" | "leave"} role
 * @param {number} travelM
 * @param {number[]} ridersU
 * @param {number} gapM
 * @returns {number | null}
 */
export function freeBoarding(layout, role, travelM, ridersU, gapM) {
  const start = boardingU(layout, role, travelM);
  if (role === "leave") return ridersU.some((u) => u < start + gapM - EPSILON) ? null : start;
  return ridersU.reduce((at, u) => Math.max(at, u + gapM), start);
}
