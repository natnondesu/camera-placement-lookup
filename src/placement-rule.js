/**
 * @typedef {{ min: number, max: number }} Band
 * @typedef {{
 *   id: string, name: string, description: string,
 *   heightRangeM: { min: number, max: number, step: number },
 *   facePointM: number, humanHeightM: number,
 *   feetAngleDeg: { target: number, best: Band, acceptable: Band },
 *   faceAngleDeg: { best: Band, acceptableMax: number },
 *   minPixelsPerMetre: { counting: number, face: number }
 * }} SceneProfile
 * @typedef {{ sensorWidthMm?: number, focalLengthMm?: number, resolution: { w: number, h: number },
 *            lens?: "rectilinear" | "fisheye", fovDeg?: number }} CameraOptics
 *   A fisheye is ceiling-mounted looking straight down, with an equidistant lens of fovDeg.
 * @typedef {"best" | "acceptable" | "out_of_range"} Status
 * @typedef {"outside_frame" | "camera_below_face_point"} NotVisibleReason
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

const isFisheye = (camera) => camera.lens === "fisheye";
// Detection is unreliable in the outer edge of the image, so only the middle 80% counts as fully covered.
const EFFECTIVE_COVERAGE = 0.8;
// Floor seen more than this far off a fisheye's axis is squeezed against the image circle's edge.
const FISHEYE_MAX_OFF_AXIS_DEG = 80;

/** @param {CameraOptics} camera @returns {number} */
export function verticalFov(camera) {
  if (isFisheye(camera)) return camera.fovDeg;
  const sensorHeightMm = camera.sensorWidthMm * (camera.resolution.h / camera.resolution.w);
  return 2 * Math.atan(sensorHeightMm / (2 * camera.focalLengthMm)) * DEG;
}

/** @param {CameraOptics} camera @returns {number} */
export function horizontalFov(camera) {
  if (isFisheye(camera)) return camera.fovDeg;
  return 2 * Math.atan(camera.sensorWidthMm / (2 * camera.focalLengthMm)) * DEG;
}

/**
 * Horizontal pixel density at a point.
 * @param {CameraOptics} camera
 * @param {number} slantDistanceM straight-line distance from the camera
 * @param {number} offAxisDeg angle between the point and the camera's optical axis
 * @returns {number} pixels per metre
 */
export function pixelDensity(camera, slantDistanceM, offAxisDeg) {
  if (isFisheye(camera)) {
    // Equidistant lens: image radius grows linearly with the off-axis angle.
    const pxPerRad = Math.min(camera.resolution.w, camera.resolution.h) / 2 / toRad(camera.fovDeg / 2);
    const theta = toRad(offAxisDeg);
    const stretch = theta < 1e-6 ? 1 : theta / Math.sin(theta);
    return (pxPerRad * stretch) / slantDistanceM;
  }
  return camera.resolution.w / (2 * slantDistanceM * Math.tan(toRad(horizontalFov(camera) / 2)));
}

/**
 * Where a point lands in a ceiling fisheye image that looks straight down, with forward (+z) at the top.
 * @param {{ x: number, y: number, z: number }} offset point minus camera position (m)
 * @param {number} fovDeg the lens's full field of view
 * @returns {{ u: number, v: number, offAxisDeg: number, inside: boolean }} u, v in -1..1 across the image circle
 */
export function fisheyeProjection(offset, fovDeg) {
  const length = Math.hypot(offset.x, offset.y, offset.z) || 1e-9;
  const theta = Math.acos(Math.max(-1, Math.min(1, -offset.y / length)));
  const phi = Math.atan2(offset.z, -offset.x);
  const r = theta / toRad(fovDeg / 2);
  return { u: r * Math.cos(phi), v: r * Math.sin(phi), offAxisDeg: theta * DEG, inside: r <= 1 };
}

// The floor width at the counting line inside a fisheye's view, out to maxOffAxisDeg from straight down.
function fisheyeChord(heightM, distanceM, maxOffAxisDeg) {
  const reach = heightM * Math.tan(toRad(Math.min(maxOffAxisDeg, FISHEYE_MAX_OFF_AXIS_DEG)));
  return reach > distanceM ? 2 * Math.sqrt(reach * reach - distanceM * distanceM) : 0;
}

function coverageWidth(camera, heightM, distanceM) {
  if (isFisheye(camera)) return fisheyeChord(heightM, distanceM, camera.fovDeg / 2);
  return 2 * Math.hypot(heightM, distanceM) * Math.tan(toRad(horizontalFov(camera) / 2));
}

// Detection is unreliable at the edge of the image: the middle 80% of the width, or of a fisheye's radius.
function effectiveWidth(camera, heightM, distanceM) {
  if (isFisheye(camera)) return fisheyeChord(heightM, distanceM, (camera.fovDeg / 2) * EFFECTIVE_COVERAGE);
  return coverageWidth(camera, heightM, distanceM) * EFFECTIVE_COVERAGE;
}

const inFrame = (angleDeg, tiltDeg, vFovDeg) =>
  angleDeg >= tiltDeg - vFovDeg / 2 && angleDeg <= tiltDeg + vFovDeg / 2;

