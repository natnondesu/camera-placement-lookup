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
  beltSpeedMps: 0.5,
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
