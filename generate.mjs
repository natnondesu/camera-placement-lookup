import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RULE = {
  minCameraHeightM: 1.8,
  maxCameraHeightM: 20,
  cameraHeightStepM: 0.1,
  humanHeightM: 1.7,
  faceHeightM: 1.5,
  defaultTiltTargetHeightM: 0.7,
  defaultTiltAngleDeg: 25,
  minTiltAngleDeg: 0,
  maxTiltAngleDeg: 90,
  tiltAngleStepDeg: 1,
  defaultFocalLengthMm: 2.8,
  minFocalLengthMm: 0.5,
  maxFocalLengthMm: 100,
  focalLengthStepMm: 0.1,
  defaultSensorWidthMm: 4.8,
  idealFeetAngleDeg: 37.5,
  priorityFeetAngleDeg: 38,
  bestFeetAngleMinDeg: 36,
  bestFeetAngleMaxDeg: 39,
  acceptableFeetAngleMinDeg: 32,
  acceptableFeetAngleMaxDeg: 45,
  bestFaceAngleMaxDeg: 25,
  acceptableFaceAngleMaxDeg: 30,
};

const EPSILON = 1e-9;
const ANGLE_TOLERANCE_DEG = 0.005;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function angleDeg(verticalDeltaM, distanceM) {
  return Math.atan(Math.abs(verticalDeltaM) / distanceM) * 180 / Math.PI;
}

function verticalFovDeg(sensorWidthMm, focalLengthMm, resolution = { w: 1920, h: 1080 }) {
  const sensorHeightMm = sensorWidthMm * (resolution.h / resolution.w);
  return 2 * Math.atan(sensorHeightMm / (2 * focalLengthMm)) * 180 / Math.PI;
}

function horizontalFovDeg(sensorWidthMm, focalLengthMm) {
  return 2 * Math.atan(sensorWidthMm / (2 * focalLengthMm)) * 180 / Math.PI;
}

function tiltAngleForTargetHeight(cameraHeightM, distanceM, targetHeightM = RULE.defaultTiltTargetHeightM) {
  return Math.atan(Math.max(0, cameraHeightM - targetHeightM) / Math.max(distanceM, EPSILON)) * 180 / Math.PI;
}

function distanceForFeetAngle(cameraHeightM, angleDegValue) {
  return cameraHeightM / Math.tan(toRad(angleDegValue));
}

function minDistanceForFaceAngle(cameraHeightM, maxFaceAngleDeg) {
  const faceDeltaM = Math.abs(cameraHeightM - RULE.faceHeightM);
  if (faceDeltaM === 0) return 0;
  return faceDeltaM / Math.tan(toRad(maxFaceAngleDeg));
}

function round(value, decimals = 3) {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  return Number(value.toFixed(decimals));
}

function fmt(value, decimals = 3) {
  const rounded = round(value, decimals);
  return rounded === "" ? "" : rounded.toFixed(decimals);
}

function cameraHeightValues() {
  const values = [];
  const count = Math.round((RULE.maxCameraHeightM - RULE.minCameraHeightM) / RULE.cameraHeightStepM);
  for (let i = 0; i <= count; i += 1) {
    values.push(Number((RULE.minCameraHeightM + i * RULE.cameraHeightStepM).toFixed(1)));
  }
  return values;
}

function lookupRow(cameraHeightM) {
  const bestFeetMinDistanceM = distanceForFeetAngle(cameraHeightM, RULE.bestFeetAngleMaxDeg);
  const bestFeetMaxDistanceM = distanceForFeetAngle(cameraHeightM, RULE.bestFeetAngleMinDeg);
  const bestFaceMinDistanceM = minDistanceForFaceAngle(cameraHeightM, RULE.bestFaceAngleMaxDeg);
  const strictBestDistanceMinM = Math.max(bestFeetMinDistanceM, bestFaceMinDistanceM);
  const strictBestDistanceMaxM = bestFeetMaxDistanceM;
  const hasStrictBest = strictBestDistanceMinM < strictBestDistanceMaxM - EPSILON;

  const acceptableFeetMinDistanceM = distanceForFeetAngle(cameraHeightM, RULE.acceptableFeetAngleMaxDeg);
  const acceptableFeetMaxDistanceM = distanceForFeetAngle(cameraHeightM, RULE.acceptableFeetAngleMinDeg);
  const acceptableFaceMinDistanceM = minDistanceForFaceAngle(cameraHeightM, RULE.acceptableFaceAngleMaxDeg);
  const acceptableDistanceMinM = Math.max(acceptableFeetMinDistanceM, acceptableFaceMinDistanceM);
  const acceptableDistanceMaxM = acceptableFeetMaxDistanceM;
  const hasAcceptable = acceptableDistanceMinM <= acceptableDistanceMaxM + EPSILON;

  let rawRecommendedDistanceM;
  let recommendationTier = "best";
  let priorityMode = "strict_best";
  let note = "Recommended distance is inside the best feet-angle band and keeps face angle below 25 deg.";

  if (hasStrictBest) {
    const idealDistanceM = distanceForFeetAngle(cameraHeightM, RULE.idealFeetAngleDeg);
    rawRecommendedDistanceM = idealDistanceM >= strictBestDistanceMinM && idealDistanceM <= strictBestDistanceMaxM
      ? idealDistanceM
      : (strictBestDistanceMinM + strictBestDistanceMaxM) / 2;
  } else {
    rawRecommendedDistanceM = distanceForFeetAngle(cameraHeightM, RULE.priorityFeetAngleDeg);
    priorityMode = "feet_priority_38deg";
    note = "Face <25 deg conflicts with the 36-39 deg feet band; recommendation prioritizes a fixed 38 deg feet angle.";
  }

  const recommendedDistanceM = round(rawRecommendedDistanceM, 2);
  const recommendedFeetAngleDeg = angleDeg(cameraHeightM, recommendedDistanceM);
  const recommendedFaceAngleDeg = angleDeg(cameraHeightM - RULE.faceHeightM, recommendedDistanceM);
  const faceStatus = recommendedFaceAngleDeg < RULE.bestFaceAngleMaxDeg
    ? "ideal_under_25"
    : recommendedFaceAngleDeg <= RULE.acceptableFaceAngleMaxDeg
      ? "acceptable_25_to_30"
      : "out_over_30";

  if (faceStatus === "out_over_30") {
    note = `${note} Face angle is above the original 30 deg out-of-range limit.`;
  }

  return {
    camera_height_m: cameraHeightM,
    face_height_m: RULE.faceHeightM,
    human_height_m: RULE.humanHeightM,
    recommended_distance_m: recommendedDistanceM,
    recommendation_tier: recommendationTier,
    priority_mode: priorityMode,
    recommended_feet_angle_deg: recommendedFeetAngleDeg,
    recommended_face_angle_deg: recommendedFaceAngleDeg,
    face_status: faceStatus,
    best_feet_distance_min_m: bestFeetMinDistanceM,
    best_feet_distance_max_m: bestFeetMaxDistanceM,
    face_safe_acceptable_distance_min_m: hasAcceptable ? acceptableDistanceMinM : null,
    face_safe_acceptable_distance_max_m: hasAcceptable ? acceptableDistanceMaxM : null,
    note,
  };
}

function buildRows() {
  return cameraHeightValues().map(lookupRow);
}

