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
// A hand-set pan may turn the camera off the middle of the entrance by up to this share of half its horizontal view.
const PAN_REACH_SHARE = 0.9;

// Each end of the datasheet implies an effective sensor width, 2 f tan(fov / 2). Moving that width in step with the
// focal length reproduces both ends exactly; in between it is an estimate the datasheet does not give. Every stream
// shares the width; its height is cut from the lens's picture (see lensFor).
function datasheetView(camera) {
  const { wide, tele } = camera.datasheetFov;
  const focal = camera.focalLengthMm ?? wide.focalLengthMm;
  const span = tele.focalLengthMm - wide.focalLengthMm;
  const t = span > 0 ? Math.min(1, Math.max(0, (focal - wide.focalLengthMm) / span)) : 0;
  const size = (end, deg) => 2 * end.focalLengthMm * Math.tan(toRad(deg / 2));
  const width = size(wide, wide.hFovDeg) + (size(tele, tele.hFovDeg) - size(wide, wide.hFovDeg)) * t;
  return { h: 2 * Math.atan(width / (2 * focal)) * DEG };
}

/** @param {CameraOptics} camera @returns {number} */
export function verticalFov(camera) {
  if (isFisheye(camera)) return camera.fovDeg;
  // A datasheet camera's vertical view is what its lens shows on this stream's shape, top edge to bottom edge.
  if (camera.datasheetFov) {
    const lens = lensFor(camera);
    const top = lens.toRay(0, lens.halfH);
    return 2 * (top === null ? lens.maxTheta : Math.acos(top.z)) * DEG;
  }
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

// People keep clear of the door frames, so the ends of the walkable width sit this far inside them.
export const FRAME_CLEARANCE_M = 0.35;

/**
 * The stretch of the counting line people walk along, measured from the entrance centre line, positive to the
 * camera's right as it faces the entrance. Its ends are checked for a warning; without an entrance width, there are none.
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
export function cameraPose({ heightM, distanceM, offsetM = 0, tiltDeg, fisheye = false, panDeg }) {
  const position = { x: offsetM, y: heightM, z: distanceM };
  if (fisheye) return { position, forward: { x: 0, y: -1, z: 0 }, right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: -1 }, fisheye };
  const reach = Math.hypot(offsetM, distanceM) || 1e-9;
  // Pan: the turn from facing straight across at the entrance, positive to the camera's right; by default, the aim.
  const level = Number.isFinite(panDeg)
    ? { x: Math.sin(toRad(panDeg)), z: -Math.cos(toRad(panDeg)) }
    : { x: -offsetM / reach, z: -distanceM / reach };
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

// Camera space: x to the right of the image, y up it, z out of the lens.
const toCamera = (pose, v) => ({ x: dot(v, pose.right), y: dot(v, pose.up), z: dot(v, pose.forward) });
const toWorld = (pose, c) => ({
  x: c.x * pose.right.x + c.y * pose.up.x + c.z * pose.forward.x,
  y: c.x * pose.right.y + c.y * pose.up.y + c.z * pose.forward.y,
  z: c.x * pose.right.z + c.y * pose.up.z + c.z * pose.forward.z,
});
const fromCamera = (pose, point) => toCamera(pose, { x: point.x - pose.position.x, y: point.y - pose.position.y, z: point.z - pose.position.z });

function radialLens(kind, halfH, radius, inverse, maxTheta) {
  return {
    kind,
    halfH,
    /** @param {{x:number,y:number,z:number}} c camera-space direction @returns {{x:number,y:number} | null} */
    toImage(c) {
      if (c.z <= 0) return null;
      const rho = Math.hypot(c.x, c.y);
      if (rho < 1e-12) return { x: 0, y: 0 };
      const theta = Math.atan2(rho, c.z);
      if (theta > maxTheta) return null;
      const r = radius(theta);
      return { x: (r * c.x) / rho, y: (r * c.y) / rho };
    },
    /** @returns {{x:number,y:number,z:number} | null} a unit camera-space direction */
    toRay(x, y) {
      const r = Math.hypot(x, y);
      if (r < 1e-12) return { x: 0, y: 0, z: 1 };
      const theta = inverse(r);
      if (theta === null || theta > maxTheta) return null;
      const sin = Math.sin(theta);
      return { x: (sin * x) / r, y: (sin * y) / r, z: Math.cos(theta) };
    },
    inImage(c, share = 1) {
      const p = this.toImage(c);
      return p !== null && Math.abs(p.x) <= share + 1e-9 && Math.abs(p.y) <= halfH + 1e-9;
    },
  };
}

