/**
 * A placement written into a link, so the link itself is the record: no server keeps anything.
 * @typedef {{
 *   rulesVersion: string | null, scene: string | null, camera: string | null,
 *   focalMm: number | null, resolution: { w: number, h: number } | null, sensor: string | null,
 *   solve: string | null, heightM: number | null, distanceM: number | null,
 *   tiltDeg: number | null, entranceM: number | null, verdict: string | null,
 *   site: string | null, location: string | null
 * }} SharedPlacement
 *   tiltDeg is set only when the tilt was set by hand; verdict is the verdict when the link was made.
 */

const NUMBERS = [
  ["z", "focalMm", 2],
  ["h", "heightM", 2],
  ["d", "distanceM", 2],
  ["t", "tiltDeg", 1],
  ["e", "entranceM", 2],
];
const TEXTS = [
  ["v", "rulesVersion"],
  ["s", "scene"],
  ["c", "camera"],
  ["sn", "sensor"],
  ["m", "solve"],
  ["vd", "verdict"],
  ["site", "site"],
  ["loc", "location"],
];

const trimmed = (value, digits) => String(Number(value.toFixed(digits)));

/** @param {SharedPlacement} placement @returns {string} the hash, without the leading # */
export function encodePlacement(placement) {
  const params = new URLSearchParams();
  const put = (key, value) => {
    if (value !== null && value !== undefined && value !== "") params.set(key, value);
  };
  TEXTS.slice(0, 5).forEach(([key, field]) => put(key, placement[field]));
  if (placement.resolution) put("r", placement.resolution.w + "x" + placement.resolution.h);
  NUMBERS.forEach(([key, field, digits]) => {
    if (Number.isFinite(placement[field])) put(key, trimmed(placement[field], digits));
  });
  TEXTS.slice(5).forEach(([key, field]) => put(key, placement[field]));
  return params.toString();
}

/** @param {string} hash with or without the leading # @returns {SharedPlacement | null} null when it holds no placement */
export function decodePlacement(hash) {
  const params = new URLSearchParams(String(hash || "").replace(/^#/, ""));
  if (!params.has("s") && !params.has("c") && !params.has("h")) return null;
  const placement = {};
  TEXTS.forEach(([key, field]) => { placement[field] = params.get(key) || null; });
  NUMBERS.forEach(([key, field]) => {
    const text = params.get(key);
    const value = Number(text);
    placement[field] = text !== null && text !== "" && Number.isFinite(value) ? value : null;
  });
  const size = /^(\d+)x(\d+)$/.exec(params.get("r") || "");
  placement.resolution = size ? { w: Number(size[1]), h: Number(size[2]) } : null;
  return placement;
}