function judgeFaceLine({ profile, camera, heightM, distanceM, tiltDeg, vFovDeg }) {
  const distance = faceLineDistance(heightM, distanceM, profile);
  if (distance === null) {
    return { distanceM: null, angleDeg: null, coincides: false, pixelsPerMetre: null, visible: false, tooSmall: false, reason: "camera_below_face_point" };
  }
  const angleDeg = faceAngle(heightM, distance, profile.facePointM);
  const pixelsPerMetre = pixelDensity(camera, Math.hypot(heightM - profile.facePointM, distance), 90 - angleDeg);
  const base = { distanceM: distance, angleDeg, coincides: distance === round2(distanceM), pixelsPerMetre };
  if (!inFrame(angleDeg, tiltDeg, vFovDeg)) {
    return { ...base, visible: false, tooSmall: false, reason: "outside_frame" };
  }
  // In frame but too few pixels across a face for demographics; still never fails the placement.
  return { ...base, visible: true, tooSmall: pixelsPerMetre < profile.minPixelsPerMetre.face, reason: null };
}

/**
 * Whether an entrance of a given width fits the width the camera covers at the counting line.
 * @param {number} entranceWidthM
 * @param {number} coverageWidthM
 * @param {number} [effectiveWidthM] the reliably covered part; the middle 80% when omitted
 * @returns {{ widthM: number, status: "covered" | "tight" | "too_wide", uncoveredM: number }}
 */
export function entranceCoverage(entranceWidthM, coverageWidthM, effectiveWidthM = coverageWidthM * EFFECTIVE_COVERAGE) {
  if (entranceWidthM > coverageWidthM) {
    return { widthM: entranceWidthM, status: "too_wide", uncoveredM: entranceWidthM - coverageWidthM };
  }
  const status = entranceWidthM <= effectiveWidthM ? "covered" : "tight";
  return { widthM: entranceWidthM, status, uncoveredM: 0 };
}

/**
 * Judges one placement: a camera at heightM with its counting line distanceM away.
 * @param {{ profile: SceneProfile, heightM: number, distanceM: number, camera: CameraOptics,
 *           tiltDeg?: number, entranceWidthM?: number }} placement
 */
export function evaluatePlacement({ profile, heightM, distanceM, camera, tiltDeg, entranceWidthM }) {
  const fisheye = isFisheye(camera);
  const feetAngleDeg = feetAngle(heightM, distanceM);
  const faceAngleDeg = faceAngle(heightM, distanceM, profile.facePointM);
  const feetStatus = judgeFeet(feetAngleDeg, profile);
  // A ceiling fisheye always looks straight down, so its tilt is fixed.
  const recommended = fisheye ? 90 : recommendedTilt(heightM, distanceM, profile);
  const tilt = fisheye ? 90 : tiltDeg ?? recommended;
  const vFovDeg = verticalFov(camera);
  const hFovDeg = horizontalFov(camera);
  // A fisheye's last few degrees are squeezed against the image circle, so people count as framed only within the usable cone.
  const frameFovDeg = fisheye ? 2 * FISHEYE_MAX_OFF_AXIS_DEG : vFovDeg;
  const headAngleDeg = downwardAngle(heightM, profile.humanHeightM, distanceM);
  const framed = inFrame(feetAngleDeg, tilt, frameFovDeg) && inFrame(headAngleDeg, tilt, frameFovDeg);
  const coverageWidthM = coverageWidth(camera, heightM, distanceM);
  const effectiveWidthM = effectiveWidth(camera, heightM, distanceM);
  const pixelsPerMetre = pixelDensity(camera, Math.hypot(heightM, distanceM), 90 - feetAngleDeg);
  const { min, max } = profile.heightRangeM;

  return {
    feet: { angleDeg: feetAngleDeg, status: feetStatus },
    face: { angleDeg: faceAngleDeg, status: judgeFace(faceAngleDeg, profile) },
    countingLine: { distanceM, recommendedDistanceM: recommendedDistance(heightM, profile), framed, headAngleDeg },
    faceLine: judgeFaceLine({ profile, camera, heightM, distanceM, tiltDeg: tilt, vFovDeg: frameFovDeg }),
    tilt: { value: tilt, recommended },
    optics: { lens: fisheye ? "fisheye" : "rectilinear", verticalFovDeg: vFovDeg, horizontalFovDeg: hFovDeg, coverageWidthM, effectiveWidthM, pixelsPerMetre },
    entrance: entranceWidthM == null ? null : entranceCoverage(entranceWidthM, coverageWidthM, effectiveWidthM),
    verdict: framed ? feetStatus : "out_of_range",
    // Low density warns instead of failing: the verdict stays a judgement of the feet angle (ADR 0004).
    warnings: [
      (heightM < min || heightM > max) && "height_outside_range",
      pixelsPerMetre < profile.minPixelsPerMetre.counting && "low_pixel_density",
    ].filter(Boolean),
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
    !(profile.minPixelsPerMetre?.counting > 0 && profile.minPixelsPerMetre?.face > 0) && "minimum pixels per metre for counting and face must both be positive",
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
