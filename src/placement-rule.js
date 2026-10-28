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
 *            lens?: "rectilinear" | "fisheye", fovDeg?: number, datasheetFov?: DatasheetFov }} CameraOptics
 *   A fisheye is ceiling-mounted looking straight down, with an equidistant lens of fovDeg.
 *   datasheetFov is the manufacturer's measured view; when given it replaces sensor width.
 * @typedef {{ focalLengthMm: number, hFovDeg: number, vFovDeg: number }} DatasheetEnd
 * @typedef {{ aspect: { w: number, h: number }, wide: DatasheetEnd, tele: DatasheetEnd }} DatasheetFov
 *   A lens's datasheet view at both ends of its zoom (the same end twice for a fixed lens), quoted for one stream aspect.
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
export function faceLineDistance(heightM, countingDistanceM, profile, offsetM = 0) {
  const { facePointM, faceAngleDeg } = profile;
  if (heightM <= facePointM) return null;
  // Off-centre, the face is judged along the middle of the entrance, so its floor distance includes the offset.
  const angleAt = (d) => faceAngle(heightM, Math.hypot(offsetM, d), facePointM);
  const isBest = (d) => judgeFace(angleAt(d), profile) === "best";
  if (isBest(countingDistanceM)) return round2(countingDistanceM);

  // Angles are judged after rounding to 0.1 deg, so the Best band really ends 0.05 deg past
  // each edge. Start just outside that rounded edge and walk toward the counting line, so the
  // first Best distance found is the one closest to it.
  const tooSteep = round1(angleAt(countingDistanceM)) >= faceAngleDeg.best.max;
  const edgeAngle = tooSteep ? faceAngleDeg.best.max - 0.05 : faceAngleDeg.best.min - 0.05;
  const direction = tooSteep ? 1 : -1;
  const edgeReach = (heightM - facePointM) / Math.tan(toRad(edgeAngle));
  // Far enough off-centre, even the face straight across from the camera is too flat to be Best.
  if (edgeReach <= Math.abs(offsetM)) return null;
  const edgeDistance = Math.sqrt(edgeReach * edgeReach - offsetM * offsetM);
  let d = tooSteep ? Math.floor(edgeDistance * 100) / 100 : Math.ceil(edgeDistance * 100) / 100;
  for (let i = 0; i < MAX_SEARCH_STEPS && d > 0; i += 1) {
    if (isBest(d)) return d;
    d = round2(d + direction * DISTANCE_STEP_M);
  }
  if (offsetM !== 0) return null;
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

// Each end of the datasheet implies an effective sensor size, 2 f tan(fov / 2). Moving that size in step with the
// focal length reproduces both ends exactly; in between it is an estimate the datasheet does not give.
function datasheetView(camera) {
  const { wide, tele, aspect } = camera.datasheetFov;
  const focal = camera.focalLengthMm ?? wide.focalLengthMm;
  const span = tele.focalLengthMm - wide.focalLengthMm;
  const t = span > 0 ? Math.min(1, Math.max(0, (focal - wide.focalLengthMm) / span)) : 0;
  const size = (end, deg) => 2 * end.focalLengthMm * Math.tan(toRad(deg / 2));
  const between = (a, b) => a + (b - a) * t;
  const width = between(size(wide, wide.hFovDeg), size(tele, tele.hFovDeg));
  const height = between(size(wide, wide.vFovDeg), size(tele, tele.vFovDeg));
  // The vertical view is quoted for one stream shape; another shape keeps the width and crops or extends the height.
  const streamHeight = (height * (aspect.w / aspect.h)) / (camera.resolution.w / camera.resolution.h);
  return { h: 2 * Math.atan(width / (2 * focal)) * DEG, v: 2 * Math.atan(streamHeight / (2 * focal)) * DEG };
}

/** @param {CameraOptics} camera @returns {number} */
export function verticalFov(camera) {
  if (isFisheye(camera)) return camera.fovDeg;
  // Wide lenses are distorted, so the datasheet's measured view beats the pinhole estimate.
  if (camera.datasheetFov) return datasheetView(camera).v;
  const sensorHeightMm = camera.sensorWidthMm * (camera.resolution.h / camera.resolution.w);
  return 2 * Math.atan(sensorHeightMm / (2 * camera.focalLengthMm)) * DEG;
}

/** @param {CameraOptics} camera @returns {number} */
export function horizontalFov(camera) {
  if (isFisheye(camera)) return camera.fovDeg;
  if (camera.datasheetFov) return datasheetView(camera).h;
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

// People keep clear of the door frames, so the verdict is judged across the walkable width inside them.
export const FRAME_CLEARANCE_M = 0.35;

/**
 * The stretch of the counting line that decides the verdict, measured from the entrance centre line,
 * positive to the camera's right as it faces the entrance. Without an entrance width, only the middle.
 * @param {number | undefined} entranceWidthM
 * @returns {{ leftM: number, rightM: number }}
 */
export function walkableSpan(entranceWidthM) {
  if (entranceWidthM == null) return { leftM: 0, rightM: 0 };
  const half = Math.max(0, round2(entranceWidthM / 2 - FRAME_CLEARANCE_M));
  return { leftM: half === 0 ? 0 : -half, rightM: half };
}

// The feet angle only falls with floor distance, so the nearest and farthest walkable points bound it.
function linePoints(offsetM, span) {
  const nearX = Math.min(span.rightM, Math.max(span.leftM, offsetM));
  const farX = Math.abs(span.leftM - offsetM) > Math.abs(span.rightM - offsetM) ? span.leftM : span.rightM;
  return { near: nearX, aim: 0, far: farX };
}

/**
 * Where the camera is and which way it looks: x along the counting line from the entrance centre, y up, z from the
 * counting line toward the camera. A rectilinear camera turns to the entrance centre and tilts down; a fisheye looks down.
 * @param {{ heightM: number, distanceM: number, offsetM?: number, tiltDeg: number, fisheye?: boolean }} placement
 */
export function cameraPose({ heightM, distanceM, offsetM = 0, tiltDeg, fisheye = false }) {
  const position = { x: offsetM, y: heightM, z: distanceM };
  if (fisheye) return { position, forward: { x: 0, y: -1, z: 0 }, right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: -1 }, fisheye };
  const reach = Math.hypot(offsetM, distanceM) || 1e-9;
  const level = { x: -offsetM / reach, z: -distanceM / reach };
  const t = toRad(tiltDeg);
  const forward = { x: level.x * Math.cos(t), y: -Math.sin(t), z: level.z * Math.cos(t) };
  const right = { x: -level.z, y: 0, z: level.x };
  const up = {
    x: right.y * forward.z - right.z * forward.y,
    y: right.z * forward.x - right.x * forward.z,
    z: right.x * forward.y - right.y * forward.x,
  };
  return { position, forward, right, up, fisheye };
}

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

/**
 * A point in the camera's image: u, v are tangents across and up the image for a rectilinear camera; offAxisDeg is
 * the angle from the optical axis, which is what a fisheye frames by.
 */
export function projectPoint(pose, point) {
  const d = { x: point.x - pose.position.x, y: point.y - pose.position.y, z: point.z - pose.position.z };
  const depth = dot(d, pose.forward);
  const length = Math.hypot(d.x, d.y, d.z) || 1e-9;
  return {
    u: dot(d, pose.right) / depth,
    v: dot(d, pose.up) / depth,
    depth,
    offAxisDeg: Math.acos(Math.max(-1, Math.min(1, depth / length))) * DEG,
  };
}

// Whole-person framing is a vertical question; a too-wide entrance warns through the entrance check instead.
function framedAt(pose, point, vFovDeg) {
  const p = projectPoint(pose, point);
  if (pose.fisheye) return p.offAxisDeg <= FISHEYE_MAX_OFF_AXIS_DEG;
  return p.depth > 0 && Math.abs(p.v) <= Math.tan(toRad(vFovDeg / 2)) + 1e-12;
}

const STATUS_RANK = { best: 0, acceptable: 1, out_of_range: 2 };

// How far inside the Best band an angle sits, after the same rounding the judgement uses; negative outside it.
function bestMargin(angleDeg, profile) {
  const angle = round1(angleDeg);
  const { best } = profile.feetAngleDeg;
  return Math.min(angle - best.min, best.max - angle);
}

// The worst judged point decides; between equal statuses, the one closest to leaving the Best band.
function decidingPoint(points, keys, profile) {
  return keys.reduce((worst, key) => {
    const a = points[key];
    const b = points[worst];
    if (STATUS_RANK[a.status] !== STATUS_RANK[b.status]) return STATUS_RANK[a.status] > STATUS_RANK[b.status] ? key : worst;
    return bestMargin(a.feetAngleDeg, profile) < bestMargin(b.feetAngleDeg, profile) ? key : worst;
  });
}

function feetAcross(profile, heightM, distanceM, offsetM, span) {
  const xs = linePoints(offsetM, span);
  const status = (x) => judgeFeet(feetAngle(heightM, Math.hypot(x - offsetM, distanceM)), profile);
  return [status(xs.near), status(xs.far)].reduce((w, s) => (STATUS_RANK[s] > STATUS_RANK[w] ? s : w));
}

// Searched to the centimetre; the judgement is monotone in distance and in height, so each window is one stretch.
function windowsOf(values, statusAt) {
  const windows = { best: null, acceptable: null };
  for (const value of values) {
    const status = statusAt(value);
    for (const wanted of ["best", "acceptable"]) {
      if (STATUS_RANK[status] > STATUS_RANK[wanted]) continue;
      const w = windows[wanted];
      windows[wanted] = w === null ? { minM: value, maxM: value } : { minM: w.minM, maxM: value };
    }
  }
  return windows;
}

const centimetres = (from, to) => {
  const steps = Math.round((to - from) * 100);
  return Array.from({ length: steps + 1 }, (_, i) => round2(from + i / 100));
};

function pickInside(target, windows) {
  const judgedBy = windows.best ? "best" : windows.acceptable ? "acceptable" : null;
  const w = judgedBy ? windows[judgedBy] : null;
  return { value: w ? Math.min(w.maxM, Math.max(w.minM, target)) : target, judgedBy };
}

/**
 * The counting line distance for a mount height, judged across the walkable width: inside the stretch where every
 * walkable point is Best (else Acceptable), as close as it gets to the target angle at the entrance centre.
 * @param {{ profile: SceneProfile, heightM: number, offsetM?: number, entranceWidthM?: number }} placement
 * @returns {{ distanceM: number, best: {minM:number,maxM:number} | null, acceptable: {minM:number,maxM:number} | null, judgedBy: "best" | "acceptable" | null }}
 */
export function solveDistance({ profile, heightM, offsetM = 0, entranceWidthM }) {
  const span = walkableSpan(entranceWidthM);
  const reachAtTarget = heightM / Math.tan(toRad(profile.feetAngleDeg.target));
  const atTarget = round2(Math.sqrt(Math.max(0.0001, reachAtTarget * reachAtTarget - offsetM * offsetM)));
  const farthest = heightM / Math.tan(toRad(profile.feetAngleDeg.acceptable.min)) + 0.5;
  const windows = windowsOf(centimetres(0.01, Math.max(0.5, farthest)), (d) => feetAcross(profile, heightM, d, offsetM, span));
  const { value, judgedBy } = pickInside(atTarget, windows);
  return { distanceM: value, best: windows.best, acceptable: windows.acceptable, judgedBy };
}

/**
 * The mount height for a counting line distance, judged the same way, aiming at the target angle at the entrance centre.
 * @param {{ profile: SceneProfile, distanceM: number, offsetM?: number, entranceWidthM?: number }} placement
 * @returns {{ heightM: number, best: {minM:number,maxM:number} | null, acceptable: {minM:number,maxM:number} | null, judgedBy: "best" | "acceptable" | null }}
 */
export function solveHeight({ profile, distanceM, offsetM = 0, entranceWidthM }) {
  const span = walkableSpan(entranceWidthM);
  const atTarget = round2(Math.hypot(offsetM, distanceM) * Math.tan(toRad(profile.feetAngleDeg.target)));
  const farReach = Math.hypot(Math.max(Math.abs(span.leftM - offsetM), Math.abs(span.rightM - offsetM)), distanceM);
  const tallest = farReach * Math.tan(toRad(profile.feetAngleDeg.acceptable.max)) + 0.5;
  const windows = windowsOf(centimetres(0.01, tallest), (h) => feetAcross(profile, h, distanceM, offsetM, span));
  const { value, judgedBy } = pickInside(atTarget, windows);
  return { heightM: value, best: windows.best, acceptable: windows.acceptable, judgedBy };
}

// Face line: the first face-Best distance from the counting line, judged along the middle of the entrance.
function judgeFaceLine({ profile, camera, heightM, distanceM, offsetM, pose, vFovDeg }) {
  const none = { distanceM: null, angleDeg: null, coincides: false, pixelsPerMetre: null, visible: false, tooSmall: false };
  if (heightM <= profile.facePointM) return { ...none, reason: "camera_below_face_point" };
  const distance = faceLineDistance(heightM, distanceM, profile, offsetM);
  if (distance === null) return { ...none, reason: "off_centre" };
  const reach = Math.hypot(offsetM, distance);
  const angleDeg = faceAngle(heightM, reach, profile.facePointM);
  const pixelsPerMetre = pixelDensity(camera, Math.hypot(heightM - profile.facePointM, reach), 90 - angleDeg);
  const base = { distanceM: distance, angleDeg, coincides: distance === round2(distanceM), pixelsPerMetre };
  if (!framedAt(pose, { x: 0, y: profile.facePointM, z: distanceM - distance }, vFovDeg)) {
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

// The entrance against the stretches of the counting line in view and in the effective 80%, which a panned camera shifts.
function entranceOnLine(entranceWidthM, inView, inEffective) {
  const half = entranceWidthM / 2;
  const overlap = Math.max(0, Math.min(inView.rightM, half) - Math.max(inView.leftM, -half));
  if (overlap < entranceWidthM) return { widthM: entranceWidthM, status: "too_wide", uncoveredM: entranceWidthM - overlap };
  const inside = inEffective.leftM <= -half && inEffective.rightM >= half;
  return { widthM: entranceWidthM, status: inside ? "covered" : "tight", uncoveredM: 0 };
}

// Where the image's side edges (or a share of the way out to them) cross the counting line, solved from the projection.
function lineInView(camera, heightM, distanceM, offsetM, tiltDeg, share) {
  if (isFisheye(camera)) {
    const half = fisheyeChord(heightM, distanceM, (camera.fovDeg / 2) * share) / 2;
    return { leftM: offsetM - half, rightM: offsetM + half };
  }
  const T = Math.tan(toRad(horizontalFov(camera) / 2)) * share;
  const reach = Math.hypot(offsetM, distanceM);
  const t = toRad(tiltDeg);
  const k = reach * (reach * Math.cos(t) + heightM * Math.sin(t));
  const edge = (sign) => {
    const denominator = distanceM + sign * T * offsetM * Math.cos(t);
    return denominator > 0 ? (sign * T * k) / denominator : sign * Infinity;
  };
  return { leftM: edge(-1), rightM: edge(1) };
}

/**
 * Judges one placement: a camera at heightM, its counting line distanceM in front of it, offsetM to the right of the
 * entrance centre line. The feet angle is judged across the walkable width and the worst point decides.
 * @param {{ profile: SceneProfile, heightM: number, distanceM: number, camera: CameraOptics,
 *           tiltDeg?: number, entranceWidthM?: number, offsetM?: number }} placement
 */
export function evaluatePlacement({ profile, heightM, distanceM, camera, tiltDeg, entranceWidthM, offsetM = 0 }) {
  const fisheye = isFisheye(camera);
  const aimReachM = Math.hypot(offsetM, distanceM);
  // A ceiling fisheye always looks straight down, so its tilt is fixed.
  const recommended = fisheye ? 90 : recommendedTilt(heightM, aimReachM, profile);
  const tilt = fisheye ? 90 : tiltDeg ?? recommended;
  const vFovDeg = verticalFov(camera);
  const hFovDeg = horizontalFov(camera);
  const pose = cameraPose({ heightM, distanceM, offsetM, tiltDeg: tilt, fisheye });

  const span = walkableSpan(entranceWidthM);
  const solved = solveDistance({ profile, heightM, offsetM, entranceWidthM });
  const xs = linePoints(offsetM, span);
  const points = Object.fromEntries(Object.entries(xs).map(([key, x]) => {
    const floorDistanceM = Math.hypot(x - offsetM, distanceM);
    const angle = feetAngle(heightM, floorDistanceM);
    const framed = framedAt(pose, { x, y: 0, z: 0 }, vFovDeg) && framedAt(pose, { x, y: profile.humanHeightM, z: 0 }, vFovDeg);
    return [key, { xM: x, floorDistanceM, feetAngleDeg: angle, status: judgeFeet(angle, profile), framed }];
  }));
  // The middle comes first, so it is the one named when the nearest point is the middle itself.
  const judged = span.leftM === span.rightM ? ["aim"] : ["aim", "near", "far"];
  const deciding = decidingPoint(points, judged, profile);
  const feet = points[deciding];
  const framed = judged.every((key) => points[key].framed);

  const faceAngleDeg = faceAngle(heightM, aimReachM, profile.facePointM);
  const headAngleDeg = downwardAngle(heightM, profile.humanHeightM, aimReachM);
  const inView = lineInView(camera, heightM, distanceM, offsetM, tilt, 1);
  const inEffective = lineInView(camera, heightM, distanceM, offsetM, tilt, EFFECTIVE_COVERAGE);
  const pixelsPerMetre = pixelDensity(camera, Math.hypot(heightM, aimReachM), 90 - points.aim.feetAngleDeg);
  const panDeg = fisheye ? 0 : Math.atan2(Math.abs(offsetM), distanceM) * DEG;
  const { min, max } = profile.heightRangeM;

  return {
    feet: { angleDeg: feet.feetAngleDeg, status: feet.status, point: deciding },
    face: { angleDeg: faceAngleDeg, status: judgeFace(faceAngleDeg, profile) },
    countingLine: {
      distanceM, offsetM, recommendedDistanceM: solved.distanceM, window: { best: solved.best, acceptable: solved.acceptable, judgedBy: solved.judgedBy },
      framed, headAngleDeg, walkable: span, points, judged,
    },
    faceLine: judgeFaceLine({ profile, camera, heightM, distanceM, offsetM, pose, vFovDeg }),
    tilt: { value: tilt, recommended },
    pan: { deg: panDeg, toward: panDeg < 0.05 ? null : offsetM > 0 ? "left" : "right" },
    optics: {
      lens: fisheye ? "fisheye" : "rectilinear", verticalFovDeg: vFovDeg, horizontalFovDeg: hFovDeg,
      coverageWidthM: inView.rightM - inView.leftM, effectiveWidthM: inEffective.rightM - inEffective.leftM,
      inView, inEffective, pixelsPerMetre,
    },
    entrance: entranceWidthM == null ? null : entranceOnLine(entranceWidthM, inView, inEffective),
    verdict: framed ? feet.status : "out_of_range",
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
