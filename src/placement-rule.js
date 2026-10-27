/**
 * @typedef {{ min: number, max: number }} Band
 * @typedef {{
 *   id: string, name: string, description: string,
 *   heightRangeM: { min: number, max: number, step: number },
 *   facePointM: number, humanHeightM: number,
 *   feetAngleDeg: { target: number, best: Band, acceptable: Band },
 *   faceAngleDeg: { best: Band, acceptableMax: number }
 * }} SceneProfile
 * @typedef {{ sensorWidthMm: number, focalLengthMm: number, resolution: { w: number, h: number } }} CameraOptics
 * @typedef {"best" | "acceptable" | "out_of_range"} Status
 * @typedef {"outside_frame" | "beyond_available_depth" | "camera_below_face_point"} NotVisibleReason
 */

const DEG = 180 / Math.PI;
// Distances are reported to the centimetre, so face line search steps by 1 cm.
const DISTANCE_STEP_M = 0.01;
const MAX_SEARCH_STEPS = 500;

const round1 = (value) => Math.round(value * 10) / 10;
const round2 = (value) => Math.round(value * 100) / 100;
const toRad = (deg) => deg / DEG;

/** @returns {number} downward angle in degrees from a camera at heightM to a point at pointHeightM, distanceM away */
function downwardAngle(heightM, pointHeightM, distanceM) {
  return Math.atan2(heightM - pointHeightM, distanceM) * DEG;
}

/** @param {number} heightM @param {number} distanceM @returns {number} */
export function feetAngle(heightM, distanceM) {
  return downwardAngle(heightM, 0, distanceM);
}

/** @param {number} heightM @param {number} distanceM @param {number} facePointM @returns {number} */
export function faceAngle(heightM, distanceM, facePointM) {
  return downwardAngle(heightM, facePointM, distanceM);
}

/** @param {number} angleDeg @param {SceneProfile} profile @returns {Status} */
export function judgeFeet(angleDeg, profile) {
  const angle = round1(angleDeg);
  const { best, acceptable } = profile.feetAngleDeg;
  if (angle >= best.min && angle <= best.max) return "best";
  if (angle >= acceptable.min && angle <= acceptable.max) return "acceptable";
  return "out_of_range";
}

/** A face angle too flat to be Best is Acceptable, never Out of range. */
/** @param {number} angleDeg @param {SceneProfile} profile @returns {Status} */
export function judgeFace(angleDeg, profile) {
  const angle = round1(angleDeg);
  const { best, acceptableMax } = profile.faceAngleDeg;
  if (angle >= best.min && angle < best.max) return "best";
  if (angle <= acceptableMax) return "acceptable";
  return "out_of_range";
}

/** @param {number} heightM @param {SceneProfile} profile @returns {number} */
export function recommendedDistance(heightM, profile) {
  return round2(heightM / Math.tan(toRad(profile.feetAngleDeg.target)));
}

/**
 * The distance closest to the counting line at which the face angle is Best.
 * @param {number} heightM @param {number} countingDistanceM @param {SceneProfile} profile
 * @returns {number | null} null when the camera is not above the face point
 */
export function faceLineDistance(heightM, countingDistanceM, profile) {
  const { facePointM, faceAngleDeg } = profile;
  if (heightM <= facePointM) return null;
  const isBest = (d) => judgeFace(faceAngle(heightM, d, facePointM), profile) === "best";
  if (isBest(countingDistanceM)) return round2(countingDistanceM);

  // Angles are judged after rounding to 0.1 deg, so the Best band really ends 0.05 deg past
  // each edge. Start just outside that rounded edge and walk toward the counting line, so the
  // first Best distance found is the one closest to it.
  const tooSteep = round1(faceAngle(heightM, countingDistanceM, facePointM)) >= faceAngleDeg.best.max;
  const edgeAngle = tooSteep ? faceAngleDeg.best.max - 0.05 : faceAngleDeg.best.min - 0.05;
  const direction = tooSteep ? 1 : -1;
  const edgeDistance = (heightM - facePointM) / Math.tan(toRad(edgeAngle));
  let d = tooSteep ? Math.floor(edgeDistance * 100) / 100 : Math.ceil(edgeDistance * 100) / 100;
  for (let i = 0; i < MAX_SEARCH_STEPS; i += 1) {
    if (isBest(d)) return d;
    d = round2(d + direction * DISTANCE_STEP_M);
  }
  throw new Error(`No face-best distance found for height ${heightM} m in profile ${profile.id}`);
}