function buildHtml(rows) {
  const rowsJson = JSON.stringify(rows);
  const ruleJson = JSON.stringify(RULE, null, 2);
  const initialRow = rows[0] ?? lookupRow(RULE.minCameraHeightM);
  const initialResolution = { w: 1920, h: 1080 };
  const initialTiltAngleDeg = round(tiltAngleForTargetHeight(initialRow.camera_height_m, initialRow.recommended_distance_m), 0);
  const initialVerticalFovDeg = verticalFovDeg(RULE.defaultSensorWidthMm, RULE.defaultFocalLengthMm, initialResolution);
  const initialHorizontalFovDeg = horizontalFovDeg(RULE.defaultSensorWidthMm, RULE.defaultFocalLengthMm);
  const initialVisibleVerticalSpanM = Math.max(0.001, 2 * initialRow.recommended_distance_m * Math.tan(toRad(initialVerticalFovDeg / 2)));
  const initialFullWidthM = Math.max(0.001, 2 * initialRow.recommended_distance_m * Math.tan(toRad(initialHorizontalFovDeg / 2)));
  const initialEffectiveWidthM = initialFullWidthM * 0.8;
  const initialHorizontalPpm = initialResolution.w / initialFullWidthM;
  const initialVerticalPpm = initialResolution.h / initialVisibleVerticalSpanM;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Camera Placement Lookup</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: oklch(0.165 0.013 256);
      --surface: oklch(0.215 0.015 256);
      --surface-2: oklch(0.255 0.017 256);
      --surface-3: oklch(0.300 0.019 256);
      --border: oklch(0.335 0.018 256);
      --border-strong: oklch(0.440 0.022 256);
      --ink: oklch(0.970 0.004 256);
      --ink-soft: oklch(0.835 0.010 256);
      --muted: oklch(0.710 0.016 256);
      --faint: oklch(0.650 0.016 256);
      --accent: oklch(0.715 0.150 256);
      --accent-ink: oklch(0.985 0.004 256);
      --accent-dim: oklch(0.715 0.150 256 / 0.16);
      --best: oklch(0.780 0.165 152);
      --best-bg: oklch(0.780 0.165 152 / 0.14);
      --ok: oklch(0.820 0.140 82);
      --ok-bg: oklch(0.820 0.140 82 / 0.14);
      --bad: oklch(0.680 0.205 24);
      --bad-bg: oklch(0.680 0.205 24 / 0.16);
      --chrome-bg: oklch(0.185 0.014 256 / 0.96);
      --chrome-solid: oklch(0.185 0.014 256);
      --shadow-sm: 0 1px 2px oklch(0 0 0 / 0.34);
      --radius-sm: 8px;
      --radius-md: 12px;
      --radius-lg: 16px;
      --ease: cubic-bezier(0.22, 1, 0.36, 1);
      color-scheme: dark;
      font-family: "Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 16px;
    }

    * {
      box-sizing: border-box;
    }

    html {
      min-height: 100%;
    }

    body {
      min-height: 100%;
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
      letter-spacing: 0;
      overflow-x: clip;
    }

    button,
    input,
    select {
      font: inherit;
    }

    button {
      cursor: pointer;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
      border: 0;
    }

    button:focus-visible,
    input:focus-visible,
    select:focus-visible,
    summary:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    .mono {
      font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-feature-settings: "tnum" 1;
    }

    .app {
      min-height: 100vh;
      display: grid;
      grid-template-rows: auto 1fr;
    }

    .topbar {
      position: sticky;
      top: 0;
      z-index: 20;
      display: flex;
      align-items: center;
      gap: 18px;
      flex-wrap: wrap;
      padding: 14px 22px;
      background: oklch(0.180 0.013 256);
      border-bottom: 1px solid var(--border);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 11px;
      min-width: 0;
    }

    .mark {
      width: 34px;
      height: 34px;
      flex: none;
      display: grid;
      place-items: center;
      border-radius: 10px;
      background: var(--accent);
      color: var(--accent-ink);
      box-shadow: var(--shadow-sm);
    }

    .mark svg {
      width: 21px;
      height: 21px;
      display: block;
    }

    .wordmark {
      min-width: 0;
      display: grid;
      gap: 1px;
      line-height: 1.1;
    }

    .wordmark b {
      font-size: 17px;
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .wordmark span {
      color: var(--muted);
      font-size: 12px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .tabs {
      display: inline-flex;
      gap: 2px;
      padding: 3px;
      border: 1px solid var(--border);
      border-radius: 11px;
      background: var(--surface);
    }

    .tabs button,
    .solve-seg button {
      appearance: none;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--muted);
      font-weight: 650;
      transition: background 160ms var(--ease), color 160ms var(--ease);
    }

    .tabs button {
      min-height: 34px;
      padding: 7px 16px;
      font-size: 13px;
    }

    .tabs button:hover,
    .solve-seg button:hover {
      color: var(--ink-soft);
    }

    .tabs button[aria-selected="true"],
    .solve-seg button[aria-pressed="true"] {
      background: var(--surface-3);
      color: var(--ink);
      box-shadow: var(--shadow-sm);
    }

    .top-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      margin-left: auto;
    }

    .button,
    .icon-button,
    .use-button {
      appearance: none;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--surface-2);
      color: var(--ink-soft);
      font-weight: 650;
      transition: background 160ms var(--ease), border-color 160ms var(--ease), color 160ms var(--ease), transform 160ms var(--ease);
    }

    .button {
      min-height: 36px;
      padding: 8px 12px;
      font-size: 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      white-space: nowrap;
    }

    .button:hover,
    .icon-button:hover {
      background: var(--surface-3);
      border-color: var(--border-strong);
      color: var(--ink);
    }

    .button.primary {
      background: var(--accent);
      border-color: var(--accent);
      color: var(--accent-ink);
    }

    .button.primary:hover {
      background: oklch(0.755 0.150 256);
      color: var(--accent-ink);
    }

    .button:active,
    .icon-button:active,
    .use-button:active {
      transform: translateY(1px);
    }

    .icon-button {
      width: 36px;
      height: 36px;
      display: grid;
      place-items: center;
    }

    .icon-button svg,
    .button svg,
    .use-button svg {
      width: 15px;
      height: 15px;
      display: block;
    }

    .workspace {
      width: min(1640px, 100%);
      margin: 0 auto;
      padding: 20px 22px 40px;
      display: grid;
      grid-template-columns: 332px minmax(0, 1fr);
      gap: 20px;
      align-items: start;
    }

    .rail,
    .main {
      min-width: 0;
    }

    .rail {
      position: sticky;
      top: 84px;
      display: grid;
      gap: 14px;
    }

    .main {
      display: grid;
      gap: 18px;
    }

    .panel,
    .verdict,
    .stage,
    .cluster,
    .table-card {
      border: 1px solid var(--border);
      background: var(--surface);
      box-shadow: var(--shadow-sm);
    }

    .panel,
    .cluster {
      border-radius: var(--radius-lg);
    }

    .panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 14px 16px 10px;
    }

    .panel-head h2,
    .stage-head h2,
    .table-head h2 {
      margin: 0;
      color: var(--ink-soft);
      font-size: 13px;
      font-weight: 700;
      line-height: 1.25;
    }

    .panel-head span {
      color: var(--faint);
      font-size: 11px;
      font-weight: 600;
    }

    .panel-body {
      display: grid;
      gap: 16px;
      padding: 4px 16px 16px;
    }

    .select-wrap {
      position: relative;
    }

    select {
      width: 100%;
      appearance: none;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--surface-2);
      color: var(--ink);
      min-height: 40px;
      padding: 9px 34px 9px 11px;
      font-size: 13px;
      font-weight: 600;
    }

    select:hover {
      border-color: var(--border-strong);
    }

    .select-wrap::after {
      content: "v";
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-53%);
      color: var(--muted);
      font-size: 11px;
      pointer-events: none;
    }

    .preset-caption {
      margin: -6px 0 0;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
      text-wrap: pretty;
    }

    .action-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .solve {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .solve-label {
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
    }

    .solve-seg {
      display: inline-flex;
      gap: 2px;
      padding: 2px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--surface-2);
    }

    .solve-seg button {
      min-height: 30px;
      padding: 6px 10px;
      font-size: 11px;
    }

    .field {
      display: grid;
      gap: 8px;
    }

    .field-top {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 10px;
    }

    .field-label {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--ink-soft);
      font-size: 13px;
      font-weight: 600;
      line-height: 1.25;
    }

    .driven-badge {
      display: none;
      border-radius: 5px;
      padding: 2px 6px;
      background: var(--accent-dim);
      color: var(--accent);
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0;
    }

    .field.driven .driven-badge,
    .field.locked .driven-badge {
      display: inline-flex;
    }

    .value-edit {
      display: inline-flex;
      align-items: baseline;
      gap: 3px;
      border: 1px solid var(--border);
      border-radius: 7px;
      background: var(--surface-2);
      padding: 3px 9px;
      transition: border-color 160ms var(--ease), box-shadow 160ms var(--ease), opacity 160ms var(--ease);
    }

    .value-edit:hover {
      border-color: var(--border-strong);
    }

    .value-edit:focus-within {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-dim);
    }

    .value-edit input {
      width: 58px;
      appearance: textfield;
      border: 0;
      outline: 0;
      background: transparent;
      color: var(--ink);
      text-align: right;
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-size: 14px;
      font-weight: 700;
    }

    .value-edit input::-webkit-outer-spin-button,
    .value-edit input::-webkit-inner-spin-button {
      appearance: none;
      margin: 0;
    }

    .unit {
      color: var(--muted);
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-size: 11px;
      font-weight: 700;
    }

    input[type="range"] {
      width: 100%;
      height: 24px;
      appearance: none;
      background: transparent;
      cursor: pointer;
    }

    input[type="range"]::-webkit-slider-runnable-track {
      height: 6px;
      border: 1px solid var(--border);
      border-radius: 999px;
      background:
        linear-gradient(var(--accent), var(--accent)) 0 / var(--fill, 40%) 100% no-repeat,
        var(--surface-3);
    }

    input[type="range"]::-moz-range-track {
      height: 6px;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--surface-3);
    }

    input[type="range"]::-moz-range-progress {
      height: 6px;
      border-radius: 999px;
      background: var(--accent);
    }

    input[type="range"]::-webkit-slider-thumb {
      width: 18px;
      height: 18px;
      margin-top: -7px;
      appearance: none;
      border: 3px solid var(--accent);
      border-radius: 50%;
      background: var(--ink);
      box-shadow: var(--shadow-sm);
      transition: transform 160ms var(--ease);
    }

    input[type="range"]::-moz-range-thumb {
      width: 18px;
      height: 18px;
      border: 3px solid var(--accent);
      border-radius: 50%;
      background: var(--ink);
      box-shadow: var(--shadow-sm);
    }

    input[type="range"]:hover::-webkit-slider-thumb {
      transform: scale(1.12);
    }

    input[type="range"]:disabled,
    .field.driven .value-edit,
    .field.locked .value-edit,
    .field.locked select {
      opacity: 0.62;
      cursor: not-allowed;
    }

    .field.driven .value-edit,
    .field.locked .value-edit,
    .field.locked select {
      border-style: dashed;
    }

    .ticks {
      display: flex;
      justify-content: space-between;
      color: var(--faint);
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-size: 10px;
      font-weight: 600;
      margin-top: -4px;
    }

    details.advanced {
      border-top: 1px solid var(--border);
      margin-top: 2px;
      padding-top: 3px;
    }

    details.advanced summary {
      list-style: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 44px;
      color: var(--ink-soft);
      font-size: 13px;
      font-weight: 700;
      padding: 10px 0;
    }

    details.advanced summary::-webkit-details-marker {
      display: none;
    }

    .advanced-body {
      display: grid;
      gap: 16px;
      padding-top: 14px;
    }

    .verdict {
      position: relative;
      overflow: hidden;
      display: grid;
      grid-template-columns: minmax(260px, 1.12fr) minmax(190px, 0.94fr) minmax(190px, 0.94fr);
      border-radius: var(--radius-lg);
    }

    .verdict::before {
      content: "";
      position: absolute;
      inset: 0 0 auto;
      height: 3px;
      background: var(--accent);
    }

    .verdict[data-state="best"]::before {
      background: var(--best);
    }

    .verdict[data-state="acceptable"]::before {
      background: var(--ok);
    }

    .verdict[data-state="out_of_range"]::before {
      background: var(--bad);
    }

    .verdict-lead,
    .pillar {
      padding: 20px 22px;
    }

    .verdict-lead {
      display: grid;
      gap: 13px;
      border-right: 1px solid var(--border);
    }

    .verdict-kicker {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent);
    }

    .verdict[data-state="best"] .dot {
      background: var(--best);
      box-shadow: 0 0 0 4px var(--best-bg);
    }

    .verdict[data-state="acceptable"] .dot {
      background: var(--ok);
      box-shadow: 0 0 0 4px var(--ok-bg);
    }

    .verdict[data-state="out_of_range"] .dot {
      background: var(--bad);
      box-shadow: 0 0 0 4px var(--bad-bg);
    }

    .verdict h1 {
      margin: 0;
      font-size: 25px;
      line-height: 1.14;
      font-weight: 750;
      text-wrap: balance;
    }

    .verdict-sub {
      margin: 0;
      max-width: 64ch;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.48;
      text-wrap: pretty;
    }

    .rec-row {
      display: grid;
      gap: 10px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--surface-2);
      padding: 12px;
    }

    .rec-pill {
      display: inline-flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 7px;
      min-width: 0;
    }

    .rec-pill small {
      color: var(--muted);
      font-size: 11px;
      font-weight: 600;
    }

    .rec-pill b {
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-size: 14px;
      font-weight: 800;
    }

    .use-button {
      min-height: 38px;
      width: 100%;
      border: 1px solid var(--accent);
      border-radius: var(--radius-sm);
      background: var(--accent-dim);
      color: var(--accent);
      padding: 8px 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 750;
    }

    .use-button:hover:not(:disabled) {
      background: var(--accent);
      color: var(--accent-ink);
    }

    .use-button:disabled {
      cursor: default;
      opacity: 0.42;
      border-color: var(--border);
      background: transparent;
      color: var(--muted);
    }

    .pillar {
      display: grid;
      gap: 12px;
      border-right: 1px solid var(--border);
    }

    .pillar:last-child {
      border-right: 0;
    }

    .pillar-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .pillar-name {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      color: var(--ink-soft);
      font-size: 13px;
      font-weight: 700;
    }

    .tag,
    .tag-info {
      border-radius: 5px;
      background: var(--accent-dim);
      color: var(--accent);
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0;
    }

    .tag {
      padding: 3px 7px;
    }

    .tag-info {
      appearance: none;
      border: 0;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 7px;
    }

    .tag-info svg {
      width: 12px;
      height: 12px;
    }

    .tip {
      position: fixed;
      left: 0;
      top: 0;
      z-index: 40;
      width: min(280px, calc(100vw - 32px));
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-md);
      background: var(--surface-3);
      color: var(--ink-soft);
      box-shadow: var(--shadow-sm);
      padding: 11px 13px;
      font-size: 12px;
      line-height: 1.45;
      opacity: 0;
      transform: translateY(4px);
      pointer-events: none;
      transition: opacity 140ms var(--ease), transform 140ms var(--ease);
    }

    .tip.show {
      opacity: 1;
      transform: translateY(0);
    }

    .tip b {
      display: block;
      color: var(--ink);
      margin-bottom: 4px;
      font-size: 12px;
    }

    .status-chip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: fit-content;
      min-height: 39px;
      border: 1px solid;
      border-radius: 10px;
      padding: 8px 13px;
      font-size: 16px;
      font-weight: 750;
    }

    .status-chip.best,
    .table-pill.best {
      color: var(--best);
      background: var(--best-bg);
      border-color: oklch(0.780 0.165 152 / 0.42);
    }

    .status-chip.acceptable,
    .table-pill.acceptable {
      color: var(--ok);
      background: var(--ok-bg);
      border-color: oklch(0.820 0.140 82 / 0.42);
    }

    .status-chip.out_of_range,
    .table-pill.out_of_range {
      color: var(--bad);
      background: var(--bad-bg);
      border-color: oklch(0.680 0.205 24 / 0.45);
    }

    .pillar-meta {
      display: flex;
      gap: 18px;
      flex-wrap: wrap;
    }

    .meta {
      display: grid;
      gap: 3px;
    }

    .meta span {
      color: var(--muted);
      font-size: 11px;
      font-weight: 600;
    }

    .meta b {
      color: var(--ink);
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-size: 16px;
      font-weight: 800;
    }

    .meta b small {
      margin-left: 2px;
      color: var(--muted);
      font-size: 10px;
      font-weight: 700;
    }

    .stage,
    .table-card {
      border-radius: var(--radius-lg);
      overflow: hidden;
    }

    .stage-head,
    .table-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 18px;
      border-bottom: 1px solid var(--border);
    }

    .stage-head {
      flex-wrap: wrap;
    }

    .stage-title {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .stage-readings {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      flex-wrap: wrap;
    }

    .reading-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 26px;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--surface-2);
      padding: 4px 8px;
      color: var(--ink-soft);
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-size: 11px;
      font-weight: 800;
      white-space: nowrap;
    }

    .reading-chip::before {
      content: "";
      width: 8px;
      height: 2px;
      border-radius: 999px;
      background: var(--accent);
    }

    .reading-chip.best::before {
      background: var(--best);
    }

    .reading-chip.acceptable::before {
      background: var(--ok);
    }

    .reading-chip.out_of_range::before {
      background: var(--bad);
    }

    .stage-badge {
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--surface-2);
      color: var(--muted);
      padding: 3px 8px;
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-size: 10px;
      font-weight: 700;
    }

    .diagram-wrap {
      width: 100%;
      min-height: 390px;
      background: oklch(0.190 0.014 256);
    }

    .dual {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 320px;
      gap: 16px;
      align-items: start;
    }

    canvas {
      display: block;
      width: 100%;
      height: auto;
    }

    #sideCanvas,
    #topCanvas {
      min-height: 390px;
    }

    #topCanvas {
      min-height: 476px;
    }

    #diagram {
      display: block;
      width: 100%;
      height: auto;
      min-height: 390px;
    }

    .svg-label {
      fill: var(--ink);
      font-size: 13px;
      font-weight: 700;
    }

    .svg-muted {
      fill: var(--muted);
      font-size: 12px;
    }

    .svg-small {
      fill: var(--faint);
      font-size: 11px;
      font-weight: 700;
    }

    .svg-value {
      fill: var(--ink);
      font-size: 12px;
      font-weight: 800;
    }

    .svg-measure,
    .svg-reference {
      stroke: var(--border-strong);
      stroke-width: 1.5;
      stroke-dasharray: 4 5;
      fill: none;
    }

    .svg-ground {
      stroke: var(--border);
      stroke-width: 2;
    }

    .svg-fov-fill {
      fill: oklch(0.715 0.150 256 / 0.11);
    }

    .svg-fov-ray {
      stroke: var(--accent);
      stroke-width: 1.8;
      stroke-dasharray: 6 7;
      stroke-linecap: round;
      fill: none;
      opacity: 0.78;
    }

    .svg-center-ray {
      stroke: oklch(0.730 0.110 190);
      stroke-width: 2.8;
      stroke-linecap: round;
      fill: none;
    }

    .svg-foot-ray,
    .svg-face-ray {
      stroke-width: 3;
      stroke-linecap: round;
      fill: none;
    }

    .svg-face-ray {
      stroke-dasharray: 8 8;
    }

    .svg-foot-ray.best,
    .svg-face-ray.best {
      stroke: var(--best);
    }

    .svg-foot-ray.acceptable,
    .svg-face-ray.acceptable {
      stroke: var(--ok);
    }

    .svg-foot-ray.out_of_range,
    .svg-face-ray.out_of_range {
      stroke: var(--bad);
    }

    .svg-camera {
      fill: var(--accent);
    }

    .svg-subject {
      fill: var(--ink);
      stroke: var(--ink);
      stroke-linecap: round;
    }

    .svg-band-ok {
      fill: var(--ok-bg);
      stroke: var(--ok);
      stroke-width: 2;
    }

    .svg-band-best {
      fill: var(--best-bg);
      stroke: var(--best);
      stroke-width: 2;
    }

    .svg-callout {
      fill: var(--surface);
      stroke: var(--border);
      stroke-width: 1;
    }

    .rangebar {
      padding: 16px 22px 20px;
      border-top: 1px solid var(--border);
    }

    .rangebar-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 16px;
    }

    .rangebar-head b {
      color: var(--ink-soft);
      font-size: 12px;
    }

    .legend {
      display: flex;
      gap: 13px;
      flex-wrap: wrap;
      color: var(--muted);
      font-size: 11px;
      font-weight: 600;
    }

    .legend i {
      display: inline-block;
      width: 9px;
      height: 9px;
      border-radius: 2px;
      margin-right: 5px;
      vertical-align: -1px;
    }

    .range-track {
      position: relative;
      height: 10px;
      margin: 30px 8px 10px;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--surface-3);
    }

    .zone,
    .cursor,
    .marker {
      position: absolute;
      top: 50%;
    }

    .zone {
      top: 0;
      bottom: 0;
      border-radius: 3px;
    }

    .zone.ok {
      background: var(--ok-bg);
      border-top: 2px solid var(--ok);
      border-bottom: 2px solid var(--ok);
    }

    .zone.best {
      background: var(--best-bg);
      border-top: 2px solid var(--best);
      border-bottom: 2px solid var(--best);
    }

    .marker,
    .cursor {
      transform: translate(-50%, -50%);
    }

    .marker::before {
      content: "";
      display: block;
      width: 2px;
      height: 18px;
      border-radius: 2px;
      background: var(--faint);
    }

    .marker span {
      position: absolute;
      left: 50%;
      bottom: 18px;
      transform: translateX(-50%);
      white-space: nowrap;
      color: var(--muted);
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-size: 10px;
      font-weight: 700;
    }

    .cursor span {
      position: absolute;
      left: 50%;
      bottom: 18px;
      transform: translateX(-50%);
      white-space: nowrap;
      color: var(--ink);
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-size: 10px;
      font-weight: 700;
    }

    .cursor {
      z-index: 2;
    }

    .cursor::before {
      content: "";
      display: block;
      width: 16px;
      height: 16px;
      border: 3px solid var(--accent);
      border-radius: 50%;
      background: var(--ink);
      box-shadow: 0 0 0 4px var(--bg), var(--shadow-sm);
    }

    .cursor span {
      bottom: 23px;
      color: var(--ink);
      border: 1px solid var(--border-strong);
      border-radius: 6px;
      background: var(--surface-3);
      padding: 2px 7px;
      font-size: 11px;
    }

    .clusters {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }

    .cluster {
      padding: 16px 18px;
    }

    .cluster h3 {
      margin: 0 0 14px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 750;
    }

    .metrics {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px 18px;
    }

    .metric {
      min-width: 0;
      display: grid;
      gap: 4px;
    }

    .metric .value {
      color: var(--ink);
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-size: 20px;
      font-weight: 800;
      line-height: 1;
      white-space: nowrap;
    }

    .metric .value small {
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
    }

    .metric .label {
      color: var(--muted);
      font-size: 11px;
      font-weight: 600;
      line-height: 1.35;
    }

    .span-2 {
      grid-column: 1 / -1;
    }

    .table-card {
      min-width: 0;
    }

    .table-meta {
      color: var(--muted);
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
    }

    .table-scroll {
      max-height: calc(100vh - 190px);
      overflow: auto;
    }

    table {
      width: 100%;
      min-width: 1120px;
      border-collapse: collapse;
      font-size: 13px;
    }

    th,
    td {
      border-bottom: 1px solid var(--border);
      padding: 10px 12px;
      text-align: right;
      white-space: nowrap;
      font-family: "JetBrains Mono", ui-monospace, monospace;
      color: var(--ink-soft);
    }

    th {
      position: sticky;
      top: 0;
      z-index: 1;
      background: var(--surface-2);
      color: var(--muted);
      font-size: 11px;
      font-weight: 800;
    }

    td:first-child,
    th:first-child,
    td:nth-child(5),
    th:nth-child(5),
    td:nth-child(6),
    th:nth-child(6) {
      text-align: left;
    }

    tbody tr:hover td {
      background: var(--surface-2);
    }

    tr.is-selected td {
      background: var(--accent-dim);
    }

    .table-pill {
      display: inline-flex;
      justify-content: center;
      min-width: 86px;
      border: 1px solid;
      border-radius: 999px;
      padding: 3px 8px;
      font-family: "Inter", ui-sans-serif, system-ui, sans-serif;
      font-size: 11px;
      font-weight: 800;
    }

    [hidden] {
      display: none !important;
    }

    .statusbar {
      display: none;
    }

    .mobile-answer {
      display: none;
    }

    @media (max-width: 1080px) {
      .workspace {
        grid-template-columns: 1fr;
        padding-bottom: 90px;
      }

      .rail {
        position: static;
      }

      .statusbar {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 30;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 11px 16px calc(11px + env(safe-area-inset-bottom, 0px));
        border-top: 1px solid var(--border-strong);
        background: var(--chrome-bg);
        box-shadow: 0 -6px 8px -8px oklch(0 0 0 / 0.7);
      }

      .statusbar button {
        appearance: none;
        border: 0;
        background: transparent;
        color: inherit;
        display: contents;
      }

      .sb-dot {
        width: 10px;
        height: 10px;
        flex: none;
        border-radius: 50%;
        background: var(--accent);
      }

      .statusbar[data-state="best"] .sb-dot {
        background: var(--best);
        box-shadow: 0 0 0 4px var(--best-bg);
      }

      .statusbar[data-state="acceptable"] .sb-dot {
        background: var(--ok);
        box-shadow: 0 0 0 4px var(--ok-bg);
      }

      .statusbar[data-state="out_of_range"] .sb-dot {
        background: var(--bad);
        box-shadow: 0 0 0 4px var(--bad-bg);
      }

      .sb-overall {
        color: var(--ink);
        font-size: 13px;
        font-weight: 800;
      }

      .sb-pairs {
        display: flex;
        gap: 12px;
        color: var(--muted);
        font-size: 12px;
        font-weight: 650;
      }

      .sb-pairs b.best {
        color: var(--best);
      }

      .sb-pairs b.acceptable {
        color: var(--ok);
      }

      .sb-pairs b.out_of_range {
        color: var(--bad);
      }

      .sb-spacer {
        flex: 1;
      }

      .sb-distance {
        color: var(--ink);
        font-family: "JetBrains Mono", ui-monospace, monospace;
        font-size: 13px;
        font-weight: 800;
      }

      .value-edit input,
      select {
        font-size: 16px;
      }

      .value-edit {
        min-height: 44px;
        align-items: center;
      }

      .value-edit input {
        width: 64px;
        min-height: 44px;
      }

      select,
      .button,
      .icon-button,
      .use-button,
      .tag-info,
      .tabs button,
      .solve-seg button {
        min-height: 44px;
      }

      input[type="range"] {
        height: 44px;
      }

      input[type="range"]::-webkit-slider-thumb {
        width: 22px;
        height: 22px;
        margin-top: -9px;
      }

      input[type="range"]::-moz-range-thumb {
        width: 22px;
        height: 22px;
      }
    }

    @media (max-width: 760px) {
      .topbar {
        padding: 12px 16px;
      }

      .brand {
        flex: 1 1 auto;
      }

      .top-actions {
        order: 2;
        margin-left: 0;
      }

      .tabs {
        order: 3;
        width: 100%;
      }

      .tabs button {
        flex: 1;
      }

      .workspace {
        padding: 16px 16px calc(104px + env(safe-area-inset-bottom, 0px));
      }

      .mobile-answer {
        display: none;
      }

      .mobile-answer[data-state="best"] .sb-dot {
        background: var(--best);
        box-shadow: 0 0 0 4px var(--best-bg);
      }

      .mobile-answer[data-state="acceptable"] .sb-dot {
        background: var(--ok);
        box-shadow: 0 0 0 4px var(--ok-bg);
      }

      .mobile-answer[data-state="out_of_range"] .sb-dot {
        background: var(--bad);
        box-shadow: 0 0 0 4px var(--bad-bg);
      }

      .mobile-answer-main {
        color: var(--ink);
        font-size: 13px;
        font-weight: 800;
      }

      .mobile-answer-pairs {
        display: flex;
        min-width: 0;
        gap: 10px;
        color: var(--muted);
        font-size: 12px;
        font-weight: 650;
      }

      .mobile-answer-pairs b.best {
        color: var(--best);
      }

      .mobile-answer-pairs b.acceptable {
        color: var(--ok);
      }

      .mobile-answer-pairs b.out_of_range {
        color: var(--bad);
      }

      .mobile-answer-distance {
        margin-left: auto;
        color: var(--ink);
        font-family: "JetBrains Mono", ui-monospace, monospace;
        font-size: 13px;
        font-weight: 800;
        white-space: nowrap;
      }

      .statusbar {
        left: 12px;
        right: 12px;
        bottom: calc(10px + env(safe-area-inset-bottom, 0px));
        display: block;
        padding: 6px;
        border: 1px solid var(--border-strong);
        border-radius: 12px;
        background: oklch(0.185 0.014 256 / 0.98);
        box-shadow: 0 -8px 24px oklch(0 0 0 / 0.36), 0 1px 0 oklch(1 0 0 / 0.06) inset;
      }

      .statusbar button {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        min-height: 48px;
        border-radius: 8px;
      }

      .sb-pairs {
        flex: 1;
        min-width: 0;
      }

      .sb-distance {
        flex: none;
      }

      .verdict {
        grid-template-columns: 1fr;
      }

      .verdict-lead,
      .pillar {
        border-right: 0;
        border-bottom: 1px solid var(--border);
      }

      .pillar:last-child {
        border-bottom: 0;
      }

      .clusters {
        grid-template-columns: 1fr;
      }

      .stage-head {
        align-items: flex-start;
        flex-direction: column;
      }

      .stage-readings {
        justify-content: flex-start;
      }

      .diagram-wrap,
      #diagram,
      #sideCanvas,
      #topCanvas {
        min-height: 330px;
      }
    }

    @media (max-width: 920px) {
      .dual {
        grid-template-columns: 1fr;
      }

      #topCanvas {
        min-height: 330px;
      }
    }

    @media (max-width: 560px) {
      .wordmark span {
        display: none;
      }

      .top-actions .button {
        display: none;
      }

      .action-grid,
      .metrics {
        grid-template-columns: 1fr;
      }

      .solve {
        align-items: stretch;
        flex-direction: column;
      }

      .solve-seg {
        width: 100%;
      }

      .solve-seg button {
        flex: 1;
      }

      .rangebar-head {
        align-items: flex-start;
        flex-direction: column;
      }

      .statusbar button {
        min-height: 56px;
        flex-wrap: wrap;
        gap: 6px 9px;
      }

      .sb-pairs {
        order: 4;
        flex-basis: 100%;
        gap: 10px;
        font-size: 11px;
        padding-left: 20px;
      }

      .sb-distance {
        margin-left: auto;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        scroll-behavior: auto !important;
        transition-duration: 1ms !important;
        animation-duration: 1ms !important;
        animation-iteration-count: 1 !important;
      }
    }
  </style>
