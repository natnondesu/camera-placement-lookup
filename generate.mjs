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

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function angleDeg(verticalDeltaM, distanceM) {
  return Math.atan(Math.abs(verticalDeltaM) / distanceM) * 180 / Math.PI;
}

function distanceForFeetAngle(cameraHeightM, angleDegValue) {
  return cameraHeightM / Math.tan(toRad(angleDegValue));
}

function minDistanceForFaceAngle(cameraHeightM, maxFaceAngleDeg) {
  const faceDeltaM = Math.abs(cameraHeightM - RULE.faceHeightM);
  if (faceDeltaM === 0) return 0;
  return faceDeltaM / Math.tan(toRad(maxFaceAngleDeg));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
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

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function buildRows() {
  return cameraHeightValues().map(lookupRow);
}

function buildCsv(rows) {
  const headers = [
    "camera_height_m",
    "face_height_m",
    "human_height_m",
    "recommended_distance_m",
    "recommendation_tier",
    "priority_mode",
    "recommended_feet_angle_deg",
    "recommended_face_angle_deg",
    "face_status",
    "best_feet_distance_min_m",
    "best_feet_distance_max_m",
    "face_safe_acceptable_distance_min_m",
    "face_safe_acceptable_distance_max_m",
    "note",
  ];

  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => {
      const value = row[header];
      if (typeof value === "number") {
        const decimals = header.endsWith("_deg") || header.endsWith("_m") ? 2 : 3;
        return csvEscape(fmt(value, decimals));
      }
      return csvEscape(value);
    }).join(",")),
  ];

  return `${lines.join("\n")}\n`;
}