/** Aims at half the human height of a person standing at the counting line. */
/** @param {number} heightM @param {number} countingDistanceM @param {SceneProfile} profile @returns {number} */
export function recommendedTilt(heightM, countingDistanceM, profile) {
  return downwardAngle(heightM, profile.humanHeightM / 2, countingDistanceM);
}

/** @param {CameraOptics} camera @returns {number} */
export function verticalFov(camera) {
  const sensorHeightMm = camera.sensorWidthMm * (camera.resolution.h / camera.resolution.w);
  return 2 * Math.atan(sensorHeightMm / (2 * camera.focalLengthMm)) * DEG;
}

/** @param {CameraOptics} camera @returns {number} */
export function horizontalFov(camera) {
  return 2 * Math.atan(camera.sensorWidthMm / (2 * camera.focalLengthMm)) * DEG;
}

const inFrame = (angleDeg, tiltDeg, vFovDeg) =>
  angleDeg >= tiltDeg - vFovDeg / 2 && angleDeg <= tiltDeg + vFovDeg / 2;

function judgeFaceLine({ profile, heightM, distanceM, tiltDeg, vFovDeg, availableDepthM }) {
  const distance = faceLineDistance(heightM, distanceM, profile);
  if (distance === null) {
    return { distanceM: null, angleDeg: null, coincides: false, visible: false, reason: "camera_below_face_point" };
  }
  const angleDeg = faceAngle(heightM, distance, profile.facePointM);
  const base = { distanceM: distance, angleDeg, coincides: distance === round2(distanceM) };
  if (availableDepthM != null && distance > availableDepthM) {
    return { ...base, visible: false, reason: "beyond_available_depth" };
  }
  if (!inFrame(angleDeg, tiltDeg, vFovDeg)) {
    return { ...base, visible: false, reason: "outside_frame" };
  }
  return { ...base, visible: true, reason: null };
}

// Detection is unreliable in the outer edge of the frame, so only the middle 80% counts as fully covered.
const EFFECTIVE_COVERAGE = 0.8;

/**
 * Whether an entrance of a given width fits the width the camera covers at the counting line.
 * @param {number} entranceWidthM
 * @param {number} coverageWidthM
 * @returns {{ widthM: number, status: "covered" | "tight" | "too_wide", uncoveredM: number }}
 */
export function entranceCoverage(entranceWidthM, coverageWidthM) {
  if (entranceWidthM > coverageWidthM) {
    return { widthM: entranceWidthM, status: "too_wide", uncoveredM: entranceWidthM - coverageWidthM };
  }
  const status = entranceWidthM <= coverageWidthM * EFFECTIVE_COVERAGE ? "covered" : "tight";
  return { widthM: entranceWidthM, status, uncoveredM: 0 };
}

/**
 * Judges one placement: a camera at heightM with its counting line distanceM away.
 * @param {{ profile: SceneProfile, heightM: number, distanceM: number, camera: CameraOptics,
 *           tiltDeg?: number, availableDepthM?: number, entranceWidthM?: number }} placement
 */