</head>
<body>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <div class="mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M4 19 13 5l7 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
            <circle cx="13" cy="5" r="2.1" fill="currentColor"></circle>
            <path d="M13 5 7.5 19" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2 2" opacity="0.78"></path>
          </svg>
        </div>
        <div class="wordmark">
          <b>Camera Placement Lookup</b>
          <span>Geometry console</span>
        </div>
      </div>

      <div class="tabs" role="tablist" aria-label="View" id="viewTabs">
        <button type="button" role="tab" aria-selected="true" aria-controls="visualizerView" id="visualizerTab" tabindex="0" data-tab="visualizer">Visualizer</button>
        <button type="button" role="tab" aria-selected="false" aria-controls="tableView" id="tableTab" tabindex="-1" data-tab="table">Rule table</button>
      </div>

    </header>

    <div class="mobile-answer" id="mobileAnswer" data-state="best" aria-hidden="true">
      <span class="sb-dot"></span>
      <span class="mobile-answer-main" id="mobileAnswerOverall">Best</span>
      <span class="mobile-answer-pairs">
        <span>Feet <b id="mobileAnswerFeet" class="best">Best</b></span>
        <span>Face <b id="mobileAnswerFace" class="best">Best</b></span>
      </span>
      <span class="mobile-answer-distance" id="mobileAnswerDistance">${fmt(initialRow.recommended_distance_m, 2)} m</span>
    </div>

    <div class="workspace">
      <aside class="rail" aria-label="Placement controls">
        <section class="panel">
          <div class="panel-head">
            <h2>Camera preset</h2>
            <span>optics</span>
          </div>
          <div class="panel-body">
            <div class="select-wrap">
              <select id="presetSelect" aria-label="Camera preset">
                <option value="custom">No preset - custom</option>
                <option value="dahua2531">Dahua DH-IPC-HDBW2531R-ZS-S2</option>
              </select>
            </div>
            <p class="preset-caption" id="presetCaption">Custom configuration. Sensor format, focal length and resolution are adjustable.</p>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2>Geometry</h2>
            <span>drag or type</span>
          </div>
          <div class="panel-body">
            <div class="solve">
              <span class="solve-label">Solve for</span>
              <div class="solve-seg" role="group" aria-label="Solve mode">
                <button type="button" data-solve="manual" aria-pressed="true">Manual</button>
                <button type="button" data-solve="distance" aria-pressed="false">Distance</button>
                <button type="button" data-solve="height" aria-pressed="false">Height</button>
              </div>
            </div>

            <div class="field" id="heightField">
              <div class="field-top">
                <label class="field-label" for="heightRange">Mounting height <span class="driven-badge">solved</span></label>
                <span class="value-edit">
                  <input id="heightInput" type="number" min="${RULE.minCameraHeightM}" max="${RULE.maxCameraHeightM}" step="${RULE.cameraHeightStepM}" value="${RULE.minCameraHeightM.toFixed(1)}" aria-label="Mounting height in meters">
                  <span class="unit">m</span>
                </span>
              </div>
              <input id="heightRange" type="range" min="${RULE.minCameraHeightM}" max="${RULE.maxCameraHeightM}" step="${RULE.cameraHeightStepM}" value="${RULE.minCameraHeightM}">
              <div class="ticks"><span>${RULE.minCameraHeightM.toFixed(1)}</span><span>${RULE.maxCameraHeightM.toFixed(1)}</span></div>
            </div>

            <div class="field" id="distanceField">
              <div class="field-top">
                <label class="field-label" for="distanceRange">Subject distance <span class="driven-badge">solved</span></label>
                <span class="value-edit">
                  <input id="distanceInput" type="number" min="0.3" max="36" step="0.01" value="${fmt(initialRow.recommended_distance_m, 2)}" aria-label="Subject distance in meters">
                  <span class="unit">m</span>
                </span>
              </div>
              <input id="distanceRange" type="range" min="0.3" max="36" step="0.01" value="${fmt(initialRow.recommended_distance_m, 2)}">
              <div class="ticks"><span id="distanceMinTick">0.30</span><span id="distanceMaxTick">36.00</span></div>
            </div>

            <div class="rec-row" aria-label="Recommended placement action">
              <span class="rec-pill"><small>recommended distance</small><b id="recommendedDistance" class="mono">${fmt(initialRow.recommended_distance_m, 2)} m</b></span>
              <button class="use-button" type="button" id="snapButton">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 6 9 17l-5-5"></path>
                </svg>
                Use recommended distance
              </button>
            </div>

            <details class="advanced" id="advancedPanel">
              <summary>Advanced optics <span aria-hidden="true">v</span></summary>
              <div class="advanced-body">
                <div class="field" id="tiltField">
                  <div class="field-top">
                    <label class="field-label" for="tiltRange">Tilt angle</label>
                    <span class="value-edit">
                      <input id="tiltInput" type="number" min="${RULE.minTiltAngleDeg}" max="${RULE.maxTiltAngleDeg}" step="${RULE.tiltAngleStepDeg}" value="${initialTiltAngleDeg}" aria-label="Tilt angle in degrees">
                      <span class="unit">deg</span>
                    </span>
                  </div>
                  <input id="tiltRange" type="range" min="${RULE.minTiltAngleDeg}" max="${RULE.maxTiltAngleDeg}" step="${RULE.tiltAngleStepDeg}" value="${initialTiltAngleDeg}">
                  <div class="ticks"><span>level</span><span>down</span></div>
                </div>

                <div class="field" id="sensorField">
                  <div class="field-top">
                    <label class="field-label" for="sensorSelect">Sensor format <span class="driven-badge">preset</span></label>
                  </div>
                  <div class="select-wrap">
                    <select id="sensorSelect" aria-label="Sensor format"></select>
                  </div>
                </div>

                <div class="field" id="focalField">
                  <div class="field-top">
                    <label class="field-label" for="focalRange">Focal length</label>
                    <span class="value-edit">
                      <input id="focalInput" type="number" min="${RULE.minFocalLengthMm}" max="${RULE.maxFocalLengthMm}" step="${RULE.focalLengthStepMm}" value="${RULE.defaultFocalLengthMm.toFixed(1)}" aria-label="Focal length in millimeters">
                      <span class="unit">mm</span>
                    </span>
                  </div>
                  <input id="focalRange" type="range" min="${RULE.minFocalLengthMm}" max="${RULE.maxFocalLengthMm}" step="${RULE.focalLengthStepMm}" value="${RULE.defaultFocalLengthMm}">
                  <div class="ticks"><span id="focalMinTick">${RULE.minFocalLengthMm.toFixed(1)}</span><span id="focalMaxTick">${RULE.maxFocalLengthMm.toFixed(1)}</span></div>
                </div>

                <div class="field">
                  <div class="field-top">
                    <label class="field-label" for="resolutionSelect">Resolution</label>
                  </div>
                  <div class="select-wrap">
                    <select id="resolutionSelect" aria-label="Camera resolution"></select>
                  </div>
                </div>
              </div>
            </details>
          </div>
        </section>
      </aside>

      <main class="main">
        <section id="visualizerView" role="tabpanel" aria-labelledby="visualizerTab">
          <div class="main">
            <section class="verdict" id="verdict" data-state="best">
              <div class="verdict-lead">
                <div class="verdict-kicker"><span class="dot"></span><span id="overallLabel">Placement verdict</span></div>
                <h1 id="verdictHeadline">Placement is best</h1>
                <p class="verdict-sub" id="verdictSub">The current distance is inside the feet priority band and keeps the face angle in range.</p>
                <p class="sr-only" id="placementAnnouncement" aria-live="polite" aria-atomic="true">Placement is best. Feet Best. Face Best. Distance ${fmt(initialRow.recommended_distance_m, 2)} meters.</p>
              </div>

              <div class="pillar">
                <div class="pillar-head">
                  <span class="pillar-name">Feet</span>
                  <button class="tag-info" type="button" id="priorityInfo" aria-expanded="false" aria-describedby="priorityTip">
                    priority
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"></circle>
                      <path d="M12 16v-4"></path>
                      <path d="M12 8h.01"></path>
                    </svg>
                  </button>
                </div>
                <span class="status-chip best" id="feetStatus">Best</span>
                <div class="pillar-meta">
                  <span class="meta"><span>angle</span><b id="feetAngle">${fmt(initialRow.recommended_feet_angle_deg, 2)}<small>deg</small></b></span>
                  <span class="meta"><span>bands</span><b>${RULE.bestFeetAngleMinDeg}-${RULE.bestFeetAngleMaxDeg} <small>best</small> / ${RULE.acceptableFeetAngleMinDeg}-${RULE.acceptableFeetAngleMaxDeg} <small>ok</small></b></span>
                </div>
              </div>

              <div class="pillar">
                <div class="pillar-head">
                  <span class="pillar-name">Face</span>
                  <span class="tag">safety</span>
                </div>
                <span class="status-chip best" id="faceStatus">Best</span>
                <div class="pillar-meta">
                  <span class="meta"><span>angle</span><b id="faceAngle">${fmt(initialRow.recommended_face_angle_deg, 2)}<small>deg</small></b></span>
                  <span class="meta"><span>bands</span><b>&lt;${RULE.bestFaceAngleMaxDeg} <small>best</small> / ${RULE.bestFaceAngleMaxDeg}-${RULE.acceptableFaceAngleMaxDeg} <small>ok</small></b></span>
                </div>
              </div>
            </section>

            <div class="dual">
              <section class="stage" aria-label="Side-view placement and distance range">
                <div class="stage-head">
                  <div class="stage-title"><h2>Side view</h2><span class="stage-badge" id="stageBadge">from lookup table</span></div>
                  <div class="stage-readings" aria-label="Current side-view readings">
                    <span class="reading-chip best" id="sideFeetReading">Feet 37.5 deg</span>
                    <span class="reading-chip best" id="sideFaceReading">Face 7.3 deg</span>
                    <span class="reading-chip" id="sideTiltReading">Tilt 25 deg / FOV 51.5 deg</span>
                  </div>
                </div>
                <div class="diagram-wrap">
                  <canvas id="sideCanvas" width="980" height="560" role="img" aria-label="Side elevation diagram"></canvas>
                </div>
                <div class="rangebar" aria-label="Distance range">
                  <div class="rangebar-head">
                    <b>Feet distance window</b>
                    <div class="legend">
                      <span><i style="background: var(--ok-bg); border: 1px solid var(--ok);"></i>ok feet</span>
                      <span><i style="background: var(--best-bg); border: 1px solid var(--best);"></i>best feet</span>
                    </div>
                  </div>
                  <div class="range-track">
                    <div class="zone ok" id="acceptableZone"></div>
                    <div class="zone best" id="bestZone"></div>
                    <div class="marker" id="minMarker"><span id="minMarkerLabel">min</span></div>
                    <div class="marker" id="bestMarker"><span id="bestMarkerLabel">best</span></div>
                    <div class="marker" id="maxMarker"><span id="maxMarkerLabel">max</span></div>
                    <div class="cursor" id="distanceCursor"><span id="cursorLabel">now</span></div>
                  </div>
                </div>
              </section>

              <section class="stage" aria-label="Top-down coverage diagram">
                <div class="stage-head">
                  <h2>Top view</h2>
                  <span class="stage-badge" id="topStageBadge">H-FOV</span>
                </div>
                <div class="diagram-wrap">
                  <canvas id="topCanvas" width="600" height="560" role="img" aria-label="Top-down coverage diagram"></canvas>
                </div>
              </section>
            </div>

            <section class="clusters" aria-label="Placement metrics">
              <div class="cluster">
                <h3>Geometry</h3>
                <div class="metrics">
                  <div class="metric"><span class="value" id="faceTiltMetric">${fmt(initialRow.recommended_face_angle_deg, 2)}<small>deg</small></span><span class="label">face tilt angle</span></div>
                  <div class="metric"><span class="value" id="groundAngleMetric">${fmt(initialRow.recommended_feet_angle_deg, 2)}<small>deg</small></span><span class="label">ground angle</span></div>
                </div>
              </div>

              <div class="cluster">
                <h3>Optics - field of view</h3>
                <div class="metrics">
                  <div class="metric"><span class="value" id="horizontalFovMetric">${fmt(initialHorizontalFovDeg, 2)}<small>deg</small></span><span class="label">horizontal FOV</span></div>
                  <div class="metric"><span class="value" id="verticalFovMetric">${fmt(initialVerticalFovDeg, 2)}<small>deg</small></span><span class="label">vertical FOV</span></div>
                </div>
              </div>

              <div class="cluster">
                <h3>Coverage at subject</h3>
                <div class="metrics">
                  <div class="metric"><span class="value" id="fullWidthMetric">${fmt(initialFullWidthM, 1)}<small>m</small></span><span class="label">full width</span></div>
                  <div class="metric"><span class="value" id="effectiveWidthMetric">${fmt(initialEffectiveWidthM, 1)}<small>m</small></span><span class="label">effective 80%</span></div>
                </div>
              </div>

              <div class="cluster">
                <h3>Resolution density</h3>
                <div class="metrics">
                  <div class="metric"><span class="value" id="horizontalPpmMetric">${fmt(initialHorizontalPpm, 0)}<small>px/m</small></span><span class="label">horizontal PPM</span></div>
                  <div class="metric"><span class="value" id="verticalPpmMetric">${fmt(initialVerticalPpm, 0)}<small>px/m</small></span><span class="label">vertical PPM</span></div>
                </div>
              </div>
            </section>
          </div>
        </section>

        <section id="tableView" role="tabpanel" aria-labelledby="tableTab" hidden>
          <div class="table-card">
            <div class="table-head">
              <h2>Lookup table</h2>
              <div class="table-meta">${RULE.minCameraHeightM.toFixed(1)}-${RULE.maxCameraHeightM.toFixed(1)} m in ${RULE.cameraHeightStepM.toFixed(1)} m steps</div>
            </div>
            <div class="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Height</th>
                    <th>Recommended</th>
                    <th>Feet angle</th>
                    <th>Face angle</th>
                    <th>Tier</th>
                    <th>Face status</th>
                    <th>Best feet min</th>
                    <th>Best feet max</th>
                    <th>Face-safe min</th>
                    <th>Face-safe max</th>
                  </tr>
                </thead>
                <tbody id="lookupBody"></tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </div>

    <div class="tip" id="priorityTip" role="tooltip">
      <b>Why feet priority?</b>
      Feet angle drives reliable people-counting geometry. Face angle sharpens profile quality, but a clean profile does not help if the count is wrong first.
    </div>

    <div class="statusbar" id="statusbar" data-state="best">
      <button type="button" id="jumpToDiagram" aria-label="Current placement status. Jump to placement diagram">
        <span class="sb-dot"></span>
        <span class="sb-overall" id="sbOverall">Best</span>
        <span class="sb-pairs">
          <span>Feet <b id="sbFeet" class="best">Best</b></span>
          <span>Face <b id="sbFace" class="best">Best</b></span>
        </span>
        <span class="sb-spacer"></span>
        <span class="sb-distance" id="sbDistance">${fmt(initialRow.recommended_distance_m, 2)} m</span>
      </button>
    </div>
  </div>

  <script>
    const RULE = ${ruleJson};
    const LOOKUP_ROWS = ${rowsJson};
    const ANGLE_TOLERANCE_DEG = ${ANGLE_TOLERANCE_DEG};

    const RESOLUTIONS = {
      custom: [
        { label: "720p - 1280 x 720", w: 1280, h: 720 },
        { label: "1080p - 1920 x 1080", w: 1920, h: 1080 },
        { label: "4 MP - 2560 x 1440", w: 2560, h: 1440 },
        { label: "8 MP - 3840 x 2160", w: 3840, h: 2160 }
      ],
      dahua2531: [
        { label: "5 MP - 2592 x 1944", w: 2592, h: 1944 },
        { label: "4 MP - 2688 x 1520", w: 2688, h: 1520 },
        { label: "3 MP - 2304 x 1296", w: 2304, h: 1296 },
        { label: "1080p - 1920 x 1080", w: 1920, h: 1080 }
      ]
    };

    const SENSOR_SIZES = [
      { id: "1/4", label: "1/4\\" format - 3.6 mm width", widthMm: 3.6 },
      { id: "1/2.7", label: "1/2.7\\" format - 4.8 mm width", widthMm: 4.8 },
      { id: "1/2.3", label: "1/2.3\\" format - 5.37 mm width", widthMm: 5.37 },
      { id: "1/2", label: "1/2\\" format - 6.4 mm width", widthMm: 6.4 },
      { id: "1/1.2", label: "1/1.2\\" format - 8.8 mm width", widthMm: 8.8 }
    ];

    const CAMERAS = {
      custom: {
        caption: "Custom configuration. Sensor format, focal length and resolution are adjustable.",
        sensorId: "1/2.7",
        sensorLocked: false,
        focalMinMm: RULE.minFocalLengthMm,
        focalMaxMm: RULE.maxFocalLengthMm,
        focalDefaultMm: RULE.defaultFocalLengthMm,
        resolutions: RESOLUTIONS.custom,
        defaultResolution: "1920x1080"
      },
      dahua2531: {
        caption: "1/2.7\\" format 5 MP dome, 2.7-13.5 mm motorized lens, up to 2592 x 1944 output.",
        sensorId: "1/2.7",
        sensorLocked: true,
        focalMinMm: 2.7,
        focalMaxMm: 13.5,
        focalDefaultMm: 4.0,
        resolutions: RESOLUTIONS.dahua2531,
        defaultResolution: "2592x1944"
      }
    };

    function themeColor(name) {
      return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }

    const COL = {
      best: themeColor("--best"),
      ok: themeColor("--ok"),
      bad: themeColor("--bad"),
      accent: themeColor("--accent"),
      ink: themeColor("--ink"),
      muted: themeColor("--muted"),
      faint: themeColor("--faint"),
      grid: themeColor("--border"),
      surface: themeColor("--surface")
    };

    const els = {
      viewTabs: document.getElementById("viewTabs"),
      visualizerTab: document.getElementById("visualizerTab"),
      tableTab: document.getElementById("tableTab"),
      visualizerView: document.getElementById("visualizerView"),
      tableView: document.getElementById("tableView"),
      presetSelect: document.getElementById("presetSelect"),
      presetCaption: document.getElementById("presetCaption"),
      heightField: document.getElementById("heightField"),
      heightRange: document.getElementById("heightRange"),
      heightInput: document.getElementById("heightInput"),
      distanceField: document.getElementById("distanceField"),
      distanceRange: document.getElementById("distanceRange"),
      distanceInput: document.getElementById("distanceInput"),
      distanceMinTick: document.getElementById("distanceMinTick"),
      distanceMaxTick: document.getElementById("distanceMaxTick"),
      tiltRange: document.getElementById("tiltRange"),
      tiltInput: document.getElementById("tiltInput"),
      sensorField: document.getElementById("sensorField"),
      sensorSelect: document.getElementById("sensorSelect"),
      focalRange: document.getElementById("focalRange"),
      focalInput: document.getElementById("focalInput"),
      focalMinTick: document.getElementById("focalMinTick"),
      focalMaxTick: document.getElementById("focalMaxTick"),
      resolutionSelect: document.getElementById("resolutionSelect"),
      advancedPanel: document.getElementById("advancedPanel"),
      verdict: document.getElementById("verdict"),
      overallLabel: document.getElementById("overallLabel"),
      verdictHeadline: document.getElementById("verdictHeadline"),
      verdictSub: document.getElementById("verdictSub"),
      placementAnnouncement: document.getElementById("placementAnnouncement"),
      recommendedDistance: document.getElementById("recommendedDistance"),
      snapButton: document.getElementById("snapButton"),
      feetStatus: document.getElementById("feetStatus"),
      faceStatus: document.getElementById("faceStatus"),
      feetAngle: document.getElementById("feetAngle"),
      faceAngle: document.getElementById("faceAngle"),
      priorityInfo: document.getElementById("priorityInfo"),
      priorityTip: document.getElementById("priorityTip"),
      stageBadge: document.getElementById("stageBadge"),
      sideFeetReading: document.getElementById("sideFeetReading"),
      sideFaceReading: document.getElementById("sideFaceReading"),
      sideTiltReading: document.getElementById("sideTiltReading"),
      topStageBadge: document.getElementById("topStageBadge"),
      sideCanvas: document.getElementById("sideCanvas"),
      topCanvas: document.getElementById("topCanvas"),
      acceptableZone: document.getElementById("acceptableZone"),
      bestZone: document.getElementById("bestZone"),
      minMarker: document.getElementById("minMarker"),
      minMarkerLabel: document.getElementById("minMarkerLabel"),
      bestMarker: document.getElementById("bestMarker"),
      bestMarkerLabel: document.getElementById("bestMarkerLabel"),
      maxMarker: document.getElementById("maxMarker"),
      maxMarkerLabel: document.getElementById("maxMarkerLabel"),
      distanceCursor: document.getElementById("distanceCursor"),
      cursorLabel: document.getElementById("cursorLabel"),
      faceTiltMetric: document.getElementById("faceTiltMetric"),
      groundAngleMetric: document.getElementById("groundAngleMetric"),
      horizontalFovMetric: document.getElementById("horizontalFovMetric"),
      verticalFovMetric: document.getElementById("verticalFovMetric"),
      fullWidthMetric: document.getElementById("fullWidthMetric"),
      effectiveWidthMetric: document.getElementById("effectiveWidthMetric"),
      horizontalPpmMetric: document.getElementById("horizontalPpmMetric"),
      verticalPpmMetric: document.getElementById("verticalPpmMetric"),
      lookupBody: document.getElementById("lookupBody"),
      mobileAnswer: document.getElementById("mobileAnswer"),
      mobileAnswerOverall: document.getElementById("mobileAnswerOverall"),
      mobileAnswerFeet: document.getElementById("mobileAnswerFeet"),
      mobileAnswerFace: document.getElementById("mobileAnswerFace"),
      mobileAnswerDistance: document.getElementById("mobileAnswerDistance"),
      statusbar: document.getElementById("statusbar"),
      sbOverall: document.getElementById("sbOverall"),
      sbFeet: document.getElementById("sbFeet"),
      sbFace: document.getElementById("sbFace"),
      sbDistance: document.getElementById("sbDistance"),
      jumpToDiagram: document.getElementById("jumpToDiagram")
    };

    const state = {
      solveMode: "manual",
      preset: "custom",
      tableRendered: false,
      tableSelectedHeightKey: null,
      announceTimer: null,
      tiltUserAdjusted: false
    };

    function toRad(deg) {
      return deg * Math.PI / 180;
    }

    function angleDeg(verticalDeltaM, distanceM) {
      return Math.atan(Math.abs(verticalDeltaM) / Math.max(distanceM, 0.001)) * 180 / Math.PI;
    }

    function verticalFovDeg(sensorWidthMm, focalLengthMm, resolution) {
      const sensorHeightMm = sensorWidthMm * (resolution.h / resolution.w);
      return 2 * Math.atan(sensorHeightMm / (2 * focalLengthMm)) * 180 / Math.PI;
    }

    function horizontalFovDeg(sensorWidthMm, focalLengthMm) {
      return 2 * Math.atan(sensorWidthMm / (2 * focalLengthMm)) * 180 / Math.PI;
    }

    function tiltAngleForTargetHeight(cameraHeightM, distanceM, targetHeightM) {
      return Math.atan(Math.max(0, cameraHeightM - targetHeightM) / Math.max(distanceM, 0.001)) * 180 / Math.PI;
    }

    function aimHeightAtDistance(cameraHeightM, distanceM, tiltAngleDeg) {
      return cameraHeightM - Math.tan(toRad(tiltAngleDeg)) * distanceM;
    }

    function syncDefaultTilt(heightM, distanceM) {
      if (state.tiltUserAdjusted) return;
      const tilt = tiltAngleForTargetHeight(heightM, distanceM, RULE.defaultTiltTargetHeightM);
      setFieldValue(els.tiltInput, els.tiltRange, tilt, 0);
    }

    function distanceForFeetAngle(heightM, angleDegValue) {
      return heightM / Math.tan(toRad(angleDegValue));
    }

    function feetDistanceWindow(heightM) {
      return {
        acceptableMin: distanceForFeetAngle(heightM, RULE.acceptableFeetAngleMaxDeg),
        acceptableMax: distanceForFeetAngle(heightM, RULE.acceptableFeetAngleMinDeg),
        bestMin: distanceForFeetAngle(heightM, RULE.bestFeetAngleMaxDeg),
        bestMax: distanceForFeetAngle(heightM, RULE.bestFeetAngleMinDeg)
      };
    }

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }

    function fmt(value, decimals, suffix) {
      if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
      return Number(value).toFixed(decimals) + (suffix || "");
    }

    function pct(value, min, max) {
      if (max <= min) return 0;
      return clamp(((value - min) / (max - min)) * 100, 0, 100);
    }

    function setRangeFill(range) {
      const min = Number(range.min);
      const max = Number(range.max);
      const value = Number(range.value);
      range.style.setProperty("--fill", pct(value, min, max).toFixed(2) + "%");
    }

    function setFieldValue(input, range, value, decimals) {
      const clamped = clamp(Number(value), Number(input.min), Number(input.max));
      input.value = clamped.toFixed(decimals);
      range.value = clamped.toFixed(decimals);
      setRangeFill(range);
      return clamped;
    }

    function rowForHeight(heightM) {
      const rounded = Number(heightM.toFixed(1));
      return LOOKUP_ROWS.reduce((best, row) => {
        return Math.abs(row.camera_height_m - rounded) < Math.abs(best.camera_height_m - rounded) ? row : best;
      }, LOOKUP_ROWS[0]);
    }

    function rowForRecommendedDistance(distanceM) {
      return LOOKUP_ROWS.reduce((best, row) => {
        return Math.abs(row.recommended_distance_m - distanceM) < Math.abs(best.recommended_distance_m - distanceM) ? row : best;
      }, LOOKUP_ROWS[0]);
    }

    function classifyFeet(feetAngleDeg) {
      if (feetAngleDeg >= RULE.bestFeetAngleMinDeg - ANGLE_TOLERANCE_DEG && feetAngleDeg <= RULE.bestFeetAngleMaxDeg + ANGLE_TOLERANCE_DEG) {
        return { status: "best", label: "Best" };
      }
      if (feetAngleDeg >= RULE.acceptableFeetAngleMinDeg - ANGLE_TOLERANCE_DEG && feetAngleDeg <= RULE.acceptableFeetAngleMaxDeg + ANGLE_TOLERANCE_DEG) {
        return { status: "acceptable", label: "Acceptable" };
      }
      return { status: "out_of_range", label: "Out of range" };
    }

    function classifyFace(faceAngleDeg) {
      if (faceAngleDeg < RULE.bestFaceAngleMaxDeg) {
        return { status: "best", label: "Best" };
      }
      if (faceAngleDeg <= RULE.acceptableFaceAngleMaxDeg + ANGLE_TOLERANCE_DEG) {
        return { status: "acceptable", label: "Acceptable" };
      }
      return { status: "out_of_range", label: "Out of range" };
    }

    function classifyOverall(feetStatus, faceStatus) {
      if (feetStatus === "out_of_range" || faceStatus === "out_of_range") {
        return { status: "out_of_range", label: "Out of range" };
      }
      if (feetStatus === "best" && faceStatus === "best") {
        return { status: "best", label: "Best" };
      }
      return { status: "acceptable", label: "Acceptable" };
    }

    function classify(heightM, distanceM) {
      const feetAngle = angleDeg(heightM, distanceM);
      const faceAngle = angleDeg(heightM - RULE.faceHeightM, distanceM);
      const feet = Object.assign({ angle: feetAngle }, classifyFeet(feetAngle));
      const face = Object.assign({ angle: faceAngle }, classifyFace(faceAngle));
      return {
        feet,
        face,
        overall: classifyOverall(feet.status, face.status)
      };
    }

    function selectedResolution() {
      const value = els.resolutionSelect.value || "1920x1080";
      const parts = value.split("x").map(Number);
      return { w: parts[0] || 1920, h: parts[1] || 1080 };
    }

    function sensorById(id) {
      return SENSOR_SIZES.find((sensor) => sensor.id === id) || SENSOR_SIZES[0];
    }

    function selectedSensor() {
      return sensorById(els.sensorSelect.value);
    }

    function populateSensorOptions() {
      els.sensorSelect.innerHTML = SENSOR_SIZES.map((sensor) => {
        return "<option value=\\"" + sensor.id + "\\">" + sensor.label + "</option>";
      }).join("");
    }

    function updateResolutionOptions(camera) {
      const previous = els.resolutionSelect.value;
      els.resolutionSelect.innerHTML = camera.resolutions.map((resolution) => {
        const value = resolution.w + "x" + resolution.h;
        return "<option value=\\"" + value + "\\">" + resolution.label + "</option>";
      }).join("");
      const values = camera.resolutions.map((resolution) => resolution.w + "x" + resolution.h);
      els.resolutionSelect.value = values.includes(previous) ? previous : camera.defaultResolution;
    }

    function applyPreset(presetKey) {
      const camera = CAMERAS[presetKey] || CAMERAS.custom;
      state.preset = presetKey;
      els.presetCaption.textContent = camera.caption;
      els.sensorField.classList.toggle("locked", camera.sensorLocked);
      els.sensorSelect.disabled = camera.sensorLocked;
      els.focalInput.min = camera.focalMinMm;
      els.focalInput.max = camera.focalMaxMm;
      els.focalRange.min = camera.focalMinMm;
      els.focalRange.max = camera.focalMaxMm;
      els.focalMinTick.textContent = fmt(camera.focalMinMm, 1);
      els.focalMaxTick.textContent = fmt(camera.focalMaxMm, 1);
      if (camera.sensorLocked || !els.sensorSelect.value) {
        els.sensorSelect.value = camera.sensorId;
      }
      setFieldValue(els.focalInput, els.focalRange, clamp(Number(els.focalInput.value), camera.focalMinMm, camera.focalMaxMm) || camera.focalDefaultMm, 1);
      updateResolutionOptions(camera);
      if (presetKey !== "custom") {
        els.resolutionSelect.value = camera.defaultResolution;
        els.sensorSelect.value = camera.sensorId;
        setFieldValue(els.focalInput, els.focalRange, camera.focalDefaultMm, 1);
      }
      update();
    }

    function setSolveMode(mode) {
      state.solveMode = mode;
      document.querySelectorAll("[data-solve]").forEach((button) => {
        const selected = button.dataset.solve === mode;
        button.setAttribute("aria-pressed", String(selected));
      });
      els.heightField.classList.toggle("driven", mode === "height");
      els.distanceField.classList.toggle("driven", mode === "distance");
      els.heightInput.disabled = mode === "height";
      els.heightRange.disabled = mode === "height";
      els.distanceInput.disabled = mode === "distance";
      els.distanceRange.disabled = mode === "distance";

      if (mode === "distance") {
        const row = rowForHeight(Number(els.heightInput.value));
        setFieldValue(els.distanceInput, els.distanceRange, row.recommended_distance_m, 2);
      }
      if (mode === "height") {
        const row = rowForRecommendedDistance(Number(els.distanceInput.value));
        setFieldValue(els.heightInput, els.heightRange, row.camera_height_m, 1);
      }
      update();
    }

    function syncDistanceBounds(row, currentDistanceM) {
      const maxFromRule = Math.max(
        row.face_safe_acceptable_distance_max_m || 0,
        row.best_feet_distance_max_m || 0,
        row.recommended_distance_m || 0,
        currentDistanceM || 0
      );
      const maxDistance = Math.max(36, Math.ceil(maxFromRule + 2));
      els.distanceRange.max = String(maxDistance);
      els.distanceInput.max = String(maxDistance);
      els.distanceMaxTick.textContent = fmt(maxDistance, 2);
      setRangeFill(els.distanceRange);
    }

    function setHeight(value) {
      if (state.solveMode === "height") return;
      const heightM = setFieldValue(els.heightInput, els.heightRange, value, 1);
      if (state.solveMode === "distance") {
        const row = rowForHeight(heightM);
        setFieldValue(els.distanceInput, els.distanceRange, row.recommended_distance_m, 2);
      }
      update();
    }

    function setDistance(value) {
      if (state.solveMode === "distance") return;
      const distanceM = setFieldValue(els.distanceInput, els.distanceRange, value, 2);
      if (state.solveMode === "height") {
        const row = rowForRecommendedDistance(distanceM);
        setFieldValue(els.heightInput, els.heightRange, row.camera_height_m, 1);
      }
      update();
    }

    function setTilt(value) {
      state.tiltUserAdjusted = true;
      setFieldValue(els.tiltInput, els.tiltRange, value, 0);
      update();
    }

    function setSensor(value) {
      if (els.sensorSelect.disabled) return;
      els.sensorSelect.value = sensorById(value).id;
      update();
    }

    function setFocal(value) {
      setFieldValue(els.focalInput, els.focalRange, value, 1);
      update();
    }

    function statusLabelForFace(faceStatus) {
      if (faceStatus === "ideal_under_25") return "best";
      if (faceStatus === "acceptable_25_to_30") return "acceptable";
      return "out of range";
    }

    function statusClassForFace(faceStatus) {
      if (faceStatus === "ideal_under_25") return "best";
      if (faceStatus === "acceptable_25_to_30") return "acceptable";
      return "out_of_range";
    }

    function updateStatusElement(element, result) {
      element.textContent = result.label;
      element.className = "status-chip " + result.status;
    }

    function recommendationCopy(distanceM, recommendedM, overall) {
      const delta = recommendedM - distanceM;
      if (Math.abs(delta) < 0.01) {
        return overall.status === "best"
          ? "Already on the recommended distance from the lookup table."
          : "Distance matches the recommendation, but the face rule is limiting the overall status.";
      }
      const direction = delta > 0 ? "farther" : "closer";
      return "Move the subject " + Math.abs(delta).toFixed(2) + " m " + direction + ", to " + recommendedM.toFixed(2) + " m.";
    }

    function updateRangeBar(heightM, row, distanceM) {
      const window = feetDistanceWindow(heightM);
      const acceptableMin = window.acceptableMin;
      const acceptableMax = window.acceptableMax;
      const bestMin = window.bestMin;
      const bestMax = window.bestMax;
      const domainMin = Math.max(0, Math.min(acceptableMin, bestMin, distanceM, row.recommended_distance_m) - 1);
      const domainMax = Math.max(acceptableMax, bestMax, distanceM, row.recommended_distance_m) + 1;
      const setZone = (el, min, max) => {
        el.style.left = pct(min, domainMin, domainMax).toFixed(2) + "%";
        el.style.width = Math.max(0, pct(max, domainMin, domainMax) - pct(min, domainMin, domainMax)).toFixed(2) + "%";
      };
      const setMarker = (el, label, value) => {
        el.style.left = pct(value, domainMin, domainMax).toFixed(2) + "%";
        label.textContent = fmt(value, 2) + " m";
      };

      setZone(els.acceptableZone, acceptableMin, acceptableMax);
      setZone(els.bestZone, bestMin, bestMax);
      setMarker(els.minMarker, els.minMarkerLabel, acceptableMin);
      setMarker(els.bestMarker, els.bestMarkerLabel, row.recommended_distance_m);
      setMarker(els.maxMarker, els.maxMarkerLabel, acceptableMax);
      els.distanceCursor.style.left = pct(distanceM, domainMin, domainMax).toFixed(2) + "%";
      els.cursorLabel.textContent = fmt(distanceM, 2) + " m";
    }

    function updateMetrics(result, horizontalFov, verticalFov, fullWidthM, effectiveWidthM, horizontalPpm, verticalPpm) {
      els.faceTiltMetric.innerHTML = fmt(result.face.angle, 2) + "<small>deg</small>";
      els.groundAngleMetric.innerHTML = fmt(result.feet.angle, 2) + "<small>deg</small>";
      els.horizontalFovMetric.innerHTML = fmt(horizontalFov, 2) + "<small>deg</small>";
      els.verticalFovMetric.innerHTML = fmt(verticalFov, 2) + "<small>deg</small>";
      els.fullWidthMetric.innerHTML = fmt(fullWidthM, 1) + "<small>m</small>";
      els.effectiveWidthMetric.innerHTML = fmt(effectiveWidthM, 1) + "<small>m</small>";
      els.horizontalPpmMetric.innerHTML = fmt(horizontalPpm, 0) + "<small>px/m</small>";
      els.verticalPpmMetric.innerHTML = fmt(verticalPpm, 0) + "<small>px/m</small>";
    }

    function colorWithAlpha(color, alpha) {
      return color.replace(")", " / " + alpha + ")");
    }

    function canvasDpr() {
      return Math.min(2, window.devicePixelRatio || 1);
    }

    function fitCanvas(canvas) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      const scale = canvasDpr();
      canvas.width = Math.round(rect.width * scale);
      canvas.height = Math.round(rect.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      return { ctx, w: rect.width, h: rect.height };
    }

    function roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function drawPerson(ctx, x, groundY, yForHeight, color) {
      const headY = yForHeight(RULE.humanHeightM);
      const faceY = yForHeight(RULE.faceHeightM);
      const hipY = yForHeight(0.95);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(x, headY - 6, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, headY + 1);
      ctx.lineTo(x, hipY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, hipY);
      ctx.lineTo(x - 7, groundY);
      ctx.moveTo(x, hipY);
      ctx.lineTo(x + 7, groundY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, headY + 12);
      ctx.lineTo(x - 8, hipY - 8);
      ctx.moveTo(x, headY + 12);
      ctx.lineTo(x + 8, hipY - 8);
      ctx.stroke();
      ctx.fillStyle = COL.muted;
      ctx.font = "10px JetBrains Mono, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText("1.7 head", x + 12, headY - 6);
      ctx.fillText("1.5 face", x + 12, faceY);
      ctx.strokeStyle = COL.faint;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(x + 8, faceY);
      ctx.lineTo(x + 10, faceY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    function drawSide(heightM, distanceM, row, feet, face, verticalFov, tiltAngle) {
      const fit = fitCanvas(els.sideCanvas);
      if (!fit) return;
      const { ctx, w, h } = fit;
      ctx.clearRect(0, 0, w, h);
      const padL = 60;
      const padR = 70;
      const padB = 58;
      const padT = 40;
      const groundY = h - padB;
      const window = feetDistanceWindow(heightM);
      const acceptableMin = window.acceptableMin;
      const acceptableMax = window.acceptableMax;
      const maxX = Math.max(distanceM * 1.25, acceptableMax * 1.15, window.bestMax * 1.15, 6);
      const maxY = Math.max(heightM * 1.25, RULE.humanHeightM, 4);
      const sx = (w - padL - padR) / maxX;
      const sy = (groundY - padT) / maxY;
      const xFor = (meters) => padL + meters * sx;
      const yFor = (meters) => groundY - meters * sy;
      const camX = xFor(0);
      const camY = yFor(heightM);
      const subX = xFor(distanceM);
      const faceY = yFor(RULE.faceHeightM);
      const feetColor = feet.status === "best" ? COL.best : feet.status === "acceptable" ? COL.ok : COL.bad;
      const faceColor = face.status === "best" ? COL.best : face.status === "acceptable" ? COL.ok : COL.bad;

      ctx.strokeStyle = COL.grid;
      ctx.lineWidth = 1;
      ctx.font = "11px JetBrains Mono, monospace";
      ctx.fillStyle = COL.faint;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (let gx = 0; gx <= maxX; gx += 2) {
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.moveTo(xFor(gx), padT);
        ctx.lineTo(xFor(gx), groundY);
        ctx.stroke();
        ctx.globalAlpha = 1;
        if (gx > 0) ctx.fillText(gx + "m", xFor(gx), groundY + 8);
      }

      ctx.strokeStyle = COL.muted;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(padL, groundY);
      ctx.lineTo(w - padR + 10, groundY);
      ctx.stroke();

      ctx.strokeStyle = COL.faint;
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(camX, groundY);
      ctx.lineTo(camX, camY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.save();
      ctx.translate(camX - 12, (groundY + camY) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = COL.muted;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(fmt(heightM, 1, " m"), 0, 0);
      ctx.restore();

      const aimDown = toRad(clamp(tiltAngle, RULE.minTiltAngleDeg, RULE.maxTiltAngleDeg));
      const half = toRad(verticalFov / 2);
      const ray = (angle) => {
        const slope = Math.tan(angle);
        const candidates = [];
        const push = (x, y) => {
          if (Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= maxX && y >= 0 && y <= maxY) {
            candidates.push({ x, y });
          }
        };

        push(maxX, heightM - slope * maxX);
        if (slope > 0.0001) push(heightM / slope, 0);
        if (slope < -0.0001) push((heightM - maxY) / slope, maxY);

        const endpoint = candidates.sort((a, b) => a.x - b.x)[0] || {
          x: maxX,
          y: clamp(heightM - slope * maxX, 0, maxY)
        };
        return { x: xFor(endpoint.x), y: yFor(endpoint.y) };
      };
      const upper = ray(aimDown - half);
      const center = ray(aimDown);
      const lower = ray(aimDown + half);
      const aimHeightM = aimHeightAtDistance(heightM, distanceM, tiltAngle);
      const clampedAimHeightM = clamp(aimHeightM, 0, maxY);
      const aimSubjectY = yFor(clampedAimHeightM);
      const gradient = ctx.createLinearGradient(camX, camY, lower.x, lower.y);
      gradient.addColorStop(0, colorWithAlpha(COL.accent, "0.22"));
      gradient.addColorStop(1, colorWithAlpha(COL.accent, "0.02"));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(camX, camY);
      ctx.lineTo(upper.x, upper.y);
      ctx.lineTo(lower.x, lower.y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = colorWithAlpha(COL.accent, "0.50");
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(camX, camY);
      ctx.lineTo(upper.x, upper.y);
      ctx.moveTo(camX, camY);
      ctx.lineTo(lower.x, lower.y);
      ctx.stroke();

      ctx.strokeStyle = colorWithAlpha(COL.accent, "0.88");
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(camX, camY);
      ctx.lineTo(center.x, center.y);
      ctx.stroke();

      const bandSegment = (start, end, color, width) => {
        const x1 = xFor(Math.max(0, start));
        const x2 = xFor(Math.min(maxX, end));
        if (x2 <= x1) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = "round";
        ctx.globalAlpha = 0.92;
        ctx.beginPath();
        ctx.moveTo(x1, groundY);
        ctx.lineTo(x2, groundY);
        ctx.stroke();
        ctx.globalAlpha = 1;
      };
      bandSegment(acceptableMin, acceptableMax, colorWithAlpha(COL.ok, "0.55"), 5);
      bandSegment(window.bestMin, window.bestMax, COL.best, 6);

      ctx.strokeStyle = feetColor;
      ctx.lineWidth = 2.25;
      ctx.setLineDash([7, 4]);
      ctx.beginPath();
      ctx.moveTo(camX, camY);
      ctx.lineTo(subX, groundY);
      ctx.stroke();
      ctx.strokeStyle = faceColor;
      ctx.beginPath();
      ctx.moveTo(camX, camY);
      ctx.lineTo(subX, faceY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = "600 12px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const feetLabelX = camX + (subX - camX) * 0.34;
      const feetLabelY = camY + (groundY - camY) * 0.34;
      const faceLabelX = camX + (subX - camX) * 0.30;
      const faceLabelY = camY + (faceY - camY) * 0.30;
      ctx.fillStyle = feetColor;
      ctx.fillText(fmt(feet.angle, 1, " deg feet"), feetLabelX + 6, feetLabelY + 13);
      ctx.fillStyle = faceColor;
      ctx.fillText(fmt(face.angle, 1, " deg face"), faceLabelX + 6, faceLabelY - 11);

      drawPerson(ctx, subX, groundY, yFor, feetColor);

      const tiltLabelX = camX + (subX - camX) * 0.20;
      const tiltLabelY = camY + (aimSubjectY - camY) * 0.20;
      ctx.fillStyle = COL.accent;
      ctx.fillText(fmt(tiltAngle, 0, " deg tilt"), tiltLabelX + 6, tiltLabelY - 12);
      if (aimHeightM >= 0 && aimHeightM <= maxY) {
        ctx.strokeStyle = colorWithAlpha(COL.accent, "0.58");
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(subX - 10, aimSubjectY);
        ctx.lineTo(subX + 10, aimSubjectY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = COL.accent;
        ctx.beginPath();
        ctx.arc(subX, aimSubjectY, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillText(fmt(aimHeightM, 2, " m aim"), subX + 10, aimSubjectY - 8);
      }

      ctx.fillStyle = COL.accent;
      roundRect(ctx, camX - 12, camY - 7, 24, 14, 4);
      ctx.fill();
      ctx.fillStyle = COL.ink;
      ctx.beginPath();
      ctx.arc(camX + 5, camY, 3.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = COL.faint;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(camX, groundY + 30);
      ctx.lineTo(subX, groundY + 30);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COL.ink;
      ctx.font = "600 12px JetBrains Mono, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(fmt(distanceM, 2, " m"), (camX + subX) / 2, groundY + 34);

      ctx.fillStyle = COL.ink;
      ctx.font = "700 13px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("Camera", camX, Math.max(22, camY - 14));
      ctx.fillText("Human", subX, Math.max(22, yFor(RULE.humanHeightM) - 14));
    }

    function drawTop(distanceM, horizontalFov, fullWidthM, effectiveWidthM, feet) {
      const fit = fitCanvas(els.topCanvas);
      if (!fit) return;
      const { ctx, w, h } = fit;
      ctx.clearRect(0, 0, w, h);
      const camX = w / 2;
      const camY = 34;
      const padB = 50;
      const half = toRad(horizontalFov / 2);
      const reach = h - camY - padB;
      const maxSubjectPx = reach * 0.82;
      const fitSubjectPx = Math.tan(half) > 0 ? (w * 0.42) / Math.tan(half) : maxSubjectPx;
      const subjectPx = Math.max(100, Math.min(maxSubjectPx, fitSubjectPx));
      const subjectY = camY + subjectPx;
      const halfWidthPx = Math.tan(half) * subjectPx;
      const leftX = camX - halfWidthPx;
      const rightX = camX + halfWidthPx;
      const feetColor = feet.status === "best" ? COL.best : feet.status === "acceptable" ? COL.ok : COL.bad;
      const bottomY = h - padB;
      const bottomHalfWidth = Math.tan(half) * (bottomY - camY);
      const gradient = ctx.createLinearGradient(camX, camY, camX, bottomY);
      gradient.addColorStop(0, colorWithAlpha(feetColor, "0.30"));
      gradient.addColorStop(1, colorWithAlpha(feetColor, "0.04"));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(camX, camY);
      ctx.lineTo(camX - bottomHalfWidth, bottomY);
      ctx.lineTo(camX + bottomHalfWidth, bottomY);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = feetColor;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.82;
      ctx.beginPath();
      ctx.moveTo(camX, camY);
      ctx.lineTo(camX - bottomHalfWidth, bottomY);
      ctx.moveTo(camX, camY);
      ctx.lineTo(camX + bottomHalfWidth, bottomY);
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.strokeStyle = COL.faint;
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(camX, camY);
      ctx.lineTo(camX, bottomY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = COL.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(leftX, subjectY);
      ctx.lineTo(rightX, subjectY);
      ctx.stroke();
      const effLeft = camX - (camX - leftX) * 0.8;
      const effRight = camX + (rightX - camX) * 0.8;
      ctx.strokeStyle = COL.best;
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(effLeft, subjectY);
      ctx.lineTo(effRight, subjectY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = COL.ink;
      ctx.beginPath();
      ctx.arc(camX, subjectY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COL.accent;
      roundRect(ctx, camX - 13, camY - 8, 26, 14, 4);
      ctx.fill();
      ctx.fillStyle = COL.muted;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.font = "10px JetBrains Mono, monospace";
      ctx.fillText("camera", camX, camY - 12);

      ctx.fillStyle = COL.ink;
      ctx.font = "700 12px JetBrains Mono, monospace";
      ctx.textBaseline = "top";
      ctx.fillText(fmt(fullWidthM, 1, " m"), camX, subjectY + 8);
      ctx.fillStyle = COL.best;
      ctx.fillText(fmt(effectiveWidthM, 1, " m") + " (80%)", camX, subjectY + 25);

      ctx.fillStyle = COL.muted;
      ctx.font = "600 11px Inter, sans-serif";
      ctx.fillText("subject plane", camX, Math.min(bottomY - 18, subjectY + 47));
    }

    function renderTable(selectedHeightM) {
      if (!state.tableRendered) {
        els.lookupBody.innerHTML = LOOKUP_ROWS.map((row) => {
          const heightKey = row.camera_height_m.toFixed(1);
          const faceClass = statusClassForFace(row.face_status);
          return "<tr data-height=\\"" + heightKey + "\\">" +
            "<td>" + fmt(row.camera_height_m, 1, " m") + "</td>" +
            "<td>" + fmt(row.recommended_distance_m, 2, " m") + "</td>" +
            "<td>" + fmt(row.recommended_feet_angle_deg, 2, " deg") + "</td>" +
            "<td>" + fmt(row.recommended_face_angle_deg, 2, " deg") + "</td>" +
            "<td><span class=\\"table-pill best\\">" + row.recommendation_tier.replaceAll("_", " ") + "</span></td>" +
            "<td><span class=\\"table-pill " + faceClass + "\\">" + statusLabelForFace(row.face_status) + "</span></td>" +
            "<td>" + fmt(row.best_feet_distance_min_m, 2, " m") + "</td>" +
            "<td>" + fmt(row.best_feet_distance_max_m, 2, " m") + "</td>" +
            "<td>" + fmt(row.face_safe_acceptable_distance_min_m, 2, " m") + "</td>" +
            "<td>" + fmt(row.face_safe_acceptable_distance_max_m, 2, " m") + "</td>" +
            "</tr>";
        }).join("");
        state.tableRendered = true;
      }

      const selectedKey = selectedHeightM.toFixed(1);
      if (state.tableSelectedHeightKey === selectedKey) return;
      const previous = els.lookupBody.querySelector("tr.is-selected");
      if (previous) previous.classList.remove("is-selected");
      const selected = els.lookupBody.querySelector("tr[data-height=\\"" + selectedKey + "\\"]");
      if (selected) selected.classList.add("is-selected");
      state.tableSelectedHeightKey = selectedKey;
    }

    function queuePlacementAnnouncement(result, distanceM) {
      const text = "Placement is " + result.overall.label.toLowerCase() + ". Feet " + result.feet.label + ". Face " + result.face.label + ". Distance " + fmt(distanceM, 2, " meters") + ".";
      window.clearTimeout(state.announceTimer);
      state.announceTimer = window.setTimeout(() => {
        els.placementAnnouncement.textContent = text;
      }, 240);
    }

    function update() {
      const heightM = Number(els.heightInput.value);
      const distanceM = Number(els.distanceInput.value);
      const tiltAngle = Number(els.tiltInput.value);
      const sensor = selectedSensor();
      const sensorWidth = sensor.widthMm;
      const focalLength = Number(els.focalInput.value);
      if (![heightM, distanceM, tiltAngle, sensorWidth, focalLength].every(Number.isFinite)) return;

      const row = rowForHeight(heightM);
      syncDistanceBounds(row, distanceM);
      syncDefaultTilt(heightM, distanceM);
      const syncedTiltAngle = Number(els.tiltInput.value);
      [els.heightRange, els.distanceRange, els.tiltRange, els.focalRange].forEach(setRangeFill);

      const result = classify(heightM, distanceM);
      const resolution = selectedResolution();
      const verticalFov = verticalFovDeg(sensorWidth, focalLength, resolution);
      const horizontalFov = horizontalFovDeg(sensorWidth, focalLength);
      const visibleVerticalSpanM = Math.max(0.001, 2 * distanceM * Math.tan(toRad(verticalFov / 2)));
      const fullWidthM = Math.max(0.001, 2 * distanceM * Math.tan(toRad(horizontalFov / 2)));
      const effectiveWidthM = fullWidthM * 0.8;
      const verticalPpm = resolution.h / visibleVerticalSpanM;
      const horizontalPpm = resolution.w / fullWidthM;
      const copy = recommendationCopy(distanceM, row.recommended_distance_m, result.overall);
      const canSnap = Math.abs(row.recommended_distance_m - distanceM) >= 0.01 && state.solveMode !== "distance";

      els.verdict.dataset.state = result.overall.status;
      els.overallLabel.textContent = "Placement verdict";
      els.verdictHeadline.textContent = "Placement is " + result.overall.label.toLowerCase();
      els.verdictSub.textContent = copy;
      els.recommendedDistance.textContent = fmt(row.recommended_distance_m, 2, " m");
      els.snapButton.disabled = !canSnap;
      updateStatusElement(els.feetStatus, result.feet);
      updateStatusElement(els.faceStatus, result.face);
      els.feetAngle.innerHTML = fmt(result.feet.angle, 2) + "<small>deg</small>";
      els.faceAngle.innerHTML = fmt(result.face.angle, 2) + "<small>deg</small>";
      els.stageBadge.textContent = row.priority_mode === "strict_best" ? "strict best row" : "feet-priority row";
      els.topStageBadge.textContent = "H-FOV " + fmt(horizontalFov, 1, " deg");
      els.sideFeetReading.textContent = "Feet: " + result.feet.label + ", " + fmt(result.feet.angle, 1, " deg");
      els.sideFaceReading.textContent = "Face: " + result.face.label + ", " + fmt(result.face.angle, 1, " deg");
      const aimHeightM = aimHeightAtDistance(heightM, distanceM, syncedTiltAngle);
      const aimCopy = aimHeightM < 0
        ? "below ground"
        : aimHeightM > heightM
          ? "above camera"
          : fmt(aimHeightM, 2, " m");
      els.sideTiltReading.textContent = "Tilt: " + fmt(syncedTiltAngle, 0, " deg") + " to " + aimCopy + " / FOV " + fmt(verticalFov, 1, " deg");
      els.sideFeetReading.className = "reading-chip " + result.feet.status;
      els.sideFaceReading.className = "reading-chip " + result.face.status;
      els.sideTiltReading.className = "reading-chip";

      updateRangeBar(heightM, row, distanceM);
      updateMetrics(result, horizontalFov, verticalFov, fullWidthM, effectiveWidthM, horizontalPpm, verticalPpm);
      els.sideCanvas.setAttribute("aria-label", "Side elevation. Camera height " + fmt(heightM, 1, " meters") + ", subject distance " + fmt(distanceM, 2, " meters") + ". Tilt " + fmt(syncedTiltAngle, 0, " degrees") + " aiming at " + aimCopy + ". Feet angle " + fmt(result.feet.angle, 1, " degrees") + ", " + result.feet.label + ". Face angle " + fmt(result.face.angle, 1, " degrees") + ", " + result.face.label + ".");
      els.topCanvas.setAttribute("aria-label", "Top-down coverage. Horizontal field of view " + fmt(horizontalFov, 1, " degrees") + ". Full width " + fmt(fullWidthM, 1, " meters") + ", effective width " + fmt(effectiveWidthM, 1, " meters") + ".");
      drawSide(heightM, distanceM, row, result.feet, result.face, verticalFov, syncedTiltAngle);
      drawTop(distanceM, horizontalFov, fullWidthM, effectiveWidthM, result.feet);
      if (state.tableRendered) renderTable(row.camera_height_m);

      els.mobileAnswer.dataset.state = result.overall.status;
      els.mobileAnswerOverall.textContent = result.overall.label;
      els.mobileAnswerFeet.textContent = result.feet.label;
      els.mobileAnswerFeet.className = result.feet.status;
      els.mobileAnswerFace.textContent = result.face.label;
      els.mobileAnswerFace.className = result.face.status;
      els.mobileAnswerDistance.textContent = fmt(distanceM, 2, " m");
      els.statusbar.dataset.state = result.overall.status;
      els.sbOverall.textContent = result.overall.label;
      els.sbFeet.textContent = result.feet.label;
      els.sbFeet.className = result.feet.status;
      els.sbFace.textContent = result.face.label;
      els.sbFace.className = result.face.status;
      els.sbDistance.textContent = fmt(distanceM, 2, " m");
      queuePlacementAnnouncement(result, distanceM);
    }

    function setTab(tab) {
      const isTable = tab === "table";
      els.visualizerView.hidden = isTable;
      els.tableView.hidden = !isTable;
      els.visualizerTab.setAttribute("aria-selected", String(!isTable));
      els.tableTab.setAttribute("aria-selected", String(isTable));
      els.visualizerTab.tabIndex = isTable ? -1 : 0;
      els.tableTab.tabIndex = isTable ? 0 : -1;
      if (isTable) {
        renderTable(rowForHeight(Number(els.heightInput.value)).camera_height_m);
      } else {
        requestAnimationFrame(update);
      }
    }

    function onTabKey(event) {
      const tabs = [els.visualizerTab, els.tableTab];
      const current = tabs.indexOf(document.activeElement);
      if (current < 0) return;
      let next = current;
      if (event.key === "ArrowRight") next = (current + 1) % tabs.length;
      if (event.key === "ArrowLeft") next = (current - 1 + tabs.length) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      if (next !== current) {
        event.preventDefault();
        tabs[next].focus();
        setTab(tabs[next].dataset.tab);
      }
    }

    function showPriorityTip() {
      const rect = els.priorityInfo.getBoundingClientRect();
      const left = Math.min(window.innerWidth - 296, Math.max(16, rect.left));
      const top = Math.min(window.innerHeight - 140, rect.bottom + 8);
      els.priorityTip.style.left = left + "px";
      els.priorityTip.style.top = top + "px";
      els.priorityTip.classList.add("show");
      els.priorityInfo.setAttribute("aria-expanded", "true");
    }

    function hidePriorityTip() {
      els.priorityTip.classList.remove("show");
      els.priorityInfo.setAttribute("aria-expanded", "false");
    }

    els.viewTabs.addEventListener("click", (event) => {
      const button = event.target.closest("[data-tab]");
      if (button) setTab(button.dataset.tab);
    });
    els.viewTabs.addEventListener("keydown", onTabKey);

    document.querySelectorAll("[data-solve]").forEach((button) => {
      button.addEventListener("click", () => setSolveMode(button.dataset.solve));
    });

    els.presetSelect.addEventListener("change", (event) => applyPreset(event.target.value));
    els.heightRange.addEventListener("input", (event) => setHeight(event.target.value));
    els.heightInput.addEventListener("input", (event) => setHeight(event.target.value));
    els.heightInput.addEventListener("change", (event) => setHeight(event.target.value));
    els.distanceRange.addEventListener("input", (event) => setDistance(event.target.value));
    els.distanceInput.addEventListener("input", (event) => setDistance(event.target.value));
    els.distanceInput.addEventListener("change", (event) => setDistance(event.target.value));
    els.tiltRange.addEventListener("input", (event) => setTilt(event.target.value));
    els.tiltInput.addEventListener("input", (event) => setTilt(event.target.value));
    els.tiltInput.addEventListener("change", (event) => setTilt(event.target.value));
    els.sensorSelect.addEventListener("change", (event) => setSensor(event.target.value));
    els.focalRange.addEventListener("input", (event) => setFocal(event.target.value));
    els.focalInput.addEventListener("input", (event) => setFocal(event.target.value));
    els.focalInput.addEventListener("change", (event) => setFocal(event.target.value));
    els.resolutionSelect.addEventListener("change", update);

    els.snapButton.addEventListener("click", () => {
      const row = rowForHeight(Number(els.heightInput.value));
      setDistance(row.recommended_distance_m);
    });

    els.jumpToDiagram.addEventListener("click", () => {
      document.querySelector(".stage").scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    });

    els.priorityInfo.addEventListener("mouseenter", showPriorityTip);
    els.priorityInfo.addEventListener("focus", showPriorityTip);
    els.priorityInfo.addEventListener("click", (event) => {
      event.stopPropagation();
      els.priorityTip.classList.contains("show") ? hidePriorityTip() : showPriorityTip();
    });
    els.priorityInfo.addEventListener("mouseleave", hidePriorityTip);
    document.addEventListener("click", hidePriorityTip);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hidePriorityTip();
    });

    populateSensorOptions();
    els.sensorSelect.value = CAMERAS.custom.sensorId;
    updateResolutionOptions(CAMERAS.custom);
    setFieldValue(els.distanceInput, els.distanceRange, ${fmt(initialRow.recommended_distance_m, 2)}, 2);
    setFieldValue(els.tiltInput, els.tiltRange, ${initialTiltAngleDeg}, 0);
    [els.heightRange, els.distanceRange, els.tiltRange, els.focalRange].forEach(setRangeFill);
    update();
  </script>
</body>
</html>
`;
}

const rows = buildRows();
const publicDir = path.join(__dirname, "public");

await fs.mkdir(publicDir, { recursive: true });
await fs.writeFile(path.join(publicDir, "index.html"), buildHtml(rows), "utf8");

console.log(`Generated ${rows.length} rows.`);
console.log(path.join(publicDir, "index.html"));