/**
 * How a direction from a rectilinear camera lands in its image. Image coordinates run -1 to 1 across the width and
 * -halfH to halfH up the height (halfH = height / width). A camera known by its sensor and focal length is a pinhole.
 * A datasheet camera's wide end squeezes more into the edges of its picture (barrel distortion) than a pinhole can:
 * its shape, an image radius in proportion to θ + aθ³ (θ from the lens axis), is fitted once on the picture the
 * datasheet quotes the wide end for, so both quoted views land on its edges. Toward the long end the lens straightens
 * into a pinhole, in step with the width of view. The scale comes from the horizontal view, and every stream is cut
 * from that picture, so its vertical view follows from the lens. Checked against a real camera (ADR 0006).
 * @param {CameraOptics} camera a rectilinear camera
 */
export function lensFor(camera) {
  const halfH = camera.resolution.h / camera.resolution.w;
  const th = toRad(horizontalFov(camera) / 2);
  const flat = toRad(89);
  const pinhole = () => {
    const f = 1 / Math.tan(th);
    return { ...radialLens("pinhole", halfH, (t) => f * Math.tan(t), (r) => Math.atan(r / f), flat), f, maxTheta: flat };
  };
  if (!camera.datasheetFov) return pinhole();
  const { wide, tele, aspect } = camera.datasheetFov;
  // The wide end's shape on its own picture: r(θv) = nativeH where r(θh) = 1, so θv + aθv³ = nativeH (θh + aθh³).
  const nativeH = aspect.h / aspect.w;
  const thW = toRad(wide.hFovDeg / 2);
  const tvW = toRad(wide.vFovDeg / 2);
  const denominator = tvW ** 3 - nativeH * thW ** 3;
  const a = Math.abs(denominator) < 1e-12 ? 0 : (nativeH * thW - tvW) / denominator;
  // How much of that shape is left at this zoom: all of it at the wide end, none at the long end. A fixed lens keeps it.
  const tanWide = Math.tan(thW);
  const tanTele = Math.tan(toRad(tele.hFovDeg / 2));
  const w = Math.abs(tanWide - tanTele) < 1e-9 ? 1 : Math.min(1, Math.max(0, (Math.tan(th) - tanTele) / (tanWide - tanTele)));
  if (w === 0) return pinhole();
  const g = (t) => (1 - w) * Math.tan(t) + w * (t + a * t ** 3);
  // A strong barrel curve turns back on itself; the lens ends just before it does.
  const slope = (t) => (1 - w) / Math.cos(t) ** 2 + w * (1 + 3 * a * t * t);
  let maxTheta = flat;
  for (let t = 0; t <= flat; t += toRad(0.25)) {
    if (slope(t) <= 1e-6) {
      maxTheta = 0.98 * t;
      break;
    }
  }
  const f = 1 / g(th);
  const edge = g(maxTheta);
  const inverse = (r) => {
    const target = r / f;
    if (target > edge) return null;
    let lo = 0;
    let hi = maxTheta;
    for (let i = 0; i < 64; i += 1) {
      const mid = (lo + hi) / 2;
      if (g(mid) < target) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  };
  return { ...radialLens("barrel", halfH, (t) => f * g(t), inverse, maxTheta), a, w, f, maxTheta };
}

/**
 * The floor a rectilinear camera sees, for the plan view: the outline of its picture carried down to the floor along
 * each ray, through the same lens as the 3D view, so it turns, tilts and bends exactly as that view does. Rays that
 * reach toward the horizon, or past rangeM along the floor, are cut at rangeM.
 * @param {{ position: {x:number,y:number,z:number}, forward: {x:number,y:number,z:number}, right: {x:number,y:number,z:number}, up: {x:number,y:number,z:number} }} pose
 * @param {ReturnType<typeof lensFor>} lens
 * @param {number} [share] of the width, from the middle: 0.8 for the effective coverage
 * @param {number} [rangeM]
 * @returns {{ bottom: {x:number,z:number}[], right: {x:number,z:number}[], top: {x:number,z:number}[], left: {x:number,z:number}[],
 *   outline: {x:number,z:number}[], farIsImageTop: boolean } | null} each edge in order around the picture (bottom left
 *   to right, right side upward, top right to left, left side downward); null when it misses the floor altogether
 */
export function floorFootprint(pose, lens, share = 1, rangeM = 40) {
  const p = pose.position;
  // Traced in steps: a curved lens bends its edges, and a ray cut at the range would cut a straight edge short too.
  const steps = 48;
  const along = (from, to) => Array.from({ length: steps + 1 }, (_, i) => [from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps]);
  const h = lens.halfH;
  let capped = false;
  const onFloor = ([x, y], isTop) => {
    const c = lens.toRay(x, y);
    if (c === null) return null;
    const ray = toWorld(pose, c);
    if (ray.y < -1e-9) {
      const s = p.y / -ray.y;
      if (Math.hypot(s * ray.x, s * ray.z) <= rangeM) return { x: p.x + s * ray.x, z: p.z + s * ray.z };
    }
    const level = Math.hypot(ray.x, ray.z);
    if (level < 1e-9) return null;
    if (isTop) capped = true;
    return { x: p.x + (ray.x / level) * rangeM, z: p.z + (ray.z / level) * rangeM };
  };
  const trace = (from, to, isTop = false) => along(from, to).map((pt) => onFloor(pt, isTop)).filter(Boolean);
  const bottom = trace([-share, -h], [share, -h]);
  const right = trace([share, -h], [share, h]);
  const top = trace([share, h], [-share, h], true);
  const left = trace([-share, h], [-share, -h]);
  const outline = [...bottom, ...right, ...top, ...left];
  if (outline.length < 3) return null;
  return { bottom, right, top, left, outline, farIsImageTop: !capped };
}

// Whole-person framing is a vertical question; a too-wide entrance warns through the entrance check instead.
function framedAt(pose, point, lens) {
  if (pose.fisheye) return projectPoint(pose, point).offAxisDeg <= FISHEYE_MAX_OFF_AXIS_DEG;
  const image = lens.toImage(fromCamera(pose, point));
  return image !== null && Math.abs(image.y) <= lens.halfH + 1e-12;
}

const STATUS_RANK = { best: 0, acceptable: 1, out_of_range: 2 };

// How far an angle falls outside the feet bands, after the judgement's rounding; 0 inside them.
function bandMiss(angleDeg, profile) {
  const angle = round1(angleDeg);
  const { acceptable } = profile.feetAngleDeg;
  return Math.max(0, acceptable.min - angle, angle - acceptable.max);
}

/**
 * The end of the walkable width that needs a warning: outside the feet bands, or a person there not wholly in frame.
 * It never changes the verdict, which is judged in the middle of the entrance. Cut off outranks a bad angle.
 */
function walkableEdge(points, span, profile) {
  if (span.leftM === span.rightM) return null;
  const flagged = [points.near, points.far].filter((pt) => pt.xM !== 0 && (pt.status === "out_of_range" || !pt.framed));
  if (flagged.length === 0) return null;
  const worst = flagged.reduce((a, b) => {
    if (a.framed !== b.framed) return a.framed ? b : a;
    return bandMiss(b.feetAngleDeg, profile) > bandMiss(a.feetAngleDeg, profile) ? b : a;
  });
  return { ...worst, side: worst.xM > 0 ? "right" : "left" };
}

// Searched to the centimetre; the feet angle only falls with distance and rises with height, so each window is one stretch.
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
 * The counting line distance for a mount height that puts the middle of the entrance on the target angle, with the
 * distances where it is Best and Acceptable. Off-centre the middle is farther away than the line, so the line comes closer.
 * @param {{ profile: SceneProfile, heightM: number, offsetM?: number }} placement
 * @returns {{ distanceM: number, best: {minM:number,maxM:number} | null, acceptable: {minM:number,maxM:number} | null, judgedBy: "best" | "acceptable" | null }}
 */
export function solveDistance({ profile, heightM, offsetM = 0 }) {
  const reachAtTarget = heightM / Math.tan(toRad(profile.feetAngleDeg.target));
  const atTarget = round2(Math.sqrt(Math.max(0.0001, reachAtTarget * reachAtTarget - offsetM * offsetM)));
  const farthest = heightM / Math.tan(toRad(profile.feetAngleDeg.acceptable.min)) + 0.5;
  const windows = windowsOf(centimetres(0.01, Math.max(0.5, farthest)), (d) => judgeFeet(feetAngle(heightM, Math.hypot(offsetM, d)), profile));
  const { value, judgedBy } = pickInside(atTarget, windows);
  return { distanceM: value, best: windows.best, acceptable: windows.acceptable, judgedBy };
}

/**
 * The mount height for a counting line distance that puts the middle of the entrance on the target angle.
 * @param {{ profile: SceneProfile, distanceM: number, offsetM?: number }} placement
 * @returns {{ heightM: number, best: {minM:number,maxM:number} | null, acceptable: {minM:number,maxM:number} | null, judgedBy: "best" | "acceptable" | null }}
 */
export function solveHeight({ profile, distanceM, offsetM = 0 }) {
  const reach = Math.hypot(offsetM, distanceM);
  const atTarget = round2(reach * Math.tan(toRad(profile.feetAngleDeg.target)));
  const tallest = reach * Math.tan(toRad(profile.feetAngleDeg.acceptable.max)) + 0.5;
  const windows = windowsOf(centimetres(0.01, tallest), (h) => judgeFeet(feetAngle(h, reach), profile));
  const { value, judgedBy } = pickInside(atTarget, windows);
  return { heightM: value, best: windows.best, acceptable: windows.acceptable, judgedBy };
}

// Face line: the first face-Best distance from the counting line, judged along the middle of the entrance.
function judgeFaceLine({ profile, camera, heightM, distanceM, offsetM, pose, lens }) {
  const none = { distanceM: null, angleDeg: null, coincides: false, pixelsPerMetre: null, visible: false, tooSmall: false };
  if (heightM <= profile.facePointM) return { ...none, reason: "camera_below_face_point" };
  const distance = faceLineDistance(heightM, distanceM, profile, offsetM);
  if (distance === null) return { ...none, reason: "off_centre" };
  const reach = Math.hypot(offsetM, distance);
  const angleDeg = faceAngle(heightM, reach, profile.facePointM);
  const pixelsPerMetre = pixelDensity(camera, Math.hypot(heightM - profile.facePointM, reach), 90 - angleDeg);
  const base = { distanceM: distance, angleDeg, coincides: distance === round2(distanceM), pixelsPerMetre };
  if (!framedAt(pose, { x: 0, y: profile.facePointM, z: distanceM - distance }, lens)) {
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
// When part of it is out of view, cause says why: "width" (wider than the view) or "turned" (the view is wide enough but
// aimed so one end, side, is left out), so the advice can be to widen the view or to turn the camera back.
function entranceOnLine(entranceWidthM, inView, inEffective) {
  const half = entranceWidthM / 2;
  const overlap = Math.max(0, Math.min(inView.rightM, half) - Math.max(inView.leftM, -half));
  if (overlap < entranceWidthM) {
    const cutRight = Math.max(0, half - inView.rightM);
    const cutLeft = Math.max(0, inView.leftM + half);
    return {
      widthM: entranceWidthM, status: "too_wide", uncoveredM: entranceWidthM - overlap,
      cause: inView.rightM - inView.leftM >= entranceWidthM ? "turned" : "width", side: cutRight >= cutLeft ? "right" : "left",
    };
  }
  const inside = inEffective.leftM <= -half && inEffective.rightM >= half;
  return { widthM: entranceWidthM, status: inside ? "covered" : "tight", uncoveredM: 0 };
}

// Through a curved lens the picture's edges are curves, so the stretch is found by search: out from the middle of the
// entrance (or the first point in view) until a point leaves the picture, then narrowed down to a millimetre.
function lineThroughLens(pose, lens, share) {
  const inside = (x) => lens.inImage(fromCamera(pose, { x, y: 0, z: 0 }), share);
  const far = 1e4;
  let start = 0;
  if (!inside(start)) {
    const found = Array.from({ length: 401 }, (_, i) => -100 + i * 0.5).find(inside);
    if (found === undefined) return { leftM: 0, rightM: 0 };
    start = found;
  }
  const reach = (sign) => {
    let inX = start;
    let step = 0.5;
    while (Math.abs(inX) < far && inside(inX + sign * step)) {
      inX += sign * step;
      step *= 2;
    }
    if (Math.abs(inX) >= far) return sign * Infinity;
    let outX = inX + sign * step;
    while (Math.abs(outX - inX) > 1e-3) {
      const mid = (inX + outX) / 2;
      if (inside(mid)) inX = mid; else outX = mid;
    }
    return inX;
  };
  return { leftM: reach(-1), rightM: reach(1) };
}

// The stretch of the counting line (on the floor) inside the image, or a share of its width, solved from the projection.
// Each image bound (in front of the lens, within the sides, within the top and bottom) is a linear condition on x along
// the line, so the stretch is where five half-lines overlap. A steep, close camera can lose the line off the bottom
// of the picture before its side, so the sides alone are not enough.
function lineInView(camera, pose, heightM, distanceM, offsetM, share) {
  if (isFisheye(camera)) {
    const half = fisheyeChord(heightM, distanceM, (camera.fovDeg / 2) * share) / 2;
    return { leftM: offsetM - half, rightM: offsetM + half };
  }
  const lens = lensFor(camera);
  if (lens.kind !== "pinhole") return lineThroughLens(pose, lens, share);
  const { position: p, forward: f, right: r, up } = pose;
  const across = Math.tan(toRad(horizontalFov(camera) / 2)) * share;
  const down = Math.tan(toRad(verticalFov(camera) / 2));
  const bound = (w) => ({ a: w.x, c: -w.x * p.x - w.y * p.y - w.z * p.z });
  const mix = (a, k, b) => ({ x: a.x * k + b.x, y: a.y * k + b.y, z: a.z * k + b.z });
  const flip = (w) => ({ x: -w.x, y: -w.y, z: -w.z });
  const bounds = [f, mix(f, across, flip(r)), mix(f, across, r), mix(f, down, flip(up)), mix(f, down, up)].map(bound);
  let leftM = -Infinity;
  let rightM = Infinity;
  for (const { a, c } of bounds) {
    if (Math.abs(a) < 1e-12) {
      if (c < 0) return { leftM: 0, rightM: 0 };
    } else if (a > 0) {
      leftM = Math.max(leftM, -c / a);
    } else {
      rightM = Math.min(rightM, -c / a);
    }
  }
  return rightM > leftM ? { leftM, rightM } : { leftM: 0, rightM: 0 };
}

/**
 * Judges one placement: a camera at heightM, its counting line distanceM in front of it, offsetM to the right of the
 * entrance centre line. The verdict is the feet angle in the middle of the entrance; the ends of the walkable width
 * only warn.
 * @param {{ profile: SceneProfile, heightM: number, distanceM: number, camera: CameraOptics,
 *           tiltDeg?: number, entranceWidthM?: number, offsetM?: number }} placement
 */
export function evaluatePlacement({ profile, heightM, distanceM, camera, tiltDeg, entranceWidthM, offsetM = 0, panDeg }) {
  const fisheye = isFisheye(camera);
  const aimReachM = Math.hypot(offsetM, distanceM);
  // A ceiling fisheye always looks straight down, so its tilt is fixed.
  const recommended = fisheye ? 90 : recommendedTilt(heightM, aimReachM, profile);
  const tilt = fisheye ? 90 : tiltDeg ?? recommended;
  const vFovDeg = verticalFov(camera);
  const hFovDeg = horizontalFov(camera);
  // Pan: aimed at the middle of the entrance unless set by hand, and never so far that the middle leaves the picture.
  const recommendedPan = fisheye ? 0 : -Math.atan2(offsetM, distanceM) * DEG;
  const panReach = fisheye ? 0 : (horizontalFov(camera) / 2) * PAN_REACH_SHARE;
  const panRange = { min: recommendedPan - panReach, max: recommendedPan + panReach };
  const pan = fisheye || !Number.isFinite(panDeg) ? recommendedPan : Math.min(panRange.max, Math.max(panRange.min, panDeg));
  const pose = cameraPose({ heightM, distanceM, offsetM, tiltDeg: tilt, fisheye, panDeg: fisheye ? undefined : pan });
  const lens = fisheye ? null : lensFor(camera);

  const span = walkableSpan(entranceWidthM);
  const solved = solveDistance({ profile, heightM, offsetM });
  const xs = linePoints(offsetM, span);
  const points = Object.fromEntries(Object.entries(xs).map(([key, x]) => {
    const floorDistanceM = Math.hypot(x - offsetM, distanceM);
    const angle = feetAngle(heightM, floorDistanceM);
    const framed = framedAt(pose, { x, y: 0, z: 0 }, lens) && framedAt(pose, { x, y: profile.humanHeightM, z: 0 }, lens);
    return [key, { xM: x, floorDistanceM, feetAngleDeg: angle, status: judgeFeet(angle, profile), framed }];
  }));
  const feet = points.aim;
  const framed = feet.framed;
  const edge = walkableEdge(points, span, profile);

  const faceAngleDeg = faceAngle(heightM, aimReachM, profile.facePointM);
  const headAngleDeg = downwardAngle(heightM, profile.humanHeightM, aimReachM);
  const inView = lineInView(camera, pose, heightM, distanceM, offsetM, 1);
  const inEffective = lineInView(camera, pose, heightM, distanceM, offsetM, EFFECTIVE_COVERAGE);
  // A hand-set pan can push the person in the middle of the entrance (shoulders, feet to head) into the outer tenth of
  // the picture, where detection is weaker.
  const aimReachX = fisheye ? 0 : Math.max(0, ...[-0.3, 0.3].flatMap((x) => [0, profile.humanHeightM / 2, profile.humanHeightM].map((y) => {
    const image = lens.toImage(fromCamera(pose, { x, y, z: 0 }));
    return image === null ? 1 : Math.abs(image.x);
  })));
  const aimOffEffective = aimReachX > EFFECTIVE_COVERAGE;
  const pixelsPerMetre = pixelDensity(camera, Math.hypot(heightM, aimReachM), 90 - points.aim.feetAngleDeg);
  const { min, max } = profile.heightRangeM;

  return {
    feet: { angleDeg: feet.feetAngleDeg, status: feet.status },
    face: { angleDeg: faceAngleDeg, status: judgeFace(faceAngleDeg, profile) },
    countingLine: {
      distanceM, offsetM, recommendedDistanceM: solved.distanceM, window: { best: solved.best, acceptable: solved.acceptable, judgedBy: solved.judgedBy },
      framed, headAngleDeg, walkable: span, points, edge,
    },
    faceLine: judgeFaceLine({ profile, camera, heightM, distanceM, offsetM, pose, lens }),
    tilt: { value: tilt, recommended },
    // Where the camera is and which way it looks, as judged: views draw from this rather than rebuilding it.
    pose,
    pan: {
      deg: Math.abs(pan), toward: Math.abs(pan) < 0.05 ? null : pan < 0 ? "left" : "right",
      value: pan, recommended: recommendedPan, manual: !fisheye && Number.isFinite(panDeg), range: panRange,
    },
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
      edge !== null && "walkable_edge",
      aimOffEffective && "aim_off_effective",
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