export function evaluatePlacement({ profile, heightM, distanceM, camera, tiltDeg, availableDepthM, entranceWidthM }) {
  const feetAngleDeg = feetAngle(heightM, distanceM);
  const faceAngleDeg = faceAngle(heightM, distanceM, profile.facePointM);
  const feetStatus = judgeFeet(feetAngleDeg, profile);
  const recommended = recommendedTilt(heightM, distanceM, profile);
  const tilt = tiltDeg ?? recommended;
  const vFovDeg = verticalFov(camera);
  const hFovDeg = horizontalFov(camera);
  const headAngleDeg = downwardAngle(heightM, profile.humanHeightM, distanceM);
  const framed = inFrame(feetAngleDeg, tilt, vFovDeg) && inFrame(headAngleDeg, tilt, vFovDeg);
  const coverageWidthM = 2 * Math.hypot(heightM, distanceM) * Math.tan(toRad(hFovDeg / 2));
  const { min, max } = profile.heightRangeM;

  return {
    feet: { angleDeg: feetAngleDeg, status: feetStatus },
    face: { angleDeg: faceAngleDeg, status: judgeFace(faceAngleDeg, profile) },
    countingLine: { distanceM, recommendedDistanceM: recommendedDistance(heightM, profile), framed, headAngleDeg },
    faceLine: judgeFaceLine({ profile, heightM, distanceM, tiltDeg: tilt, vFovDeg, availableDepthM }),
    tilt: { value: tilt, recommended },
    optics: { verticalFovDeg: vFovDeg, horizontalFovDeg: hFovDeg, coverageWidthM, pixelsPerMetre: camera.resolution.w / coverageWidthM },
    entrance: entranceWidthM == null ? null : entranceCoverage(entranceWidthM, coverageWidthM),
    verdict: framed ? feetStatus : "out_of_range",
    warnings: heightM < min || heightM > max ? ["height_outside_range"] : [],
  };
}

/** @param {SceneProfile} profile */
export function lookupTable(profile) {
  const { min, max, step } = profile.heightRangeM;
  const count = Math.round((max - min) / step);
  return Array.from({ length: count + 1 }, (_, i) => {
    const heightM = round2(min + i * step);
    const distanceM = recommendedDistance(heightM, profile);
    const feetAngleDeg = feetAngle(heightM, distanceM);
    const faceAngleDeg = faceAngle(heightM, distanceM, profile.facePointM);
    return {
      heightM,
      recommendedDistanceM: distanceM,
      feetAngleDeg: round2(feetAngleDeg),
      feetStatus: judgeFeet(feetAngleDeg, profile),
      faceAngleDeg: round2(faceAngleDeg),
      faceStatus: judgeFace(faceAngleDeg, profile),
      faceLineDistanceM: faceLineDistance(heightM, distanceM, profile),
    };
  });
}

/** @param {SceneProfile} profile @throws {Error} when the thresholds contradict each other */
export function validateProfile(profile) {
  const { target, best, acceptable } = profile.feetAngleDeg;
  const face = profile.faceAngleDeg;
  const range = profile.heightRangeM;
  const problems = [
    !(best.min <= target && target <= best.max) && `target ${target} deg is outside the best band ${best.min}-${best.max}`,
    !(acceptable.min <= best.min && best.max <= acceptable.max) && `best band ${best.min}-${best.max} is not inside the acceptable band ${acceptable.min}-${acceptable.max}`,
    !(face.best.min < face.best.max && face.best.max <= face.acceptableMax) && `face best band ${face.best.min}-${face.best.max} must sit below the acceptable max ${face.acceptableMax}`,
    !(range.min < range.max && range.step > 0) && `height range ${range.min}-${range.max} m step ${range.step} is invalid`,
    !(profile.facePointM > 0 && profile.facePointM < profile.humanHeightM) && `face point ${profile.facePointM} m must be above ground and below human height ${profile.humanHeightM} m`,
  ].filter(Boolean);
  if (problems.length > 0) {
    throw new Error(`Scene profile ${profile.id}: ${problems.join("; ")}`);
  }
}

const CSV_COLUMNS = [
  ["height_m", (r) => r.heightM.toFixed(1)],
  ["recommended_distance_m", (r) => r.recommendedDistanceM.toFixed(2)],
  ["feet_angle_deg", (r) => r.feetAngleDeg.toFixed(2)],
  ["feet_status", (r) => r.feetStatus],
  ["face_angle_deg", (r) => r.faceAngleDeg.toFixed(2)],
  ["face_status", (r) => r.faceStatus],
  ["face_line_distance_m", (r) => (r.faceLineDistanceM === null ? "" : r.faceLineDistanceM.toFixed(2))],
];

/** @param {ReturnType<typeof lookupTable>} rows @returns {string} */
export function toCsv(rows) {
  const header = CSV_COLUMNS.map(([name]) => name).join(",");
  const lines = rows.map((row) => CSV_COLUMNS.map(([, read]) => read(row)).join(","));
  return [header, ...lines].join("\n") + "\n";
}