function buildHtml(csvText) {
  const csvJson = JSON.stringify(csvText);
  const ruleJson = JSON.stringify(RULE, null, 2);
  const initialRow = lookupRow(RULE.minCameraHeightM);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Camera Placement Lookup</title>
  <style>
    :root {
      --bg: oklch(1 0 0);
      --surface: oklch(0.974 0.008 200);
      --panel: oklch(0.992 0.004 200);
      --ink: oklch(0.19 0.018 220);
      --muted: oklch(0.45 0.022 220);
      --line: oklch(0.84 0.018 210);
      --primary: oklch(0.58 0.12 200);
      --primary-strong: oklch(0.46 0.13 200);
      --accent: oklch(0.62 0.15 45);
      --success-bg: oklch(0.94 0.055 150);
      --success-fg: oklch(0.32 0.08 150);
      --warn-bg: oklch(0.94 0.062 75);
      --warn-fg: oklch(0.38 0.08 65);
      --danger-bg: oklch(0.94 0.055 20);
      --danger-fg: oklch(0.4 0.11 20);
      --focus: oklch(0.7 0.13 200);
      color-scheme: light;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 16px;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
    }

    button,
    input {
      font: inherit;
    }

    button:focus-visible,
    input:focus-visible {
      outline: 3px solid var(--focus);
      outline-offset: 2px;
    }

    .shell {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    header {
      border-bottom: 1px solid var(--line);
      background: var(--panel);
    }

    .topbar {
      width: min(1440px, 100%);
      margin: 0 auto;
      padding: 18px 24px;
      display: flex;
      justify-content: space-between;
      gap: 20px;
      align-items: center;
    }

    h1 {
      margin: 0;
      font-size: 1.375rem;
      line-height: 1.2;
      letter-spacing: 0;
    }

    .assumptions {
      margin: 4px 0 0;
      color: var(--muted);
      font-size: 0.875rem;
      line-height: 1.45;
    }

    .actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .button {
      border: 1px solid var(--primary-strong);
      background: var(--primary-strong);
      color: white;
      border-radius: 8px;
      min-height: 38px;
      padding: 8px 13px;
      cursor: pointer;
      transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
      white-space: nowrap;
    }

    .button:hover {
      background: var(--primary);
      border-color: var(--primary);
    }

    .button:active {
      transform: translateY(1px);
    }

    .button.secondary {
      background: var(--bg);
      color: var(--ink);
      border-color: var(--line);
    }

    .button.secondary:hover {
      border-color: var(--primary);
      background: var(--surface);
    }

    main {
      width: min(1440px, 100%);
      margin: 0 auto;
      padding: 22px 24px 32px;
      display: grid;
      grid-template-columns: minmax(280px, 360px) minmax(420px, 1fr);
      gap: 18px;
      flex: 1;
    }

    .panel {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      overflow: hidden;
    }

    .panel-inner {
      padding: 18px;
    }

    .panel-title {
      margin: 0 0 14px;
      font-size: 1rem;
      line-height: 1.3;
    }

    .controls {
      display: grid;
      gap: 17px;
    }

    .field {
      display: grid;
      gap: 8px;
    }

    label {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      color: var(--muted);
      font-size: 0.875rem;
      line-height: 1.35;
    }

    .value {
      color: var(--ink);
      font-variant-numeric: tabular-nums;
    }

    input[type="range"] {
      width: 100%;
      accent-color: var(--primary-strong);
    }

    input[type="number"] {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px 12px;
      color: var(--ink);
      background: var(--bg);
    }

    .rule-list {
      margin: 18px 0 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 8px;
      color: var(--muted);
      font-size: 0.875rem;
      line-height: 1.45;
    }

    .rule-list strong {
      color: var(--ink);
      font-weight: 650;
    }

    .workspace {
      display: grid;
      grid-template-rows: auto minmax(360px, 1fr);
      gap: 18px;
      min-width: 0;
    }

    .summary {
      display: grid;
      grid-template-columns: minmax(260px, 0.85fr) minmax(320px, 1.15fr);
      gap: 18px;
    }

    .status-pair {
      display: flex;
      flex-wrap: wrap;
      gap: 12px 16px;
      align-items: flex-start;
    }

    .status-group {
      display: grid;
      gap: 6px;
      min-width: 120px;
    }

    .status-group.feet-priority {
      min-width: 150px;
    }

    .status-label {
      color: var(--muted);
      font-size: 0.8125rem;
      font-weight: 650;
      line-height: 1.25;
    }

    .feet-priority .status-label {
      color: var(--primary-strong);
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .feet-priority .status-label::after {
      content: "Priority";
      border: 1px solid var(--primary);
      border-radius: 999px;
      padding: 2px 7px;
      color: var(--primary-strong);
      background: var(--surface);
      font-size: 0.6875rem;
      font-weight: 700;
      line-height: 1.2;
    }

    .status {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 30px;
      padding: 5px 10px;
      border-radius: 999px;
      font-size: 0.875rem;
      font-weight: 650;
      width: fit-content;
      min-width: 104px;
    }

    .feet-priority .status {
      min-height: 38px;
      min-width: 132px;
      border: 2px solid currentColor;
      padding: 7px 13px;
      font-size: 0.9375rem;
      transition: background 160ms ease, box-shadow 160ms ease, color 160ms ease;
    }

    .status.best {
      background: var(--success-bg);
      color: var(--success-fg);
    }

    .feet-priority .status.best {
      box-shadow: 0 0 0 3px oklch(0.88 0.052 150);
    }

    .status.acceptable {
      background: var(--warn-bg);
      color: var(--warn-fg);
    }

    .feet-priority .status.acceptable {
      box-shadow: 0 0 0 3px oklch(0.88 0.058 75);
    }

    .status.out,
    .status.out_of_range {
      background: var(--danger-bg);
      color: var(--danger-fg);
    }

    .feet-priority .status.out,
    .feet-priority .status.out_of_range {
      box-shadow: 0 0 0 3px oklch(0.88 0.052 20);
    }

    .metric-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin-top: 16px;
    }

    .metric {
      border-top: 1px solid var(--line);
      padding-top: 10px;
      min-width: 0;
    }

    .metric-label {
      margin: 0 0 4px;
      color: var(--muted);
      font-size: 0.8125rem;
      line-height: 1.35;
    }

    .metric-value {
      margin: 0;
      font-size: 1.2rem;
      font-weight: 700;
      line-height: 1.25;
      font-variant-numeric: tabular-nums;
      overflow-wrap: anywhere;
    }

    .lookup-row {
      display: grid;
      gap: 8px;
      margin-top: 16px;
      color: var(--muted);
      font-size: 0.875rem;
      line-height: 1.45;
    }

    .lookup-row strong {
      color: var(--ink);
    }

    .diagram-card {
      min-height: 380px;
      display: grid;
      grid-template-rows: auto minmax(330px, 1fr);
    }

    .diagram-head {
      border-bottom: 1px solid var(--line);
      padding: 14px 16px 11px;
      display: flex;
      justify-content: space-between;
      gap: 14px;
      align-items: center;
    }

    .diagram-head h2 {
      margin: 0;
      font-size: 1rem;
      line-height: 1.3;
    }

    .diagram-legend {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px 12px;
      color: var(--muted);
      font-size: 0.75rem;
      line-height: 1.25;
    }

    .diagram-key {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
    }

    .legend-line {
      width: 22px;
      height: 0;
      border-top: 3px solid var(--primary-strong);
      border-radius: 999px;
    }

    .legend-line.face {
      border-top-color: var(--accent);
      border-top-style: dashed;
    }

    .legend-line.reference {
      border-top-width: 2px;
      border-top-color: var(--line);
      border-top-style: dashed;
    }

    .diagram-stage {
      min-height: 330px;
      display: grid;
    }

    .diagram-stage svg {
      width: 100%;
      height: 100%;
      min-height: 330px;
      display: block;
      background: linear-gradient(180deg, var(--panel), var(--surface));
    }

    .svg-label {
      fill: var(--ink);
      font-size: 13px;
      font-weight: 650;
    }

    .svg-muted {
      fill: var(--muted);
      font-size: 12px;
    }

    .svg-small {
      fill: var(--muted);
      font-size: 11px;
      font-weight: 650;
    }

    .svg-value {
      fill: var(--ink);
      font-size: 12px;
      font-weight: 700;
    }

    .svg-foot-ray {
      stroke: var(--primary-strong);
      stroke-width: 3;
      stroke-linecap: round;
      fill: none;
    }

    .svg-face-ray {
      stroke: var(--accent);
      stroke-width: 3;
      stroke-linecap: round;
      stroke-dasharray: 8 8;
      fill: none;
    }

    .svg-reference {
      stroke: var(--line);
      stroke-width: 1.5;
      stroke-dasharray: 5 6;
      fill: none;
    }

    .svg-measure {
      stroke: var(--muted);
      stroke-width: 1.5;
      stroke-dasharray: 4 5;
      fill: none;
    }

    .svg-callout {
      fill: var(--panel);
      stroke: var(--line);
      stroke-width: 1;
    }

    .svg-status-bg.best {
      fill: var(--success-bg);
    }

    .svg-status-bg.acceptable {
      fill: var(--warn-bg);
    }

    .svg-status-bg.out_of_range {
      fill: var(--danger-bg);
    }

    .svg-status-text.best {
      fill: var(--success-fg);
    }

    .svg-status-text.acceptable {
      fill: var(--warn-fg);
    }

    .svg-status-text.out_of_range {
      fill: var(--danger-fg);
    }

    .table-panel {
      min-width: 0;
    }

    .table-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding: 14px 18px;
      border-bottom: 1px solid var(--line);
    }

    .table-head h2 {
      margin: 0;
      font-size: 1rem;
      line-height: 1.3;
    }

    .table-meta {
      color: var(--muted);
      font-size: 0.875rem;
      font-variant-numeric: tabular-nums;
    }

    .table-scroll {
      overflow: auto;
      max-height: 500px;
    }

    table {
      border-collapse: collapse;
      width: 100%;
      min-width: 1120px;
      font-size: 0.875rem;
    }

    th,
    td {
      border-bottom: 1px solid var(--line);
      padding: 9px 10px;
      text-align: right;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }

    th {
      position: sticky;
      top: 0;
      z-index: 1;
      background: var(--surface);
      color: var(--muted);
      font-size: 0.75rem;
      font-weight: 700;
      text-align: right;
    }

    td:first-child,
    th:first-child,
    td:nth-child(5),
    th:nth-child(5),
    td:nth-child(6),
    th:nth-child(6) {
      text-align: left;
    }

    tr.is-selected td {
      background: oklch(0.94 0.035 200);
    }

    .table-pill {
      display: inline-flex;
      border-radius: 999px;
      padding: 3px 8px;
      font-size: 0.75rem;
      font-weight: 700;
      min-width: 88px;
      justify-content: center;
    }

    .table-pill.best {
      color: var(--success-fg);
      background: var(--success-bg);
    }

    .table-pill.acceptable {
      color: var(--warn-fg);
      background: var(--warn-bg);
    }

    .table-pill.out_of_range {
      color: var(--danger-fg);
      background: var(--danger-bg);
    }

    @media (max-width: 1060px) {
      main,
      .summary {
        grid-template-columns: 1fr;
      }

      .topbar {
        align-items: flex-start;
        flex-direction: column;
      }

      .actions {
        justify-content: flex-start;
      }
    }

    @media (max-width: 640px) {
      .topbar,
      main {
        padding-left: 14px;
        padding-right: 14px;
      }

      .panel-inner {
        padding: 14px;
      }

      .metric-grid {
        grid-template-columns: 1fr;
      }

      .table-head {
        align-items: flex-start;
        flex-direction: column;
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
  <div class="shell">
    <header>
      <div class="topbar">
        <div>
          <h1>Camera Placement Lookup</h1>
          <p class="assumptions">Human height 1.7 m. Face point 1.5 m from ground. Distance is horizontal camera-to-subject distance.</p>
        </div>
        <div class="actions">
          <button class="button secondary" type="button" id="copyRuleButton">Copy rule JSON</button>
          <button class="button" type="button" id="downloadCsvButton">Download CSV</button>
        </div>
      </div>
    </header>

    <main>
      <section class="panel" aria-label="Camera controls">
        <div class="panel-inner">
          <h2 class="panel-title">Inputs</h2>
          <div class="controls">
            <div class="field">
              <label for="heightInput">
                <span>Camera height</span>
                <span class="value" id="heightLabel">${RULE.minCameraHeightM.toFixed(1)} m</span>
              </label>
              <input id="heightRange" type="range" min="${RULE.minCameraHeightM}" max="${RULE.maxCameraHeightM}" step="${RULE.cameraHeightStepM}" value="${RULE.minCameraHeightM}">
              <input id="heightInput" type="number" min="${RULE.minCameraHeightM}" max="${RULE.maxCameraHeightM}" step="${RULE.cameraHeightStepM}" value="${RULE.minCameraHeightM}">
            </div>
            <div class="field">
              <label for="distanceInput">
                <span>Distance</span>
                <span class="value" id="distanceLabel">${fmt(initialRow.recommended_distance_m, 2)} m</span>
              </label>
              <input id="distanceRange" type="range" min="0.3" max="36" step="0.01" value="${fmt(initialRow.recommended_distance_m, 2)}">
              <input id="distanceInput" type="number" min="0.3" max="36" step="0.01" value="${fmt(initialRow.recommended_distance_m, 2)}">
            </div>
            <button class="button secondary" type="button" id="snapButton">Use recommended distance</button>
          </div>

          <ul class="rule-list">
            <li><strong>Best:</strong> feet angle 36-39 deg. If face &lt;25 deg conflicts, use a fixed 38 deg feet angle.</li>
            <li><strong>Face status:</strong> below 25 deg is best, 25-30 deg is acceptable, above 30 deg is out of range.</li>
            <li><strong>Acceptable feet:</strong> feet angle 32-45 deg.</li>
          </ul>
        </div>
      </section>

      <div class="workspace">
        <section class="summary" aria-label="Live result">
          <div class="panel">
            <div class="panel-inner">
              <h2 class="panel-title">Live classification</h2>
              <div class="status-pair" aria-label="Feet and face status">
                <div class="status-group feet-priority" aria-label="Feet status, priority rule">
                  <span class="status-label">Feet</span>
                  <span class="status best" id="feetStatusPill">Best</span>
                </div>
                <div class="status-group">
                  <span class="status-label">Face</span>
                  <span class="status best" id="faceStatusPill">Best</span>
                </div>
              </div>
              <div class="metric-grid">
                <div class="metric">
                  <p class="metric-label">Feet angle</p>
                  <p class="metric-value" id="feetAngleValue">${fmt(initialRow.recommended_feet_angle_deg, 2)} deg</p>
                </div>
                <div class="metric">
                  <p class="metric-label">Face angle</p>
                  <p class="metric-value" id="faceAngleValue">${fmt(initialRow.recommended_face_angle_deg, 2)} deg</p>
                </div>
                <div class="metric">
                  <p class="metric-label">Recommended distance</p>
                  <p class="metric-value" id="recommendedValue">${fmt(initialRow.recommended_distance_m, 2)} m</p>
                </div>
                <div class="metric">
                  <p class="metric-label">Distance works?</p>
                  <p class="metric-value" id="tierValue">best</p>
                </div>
              </div>
              <div class="lookup-row" id="lookupDetails"></div>
            </div>
          </div>

          <div class="panel diagram-card">
            <div class="diagram-head">
              <h2>Geometry preview</h2>
              <div class="diagram-legend" aria-label="Diagram legend">
                <span class="diagram-key"><span class="legend-line"></span>Feet ray</span>
                <span class="diagram-key"><span class="legend-line face"></span>Face ray</span>
                <span class="diagram-key"><span class="legend-line reference"></span>Reference</span>
              </div>
            </div>
            <div class="diagram-stage">
              <svg id="diagram" role="img" aria-label="Side-view camera geometry" viewBox="0 0 720 360"></svg>
            </div>
          </div>
        </section>

        <section class="panel table-panel" aria-label="Lookup table">
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
        </section>
      </div>
    </main>
  </div>

  <script>
    const RULE = ${ruleJson};
    const CSV_TEXT = ${csvJson};
    const EPSILON = 1e-9;

    const els = {
      heightRange: document.getElementById("heightRange"),
      heightInput: document.getElementById("heightInput"),
      heightLabel: document.getElementById("heightLabel"),
      distanceRange: document.getElementById("distanceRange"),
      distanceInput: document.getElementById("distanceInput"),
      distanceLabel: document.getElementById("distanceLabel"),
      feetStatusPill: document.getElementById("feetStatusPill"),
      faceStatusPill: document.getElementById("faceStatusPill"),
      feetAngleValue: document.getElementById("feetAngleValue"),
      faceAngleValue: document.getElementById("faceAngleValue"),
      recommendedValue: document.getElementById("recommendedValue"),
      tierValue: document.getElementById("tierValue"),
      lookupDetails: document.getElementById("lookupDetails"),
      lookupBody: document.getElementById("lookupBody"),
      diagram: document.getElementById("diagram"),
      snapButton: document.getElementById("snapButton"),
      downloadCsvButton: document.getElementById("downloadCsvButton"),
      copyRuleButton: document.getElementById("copyRuleButton"),
    };

    function toRad(deg) {
      return deg * Math.PI / 180;
    }

    function angleDeg(verticalDeltaM, distanceM) {
      return Math.atan(Math.abs(verticalDeltaM) / distanceM) * 180 / Math.PI;
    }

    function distanceForFeetAngle(cameraHeightM, angleDegValue) {
      return cameraHeightM / Math.tan(toRad(angleDegValue));
    }

    function minDistanceForFaceAngle(cameraHeightM, maxFaceAngleDeg) {
      const faceDeltaM = Math.abs(cameraHeightM - RULE.faceHeightM);
      if (faceDeltaM === 0) return 0;
      return faceDeltaM / Math.tan(toRad(maxFaceAngleDeg));
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

      if (hasStrictBest) {
        const idealDistanceM = distanceForFeetAngle(cameraHeightM, RULE.idealFeetAngleDeg);
        rawRecommendedDistanceM = idealDistanceM >= strictBestDistanceMinM && idealDistanceM <= strictBestDistanceMaxM
          ? idealDistanceM
          : (strictBestDistanceMinM + strictBestDistanceMaxM) / 2;
      } else {
        rawRecommendedDistanceM = distanceForFeetAngle(cameraHeightM, RULE.priorityFeetAngleDeg);
        priorityMode = "feet_priority_38deg";
      }

      const recommendedDistanceM = Number(rawRecommendedDistanceM.toFixed(2));
      const recommendedFeetAngleDeg = angleDeg(cameraHeightM, recommendedDistanceM);
      const recommendedFaceAngleDeg = angleDeg(cameraHeightM - RULE.faceHeightM, recommendedDistanceM);
      const faceStatus = recommendedFaceAngleDeg < RULE.bestFaceAngleMaxDeg
        ? "ideal_under_25"
        : recommendedFaceAngleDeg <= RULE.acceptableFaceAngleMaxDeg
          ? "acceptable_25_to_30"
          : "out_over_30";

      return {
        cameraHeightM,
        recommendedDistanceM,
        recommendationTier,
        priorityMode,
        recommendedFeetAngleDeg,
        recommendedFaceAngleDeg,
        faceStatus,
        bestDistanceMinM: bestFeetMinDistanceM,
        bestDistanceMaxM: bestFeetMaxDistanceM,
        acceptableDistanceMinM: hasAcceptable ? acceptableDistanceMinM : null,
        acceptableDistanceMaxM: hasAcceptable ? acceptableDistanceMaxM : null,
      };
    }

    function classifyFeet(feetAngleDeg) {
      if (
        feetAngleDeg >= RULE.bestFeetAngleMinDeg &&
        feetAngleDeg <= RULE.bestFeetAngleMaxDeg
      ) {
        return { status: "best", label: "Best" };
      }
      if (
        feetAngleDeg >= RULE.acceptableFeetAngleMinDeg &&
        feetAngleDeg <= RULE.acceptableFeetAngleMaxDeg
      ) {
        return { status: "acceptable", label: "Acceptable" };
      }
      return { status: "out_of_range", label: "Out of range" };
    }

    function classifyFace(faceAngleDeg) {
      if (faceAngleDeg < RULE.bestFaceAngleMaxDeg) {
        return { status: "best", label: "Best" };
      }
      if (faceAngleDeg <= RULE.acceptableFaceAngleMaxDeg) {
        return { status: "acceptable", label: "Acceptable" };
      }
      return { status: "out_of_range", label: "Out of range" };
    }

    function classifyOverall(feetStatus, faceStatus) {
      if (feetStatus === "out_of_range" || faceStatus === "out_of_range") {
        return { status: "out_of_range", label: "out of range" };
      }
      if (feetStatus === "best" && faceStatus === "best") {
        return { status: "best", label: "best" };
      }
      return { status: "acceptable", label: "acceptable" };
    }

    function classify(cameraHeightM, distanceM) {
      const feetAngle = angleDeg(cameraHeightM, distanceM);
      const faceAngle = angleDeg(cameraHeightM - RULE.faceHeightM, distanceM);
      const feet = { angle: feetAngle, ...classifyFeet(feetAngle) };
      const face = { angle: faceAngle, ...classifyFace(faceAngle) };
      return {
        feet,
        face,
        overall: classifyOverall(feet.status, face.status),
      };
    }

    function fmt(value, decimals = 2, suffix = "") {
      if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
      return value.toFixed(decimals) + suffix;
    }

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }

    function lookupFaceStatusLabel(faceStatus) {
      if (faceStatus === "ideal_under_25") return "best";
      if (faceStatus === "acceptable_25_to_30") return "acceptable";
      if (faceStatus === "out_over_30") return "out of range";
      return faceStatus.replaceAll("_", " ");
    }

    function lookupFaceStatusClass(faceStatus) {
      if (faceStatus === "ideal_under_25") return "best";
      if (faceStatus === "acceptable_25_to_30") return "acceptable";
      return "out_of_range";
    }

    function setHeight(value) {
      const next = Math.min(Math.max(Number(value), RULE.minCameraHeightM), RULE.maxCameraHeightM);
      const rounded = Number(next.toFixed(1));
      els.heightRange.value = rounded;
      els.heightInput.value = rounded.toFixed(1);
      update();
    }

    function editHeight(value) {
      const next = Number(value);
      if (!Number.isFinite(next)) return;
      const clamped = Math.min(Math.max(next, RULE.minCameraHeightM), RULE.maxCameraHeightM);
      els.heightRange.value = clamped.toFixed(1);
      update();
    }

    function setDistance(value) {
      const next = Math.min(Math.max(Number(value), Number(els.distanceRange.min)), Number(els.distanceRange.max));
      els.distanceRange.value = next.toFixed(2);
      els.distanceInput.value = next.toFixed(2);
      update();
    }

    function editDistance(value) {
      const next = Number(value);
      if (!Number.isFinite(next)) return;
      const clamped = Math.min(Math.max(next, Number(els.distanceRange.min)), Number(els.distanceRange.max));
      els.distanceRange.value = clamped.toFixed(2);
      update();
    }

    function syncDistanceForHeight(row) {
      if (row.recommendedDistanceM) {
        const maxDistance = Math.max(36, Math.ceil(row.acceptableDistanceMaxM ?? row.recommendedDistanceM) + 2);
        els.distanceRange.max = String(maxDistance);
        els.distanceInput.max = String(maxDistance);
      }
    }

    function renderTable(rows, selectedHeightM) {
      els.lookupBody.innerHTML = rows.map((row) => {
        const selectedClass = row.cameraHeightM === selectedHeightM ? " class=\\"is-selected\\"" : "";
        return \`<tr\${selectedClass}>
          <td>\${fmt(row.cameraHeightM, 1, " m")}</td>
          <td>\${fmt(row.recommendedDistanceM, 2, " m")}</td>
          <td>\${fmt(row.recommendedFeetAngleDeg, 2, " deg")}</td>
          <td>\${fmt(row.recommendedFaceAngleDeg, 2, " deg")}</td>
          <td><span class="table-pill \${row.recommendationTier}">\${row.recommendationTier.replaceAll("_", " ")}</span></td>
          <td><span class="table-pill \${lookupFaceStatusClass(row.faceStatus)}">\${lookupFaceStatusLabel(row.faceStatus)}</span></td>
          <td>\${fmt(row.bestDistanceMinM, 2, " m")}</td>
          <td>\${fmt(row.bestDistanceMaxM, 2, " m")}</td>
          <td>\${fmt(row.acceptableDistanceMinM, 2, " m")}</td>
          <td>\${fmt(row.acceptableDistanceMaxM, 2, " m")}</td>
        </tr>\`;
      }).join("");
    }

    function renderDiagram(cameraHeightM, distanceM, feet, face) {
      const viewWidth = 720;
      const calloutWidth = 196;
      const calloutHeight = 90;
      const calloutX = 34;
      const calloutY = 104;
      const plot = {
        left: calloutX + calloutWidth + 36,
        right: 660,
        top: 62,
        bottom: 288,
      };
      const availableWidth = plot.right - plot.left;
      const availableHeight = plot.bottom - plot.top;
      const maxHeight = Math.max(cameraHeightM, RULE.humanHeightM, RULE.faceHeightM);
      const safeDistance = Math.max(distanceM, 0.01);
      const scale = Math.min(availableWidth / safeDistance, availableHeight / maxHeight);
      const distancePx = safeDistance * scale;
      const subjectX = plot.left + Math.max(0, (availableWidth - distancePx) / 2);
      const cameraX = subjectX + distancePx;
      const groundY = plot.bottom;
      const yForHeight = (heightM) => groundY - heightM * scale;
      const cameraY = yForHeight(cameraHeightM);
      const faceY = yForHeight(RULE.faceHeightM);
      const headTopY = yForHeight(RULE.humanHeightM);
      const headRadius = clamp(scale * 0.105, 6, 12);
      const headCenterY = headTopY + headRadius;
      const bodyStroke = clamp(scale * 0.04, 3, 5);
      const faceDotRadius = clamp(scale * 0.035, 3.5, 5);
      const cameraBodyWidth = 38;
      const cameraBodyHeight = 28;
      const heightBracketX = Math.min(cameraX + 34, viewWidth - 34);
      const heightLabelY = (cameraY + groundY) / 2;
      const distanceLabelX = (subjectX + cameraX) / 2;
      const distanceLineY = groundY + 30;
      const arcRadius = Math.min(44, Math.max(24, distancePx * 0.28));
      const faceArcRadius = Math.max(16, arcRadius - 12);
      const statusWidth = (label) => {
        if (label === "Out of range") return 86;
        if (label === "Acceptable") return 78;
        return 52;
      };
      const feetStatusWidth = statusWidth(feet.label);
      const faceStatusWidth = statusWidth(face.label);
      const arcPath = (angleDeg, radius) => {
        const theta = angleDeg * Math.PI / 180;
        const startX = cameraX - radius;
        const startY = cameraY;
        const endX = cameraX - Math.cos(theta) * radius;
        const endY = cameraY + Math.sin(theta) * radius;
        return [
          "M", startX.toFixed(2), startY.toFixed(2),
          "A", radius.toFixed(2), radius.toFixed(2), "0 0 0",
          endX.toFixed(2), endY.toFixed(2),
        ].join(" ");
      };

      els.diagram.setAttribute(
        "aria-label",
        "Side-view camera geometry. Feet angle " + fmt(feet.angle, 1, " deg") + ", " + feet.label + ". Face angle " + fmt(face.angle, 1, " deg") + ", " + face.label + "."
      );

      els.diagram.innerHTML = \`
        <rect x="0" y="0" width="720" height="360" fill="transparent"></rect>
        <line x1="\${plot.left - 40}" y1="\${groundY}" x2="\${plot.right + 40}" y2="\${groundY}" stroke="var(--line)" stroke-width="2"></line>
        <line x1="\${subjectX}" y1="\${groundY}" x2="\${cameraX}" y2="\${groundY}" class="svg-measure"></line>
        <line x1="\${subjectX}" y1="\${cameraY}" x2="\${cameraX}" y2="\${cameraY}" class="svg-reference"></line>
        <line x1="\${subjectX}" y1="\${faceY}" x2="\${cameraX}" y2="\${faceY}" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="5 6" opacity="0.48"></line>

        <line x1="\${cameraX}" y1="\${cameraY}" x2="\${subjectX}" y2="\${groundY}" class="svg-foot-ray"></line>
        <line x1="\${cameraX}" y1="\${cameraY}" x2="\${subjectX}" y2="\${faceY}" class="svg-face-ray"></line>
        <path d="\${arcPath(feet.angle, arcRadius)}" class="svg-foot-ray" stroke-width="2.2"></path>
        <path d="\${arcPath(face.angle, faceArcRadius)}" class="svg-face-ray" stroke-width="2.2"></path>

        <line x1="\${subjectX}" y1="\${groundY}" x2="\${subjectX}" y2="\${headCenterY + headRadius}" stroke="var(--ink)" stroke-width="\${bodyStroke}" stroke-linecap="round"></line>
        <circle cx="\${subjectX}" cy="\${headCenterY}" r="\${headRadius}" fill="var(--ink)"></circle>
        <circle cx="\${subjectX}" cy="\${faceY}" r="\${faceDotRadius}" fill="var(--accent)"></circle>
        <circle cx="\${subjectX}" cy="\${groundY}" r="4" fill="var(--ink)"></circle>

        <line x1="\${cameraX}" y1="\${groundY}" x2="\${cameraX}" y2="\${cameraY}" stroke="var(--primary-strong)" stroke-width="3.5" stroke-linecap="round"></line>
        <rect x="\${cameraX - cameraBodyWidth / 2}" y="\${cameraY - cameraBodyHeight / 2}" width="\${cameraBodyWidth}" height="\${cameraBodyHeight}" rx="7" fill="var(--primary-strong)"></rect>
        <circle cx="\${cameraX - 7}" cy="\${cameraY}" r="7" fill="var(--panel)" opacity="0.96"></circle>
        <rect x="\${cameraX + 5}" y="\${cameraY - 5}" width="12" height="10" rx="3" fill="var(--primary)"></rect>

        <line x1="\${heightBracketX}" y1="\${groundY}" x2="\${heightBracketX}" y2="\${cameraY}" class="svg-measure"></line>
        <line x1="\${heightBracketX - 8}" y1="\${cameraY}" x2="\${heightBracketX + 8}" y2="\${cameraY}" stroke="var(--muted)" stroke-width="1.5"></line>
        <line x1="\${heightBracketX - 8}" y1="\${groundY}" x2="\${heightBracketX + 8}" y2="\${groundY}" stroke="var(--muted)" stroke-width="1.5"></line>
        <text x="\${heightBracketX - 10}" y="\${heightLabelY}" class="svg-muted" text-anchor="end">\${fmt(cameraHeightM, 1, " m high")}</text>

        <line x1="\${subjectX}" y1="\${distanceLineY - 8}" x2="\${subjectX}" y2="\${distanceLineY + 8}" stroke="var(--muted)" stroke-width="1.5"></line>
        <line x1="\${cameraX}" y1="\${distanceLineY - 8}" x2="\${cameraX}" y2="\${distanceLineY + 8}" stroke="var(--muted)" stroke-width="1.5"></line>
        <line x1="\${subjectX}" y1="\${distanceLineY}" x2="\${cameraX}" y2="\${distanceLineY}" stroke="var(--muted)" stroke-width="1.5"></line>
        <text x="\${distanceLabelX}" y="\${distanceLineY + 22}" class="svg-muted" text-anchor="middle">\${fmt(distanceM, 2, " m horizontal")}</text>

        <text x="\${subjectX}" y="\${Math.max(26, headTopY - 10)}" class="svg-label" text-anchor="middle">Human</text>
        <text x="\${subjectX + 14}" y="\${clamp(faceY - 8, 28, groundY - 18)}" class="svg-muted">face 1.5 m</text>
        <text x="\${cameraX}" y="\${Math.max(26, cameraY - 22)}" class="svg-label" text-anchor="middle">Camera</text>
        <text x="\${cameraX - arcRadius - 10}" y="\${cameraY + Math.max(24, arcRadius * 0.72)}" class="svg-small" text-anchor="end">angle from camera level</text>

        <g transform="translate(\${calloutX}, \${calloutY})">
          <rect x="0" y="0" width="\${calloutWidth}" height="\${calloutHeight}" rx="8" class="svg-callout"></rect>
          <text x="12" y="18" class="svg-small">Current reading</text>
          <line x1="12" y1="38" x2="28" y2="38" class="svg-foot-ray" stroke-width="3"></line>
          <text x="36" y="42" class="svg-value">Feet \${fmt(feet.angle, 1, " deg")}</text>
          <rect x="110" y="27" width="\${feetStatusWidth}" height="22" rx="11" class="svg-status-bg \${feet.status}"></rect>
          <text x="\${110 + feetStatusWidth / 2}" y="42" class="svg-status-text \${feet.status}" text-anchor="middle" font-size="10" font-weight="700">\${feet.label}</text>
          <line x1="12" y1="66" x2="28" y2="66" class="svg-face-ray" stroke-width="3"></line>
          <text x="36" y="70" class="svg-value">Face \${fmt(face.angle, 1, " deg")}</text>
          <rect x="110" y="55" width="\${faceStatusWidth}" height="22" rx="11" class="svg-status-bg \${face.status}"></rect>
          <text x="\${110 + faceStatusWidth / 2}" y="70" class="svg-status-text \${face.status}" text-anchor="middle" font-size="10" font-weight="700">\${face.label}</text>
        </g>
      \`;
    }

    function update() {
      const rawHeightM = Number(els.heightInput.value);
      if (!Number.isFinite(rawHeightM)) return;
      const heightM = Math.min(Math.max(rawHeightM, RULE.minCameraHeightM), RULE.maxCameraHeightM);
      const row = lookupRow(heightM);
      syncDistanceForHeight(row);

      const rawDistanceM = Number(els.distanceInput.value);
      if (!Number.isFinite(rawDistanceM)) return;
      const distanceM = Math.min(Math.max(rawDistanceM, Number(els.distanceRange.min)), Number(els.distanceRange.max));
      const result = classify(heightM, distanceM);

      els.heightLabel.textContent = fmt(heightM, 1, " m");
      els.distanceLabel.textContent = fmt(distanceM, 2, " m");
      els.feetStatusPill.textContent = result.feet.label;
      els.feetStatusPill.className = "status " + result.feet.status;
      els.faceStatusPill.textContent = result.face.label;
      els.faceStatusPill.className = "status " + result.face.status;
      els.feetAngleValue.textContent = fmt(result.feet.angle, 2, " deg");
      els.faceAngleValue.textContent = fmt(result.face.angle, 2, " deg");
      els.recommendedValue.textContent = fmt(row.recommendedDistanceM, 2, " m");
      els.tierValue.textContent = result.overall.label;

      els.lookupDetails.innerHTML = \`
        <div><strong>Best feet range:</strong> \${fmt(row.bestDistanceMinM, 2, " m")} to \${fmt(row.bestDistanceMaxM, 2, " m")}</div>
        <div><strong>Face-safe acceptable range:</strong> \${fmt(row.acceptableDistanceMinM, 2, " m")} to \${fmt(row.acceptableDistanceMaxM, 2, " m")}</div>
      \`;

      renderDiagram(heightM, distanceM, result.feet, result.face);
      renderTable(lookupRows, heightM);
    }

    const lookupRows = cameraHeightValues().map(lookupRow);

    els.heightRange.addEventListener("input", (event) => setHeight(event.target.value));
    els.heightInput.addEventListener("input", (event) => editHeight(event.target.value));
    els.heightInput.addEventListener("change", (event) => setHeight(event.target.value));
    els.distanceRange.addEventListener("input", (event) => setDistance(event.target.value));
    els.distanceInput.addEventListener("input", (event) => editDistance(event.target.value));
    els.distanceInput.addEventListener("change", (event) => setDistance(event.target.value));

    els.snapButton.addEventListener("click", () => {
      const row = lookupRow(Number(els.heightInput.value));
      if (row.recommendedDistanceM) setDistance(row.recommendedDistanceM);
    });

    els.downloadCsvButton.addEventListener("click", () => {
      const blob = new Blob([CSV_TEXT], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "camera-placement-lookup.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    });

    els.copyRuleButton.addEventListener("click", async () => {
      const text = JSON.stringify(RULE, null, 2);
      await navigator.clipboard.writeText(text);
      els.copyRuleButton.textContent = "Copied rule JSON";
      setTimeout(() => {
        els.copyRuleButton.textContent = "Copy rule JSON";
      }, 1400);
    });

    const firstRow = lookupRow(Number(els.heightInput.value));
    if (firstRow.recommendedDistanceM) setDistance(firstRow.recommendedDistanceM);
    update();
  </script>
</body>
</html>
`;
}

const rows = buildRows();
const csvText = buildCsv(rows);
const publicDir = path.join(__dirname, "public");

await fs.mkdir(publicDir, { recursive: true });
await fs.writeFile(path.join(publicDir, "camera-placement-lookup.csv"), csvText, "utf8");
await fs.writeFile(path.join(publicDir, "index.html"), buildHtml(csvText), "utf8");

console.log(`Generated ${rows.length} rows.`);
console.log(path.join(publicDir, "camera-placement-lookup.csv"));
console.log(path.join(publicDir, "index.html"));
