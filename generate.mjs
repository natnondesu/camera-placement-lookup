import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lookupTable, toCsv, validateProfile } from "./src/placement-rule.js";
import { cacheVersion, buildManifest, renderServiceWorker } from "./src/pwa-build.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Control ranges only. Placement thresholds live in rules/scene-profiles.json.
const RULE = {
  minCameraHeightM: 1.6,
  maxCameraHeightM: 20,
  cameraHeightStepM: 0.1,
  defaultCameraHeightM: 4,
  minDistanceM: 0.3,
  maxDistanceM: 36,
  maxOffsetM: 10,
  minTiltAngleDeg: 0,
  maxTiltAngleDeg: 90,
  tiltAngleStepDeg: 0.5,
  minFocalLengthMm: 0.5,
  maxFocalLengthMm: 100,
  focalLengthStepMm: 0.1,
  defaultFocalLengthMm: 2.8,
};

const readJson = async (file) => JSON.parse(await fs.readFile(path.join(__dirname, file), "utf8"));
const rules = await readJson("rules/scene-profiles.json");
const cameras = await readJson("rules/cameras.json");
rules.profiles.forEach(validateProfile);
// The page runs the same engine the tests cover, inlined without its export keywords.
const SENSOR_SIZES = [
  { id: "1/4", label: '1/4" format - 3.6 mm width', widthMm: 3.6 },
  { id: "1/2.7", label: '1/2.7" format - 4.8 mm width', widthMm: 4.8 },
  { id: "1/2.3", label: '1/2.3" format - 5.37 mm width', widthMm: 5.37 },
  { id: "1/2", label: '1/2" format - 6.4 mm width', widthMm: 6.4 },
  { id: "1/1.2", label: '1/1.2" format - 8.8 mm width', widthMm: 8.8 }
];
// The console shows and computes a catalogue camera through its sensor format, so an unlisted width would silently use the wrong one.
cameras.cameras.filter((camera) => camera.lens !== "fisheye").forEach((camera) => {
  if (camera.datasheetFov) {
    const { wide, tele, aspect } = camera.datasheetFov;
    const sane = (end) => end.focalLengthMm > 0 && end.hFovDeg > 0 && end.hFovDeg < 180 && end.vFovDeg > 0 && end.vFovDeg < 180;
    if (!(sane(wide) && sane(tele) && aspect.w > 0 && aspect.h > 0 && wide.hFovDeg >= tele.hFovDeg
      && wide.focalLengthMm === camera.focalLengthMm.min && tele.focalLengthMm === camera.focalLengthMm.max)) {
      throw new Error(`Camera ${camera.id}: datasheetFov needs wide and tele ends at the focal range limits with views between 0 and 180 deg.`);
    }
    return;
  }
  if (!SENSOR_SIZES.some((sensor) => Math.abs(sensor.widthMm - camera.sensorWidthMm) < 0.01)) {
    throw new Error(`Camera ${camera.id}: sensor width ${camera.sensorWidthMm} mm matches no format in SENSOR_SIZES (generate.mjs); add the format first.`);
  }
});

const engineSource = (await fs.readFile(path.join(__dirname, "src/placement-rule.js"), "utf8")).replace(/^export /gm, "");
const simSource = (await fs.readFile(path.join(__dirname, "src/walk-sim.js"), "utf8")).replace(/^export /gm, "");
const peopleSource = (await fs.readFile(path.join(__dirname, "src/people.js"), "utf8")).replace(/^export /gm, "");
const shareSource = (await fs.readFile(path.join(__dirname, "src/share-link.js"), "utf8")).replace(/^export /gm, "");
const sheetSource = await fs.readFile(path.join(__dirname, "src/site-sheet.js"), "utf8");
const sheetCss = await fs.readFile(path.join(__dirname, "src/site-sheet.css"), "utf8");
const tourPlacementSource = (await fs.readFile(path.join(__dirname, "src/tour-placement.js"), "utf8")).replace(/^export /gm, "");
const helpSource = await fs.readFile(path.join(__dirname, "src/help-tour.js"), "utf8");
const helpCss = await fs.readFile(path.join(__dirname, "src/help-tour.css"), "utf8");
const pwaSource = await fs.readFile(path.join(__dirname, "src/pwa.js"), "utf8");
const pwaCss = await fs.readFile(path.join(__dirname, "src/pwa.css"), "utf8");
const serviceWorkerTemplate = await fs.readFile(path.join(__dirname, "src/service-worker.js"), "utf8");

// The outside libraries the page loads; the service worker caches the same URLs so the console works offline.
const FONTS_URL = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+Thai:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap";
const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
const ORBIT_URL = "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js";
const THREE_ADDONS = "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/";
const FBX_URL = THREE_ADDONS + "loaders/FBXLoader.js";
const SKELETON_URL = THREE_ADDONS + "utils/SkeletonUtils.js";
// The FBX loader's own imports, so the avatars still load offline.
const FBX_DEPENDENCIES = ["libs/fflate.module.js", "curves/NURBSCurve.js", "curves/NURBSUtils.js"].map((file) => THREE_ADDONS + file);
const QR_URL = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js";
if (!sheetSource.includes(QR_URL)) throw new Error("src/site-sheet.js no longer loads " + QR_URL + "; update QR_URL in generate.mjs so it stays cached offline.");
const APP_BACKGROUND = "#0b0f14";

function buildHtml() {
  const ruleJson = JSON.stringify(RULE, null, 2);
  const rulesJson = JSON.stringify(rules);
  const camerasJson = JSON.stringify(cameras);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Camera Placement Lookup</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${FONTS_URL}" rel="stylesheet">
  <link rel="manifest" href="/manifest.webmanifest">
  <meta name="theme-color" content="${APP_BACKGROUND}">
  <link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black">
  <meta name="apple-mobile-web-app-title" content="Camera Placement">
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
      --faint: oklch(0.680 0.016 256);
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
      font-family: "Inter", "Noto Sans Thai", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
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

    /* Every row sits at its content height; a 1fr row would stretch the shared-link banner on a tall window. */
    .app {
      min-height: 100vh;
      display: grid;
      grid-auto-rows: auto;
      align-content: start;
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
      font-size: 15px;
      font-weight: 700;
      line-height: 1.25;
    }

    .panel-head span {
      color: var(--faint);
      font-size: 12px;
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
      font-size: 12px;
    }

    .field {
      display: grid;
      gap: 8px;
    }

    .field-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    /* Text and the solved badge flow as one line that wraps between words, so the badge never floats on its own. */
    .field-label {
      display: block;
      color: var(--ink-soft);
      font-size: 13px;
      font-weight: 600;
      line-height: 1.35;
    }

    .field-label .driven-badge {
      margin-left: 2px;
      vertical-align: 1px;
    }

    .driven-badge {
      display: none;
      border-radius: 5px;
      padding: 2px 6px;
      background: var(--accent-dim);
      color: var(--accent);
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0;
    }

    .field.driven .driven-badge,
    .field.locked .driven-badge {
      display: inline-block;
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
      font-size: 12px;
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

    /* A solved value is tappable: the wrapper takes the tap and switches to Manual. */
    .field.driven .value-edit {
      cursor: pointer;
    }

    .field.driven .value-edit input {
      pointer-events: none;
    }

    .value-edit:has(input[aria-invalid="true"]) {
      border-color: var(--bad);
      box-shadow: 0 0 0 3px var(--bad-bg);
    }

    .ticks {
      display: flex;
      justify-content: space-between;
      color: var(--faint);
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-size: 11px;
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
      align-content: start;
      gap: 10px;
      border-right: 1px solid var(--border);
    }

    /* The one number the installer acts on, as big as the answer bar shows it on smaller screens. */
    .verdict-reading {
      display: flex;
      align-items: baseline;
      gap: 6px;
      margin: 2px 0 0;
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-variant-numeric: tabular-nums;
    }

    .verdict-reading b {
      color: var(--ink);
      font-size: 40px;
      font-weight: 750;
      line-height: 1;
      letter-spacing: -0.02em;
    }

    .verdict-reading small {
      color: var(--muted);
      font-size: 15px;
      font-weight: 700;
    }

    .verdict-reading span {
      margin-left: 6px;
      color: var(--muted);
      font-family: Inter, "Noto Sans Thai", sans-serif;
      font-size: 12px;
      font-weight: 650;
    }

    /* The notes run the full width under all three columns, in a strip of fixed height. */
    .verdict-foot {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 12px 22px;
      border-top: 1px solid var(--border);
    }

    .verdict-foot .verdict-notes {
      flex: 1;
      min-width: 0;
    }

    /* One reserved place for the card's notes: a warning that comes and goes swaps in here instead of pushing the page. */
    .verdict-notes {
      display: grid;
      align-content: center;
      gap: 6px;
      min-height: 72px;
    }

    .verdict-notes > .warn-line,
    .verdict-notes > .entrance-line {
      margin-top: 0;
    }

    .notes-none {
      margin: 0;
      padding: 8px 0;
      color: var(--muted);
      font-size: 12.5px;
    }

    .notes-more {
      flex: none;
      min-height: 26px;
      padding: 0 8px;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--surface-2);
      color: var(--ink-soft);
      font: 650 12px Inter, "Noto Sans Thai", sans-serif;
      cursor: pointer;
    }

    .notes-more:hover {
      border-color: var(--border-strong);
      color: var(--ink);
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
      font-size: 28px;
      line-height: 1.14;
      font-weight: 750;
      text-wrap: balance;
    }

    .verdict-sub {
      margin: 0;
      max-width: 64ch;
      min-height: calc(13px * 1.48 * 2);
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
      font-size: 12px;
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

    .use-button[hidden] {
      display: none;
    }

    .use-button.on-target:disabled {
      opacity: 1;
      border-color: oklch(0.780 0.165 152 / 0.35);
      background: var(--best-bg);
      color: var(--best);
    }

    /* Both columns share one row plan (head, readings, band, note), so their rows line up across the card. */
    .pillar {
      display: grid;
      grid-template-rows: 28px auto 30px 1fr;
      align-content: start;
      gap: 16px;
      border-right: 1px solid var(--border);
    }

    .pillar:last-child {
      border-right: 0;
    }

    .pillar-head {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .pillar-head .status-chip {
      min-height: 26px;
      padding: 2px 11px;
      border-radius: 999px;
      font-size: 13px;
    }

    .pillar-head .tag,
    .pillar-head .tag-info {
      margin-left: auto;
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
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0;
    }

    .tag {
      display: inline-flex;
      align-items: center;
      height: 22px;
      padding: 0 7px;
    }

    .tag-info {
      appearance: none;
      border: 0;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      height: 22px;
      padding: 0 7px;
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
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }

    .meta {
      display: grid;
      gap: 4px;
      min-width: 0;
    }

    .meta span {
      color: var(--muted);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .meta b {
      color: var(--ink);
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-size: 20px;
      font-weight: 750;
      font-variant-numeric: tabular-nums;
    }

    /* The bands as a scale: Acceptable amber, Best green, a tick where the reading sits, numbers at the band edges. */
    .band-bar {
      position: relative;
      align-self: start;
      height: 30px;
    }

    .band-bar .track,
    .band-bar .zone {
      position: absolute;
      top: 4px;
      height: 6px;
      border-radius: 3px;
    }

    .band-bar .track {
      left: 0;
      right: 0;
      background: var(--surface-2);
    }

    .band-bar .zone.acceptable {
      background: oklch(0.820 0.140 82 / 0.55);
    }

    .band-bar .zone.best {
      background: oklch(0.780 0.165 152 / 0.8);
    }

    .band-bar .tick {
      position: absolute;
      top: 0;
      width: 3px;
      height: 14px;
      margin-left: -1.5px;
      border-radius: 2px;
      background: var(--ink);
      box-shadow: 0 0 0 2px var(--surface);
    }

    .band-bar .edge {
      position: absolute;
      top: 15px;
      transform: translateX(-50%);
      color: var(--muted);
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-size: 10.5px;
      font-variant-numeric: tabular-nums;
    }

    .meta b small {
      margin-left: 2px;
      color: var(--muted);
      font-size: 11px;
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

    /* One quiet line of readings under the drawing; the verdict card above carries the statuses. */
    .side-readings {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 18px;
      margin: 0;
      padding: 10px 16px 12px;
      border-top: 1px solid var(--border);
    }

    .side-readings .reading-chip {
      min-height: 0;
      border: 0;
      background: none;
      padding: 0;
      color: var(--muted);
      font-weight: 600;
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
      font-size: 12px;
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
      color: var(--muted);
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
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

    #orbitCanvas {
      display: block;
      width: 100%;
      height: 476px;
      touch-action: none;
      cursor: grab;
    }

    .orbit-note {
      padding: 8px 14px 12px;
    }

    #topCanvas.grab {
      cursor: grab;
    }

    #topCanvas.dragging {
      cursor: grabbing;
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
      font-size: 12px;
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
      font-size: 11px;
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
      font-size: 11px;
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
      font-size: 12px;
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
      font-size: 12px;
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
      font-size: 12px;
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
      font-family: "Inter", "Noto Sans Thai", ui-sans-serif, system-ui, sans-serif;
      font-size: 12px;
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

      #orbitCanvas {
        height: 330px;
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

    :root {
      --face: oklch(0.740 0.150 305);
      --face-bg: oklch(0.740 0.150 305 / 0.14);
    }

    .scene-seg {
      display: flex;
      width: 100%;
    }

    .scene-seg button {
      flex: 1;
      min-height: 36px;
      font-size: 13px;
    }

    .field-hint {
      margin: 0;
      color: var(--faint);
      font-size: 11.5px;
      line-height: 1.4;
    }

    .tilt-auto {
      appearance: none;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--surface-2);
      color: var(--muted);
      font-size: 12px;
      font-weight: 750;
      padding: 2px 8px;
      margin-left: auto;
      margin-right: 8px;
      transition: background 160ms var(--ease), color 160ms var(--ease), border-color 160ms var(--ease);
    }

    .tilt-auto[aria-pressed="true"] {
      color: var(--accent);
      border-color: oklch(0.715 0.150 256 / 0.45);
      background: var(--accent-dim);
    }

    .tilt-auto:hover {
      color: var(--ink);
      border-color: var(--border-strong);
    }

    .verdict-actions {
      display: flex;
      flex: none;
      align-items: center;
      gap: 10px;
    }

    .button.ghost {
      min-height: 30px;
      padding: 0 10px;
      border-color: transparent;
      background: none;
      color: var(--muted);
      font-size: 12.5px;
    }

    .button.ghost:hover {
      border-color: var(--border);
      color: var(--ink);
    }

    .copy-status {
      color: var(--muted);
      font-size: 12px;
    }

    /* Three lines reserved, so a longer note never changes the card's height. */
    .pillar-note {
      margin: 0;
      min-height: calc(12.5px * 1.45 * 3);
      color: var(--muted);
      font-size: 12.5px;
      line-height: 1.45;
    }

    .status-chip.visible,
    .table-pill.visible {
      color: var(--face);
      background: var(--face-bg);
      border-color: oklch(0.740 0.150 305 / 0.45);
    }

    .status-chip.not-visible,
    .table-pill.not-visible {
      color: var(--muted);
      background: var(--surface-2);
      border-color: var(--border);
    }

    .sb-pairs b.visible,
    .mobile-answer-pairs b.visible {
      color: var(--face);
    }

    .sb-pairs b.not-visible,
    .mobile-answer-pairs b.not-visible {
      color: var(--muted);
    }

    .reading-chip.face::before {
      background: var(--face);
    }

    .reading-chip.not-visible::before {
      background: var(--muted);
    }

    .stage-head .view-seg button {
      min-height: 26px;
      padding: 3px 9px;
      font-size: 12px;
    }

    .table-head .button {
      margin-left: auto;
    }

    .entrance-line {
      margin-top: 10px;
      padding: 8px 10px;
      border-radius: var(--radius-sm);
      font-size: 12.5px;
      font-weight: 650;
      line-height: 1.45;
    }

    .entrance-line[data-state="covered"] {
      background: var(--best-bg);
      color: var(--best);
    }

    .entrance-line[data-state="tight"] {
      background: var(--ok-bg);
      color: var(--ok);
    }

    .entrance-line[data-state="too_wide"] {
      background: var(--bad-bg);
      color: var(--bad);
    }

    .sim-frame {
      position: relative;
    }

    .sim-overlay {
      position: absolute;
      left: 0;
      top: 0;
      pointer-events: none;
    }

    /* Sideways drags move the standing person; up and down still scroll the page on a phone. */
    #simCanvas {
      touch-action: pan-y;
    }

    #simCanvas[data-drag="grab"] {
      cursor: grab;
    }

    #simCanvas[data-drag="dragging"] {
      cursor: grabbing;
    }

    #simCanvas:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: -2px;
    }

    .stage-expand .i-collapse,
    .stage-expand[aria-pressed="true"] .i-expand {
      display: none;
    }

    .stage-expand[aria-pressed="true"] .i-collapse {
      display: block;
    }

    /* Expanded: the panel fills the window above a dimmed page, and the drawing takes every pixel left over. */
    .view-expanded {
      overflow: hidden;
    }

    .stage.expanded {
      position: fixed;
      inset: 12px;
      z-index: 60;
      display: flex;
      flex-direction: column;
      box-shadow: 0 0 0 100vmax oklch(0.120 0.010 256 / 0.9), 0 24px 60px oklch(0.050 0.010 256 / 0.6);
    }

    .stage.expanded .diagram-wrap,
    .stage.expanded .sim {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    .stage.expanded #topCanvas {
      flex: 1 1 auto;
      min-height: 0;
      height: 100%;
    }

    .stage.expanded .sim-stage {
      flex: 1 1 auto;
      min-height: 0;
      display: grid;
      place-items: center;
      overflow: hidden;
    }

    .stage.expanded .sim-frame {
      width: max-content;
    }

    .stage.expanded .sim-note {
      display: none;
    }

    @media (max-width: 760px) {
      .stage > .stage-head {
        position: relative;
      }

      .stage-expand {
        position: absolute;
        top: 12px;
        right: 14px;
      }
    }

    /* On a phone the expanded view is the whole screen; every pixel goes to the picture. */
    @media (max-width: 760px), (max-height: 560px) {
      .stage.expanded {
        inset: 0;
        border-radius: 0;
      }

      .stage.expanded > .stage-head {
        padding: 8px 12px;
      }

      .stage.expanded .stage-expand {
        top: 8px;
        right: 12px;
      }
    }

    .sim-hud {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 14px;
      padding: 10px 12px 4px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 650;
    }

    .sim-hud b {
      color: var(--ink);
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-size: 13px;
    }

    .diagram-wrap > .warn-line {
      margin: 12px 12px 0;
    }

    .sim-counts {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 14px;
    }

    .person-step {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .person-step .icon-button {
      width: 32px;
      height: 32px;
    }

    .stand-seg button {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .stand-dot {
      width: 10px;
      height: 3px;
      border-radius: 2px;
      flex: none;
    }

    .person-label {
      min-width: 9ch;
      text-align: center;
      color: var(--ink-soft);
      font-variant-numeric: tabular-nums;
    }

    .sim-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-left: auto;
    }

    .sim-toggle[aria-pressed="true"] {
      color: var(--accent);
      border-color: oklch(0.715 0.150 256 / 0.45);
      background: var(--accent-dim);
    }

    .sim-note {
      padding: 0 12px 12px;
    }

    @media (min-width: 921px) {
      .dual.sim-mode {
        grid-template-columns: minmax(0, 1fr) minmax(320px, 44%);
      }
    }

    .lang-seg {
      margin-left: auto;
    }

    .warn-line {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      margin-top: 10px;
      padding: 8px 10px;
      border-radius: var(--radius-sm);
      background: var(--ok-bg);
      color: var(--ok);
      font-size: 12.5px;
      font-weight: 650;
    }

    .warn-line > svg {
      flex: none;
      width: 15px;
      height: 15px;
      margin-top: 1px;
    }

    .edge-warn {
      font-weight: 500;
      line-height: 1.45;
    }

    .edge-warn b {
      font-weight: 750;
    }

    .mono-chip {
      padding: 0 5px;
      border-radius: 4px;
      background: oklch(0.820 0.140 82 / 0.18);
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-variant-numeric: tabular-nums;
    }

    /* ---------- Phone and tablet ---------- */
    .answer,
    .sheet-bar,
    .icon-tab {
      display: none;
    }

    .rail-more {
      display: grid;
      gap: 14px;
    }

    #visualizerView,
    #tableView {
      min-width: 0;
    }

    .answer-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .answer-pill {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 5px 11px 5px 9px;
      border: 1px solid transparent;
      border-radius: 999px;
      font-size: 14px;
      font-weight: 750;
    }

    .answer-pill::before {
      content: "";
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
    }

    .answer[data-state="best"] .answer-pill {
      color: var(--best);
      background: var(--best-bg);
      border-color: oklch(0.780 0.165 152 / 0.35);
    }

    .answer[data-state="acceptable"] .answer-pill {
      color: var(--ok);
      background: var(--ok-bg);
      border-color: oklch(0.820 0.140 82 / 0.35);
    }

    .answer[data-state="out_of_range"] .answer-pill {
      color: var(--bad);
      background: var(--bad-bg);
      border-color: oklch(0.680 0.205 24 / 0.4);
    }

    .answer-feet {
      color: var(--muted);
      font-size: 13px;
    }

    .answer-feet b {
      margin-left: 6px;
      color: var(--ink);
      font: 650 14px "JetBrains Mono", ui-monospace, monospace;
    }

    .answer-line {
      margin: 10px 0 2px;
      color: var(--ink-soft);
      font-size: 15px;
    }

    .answer-distance {
      margin-left: 4px;
      color: var(--ink);
      font: 700 40px/1 "JetBrains Mono", ui-monospace, monospace;
      letter-spacing: -0.03em;
      font-variant-numeric: tabular-nums;
    }

    .answer-distance small {
      margin-left: 3px;
      color: var(--muted);
      font-size: 0.5em;
      font-weight: 500;
    }

    /* The pinned answer keeps one height while the placement changes: two lines of advice, one scrolling row of chips. */
    .answer-sub {
      margin: 0;
      min-height: calc(12.5px * 1.4 * 2);
      color: var(--muted);
      font-size: 12.5px;
      line-height: 1.4;
    }

    .answer-chips {
      display: flex;
      flex-wrap: nowrap;
      gap: 6px;
      margin-top: 12px;
      overflow-x: auto;
      scrollbar-width: none;
    }

    .answer-chips::-webkit-scrollbar {
      display: none;
    }

    .answer-chips > .answer-chip {
      flex: none;
    }

    .answer-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface-2);
      color: var(--ink-soft);
      font-size: 12.5px;
    }

    .answer-chip[hidden] {
      display: none;
    }

    .answer-chip i {
      width: 8px;
      height: 2px;
      border-radius: 2px;
      background: currentColor;
    }

    .answer-chip b {
      color: var(--ink);
      font: 650 12.5px "JetBrains Mono", ui-monospace, monospace;
    }

    .answer-chip.face {
      color: var(--face);
    }

    .answer-chip.face[data-state="too_small"],
    .answer-chip[data-state="low"] {
      color: var(--ok);
      border-color: oklch(0.820 0.140 82 / 0.45);
    }

    .answer-chip.face[data-state="not_visible"] {
      color: var(--muted);
    }

    .status-chip.too-small {
      color: var(--ok);
      background: var(--ok-bg);
      border-color: oklch(0.820 0.140 82 / 0.45);
    }

    .answer-chip[data-state="covered"] {
      color: var(--best);
    }

    .answer-chip[data-state="tight"] {
      color: var(--ok);
    }

    .answer-chip[data-state="too_wide"] {
      color: var(--bad);
      border-color: oklch(0.680 0.205 24 / 0.5);
    }

    @media (max-width: 1200px) {
      .answer {
        position: sticky;
        top: var(--topbar-h, 64px);
        z-index: 19;
        display: block;
        padding: 14px 22px 12px;
        border-bottom: 1px solid var(--border);
        background: linear-gradient(180deg, oklch(0.205 0.015 256) 0%, var(--bg) 100%);
      }

      .on-table .answer,
      .statusbar {
        display: none;
      }

      .workspace {
        padding-bottom: 40px;
      }

      .verdict-lead {
        display: none;
      }

      #visualizerView > .main > .dual {
        order: -1;
      }

      .dual > .stage:last-child {
        order: -1;
      }
    }

    @media (max-width: 1200px) and (max-height: 520px) {
      .answer {
        position: static;
      }
    }

    @media (min-width: 761px) and (max-width: 1200px) {
      .answer {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 22px;
      }

      .answer-top {
        display: contents;
      }

      .answer-line {
        order: 1;
        margin: 0;
      }

      .answer-feet {
        order: 2;
        margin-left: auto;
      }

      .answer-distance {
        font-size: 34px;
      }

      .answer-sub {
        order: 3;
        flex-basis: 100%;
      }

      .answer-chips {
        order: 4;
        margin-top: 0;
      }

      .workspace {
        grid-template-columns: 290px minmax(0, 1fr);
      }

      /* Next to the rail there is room for one diagram at a useful size, not two squeezed side by side. */
      .dual,
      .dual.sim-mode {
        grid-template-columns: minmax(0, 1fr);
      }

      .verdict {
        grid-template-columns: 1fr 1fr;
      }

      .solve {
        align-items: stretch;
        flex-direction: column;
      }

      .solve .solve-seg button {
        flex: 1;
      }

      .verdict-lead {
        grid-column: 1 / -1;
        border-right: 0;
        border-bottom: 1px solid var(--border);
      }

      /* A narrower strip wraps the longest warning to four lines. */
      .verdict-foot .verdict-notes {
        min-height: 88px;
      }

      .rail {
        position: sticky;
        top: calc(var(--topbar-h, 64px) + var(--answer-h, 120px) + 16px);
        max-height: calc(100dvh - var(--topbar-h, 64px) - var(--answer-h, 120px) - 32px);
        overflow-y: auto;
        overscroll-behavior: contain;
        scrollbar-width: thin;
      }
    }

    @media (max-width: 760px) {
      .topbar {
        flex-wrap: nowrap;
        gap: 10px;
        padding: 10px 14px;
      }

      /* On a phone the notes strip stacks: the note gets the full width and room for four lines, the actions under it. */
      .verdict-foot {
        flex-direction: column;
        align-items: stretch;
        padding: 12px 16px;
      }

      .verdict-foot .verdict-notes {
        min-height: 104px;
        align-content: start;
      }

      .verdict-actions {
        justify-content: space-between;
      }

      .brand {
        min-width: 0;
      }

      .wordmark {
        min-width: 0;
      }

      .wordmark b {
        display: block;
        overflow: hidden;
        font-size: 15px;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      .tabs {
        display: none;
      }

      .icon-tab {
        display: grid;
        flex: none;
        width: 44px;
        height: 44px;
        place-items: center;
        margin-left: auto;
        border: 1px solid var(--border);
        border-radius: 12px;
        background: var(--surface);
        color: var(--ink-soft);
      }

      .icon-tab svg {
        width: 20px;
        height: 20px;
      }

      .icon-tab .i-diagram,
      .icon-tab[aria-pressed="true"] .i-table {
        display: none;
      }

      .icon-tab[aria-pressed="true"] .i-diagram {
        display: block;
      }

      .lang-seg {
        flex: none;
        width: auto;
        margin-left: 0;
      }

      .lang-seg button {
        flex: none;
        min-width: 44px;
      }

      .answer {
        padding: 12px 16px;
      }

      .workspace {
        grid-template-columns: minmax(0, 1fr);
        padding: 12px 12px calc(var(--sheet-h, 170px) + 20px);
      }

      .rail {
        position: fixed;
        top: auto;
        right: 0;
        bottom: 0;
        left: 0;
        z-index: 25;
        display: flex;
        flex-direction: column;
        gap: 0;
        max-height: calc(var(--sheet-h, 170px) + env(safe-area-inset-bottom, 0px));
        padding-bottom: env(safe-area-inset-bottom, 0px);
        overflow: hidden;
        border-top: 1px solid var(--border-strong);
        border-radius: 22px 22px 0 0;
        background: var(--surface);
        box-shadow: 0 -12px 32px oklch(0 0 0 / 0.45);
        transition: max-height 380ms var(--ease);
      }

      .rail.open {
        max-height: 82dvh;
      }

      .sheet-bar {
        display: block;
        flex: none;
      }

      .rail-more {
        flex: 1;
        min-height: 0;
        padding: 12px 12px 18px;
        overflow-y: auto;
        overscroll-behavior: contain;
        border-top: 1px solid var(--border);
        visibility: hidden;
      }

      .rail.open .rail-more,
      .rail.dragging .rail-more {
        visibility: visible;
      }

      .rail.dragging {
        transition: none;
      }

      .sheet-handle,
      .sheet-summary {
        touch-action: none;
      }

      .sheet-handle {
        display: grid;
        width: 100%;
        height: 32px;
        place-items: center;
        padding: 0;
        border: 0;
        background: transparent;
      }

      .sheet-handle::before {
        content: "";
        width: 40px;
        height: 5px;
        border-radius: 3px;
        background: var(--border-strong);
      }

      .sheet-quick {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        padding: 2px 14px 10px;
      }

      .quick-label {
        display: block;
        margin: 0 0 6px 2px;
        color: var(--muted);
        font-size: 12px;
        font-weight: 650;
      }

      .stepper {
        display: grid;
        grid-template-columns: 44px minmax(0, 1fr) 44px;
        height: 48px;
        overflow: hidden;
        border: 1px solid var(--border-strong);
        border-radius: 12px;
        background: var(--surface-2);
      }

      .stepper button {
        display: grid;
        place-items: center;
        border: 0;
        background: var(--surface-3);
        color: var(--ink);
        transition: background 160ms var(--ease);
      }

      .stepper button:active {
        background: var(--border-strong);
      }

      .stepper button:disabled {
        opacity: 0.4;
      }

      .stepper button svg {
        width: 18px;
        height: 18px;
      }

      .stepper-value {
        display: flex;
        align-items: baseline;
        justify-content: center;
        gap: 3px;
        min-width: 0;
        align-self: center;
      }

      .stepper-value input {
        width: 4.2ch;
        min-width: 0;
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--ink);
        text-align: right;
        font: 700 19px "JetBrains Mono", ui-monospace, monospace;
        -moz-appearance: textfield;
      }

      .stepper-value input::-webkit-inner-spin-button,
      .stepper-value input::-webkit-outer-spin-button {
        margin: 0;
        -webkit-appearance: none;
      }

      .stepper-value input:disabled {
        color: var(--muted);
      }

      .stepper-value span {
        color: var(--muted);
        font: 500 12px "JetBrains Mono", ui-monospace, monospace;
      }

      .sheet-summary {
        display: flex;
        align-items: center;
        gap: 8px;
        width: calc(100% - 28px);
        min-height: 44px;
        margin: 0 14px 12px;
        padding: 0 10px 0 12px;
        border: 1px solid var(--border);
        border-radius: 12px;
        background: var(--surface-2);
        color: var(--muted);
        font-size: 13px;
        text-align: left;
      }

      .sheet-summary > span {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      .sheet-summary b {
        color: var(--ink-soft);
        font-weight: 650;
      }

      .sheet-summary svg {
        width: 18px;
        height: 18px;
        flex: none;
        transition: transform 300ms var(--ease);
      }

      .rail.open .sheet-summary svg {
        transform: rotate(180deg);
      }

      .table-head {
        flex-wrap: wrap;
      }

      .stage-title h2 {
        white-space: nowrap;
      }

      .table-scroll {
        max-height: calc(100dvh - var(--topbar-h, 64px) - var(--sheet-h, 170px) - 150px);
      }
    }

    @media (max-width: 1200px), (pointer: coarse) {
      .solve-seg button,
      .scene-seg button,
      .stage-head .view-seg button,
      .tilt-auto,
      .tag-info,
      .button,
      select {
        min-height: 44px;
      }

      .lang-seg button {
        min-width: 44px;
      }

      .stage-head .view-seg button,
      .tilt-auto {
        padding: 0 12px;
      }
    }
${sheetCss}
${helpCss}
${pwaCss}
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
          <span data-i18n="subtitle">Geometry console</span>
        </div>
      </div>
      <div class="tabs" role="tablist" aria-label="View" data-i18n-attr="aria-label:viewTabs" id="viewTabs">
        <button type="button" role="tab" aria-selected="true" aria-controls="visualizerView" id="visualizerTab" tabindex="0" data-tab="visualizer" data-i18n="visualizer">Visualizer</button>
        <button type="button" role="tab" aria-selected="false" aria-controls="tableView" id="tableTab" tabindex="-1" data-tab="table" data-i18n="ruleTable">Rule table</button>
      </div>
      <button type="button" class="icon-tab" id="tableToggle" aria-pressed="false" aria-label="Rule table" data-i18n-attr="aria-label:ruleTable"><svg class="i-table" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2"></rect><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10"></path></svg><svg class="i-diagram" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19 13 5l7 14"></path><path d="M3 19h18"></path></svg></button>
      <div class="solve-seg lang-seg" role="group" aria-label="Language" data-i18n-attr="aria-label:language">
        <button type="button" data-lang="en" aria-pressed="true">EN</button>
        <button type="button" data-lang="th" aria-pressed="false">ไทย</button>
      </div>
    </header>
    <section class="answer" id="answer" data-state="best" aria-label="Placement answer" data-i18n-attr="aria-label:placementVerdict">
      <div class="answer-top">
        <span class="answer-pill" id="answerPill">Best</span>
        <span class="answer-feet"><span data-i18n="feetAngle">feet angle</span><b id="answerFeet"></b></span>
      </div>
      <p class="answer-line"><span data-i18n="countingLineAt">Counting line at</span> <span class="answer-distance"><b id="answerDistance"></b><small>m</small></span></p>
      <p class="answer-sub" id="answerSub"></p>
      <div class="answer-chips">
        <span class="answer-chip face" id="answerFaceChip" data-state="visible"><i></i><span data-i18n="faceLine">Face line</span> <b id="answerFace"></b> <span id="answerFaceState"></span></span>
        <span class="answer-chip entry" id="answerEntry" data-state="covered"><i></i><span data-i18n="entranceShort">Entrance</span> <b id="answerEntryWidth"></b> <span id="answerEntryState"></span></span>
        <span class="answer-chip" id="answerPpmChip" data-state="ok"><i></i><b id="answerPpm"></b> px/m</span>
      </div>
    </section>
    <div class="mobile-answer" id="mobileAnswer" data-state="best" aria-hidden="true">
      <span class="sb-dot"></span>
      <span class="mobile-answer-main" id="mobileAnswerOverall">Best</span>
      <span class="mobile-answer-pairs">
        <span><span data-i18n="feet">Feet</span> <b id="mobileAnswerFeet" class="best">Best</b></span>
        <span><span data-i18n="faceLine">Face line</span> <b id="mobileAnswerFace" class="visible">Visible</b></span>
      </span>
      <span class="mobile-answer-distance" id="mobileAnswerDistance"></span>
    </div>
    <div class="workspace">
      <aside class="rail" id="rail" aria-label="Placement controls" data-i18n-attr="aria-label:placementControls">
        <div class="sheet-bar" id="sheetBar">
          <button type="button" class="sheet-handle" id="sheetHandle" aria-expanded="false" aria-controls="railMore" aria-label="All controls" data-i18n-attr="aria-label:allControls"></button>
          <div class="sheet-quick">
            <div>
              <label class="quick-label" for="quickHeight" data-i18n="mountingHeight">Mounting height</label>
              <div class="stepper" id="quickHeightStepper">
                <button type="button" data-quick="height" data-dir="-1" aria-label="Lower" data-i18n-attr="aria-label:lower"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"></path></svg></button>
                <span class="stepper-value"><input id="quickHeight" type="number" inputmode="decimal" step="0.1"><span>m</span></span>
                <button type="button" data-quick="height" data-dir="1" aria-label="Raise" data-i18n-attr="aria-label:raise"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg></button>
              </div>
            </div>
            <div>
              <label class="quick-label" for="quickEntrance" data-i18n="entranceWidth">Entrance width</label>
              <div class="stepper">
                <button type="button" data-quick="entrance" data-dir="-1" aria-label="Lower" data-i18n-attr="aria-label:lower"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"></path></svg></button>
                <span class="stepper-value"><input id="quickEntrance" type="number" inputmode="decimal" step="0.1" placeholder="none" data-i18n-attr="placeholder:none"><span>m</span></span>
                <button type="button" data-quick="entrance" data-dir="1" aria-label="Raise" data-i18n-attr="aria-label:raise"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg></button>
              </div>
            </div>
          </div>
          <button type="button" class="sheet-summary" id="sheetSummary" aria-expanded="false" aria-controls="railMore"><span><b id="sheetScene"></b> · <span id="sheetCamera"></span></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6"></path></svg></button>
        </div>
        <div class="rail-more" id="railMore">
        <section class="panel">
          <div class="panel-head">
            <h2 data-i18n="scene">Scene</h2>
            <span id="sceneVersion">rules</span>
          </div>
          <div class="panel-body">
            <div class="solve-seg scene-seg" role="group" aria-label="Scene profile" data-i18n-attr="aria-label:scene" id="sceneSeg"></div>
            <p class="preset-caption" id="sceneCaption"></p>
          </div>
        </section>
        <section class="panel">
          <div class="panel-head">
            <h2 data-i18n="cameraPreset">Camera preset</h2>
            <span data-i18n="optics">optics</span>
          </div>
          <div class="panel-body">
            <div class="select-wrap">
              <select id="presetSelect" aria-label="Camera preset" data-i18n-attr="aria-label:cameraPreset"></select>
            </div>
            <p class="preset-caption" id="presetCaption"></p>
          </div>
        </section>
        <section class="panel">
          <div class="panel-head">
            <h2 data-i18n="geometry">Geometry</h2>
            <span data-i18n="dragOrType">drag or type</span>
          </div>
          <div class="panel-body">
            <div class="solve">
              <span class="solve-label" data-i18n="solveFor">Solve for</span>
              <div class="solve-seg" role="group" aria-label="Solve mode" data-i18n-attr="aria-label:solveFor">
                <button type="button" data-solve="manual" aria-pressed="false" data-i18n="manual">Manual</button>
                <button type="button" data-solve="distance" aria-pressed="true" data-i18n="distance">Distance</button>
                <button type="button" data-solve="height" aria-pressed="false" data-i18n="height">Height</button>
              </div>
            </div>
            <div class="field" id="heightField">
              <div class="field-top">
                <label class="field-label" for="heightRange"><span data-i18n="mountingHeight">Mounting height</span> <span class="driven-badge" data-i18n="solved">solved</span></label>
                <span class="value-edit" data-i18n-attr="title:editSolved">
                  <input id="heightInput" type="number" inputmode="decimal" min="${RULE.minCameraHeightM}" max="${RULE.maxCameraHeightM}" step="${RULE.cameraHeightStepM}" value="${RULE.defaultCameraHeightM.toFixed(1)}" aria-label="Mounting height in meters" data-i18n-attr="aria-label:mountingHeight">
                  <span class="unit">m</span>
                </span>
              </div>
              <input id="heightRange" type="range" min="${RULE.minCameraHeightM}" max="${RULE.maxCameraHeightM}" step="${RULE.cameraHeightStepM}" value="${RULE.defaultCameraHeightM}">
              <div class="ticks"><span>${RULE.minCameraHeightM.toFixed(1)}</span><span>${RULE.maxCameraHeightM.toFixed(1)}</span></div>
            </div>
            <div class="field" id="distanceField">
              <div class="field-top">
                <label class="field-label" for="distanceRange"><span data-i18n="countingDistance">Counting line distance</span> <span class="driven-badge" data-i18n="solved">solved</span></label>
                <span class="value-edit" data-i18n-attr="title:editSolved">
                  <input id="distanceInput" type="number" inputmode="decimal" min="${RULE.minDistanceM}" max="${RULE.maxDistanceM}" step="0.01" value="4.60" aria-label="Counting line distance in meters" data-i18n-attr="aria-label:countingDistance">
                  <span class="unit">m</span>
                </span>
              </div>
              <input id="distanceRange" type="range" min="${RULE.minDistanceM}" max="${RULE.maxDistanceM}" step="0.01" value="4.60">
              <div class="ticks"><span id="distanceMinTick">${RULE.minDistanceM.toFixed(2)}</span><span id="distanceMaxTick">${RULE.maxDistanceM.toFixed(2)}</span></div>
            </div>
            <div class="rec-row" aria-label="Recommended placement action">
              <span class="rec-pill"><small data-i18n="recommendedDistance">recommended distance</small><b id="recommendedDistance" class="mono"></b></span>
              <button class="use-button" type="button" id="snapButton">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 6 9 17l-5-5"></path>
                </svg>
                <span id="snapLabel">Use recommended distance</span>
              </button>
            </div>
            <div class="field" id="entranceField">
              <div class="field-top">
                <label class="field-label" for="entranceInput" data-i18n="entranceWidth">Entrance width</label>
                <span class="value-edit">
                  <input id="entranceInput" type="number" inputmode="decimal" min="0" max="60" step="0.1" value="5" placeholder="none" aria-describedby="entranceHint" aria-label="Entrance width in meters" data-i18n-attr="placeholder:none;aria-label:entranceWidth">
                  <span class="unit">m</span>
                </span>
              </div>
              <p class="field-hint" id="entranceHint" data-i18n="entranceHint">Optional. Width of the door or entrance people pass through, checked against what the camera covers at the counting line.</p>
            </div>
            <div class="field" id="offsetField">
              <div class="field-top">
                <label class="field-label" for="offsetRange" data-i18n="offsetFromCentre">From the centre line</label>
                <button type="button" class="tilt-auto" id="offsetCentre" aria-pressed="true" data-i18n="centreButton">Centre</button>
                <span class="value-edit">
                  <input id="offsetInput" type="number" inputmode="decimal" min="-${RULE.maxOffsetM}" max="${RULE.maxOffsetM}" step="0.05" value="0.00" aria-describedby="offsetCaption" aria-label="Camera offset from the entrance centre line in meters, positive to the right" data-i18n-attr="aria-label:offsetAria">
                  <span class="unit">m</span>
                </span>
              </div>
              <input id="offsetRange" type="range" min="-${RULE.maxOffsetM}" max="${RULE.maxOffsetM}" step="0.05" value="0">
              <div class="ticks"><span data-i18n="leftTick">left</span><span data-i18n="rightTick">right</span></div>
              <p class="field-hint" id="offsetCaption"></p>
            </div>
            <details class="advanced" id="advancedPanel">
              <summary><span data-i18n="advancedOptics">Advanced optics</span> <span aria-hidden="true">v</span></summary>
              <div class="advanced-body">
                <div class="field" id="tiltField">
                  <div class="field-top">
                    <label class="field-label" for="tiltRange" data-i18n="tiltAngle">Tilt angle</label>
                    <button type="button" class="tilt-auto" id="tiltAuto" aria-pressed="true" data-i18n="recommended">Recommended</button>
                    <span class="value-edit">
                      <input id="tiltInput" type="number" inputmode="decimal" min="${RULE.minTiltAngleDeg}" max="${RULE.maxTiltAngleDeg}" step="${RULE.tiltAngleStepDeg}" value="30" aria-label="Tilt angle in degrees" data-i18n-attr="aria-label:tiltAngle">
                      <span class="unit">deg</span>
                    </span>
                  </div>
                  <input id="tiltRange" type="range" min="${RULE.minTiltAngleDeg}" max="${RULE.maxTiltAngleDeg}" step="${RULE.tiltAngleStepDeg}" value="30">
                  <div class="ticks"><span data-i18n="level">level</span><span data-i18n="down">down</span></div>
                  <p class="field-hint" id="tiltHint" data-i18n="tiltHint" hidden>Ceiling fisheye: always 90 deg, straight down.</p>
                </div>
                <div class="field" id="sensorField">
                  <div class="field-top">
                    <label class="field-label" for="sensorSelect"><span data-i18n="sensorFormat">Sensor format</span> <span class="driven-badge" data-i18n="presetBadge">preset</span></label>
                  </div>
                  <div class="select-wrap">
                    <select id="sensorSelect" aria-label="Sensor format"></select>
                  </div>
                </div>
                <div class="field" id="focalField">
                  <div class="field-top">
                    <label class="field-label" for="focalRange" data-i18n="focalLength">Focal length</label>
                    <span class="value-edit">
                      <input id="focalInput" type="number" inputmode="decimal" min="${RULE.minFocalLengthMm}" max="${RULE.maxFocalLengthMm}" step="${RULE.focalLengthStepMm}" value="${RULE.defaultFocalLengthMm.toFixed(1)}" aria-label="Focal length in millimeters">
                      <span class="unit">mm</span>
                    </span>
                  </div>
                  <input id="focalRange" type="range" min="${RULE.minFocalLengthMm}" max="${RULE.maxFocalLengthMm}" step="${RULE.focalLengthStepMm}" value="${RULE.defaultFocalLengthMm}">
                  <div class="ticks"><span id="focalMinTick">${RULE.minFocalLengthMm.toFixed(1)}</span><span id="focalMaxTick">${RULE.maxFocalLengthMm.toFixed(1)}</span></div>
                </div>
                <div class="field">
                  <div class="field-top">
                    <label class="field-label" for="resolutionSelect" data-i18n="resolution">Resolution</label>
                  </div>
                  <div class="select-wrap">
                    <select id="resolutionSelect" aria-label="Camera resolution"></select>
                  </div>
                </div>
              </div>
            </details>
          </div>
        </section>
        </div>
      </aside>
      <main class="main">
        <section id="visualizerView" role="tabpanel" aria-labelledby="visualizerTab">
          <div class="main">
            <section class="verdict" id="verdict" data-state="best">
              <div class="verdict-lead">
                <div class="verdict-kicker"><span class="dot"></span><span id="overallLabel" data-i18n="placementVerdict">Placement verdict</span></div>
                <h1 id="verdictHeadline">Placement is best</h1>
                <p class="verdict-reading"><b id="verdictReading">4.60</b><small>m</small><span id="verdictReadingLabel" data-i18n="countingLineLower">counting line</span></p>
                <p class="verdict-sub" id="verdictSub"></p>
              </div>
              <div class="pillar" role="group" aria-labelledby="countingName">
                <div class="pillar-head">
                  <span class="pillar-name" id="countingName" data-i18n="countingLine">Counting line</span>
                  <span class="status-chip best" id="feetStatus">Best</span>
                  <button class="tag-info" type="button" id="priorityInfo" aria-expanded="false" aria-describedby="priorityTip">
                    <span data-i18n="verdictTag">verdict</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"></circle>
                      <path d="M12 16v-4"></path>
                      <path d="M12 8h.01"></path>
                    </svg>
                  </button>
                </div>
                <div class="pillar-meta">
                  <span class="meta"><span data-i18n="feetAngle">feet angle</span><b id="feetAngle"></b></span>
                  <span class="meta"><span data-i18n="pixelDensityMeta">pixel density</span><b id="feetPpm"></b></span>
                </div>
                <div class="band-bar" id="feetBar" aria-hidden="true"></div>
                <p class="pillar-note" id="countNote"></p>
              </div>
              <div class="pillar" role="group" aria-labelledby="faceName">
                <div class="pillar-head">
                  <span class="pillar-name" id="faceName" data-i18n="faceLine">Face line</span>
                  <span class="status-chip visible" id="faceStatus">Visible</span>
                  <span class="tag" data-i18n="demographics">demographics</span>
                </div>
                <div class="pillar-meta">
                  <span class="meta"><span data-i18n="distanceMeta">distance</span><b id="faceLineDistance"></b></span>
                  <span class="meta"><span data-i18n="faceAngle">face angle</span><b id="faceAngle"></b></span>
                </div>
                <div class="band-bar" id="faceBar" aria-hidden="true"></div>
                <p class="pillar-note" id="faceNote"></p>
              </div>
              <div class="verdict-foot">
                <div class="verdict-notes" id="verdictNotes">
                  <p class="warn-line edge-warn" id="edgeWarn" role="note" hidden></p>
                  <p class="warn-line" id="densityWarn" hidden></p>
                  <p class="warn-line" id="heightWarn" hidden></p>
                  <p class="entrance-line" id="entranceLine" data-state="covered" hidden></p>
                  <p class="notes-none" id="notesNone" data-i18n="notesNone" hidden>Nothing to flag for this placement.</p>
                </div>
                <div class="verdict-actions">
                  <button type="button" class="notes-more" id="notesMore" hidden></button>
                  <button type="button" class="button ghost" id="copyReadings">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"></path></svg>
                    <span data-i18n="copyReadings">Copy readings</span>
                  </button>
                  <span class="copy-status" id="copyStatus" aria-live="polite"></span>
                </div>
                <p class="sr-only" id="placementAnnouncement" aria-live="polite" aria-atomic="true"></p>
              </div>
            </section>
            <div class="dual sim-mode">
              <section class="stage" aria-label="Side-view placement and distance range">
                <div class="stage-head">
                  <div class="stage-title">
                    <h2 data-i18n="sideView">Side view</h2><span class="stage-badge" id="stageBadge"></span>
                    <div class="solve-seg view-seg" role="group" aria-label="Side panel" data-i18n-attr="aria-label:sideView" id="sideModeSeg">
                      <button type="button" data-sidemode="side" aria-pressed="true" data-i18n="sideModeSide">Side</button>
                      <button type="button" data-sidemode="orbit" aria-pressed="false" data-i18n="sideModeOrbit">Orbit</button>
                    </div>
                  </div>
                </div>
                <div class="diagram-wrap">
                  <canvas id="sideCanvas" width="980" height="560" role="img" aria-label="Side elevation diagram" style="touch-action: none"></canvas>
                  <canvas id="orbitCanvas" role="img" aria-label="The scene from outside: the entrance, the counting line and the camera's view. Drag to orbit." data-i18n-attr="aria-label:orbitAria" hidden></canvas>
                  <p class="field-hint orbit-note" id="orbitNote" data-i18n="orbitNote" hidden>Drag to orbit, scroll or pinch to zoom. The view cone ends where it meets the floor.</p>
                  <p class="side-readings" aria-label="Current side-view readings" data-i18n-attr="aria-label:sideReadingsAria">
                    <span class="reading-chip best" id="sideFeetReading"></span>
                    <span class="reading-chip face" id="sideFaceReading"></span>
                    <span class="reading-chip" id="sideTiltReading"></span>
                  </p>
                </div>
                <div class="rangebar" aria-label="Distance range">
                  <div class="rangebar-head">
                    <b data-i18n="feetWindow">Feet distance window</b>
                    <div class="legend">
                      <span><i style="background: var(--ok-bg); border: 1px solid var(--ok);"></i><span data-i18n="okFeet">ok feet</span></span>
                      <span><i style="background: var(--best-bg); border: 1px solid var(--best);"></i><span data-i18n="bestFeet">best feet</span></span>
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
              <section class="stage" aria-label="Top-down coverage and camera view">
                <div class="stage-head">
                  <div class="stage-title">
                    <h2 id="topTitle">Camera view</h2>
                    <div class="solve-seg view-seg" role="group" aria-label="Second diagram">
                      <button type="button" data-topview="top" aria-pressed="false" data-i18n="viewTop">Top</button>
                      <button type="button" data-topview="camera" aria-pressed="true" data-i18n="viewCamera">Camera</button>
                    </div>
                  </div>
                  <button type="button" class="icon-button stage-expand" id="stageExpand" aria-pressed="false" aria-label="Expand the view" title="Expand the view">
                    <svg class="i-expand" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5"></path></svg>
                    <svg class="i-collapse" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10h-6V4M4 14h6v6M14 10l6.5-6.5M10 14l-6.5 6.5"></path></svg>
                  </button>
                </div>
                <div class="diagram-wrap">
                  <p class="warn-line" id="simFallback" data-i18n="simFallback" hidden>The 3D view could not load. It needs an internet connection; this flat camera view is shown instead.</p>
                  <canvas id="topCanvas" width="600" height="560" role="img" aria-label="Top-down coverage diagram" hidden></canvas>
                  <div class="sim" id="simWrap">
                    <div class="sim-stage" id="simStage">
                      <div class="sim-frame">
                      <canvas id="simCanvas" role="img" tabindex="0" aria-label="Simulated camera view with people walking past. Drag the standing person, or use the arrow keys, to move them along the counting line." data-i18n-attr="aria-label:simAria"></canvas>
                      <canvas id="simOverlay" class="sim-overlay" aria-hidden="true"></canvas>
                      </div>
                    </div>
                    <div class="sim-hud" aria-live="off">
                      <span class="person-step" id="simPerson" role="group" aria-label="Person standing on the line" data-i18n-attr="aria-label:personGroup" hidden>
                        <button type="button" class="icon-button" id="simPersonPrev" aria-label="Previous person" data-i18n-attr="aria-label:personPrev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14.5 6-6 6 6 6"></path></svg></button>
                        <span class="person-label" id="simPersonLabel" aria-live="polite"></span>
                        <button type="button" class="icon-button" id="simPersonNext" aria-label="Next person" data-i18n-attr="aria-label:personNext"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9.5 6 6 6-6 6"></path></svg></button>
                      </span>
                      <span class="solve-seg stand-seg" id="simStand" role="group" aria-label="Where the person stands" data-i18n-attr="aria-label:standGroup" hidden>
                        <button type="button" data-stand="count" aria-pressed="true"><i class="stand-dot" id="simStandCountDot"></i><span data-i18n="standCount">Counting line</span></button>
                        <button type="button" data-stand="face" aria-pressed="false"><i class="stand-dot" id="simStandFaceDot"></i><span data-i18n="standFace">Face line</span></button>
                      </span>
                      <span class="sim-counts" id="simCounts" hidden>
                        <span><span data-i18n="in">In</span> <b id="simIn">0</b></span>
                        <span><span data-i18n="out">Out</span> <b id="simOut">0</b></span>
                        <span><span data-i18n="faces">Faces</span> <b id="simFaces">0</b></span>
                        <span id="simPassersRow"><span data-i18n="passers">Passers-by, not counted</span> <b id="simPassers">0</b></span>
                      </span>
                      <span class="sim-actions">
                        <button type="button" class="button sim-toggle" id="simCross" aria-pressed="true" title="People also walk left to right across the view, without crossing the counting line" data-i18n-attr="title:crossTitle" data-i18n="crossTraffic" hidden>Cross traffic</button>
                        <button type="button" class="button" id="simReset" data-i18n="reset" hidden>Reset</button>
                        <button type="button" class="button sim-toggle" id="simPause" aria-pressed="false" hidden>Pause</button>
                        <button type="button" class="button sim-toggle" id="simWalk" aria-pressed="false" data-i18n="walkPeople">Walk people</button>
                      </span>
                    </div>
                    <p class="field-hint sim-note" id="simStillNote" data-i18n="simStillNote">One person standing on the counting line, as this camera sees them. Walk people to watch the counting.</p>
                    <p class="field-hint sim-note" id="simNote" data-i18n="simNote" hidden>Simulated people through this camera. Counts come from the simulation, not real traffic.</p>
                  </div>
                </div>
              </section>
            </div>
            <section class="clusters" aria-label="Placement metrics">
              <div class="cluster">
                <h3 data-i18n="linesOnFloor">Lines on the floor</h3>
                <div class="metrics">
                  <div class="metric"><span class="value" id="countingMetric"></span><span class="label" data-i18n="countingLineLower">counting line</span></div>
                  <div class="metric"><span class="value" id="faceLineMetric"></span><span class="label" data-i18n="faceLineLower">face line</span></div>
                </div>
              </div>
              <div class="cluster">
                <h3 data-i18n="opticsFov">Optics - field of view</h3>
                <div class="metrics">
                  <div class="metric"><span class="value" id="horizontalFovMetric"></span><span class="label" data-i18n="horizontalFov">horizontal FOV</span></div>
                  <div class="metric"><span class="value" id="verticalFovMetric"></span><span class="label" data-i18n="verticalFov">vertical FOV</span></div>
                </div>
              </div>
              <div class="cluster">
                <h3 data-i18n="coverageAtLine">Coverage at counting line</h3>
                <div class="metrics">
                  <div class="metric"><span class="value" id="fullWidthMetric"></span><span class="label" data-i18n="fullWidth">full width</span></div>
                  <div class="metric"><span class="value" id="effectiveWidthMetric"></span><span class="label" data-i18n="effective80">effective 80%</span></div>
                </div>
              </div>
              <div class="cluster">
                <h3 data-i18n="resolutionDensity">Resolution density</h3>
                <div class="metrics">
                  <div class="metric"><span class="value" id="horizontalPpmMetric"></span><span class="label" data-i18n="horizontalPpm">horizontal PPM</span></div>
                  <div class="metric"><span class="value" id="verticalPpmMetric"></span><span class="label" data-i18n="verticalPpm">vertical PPM</span></div>
                </div>
              </div>
            </section>
          </div>
        </section>
        <section id="tableView" role="tabpanel" aria-labelledby="tableTab" hidden>
          <div class="table-card">
            <div class="table-head">
              <h2 data-i18n="lookupTable">Lookup table</h2>
              <div class="table-meta" id="tableMeta"></div>
              <button type="button" class="button" id="copyCsv" data-i18n="copyCsv">Copy CSV</button>
            </div>
            <div class="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th data-i18n="thHeight">Height</th>
                    <th data-i18n="countingLine">Counting line</th>
                    <th data-i18n="thFeetAngle">Feet angle</th>
                    <th data-i18n="feet">Feet</th>
                    <th data-i18n="thFaceThere">Face there</th>
                    <th data-i18n="thFace">Face</th>
                    <th data-i18n="faceLine">Face line</th>
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
      <b data-i18n="tipTitle">Why the counting line decides</b>
      <span data-i18n="tipBody">The feet angle at the counting line drives reliable people counting, so it alone decides the verdict. Demographics use a separate face line where the face angle is best; it never fails a placement.</span>
    </div>
    <div class="statusbar" id="statusbar" data-state="best">
      <button type="button" id="jumpToDiagram" aria-label="Current placement status. Jump to placement diagram">
        <span class="sb-dot"></span>
        <span class="sb-overall" id="sbOverall">Best</span>
        <span class="sb-pairs">
          <span><span data-i18n="feet">Feet</span> <b id="sbFeet" class="best">Best</b></span>
          <span><span data-i18n="faceLine">Face line</span> <b id="sbFace" class="visible">Visible</b></span>
        </span>
        <span class="sb-spacer"></span>
        <span class="sb-distance" id="sbDistance"></span>
      </button>
    </div>
  </div>
  <script>
${engineSource}
${shareSource}
    const RULE = ${ruleJson};
    const RULES = ${rulesJson};
    const CAMERA_CATALOG = ${camerasJson};

    const SENSOR_SIZES = ${JSON.stringify(SENSOR_SIZES)};

    const CUSTOM_PRESET = {
      caption: "Custom configuration. Sensor format, focal length and resolution are adjustable.",
      sensorId: "1/2.7",
      sensorLocked: false,
      focalMinMm: RULE.minFocalLengthMm,
      focalMaxMm: RULE.maxFocalLengthMm,
      focalDefaultMm: RULE.defaultFocalLengthMm,
      resolutions: [
        { label: "720p - 1280 x 720", w: 1280, h: 720 },
        { label: "1080p - 1920 x 1080", w: 1920, h: 1080 },
        { label: "4 MP - 2560 x 1440", w: 2560, h: 1440 },
        { label: "8 MP - 3840 x 2160", w: 3840, h: 2160 }
      ],
      defaultResolution: "1920x1080"
    };

    function presetFor(key) {
      const camera = CAMERA_CATALOG.cameras.find((item) => item.id === key);
      if (!camera) return CUSTOM_PRESET;
      const sensor = SENSOR_SIZES.find((item) => Math.abs(item.widthMm - camera.sensorWidthMm) < 0.01);
      const first = camera.resolutions[0];
      const focal = camera.focalLengthMm;
      return {
        caption: camera.description,
        sensorId: sensor ? sensor.id : "1/2.7",
        sensorLocked: true,
        focalMinMm: focal.min,
        focalMaxMm: focal.max,
        // Start at the widest end of the lens: the most coverage for the entrance.
        focalDefaultMm: focal.min,
        lens: camera.lens || "rectilinear",
        fovDeg: camera.fovDeg || null,
        datasheetFov: camera.datasheetFov || null,
        resolutions: camera.resolutions.map((r) => ({ label: r.label + " - " + r.w + " x " + r.h, w: r.w, h: r.h })),
        defaultResolution: first.w + "x" + first.h
      };
    }


    const I18N = {
      en: {
        mountAt: "Mount the camera at {height} m ({exact} m before rounding).", onRecommended: "On the recommended distance", editSolved: "Tap to set it yourself (switches to Manual)",
        densityWarn: "Only {ppm} px/m at the counting line, below the {min} px/m floor: people may be missed. Mount lower, or use a higher-resolution camera or a longer lens.",
        tooSmall: "Too small",
        faceTooSmall: "In frame, but only {ppm} px/m at the face (floor {min} px/m): too few pixels for demographics. Never fails the placement.",
        subtitle: "Geometry console", countingLineAt: "Counting line at", entranceShort: "Entrance", entryCovered: "in view",
        entryTight: "edges at frame rim", entryTooWide: "too wide", allControls: "All controls", lower: "Lower", raise: "Raise", viewTabs: "View", visualizer: "Visualizer", ruleTable: "Rule table", language: "Language",
        placementControls: "Placement controls", scene: "Scene", rulesVersion: "rules {version}",
        cameraPreset: "Camera preset", optics: "optics", geometry: "Geometry", dragOrType: "drag or type",
        solveFor: "Solve for", manual: "Manual", distance: "Distance", height: "Height",
        mountingHeight: "Mounting height", solved: "solved", countingDistance: "Counting line distance",
        recommendedDistance: "recommended distance", useRecommended: "Use recommended distance",
        notesNone: "Nothing to flag for this placement.", notesMore: "+{n} more", notesMoreAria: "Show the next note, {i} of {n}",
        offsetFromCentre: "From the centre line", centreButton: "Centre",
        faceViewPx: "{px} px face", faceViewBest: "best case", faceViewNone: "No face in view",
        sideModeSide: "Side", sideModeOrbit: "Orbit", sideReadingsAria: "Current side-view readings",
        alongFloor: "{distance} m to the middle",
        orbitNote: "Drag to orbit, scroll or pinch to zoom. The view cone ends where it meets the floor.",
        orbitAria: "The scene from outside: the entrance, the counting line and the camera's view. Drag to orbit.",
        planCentreLine: "entrance centre line", planToLine: "{distance} m to counting line", planRight: "{distance} m right of centre", planLeft: "{distance} m left of centre",
        planCamera: "camera, {height} m up", planDragSideways: "drag the camera sideways; the distance is solved", planDragAnywhere: "drag the camera",
        planWidths: "view {width} m wide at the line, effective {effective} m", planEffectiveOnly: "effective {effective} m at the line", leftTick: "left", rightTick: "right",
        offsetAria: "Camera offset from the entrance centre line in meters, positive to the right",
        offsetCentred: "On the entrance centre line. The camera aims at the middle of the entrance.",
        offsetSide: "{distance} m {side} of the entrance centre line, as the camera faces it. It turns {pan} deg to aim at the middle.",
        offsetSideFisheye: "{distance} m {side} of the entrance centre line. A ceiling fisheye looks straight down, so it does not turn.",
        sideLeft: "left", sideRight: "right",
        edgeLead: "{side} end at {angle}", edgeBody: "is outside the feet bands, so people walking there may be missed. Move the camera toward the centre line or mount it higher.",
        edgeCutLead: "{side} end cut off:", edgeCutBody: "a person there is not wholly in frame, so people walking there may be missed. Move the camera toward the centre line or zoom out.",
        sideLeftCap: "Left", sideRightCap: "Right",
        noDistance: "From this far off-centre no distance gives an Acceptable feet angle in the middle of the entrance. Move the camera toward the centre line or mount it higher.",
        faceOffCentre: "No face-Best spot along the middle of the entrance from this far off-centre. Move the camera toward the centre line.",
        entranceWidth: "Entrance width", none: "none",
        entranceHint: "Optional. Width of the door or entrance people pass through, checked against what the camera covers at the counting line.",
        advancedOptics: "Advanced optics", tiltAngle: "Tilt angle", recommended: "Recommended", level: "level", down: "down",
        tiltHint: "Ceiling fisheye: always 90 deg, straight down.", sensorFormat: "Sensor format", presetBadge: "preset",
        focalLength: "Focal length", resolution: "Resolution",
        placementVerdict: "Placement verdict", copyReadings: "Copy readings", countingLine: "Counting line", verdictTag: "verdict",
        feetAngle: "feet angle", bands: "bands", bandBest: "best", bandOk: "ok", faceLine: "Face line", demographics: "demographics",
        distanceMeta: "distance", faceAngle: "face angle", pixelDensityMeta: "pixel density", mountHeightLower: "mount height", sideView: "Side view", feetWindow: "Feet distance window",
        okFeet: "ok feet", bestFeet: "best feet", viewTop: "Top", viewCamera: "Camera",
        titleTop: "Top view", titleCamera: "Camera view",
        in: "In", out: "Out", faces: "Faces", passers: "Passers-by, not counted", crossTraffic: "Cross traffic",
        crossTitle: "People also walk left to right across the view, without crossing the counting line",
        walkPeople: "Walk people", reset: "Reset", pause: "Pause", resume: "Resume", fromCentre: "{m} m from centre",
        standGroup: "Where the person stands", standCount: "Counting line", standFace: "Face line",
        simStillNoteFace: "One person standing on the face line, as this camera sees them: the view demographics gets. Walk people to watch the counting.",
        expandView: "Expand the view", collapseView: "Back to the page",
        simAria: "Simulated camera view with people walking past. Drag the standing person, or use the arrow keys, to move them along the counting line.",
        personOf: "Person {i} of {n}", personGroup: "Person standing on the line", personPrev: "Previous person", personNext: "Next person",
        simStillNote: "One person standing on the counting line, as this camera sees them. Walk people to watch the counting.",
        simNote: "Simulated people through this camera. Counts come from the simulation, not real traffic.",
        simFallback: "The 3D view could not load. It needs an internet connection; this flat camera view is shown instead.",
        linesOnFloor: "Lines on the floor", countingLineLower: "counting line", faceLineLower: "face line",
        opticsFov: "Optics - field of view", horizontalFov: "horizontal FOV", verticalFov: "vertical FOV",
        coverageAtLine: "Coverage at counting line", fullWidth: "full width", effective80: "effective 80%",
        resolutionDensity: "Resolution density", horizontalPpm: "horizontal PPM", verticalPpm: "vertical PPM",
        lookupTable: "Lookup table", copyCsv: "Copy CSV", thHeight: "Height", thFeetAngle: "Feet angle", feet: "Feet",
        thFaceThere: "Face there", thFace: "Face",
        tipTitle: "Why the counting line decides",
        tipBody: "The feet angle at the counting line drives reliable people counting, so it alone decides the verdict. Demographics use a separate face line where the face angle is best; it never fails a placement.",
        status_best: "Best", status_acceptable: "Acceptable", status_out_of_range: "Out of range",
        visible: "Visible", notVisible: "Not visible",
        headline: "Placement is {status}",
        cutOff: "The person at the counting line is cut off in the frame. Adjust tilt or use a shorter focal length.",
        onTarget: "On the recommended distance for {scene}.",
        moveLine: "Move the counting line {delta} m {direction}, to {target} m.", farther: "farther", closer: "closer",
        heightWarn: "{height} m is outside the {scene} height range ({min}-{max} m). Judged anyway.",
        countFramed: "Whole person in frame. Target {target} deg.", countCut: "The person here is cut off in the frame.",
        faceBelow: "The camera is not above the {face} m face point.",
        faceOutsideTilt: "Outside the frame. A tilt between {lo} and {hi} deg shows both lines.",
        faceOutsideNoTilt: "Outside the frame, and no single tilt shows both lines. Use a shorter focal length.",
        faceOutsideFisheye: "Outside the fisheye's view.",
        faceSame: "Face is already best at the counting line, so both lines are the same.",
        faceBeyond: "{gap} m beyond the counting line. Demographics only; never fails the placement.",
        faceInFront: "{gap} m in front of the counting line. Demographics only; never fails the placement.",
        entranceTooWide: "Entrance {width} m is wider than the {covered} m the camera covers at the counting line; {miss} m is out of view. Mount higher, use a shorter focal length, or add a camera.",
        entranceTight: "Entrance {width} m fits the {covered} m view, but its edges fall in the outer 20% of the frame where detection is weaker.",
        entranceCovered: "Entrance {width} m is fully in view: the camera covers {covered} m at the counting line.",
        sideFeet: "Feet {angle} deg, {status}", sideFace: "Face line {distance}, {state}",
        sideTilt: "Tilt {tilt} deg {mode} · view {fov} deg", tiltManual: "manual", tiltRecommended: "recommended", tiltFisheye: "ceiling fisheye",
        canvasCamera: "Camera", canvasHead: "head", canvasFace: "face", canvasFeetAngle: "feet {angle} deg", canvasFaceAngle: "face {angle} deg",
        canvasAim: "{height} m aim", cameraBelow: "camera", entranceLabel: "entrance", effectiveShort: "effective",
        effectiveCircle: "effective 80% circle",
        faceAbove: "Face line is above the frame", framedNote: "Whole person in frame at the counting line",
        cutOffNote: "Person cut off at the counting line", fisheyeNote: "Ceiling fisheye, looking straight down",
        simCountingLine: "counting line", simFaceLine: "face line", simReadCount: "counting line · feet", simReadFace: "face line · face", simFace: "face", simIn: "IN", simOut: "OUT",
        simOutsideFrame: "Counting line is outside the frame", simEffective: "effective 80%",
        tableMeta: "{scene}, {min}-{max} m in {step} m steps, rules {version}",
        copiedReadings: "Readings copied.", copiedCsv: "CSV copied.",
        copyBlocked: "Copy was blocked by the browser.", copyUnavailable: "Copy is not available in this browser.",
        readingsHead: "{scene}, mount height {height} m, {camera} at {focal} mm",
        readingsVerdict: "Verdict: {status} (feet angle {angle} deg)",
        readingsCounting: "Counting line: {distance} m from below the camera",
        readingsFace: "Face line: {distance} ({state})", readingsTilt: "Tilt: {tilt} deg down",
        readingsEntrance: "Entrance: {text}", readingsRules: "Rules {version}",
        sideAria: "Side elevation. Camera height {height} meters, counting line at {distance} meters, feet angle {angle} degrees, {status}.",
        topAria: "Top-down coverage. Width {width} meters at the counting line.", cameraAria: "Camera view at {tilt} degrees tilt.",
        announce: "Placement is {status}. Feet {feet}. Face line {face}. Counting line {distance} meters.",
        noPresetCustom: "No preset - custom",
        scene_open_door: "Open door", scene_corridor: "Corridor",
        sceneDesc_open_door: "People can also walk across the front of the counted doorway, e.g. a store entrance.",
        sceneDesc_corridor: "People can only move in one direction through the view, e.g. a mall entrance or an escalator."
      },
      th: {
        mountAt: "ติดตั้งกล้องที่ความสูง {height} m (ค่าก่อนปัดเศษ {exact} m)", onRecommended: "อยู่ที่ระยะแนะนำแล้ว", editSolved: "แตะเพื่อกำหนดเอง (เปลี่ยนเป็นโหมดกำหนดเอง)",
        densityWarn: "ที่เส้นนับมีเพียง {ppm} px/m ต่ำกว่าเกณฑ์ {min} px/m อาจนับคนได้ไม่ครบ ติดตั้งให้ต่ำลง หรือใช้กล้องความละเอียดสูงขึ้นหรือเลนส์ยาวขึ้น",
        tooSmall: "เล็กเกินไป",
        faceTooSmall: "อยู่ในภาพ แต่ที่ใบหน้ามีเพียง {ppm} px/m (เกณฑ์ {min} px/m) พิกเซลน้อยเกินไปสำหรับข้อมูลเพศ/อายุ ไม่ทำให้ตำแหน่งไม่ผ่าน",
        subtitle: "เครื่องมือคำนวณตำแหน่งกล้อง", countingLineAt: "เส้นนับที่", entranceShort: "ทางเข้า", entryCovered: "อยู่ในภาพ",
        entryTight: "ขอบอยู่ริมภาพ", entryTooWide: "กว้างเกินภาพ", allControls: "ตั้งค่าทั้งหมด", lower: "ลด", raise: "เพิ่ม", viewTabs: "มุมมอง", visualizer: "แผนภาพ", ruleTable: "ตารางกฎ", language: "ภาษา",
        placementControls: "ตั้งค่าตำแหน่ง", scene: "ลักษณะพื้นที่", rulesVersion: "กฎ {version}",
        cameraPreset: "รุ่นกล้อง", optics: "เลนส์", geometry: "ความสูงและระยะ", dragOrType: "ลากหรือพิมพ์",
        solveFor: "คำนวณ", manual: "กำหนดเอง", distance: "ระยะ", height: "ความสูง",
        mountingHeight: "ความสูงติดตั้ง", solved: "คำนวณให้", countingDistance: "ระยะเส้นนับ",
        recommendedDistance: "ระยะที่แนะนำ", useRecommended: "ใช้ระยะที่แนะนำ",
        notesNone: "ตำแหน่งนี้ไม่มีข้อควรระวัง", notesMore: "อีก {n} ข้อ", notesMoreAria: "ดูข้อถัดไป {i} จาก {n}",
        offsetFromCentre: "ห่างจากแนวกึ่งกลาง", centreButton: "กึ่งกลาง",
        faceViewPx: "ใบหน้า {px} px", faceViewBest: "กรณีดีที่สุด", faceViewNone: "ไม่เห็นใบหน้า",
        sideModeSide: "ด้านข้าง", sideModeOrbit: "หมุนดู", sideReadingsAria: "ค่าที่อ่านได้จากมุมมองด้านข้าง",
        alongFloor: "ถึงกลางทางเข้า {distance} m",
        orbitNote: "ลากเพื่อหมุนดู เลื่อนหรือถ่างนิ้วเพื่อซูม กรวยภาพจบตรงที่แตะพื้น",
        orbitAria: "ฉากจากด้านนอก: ทางเข้า เส้นนับ และมุมมองของกล้อง ลากเพื่อหมุนดู",
        planCentreLine: "แนวกึ่งกลางทางเข้า", planToLine: "ห่างเส้นนับ {distance} m", planRight: "ขวาของกึ่งกลาง {distance} m", planLeft: "ซ้ายของกึ่งกลาง {distance} m",
        planCamera: "กล้อง สูง {height} m", planDragSideways: "ลากกล้องไปด้านข้างได้ ระยะคำนวณให้", planDragAnywhere: "ลากกล้องได้",
        planWidths: "ภาพกว้าง {width} m ที่เส้นนับ ใช้งานได้ {effective} m", planEffectiveOnly: "ใช้งานได้ {effective} m ที่เส้นนับ", leftTick: "ซ้าย", rightTick: "ขวา",
        offsetAria: "ระยะกล้องจากแนวกึ่งกลางทางเข้า เป็นเมตร ค่าบวกคือทางขวา",
        offsetCentred: "อยู่บนแนวกึ่งกลางทางเข้า กล้องเล็งไปที่กลางทางเข้า",
        offsetSide: "ห่างไปทาง{side} {distance} m จากแนวกึ่งกลางทางเข้า (มองจากกล้อง) กล้องหัน {pan} องศาเพื่อเล็งกลางทางเข้า",
        offsetSideFisheye: "ห่างไปทาง{side} {distance} m จากแนวกึ่งกลางทางเข้า ฟิชอายติดเพดานมองลงตรงๆ จึงไม่ต้องหัน",
        sideLeft: "ซ้าย", sideRight: "ขวา",
        edgeLead: "ปลายด้าน{side} {angle}", edgeBody: "อยู่นอกเกณฑ์มุมเท้า คนที่เดินตรงนั้นอาจนับไม่ได้ ขยับกล้องเข้าหาแนวกึ่งกลางหรือติดให้สูงขึ้น",
        edgeCutLead: "ปลายด้าน{side}อยู่นอกภาพ:", edgeCutBody: "คนที่ยืนตรงนั้นอยู่ในภาพไม่ครบตัว อาจนับไม่ได้ ขยับกล้องเข้าหาแนวกึ่งกลางหรือซูมออก",
        sideLeftCap: "ซ้าย", sideRightCap: "ขวา",
        noDistance: "กล้องห่างจากกึ่งกลางมากจนไม่มีระยะไหนให้มุมเท้าที่กลางทางเข้าพอใช้ได้ ขยับกล้องเข้าหาแนวกึ่งกลางหรือติดให้สูงขึ้น",
        faceOffCentre: "กล้องห่างจากกึ่งกลางมากเกินไป จึงไม่มีจุดที่มุมหน้าดีที่สุดตามแนวกลางทางเข้า ขยับกล้องเข้าหาแนวกึ่งกลาง",
        entranceWidth: "ความกว้างทางเข้า", none: "ไม่มี",
        entranceHint: "ไม่บังคับ ความกว้างของประตูหรือทางเข้าที่คนเดินผ่าน ใช้ตรวจว่ากล้องมองเห็นครบที่เส้นนับหรือไม่",
        advancedOptics: "ตั้งค่าเลนส์ขั้นสูง", tiltAngle: "มุมก้ม", recommended: "ค่าแนะนำ", level: "ระดับ", down: "ก้มลง",
        tiltHint: "ฟิชอายติดเพดาน: ก้ม 90 deg ตรงลงเสมอ", sensorFormat: "ขนาดเซนเซอร์", presetBadge: "ตามรุ่น",
        focalLength: "ความยาวโฟกัส", resolution: "ความละเอียด",
        placementVerdict: "ผลการประเมิน", copyReadings: "คัดลอกค่า", countingLine: "เส้นนับ", verdictTag: "ตัดสินผล",
        feetAngle: "มุมเท้า", bands: "ช่วงมุม", bandBest: "ดีสุด", bandOk: "พอใช้", faceLine: "เส้นจับใบหน้า", demographics: "ข้อมูลเพศ/อายุ",
        distanceMeta: "ระยะ", faceAngle: "มุมใบหน้า", pixelDensityMeta: "ความละเอียด", mountHeightLower: "ความสูงติดตั้ง", sideView: "มุมมองด้านข้าง", feetWindow: "ช่วงระยะตามมุมเท้า",
        okFeet: "พอใช้", bestFeet: "ดีที่สุด", viewTop: "บน", viewCamera: "กล้อง",
        titleTop: "มุมมองจากด้านบน", titleCamera: "ภาพจากกล้อง",
        in: "เข้า", out: "ออก", faces: "ใบหน้า", passers: "คนเดินผ่าน (ไม่นับ)", crossTraffic: "คนเดินตัดผ่าน",
        crossTitle: "ให้มีคนเดินซ้ายไปขวาผ่านภาพด้วย โดยไม่ข้ามเส้นนับ",
        walkPeople: "ให้คนเดิน", reset: "เริ่มใหม่", pause: "หยุดชั่วคราว", resume: "เดินต่อ", fromCentre: "ห่างจากกึ่งกลาง {m} m",
        standGroup: "ตำแหน่งที่คนยืน", standCount: "เส้นนับ", standFace: "เส้นจับใบหน้า",
        simStillNoteFace: "คนหนึ่งคนยืนบนเส้นจับใบหน้า ตามที่กล้องนี้มองเห็น คือภาพที่ใช้วิเคราะห์ข้อมูลประชากร กด ให้คนเดิน เพื่อดูการนับ",
        expandView: "ขยายภาพ", collapseView: "กลับสู่หน้าเดิม",
        simAria: "ภาพจำลองจากกล้องพร้อมคนเดินผ่าน ลากคนที่ยืนอยู่ หรือใช้ปุ่มลูกศร เพื่อเลื่อนไปตามเส้นนับ",
        personOf: "คนที่ {i} จาก {n}", personGroup: "คนที่ยืนบนเส้น", personPrev: "คนก่อนหน้า", personNext: "คนถัดไป",
        simStillNote: "คนหนึ่งคนยืนบนเส้นนับ ตามที่กล้องนี้มองเห็น กด ให้คนเดิน เพื่อดูการนับ",
        simNote: "คนจำลองที่มองผ่านกล้องนี้ ตัวเลขมาจากการจำลอง ไม่ใช่การนับจริง",
        simFallback: "โหลดภาพ 3 มิติไม่ได้ ต้องใช้อินเทอร์เน็ต จึงแสดงภาพจากกล้องแบบแบนแทน",
        linesOnFloor: "เส้นบนพื้น", countingLineLower: "เส้นนับ", faceLineLower: "เส้นจับใบหน้า",
        opticsFov: "เลนส์ - มุมรับภาพ", horizontalFov: "มุมรับภาพแนวนอน", verticalFov: "มุมรับภาพแนวตั้ง",
        coverageAtLine: "ความกว้างที่เส้นนับ", fullWidth: "กว้างทั้งหมด", effective80: "ใช้งานได้ 80%",
        resolutionDensity: "ความละเอียดต่อเมตร", horizontalPpm: "PPM แนวนอน", verticalPpm: "PPM แนวตั้ง",
        lookupTable: "ตารางค้นหา", copyCsv: "คัดลอก CSV", thHeight: "ความสูง", thFeetAngle: "มุมเท้า", feet: "เท้า",
        thFaceThere: "มุมใบหน้าที่เส้นนับ", thFace: "ใบหน้า",
        tipTitle: "ทำไมเส้นนับเป็นตัวตัดสินผล",
        tipBody: "มุมเท้าที่เส้นนับคือสิ่งที่ทำให้นับคนได้แม่นยำ จึงใช้ตัดสินผลเพียงอย่างเดียว ข้อมูลเพศ/อายุใช้เส้นจับใบหน้าแยกต่างหาก ณ จุดที่มุมใบหน้าดีที่สุด และไม่ทำให้ตำแหน่งไม่ผ่าน",
        status_best: "ดีที่สุด", status_acceptable: "พอใช้", status_out_of_range: "เกินเกณฑ์",
        visible: "มองเห็น", notVisible: "มองไม่เห็น",
        headline: "ตำแหน่งนี้: {status}",
        cutOff: "คนที่เส้นนับอยู่ไม่ครบในภาพ ปรับมุมก้มหรือใช้ความยาวโฟกัสสั้นลง",
        onTarget: "อยู่ที่ระยะแนะนำของ{scene}แล้ว",
        moveLine: "ขยับเส้นนับ{direction} {delta} m ไปที่ {target} m", farther: "ออกไป", closer: "เข้ามา",
        heightWarn: "{height} m อยู่นอกช่วงความสูงของ{scene} ({min}-{max} m) แต่ยังประเมินให้",
        countFramed: "เห็นคนทั้งตัวในภาพ มุมเป้าหมาย {target} deg", countCut: "คนที่ตำแหน่งนี้อยู่ไม่ครบในภาพ",
        faceBelow: "กล้องไม่ได้อยู่สูงกว่าระดับใบหน้า {face} m",
        faceOutsideTilt: "อยู่นอกภาพ ตั้งมุมก้มระหว่าง {lo} ถึง {hi} deg จะเห็นทั้งสองเส้น",
        faceOutsideNoTilt: "อยู่นอกภาพ และไม่มีมุมก้มใดที่เห็นทั้งสองเส้น ใช้ความยาวโฟกัสสั้นลง",
        faceOutsideFisheye: "อยู่นอกมุมรับภาพของฟิชอาย",
        faceSame: "มุมใบหน้าที่เส้นนับดีที่สุดอยู่แล้ว ทั้งสองเส้นจึงเป็นเส้นเดียวกัน",
        faceBeyond: "อยู่ถัดจากเส้นนับออกไป {gap} m ใช้เก็บข้อมูลเพศ/อายุเท่านั้น ไม่ทำให้ตำแหน่งไม่ผ่าน",
        faceInFront: "อยู่ก่อนถึงเส้นนับ {gap} m ใช้เก็บข้อมูลเพศ/อายุเท่านั้น ไม่ทำให้ตำแหน่งไม่ผ่าน",
        entranceTooWide: "ทางเข้า {width} m กว้างกว่าที่กล้องมองเห็นที่เส้นนับ ({covered} m) ขาดไป {miss} m ติดตั้งให้สูงขึ้น ใช้ความยาวโฟกัสสั้นลง หรือเพิ่มกล้อง",
        entranceTight: "ทางเข้า {width} m อยู่ในภาพ ({covered} m) แต่ขอบทางเข้าอยู่ในช่วง 20% ริมภาพซึ่งตรวจจับได้ไม่ดี",
        entranceCovered: "ทางเข้า {width} m อยู่ในภาพครบ กล้องมองเห็นกว้าง {covered} m ที่เส้นนับ",
        sideFeet: "เท้า {angle} deg, {status}", sideFace: "เส้นจับใบหน้า {distance}, {state}",
        sideTilt: "มุมก้ม {tilt} deg {mode} · มุมภาพ {fov} deg", tiltManual: "กำหนดเอง", tiltRecommended: "ค่าแนะนำ", tiltFisheye: "ฟิชอายติดเพดาน",
        canvasCamera: "กล้อง", canvasHead: "ศีรษะ", canvasFace: "ใบหน้า", canvasFeetAngle: "เท้า {angle} deg", canvasFaceAngle: "ใบหน้า {angle} deg",
        canvasAim: "จุดเล็ง {height} m", cameraBelow: "กล้อง", entranceLabel: "ทางเข้า", effectiveShort: "ใช้งานได้",
        effectiveCircle: "วงใช้งานได้ 80%",
        faceAbove: "เส้นจับใบหน้าอยู่เหนือภาพ", framedNote: "เห็นคนทั้งตัวที่เส้นนับ",
        cutOffNote: "คนที่เส้นนับอยู่ไม่ครบในภาพ", fisheyeNote: "ฟิชอายติดเพดาน มองตรงลง",
        simCountingLine: "เส้นนับ", simFaceLine: "เส้นจับใบหน้า", simReadCount: "เส้นนับ · ที่เท้า", simReadFace: "เส้นจับใบหน้า · ที่ใบหน้า", simFace: "ใบหน้า", simIn: "เข้า", simOut: "ออก",
        simOutsideFrame: "เส้นนับอยู่นอกภาพ", simEffective: "ใช้งานได้ 80%",
        tableMeta: "{scene} ความสูง {min}-{max} m ทีละ {step} m กฎ {version}",
        copiedReadings: "คัดลอกค่าแล้ว", copiedCsv: "คัดลอก CSV แล้ว",
        copyBlocked: "เบราว์เซอร์ไม่อนุญาตให้คัดลอก", copyUnavailable: "เบราว์เซอร์นี้คัดลอกไม่ได้",
        readingsHead: "{scene} ความสูงติดตั้ง {height} m กล้อง {camera} {focal} mm",
        readingsVerdict: "ผล: {status} (มุมเท้า {angle} deg)",
        readingsCounting: "เส้นนับ: {distance} m จากจุดใต้กล้อง",
        readingsFace: "เส้นจับใบหน้า: {distance} ({state})", readingsTilt: "มุมก้ม: {tilt} deg",
        readingsEntrance: "ทางเข้า: {text}", readingsRules: "กฎ {version}",
        sideAria: "ภาพด้านข้าง กล้องสูง {height} เมตร เส้นนับห่าง {distance} เมตร มุมเท้า {angle} องศา {status}",
        topAria: "มุมมองจากด้านบน กว้าง {width} เมตรที่เส้นนับ", cameraAria: "ภาพจากกล้องที่มุมก้ม {tilt} องศา",
        announce: "ผล {status} เท้า {feet} เส้นจับใบหน้า {face} เส้นนับ {distance} เมตร",
        noPresetCustom: "ไม่ใช้รุ่น - กำหนดเอง",
        scene_open_door: "ประตูเปิด", scene_corridor: "ทางเดิน",
        sceneDesc_open_door: "มีคนเดินตัดผ่านหน้าประตูที่นับได้ด้วย เช่น ทางเข้าร้านค้า",
        sceneDesc_corridor: "คนเดินผ่านภาพได้ทางเดียว ไม่มีคนเดินตัดผ่าน เช่น ทางเข้าห้าง หรือบันไดเลื่อน",
        camDesc_custom: "กำหนดเอง ปรับขนาดเซนเซอร์ ความยาวโฟกัส และความละเอียดได้",
        camDesc_dahua_hdbw2531r_zs_s2: "โดม 5 MP เซนเซอร์ 1/2.7 นิ้ว เลนส์ซูมมอเตอร์ 2.7-13.5 mm",
        camDesc_hikvision_dome_2mp: "DS-2DE2A204IW-DE3(C) กล้อง PTZ ขนาดเล็ก เซนเซอร์ 1/2.8 นิ้ว 2 MP ซูมออปติคอล 4 เท่า 2.8-12 mm",
        camDesc_hikvision_dome_4mp: "DS-2CD2746G2-IZS โดม AcuSense เซนเซอร์ 1/3 นิ้ว 4 MP เลนส์ปรับระยะมอเตอร์ 2.8-12 mm",
        camDesc_generic_fisheye_12mp: "ติดเพดาน มองตรงลง เลนส์ฟิชอาย 180° ภาพวงกลม 2992 × 2992"
      }
    };

    // Saved choice first, then the browser's language, then English.
    let lang = (() => {
      try {
        const saved = window.localStorage.getItem("cpl-lang");
        if (saved === "en" || saved === "th") return saved;
      } catch (error) {
        // Storage can be blocked; the browser language still decides.
      }
      return (navigator.language || "").toLowerCase().startsWith("th") ? "th" : "en";
    })();

    function t(key, vars) {
      const table = I18N[lang] || I18N.en;
      let text = key in table ? table[key] : key in I18N.en ? I18N.en[key] : key;
      if (vars) Object.keys(vars).forEach((name) => { text = text.split("{" + name + "}").join(String(vars[name])); });
      return text;
    }

    // Existing STATUS_LABEL[status] call sites read the current language.
    const STATUS_LABEL = {
      get best() { return t("status_best"); },
      get acceptable() { return t("status_acceptable"); },
      get out_of_range() { return t("status_out_of_range"); }
    };

    function sceneName(profile) {
      return I18N.en["scene_" + profile.id] ? t("scene_" + profile.id) : profile.name;
    }

    function sceneDesc(profile) {
      return I18N.en["sceneDesc_" + profile.id] ? t("sceneDesc_" + profile.id) : profile.description;
    }

    function cameraCaption(id, preset) {
      const key = "camDesc_" + id;
      return lang !== "en" && I18N[lang][key] ? I18N[lang][key] : preset.caption;
    }

    function applyStaticText() {
      document.documentElement.lang = lang;
      document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
      document.querySelectorAll("[data-i18n-attr]").forEach((el) => {
        el.dataset.i18nAttr.split(";").forEach((pair) => {
          const parts = pair.split(":");
          el.setAttribute(parts[0], t(parts[1]));
        });
      });
      document.querySelectorAll("[data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
      syncExpandButton();
    }


    function themeColor(name) {
      return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }

    const COL = {
      best: themeColor("--best"),
      ok: themeColor("--ok"),
      bad: themeColor("--bad"),
      accent: themeColor("--accent"),
      face: themeColor("--face"),
      ink: themeColor("--ink"),
      muted: themeColor("--muted"),
      faint: themeColor("--faint"),
      grid: themeColor("--border"),
      surface: themeColor("--surface"),
      surface2: themeColor("--surface-2")
    };

    const byId = (id) => document.getElementById(id);
    const els = {
      viewTabs: byId("viewTabs"), visualizerTab: byId("visualizerTab"), tableTab: byId("tableTab"),
      visualizerView: byId("visualizerView"), tableView: byId("tableView"),
      sceneSeg: byId("sceneSeg"), sceneCaption: byId("sceneCaption"), sceneVersion: byId("sceneVersion"),
      presetSelect: byId("presetSelect"), presetCaption: byId("presetCaption"),
      heightField: byId("heightField"), heightRange: byId("heightRange"), heightInput: byId("heightInput"),
      distanceField: byId("distanceField"), distanceRange: byId("distanceRange"), distanceInput: byId("distanceInput"),
      distanceMaxTick: byId("distanceMaxTick"),
      entranceInput: byId("entranceInput"), entranceLine: byId("entranceLine"),
      tiltRange: byId("tiltRange"), tiltHint: byId("tiltHint"), tiltInput: byId("tiltInput"), tiltAuto: byId("tiltAuto"),
      sensorField: byId("sensorField"), sensorSelect: byId("sensorSelect"), focalField: byId("focalField"),
      focalRange: byId("focalRange"), focalInput: byId("focalInput"), focalMinTick: byId("focalMinTick"), focalMaxTick: byId("focalMaxTick"),
      resolutionSelect: byId("resolutionSelect"),
      verdict: byId("verdict"), verdictHeadline: byId("verdictHeadline"), verdictSub: byId("verdictSub"), heightWarn: byId("heightWarn"),
      copyReadings: byId("copyReadings"), copyStatus: byId("copyStatus"), placementAnnouncement: byId("placementAnnouncement"),
      recommendedDistance: byId("recommendedDistance"), snapButton: byId("snapButton"), snapLabel: byId("snapLabel"), densityWarn: byId("densityWarn"),
      answerFaceChip: byId("answerFaceChip"), answerFaceState: byId("answerFaceState"), answerPpmChip: byId("answerPpmChip"),
      feetStatus: byId("feetStatus"), feetAngle: byId("feetAngle"), feetPpm: byId("feetPpm"), feetBar: byId("feetBar"), faceBar: byId("faceBar"),
      verdictReading: byId("verdictReading"), verdictReadingLabel: byId("verdictReadingLabel"), countNote: byId("countNote"),
      faceStatus: byId("faceStatus"), faceLineDistance: byId("faceLineDistance"), faceAngle: byId("faceAngle"), faceNote: byId("faceNote"),
      priorityInfo: byId("priorityInfo"), priorityTip: byId("priorityTip"),
      stageBadge: byId("stageBadge"), sideFeetReading: byId("sideFeetReading"), sideFaceReading: byId("sideFaceReading"), sideTiltReading: byId("sideTiltReading"),
      topTitle: byId("topTitle"), sideCanvas: byId("sideCanvas"), topCanvas: byId("topCanvas"),
      acceptableZone: byId("acceptableZone"), bestZone: byId("bestZone"),
      minMarker: byId("minMarker"), minMarkerLabel: byId("minMarkerLabel"), bestMarker: byId("bestMarker"), bestMarkerLabel: byId("bestMarkerLabel"),
      maxMarker: byId("maxMarker"), maxMarkerLabel: byId("maxMarkerLabel"), distanceCursor: byId("distanceCursor"), cursorLabel: byId("cursorLabel"),
      countingMetric: byId("countingMetric"), faceLineMetric: byId("faceLineMetric"),
      horizontalFovMetric: byId("horizontalFovMetric"), verticalFovMetric: byId("verticalFovMetric"),
      fullWidthMetric: byId("fullWidthMetric"), effectiveWidthMetric: byId("effectiveWidthMetric"),
      horizontalPpmMetric: byId("horizontalPpmMetric"), verticalPpmMetric: byId("verticalPpmMetric"),
      tableMeta: byId("tableMeta"), copyCsv: byId("copyCsv"), lookupBody: byId("lookupBody"),
      answer: byId("answer"), answerPill: byId("answerPill"), answerFeet: byId("answerFeet"), answerDistance: byId("answerDistance"),
      answerSub: byId("answerSub"), answerFace: byId("answerFace"), answerEntry: byId("answerEntry"), answerEntryWidth: byId("answerEntryWidth"),
      answerEntryState: byId("answerEntryState"), answerPpm: byId("answerPpm"), rail: byId("rail"), sheetBar: byId("sheetBar"),
      sheetHandle: byId("sheetHandle"), sheetSummary: byId("sheetSummary"), sheetScene: byId("sheetScene"), sheetCamera: byId("sheetCamera"),
      quickHeight: byId("quickHeight"), quickHeightStepper: byId("quickHeightStepper"), quickEntrance: byId("quickEntrance"), tableToggle: byId("tableToggle"),
      mobileAnswer: byId("mobileAnswer"), mobileAnswerOverall: byId("mobileAnswerOverall"), mobileAnswerFeet: byId("mobileAnswerFeet"),
      mobileAnswerFace: byId("mobileAnswerFace"), mobileAnswerDistance: byId("mobileAnswerDistance"),
      statusbar: byId("statusbar"), sbOverall: byId("sbOverall"), sbFeet: byId("sbFeet"), sbFace: byId("sbFace"), sbDistance: byId("sbDistance"),
      jumpToDiagram: byId("jumpToDiagram"),
      dual: document.querySelector(".dual"), simWrap: byId("simWrap"), simFallback: byId("simFallback"),
      orbitCanvas: byId("orbitCanvas"), orbitNote: byId("orbitNote"), sideModeSeg: byId("sideModeSeg"), edgeWarn: byId("edgeWarn"),
      offsetInput: byId("offsetInput"), offsetRange: byId("offsetRange"), offsetCaption: byId("offsetCaption"), offsetCentre: byId("offsetCentre"),
      notesNone: byId("notesNone"), notesMore: byId("notesMore")
    };

    // Three.js and the 2D overlay need plain sRGB, not the theme's oklch().
    function toRgb(color) {
      const ctx = document.createElement("canvas").getContext("2d");
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return "rgb(" + d[0] + ", " + d[1] + ", " + d[2] + ")";
    }
    const SIM_COLORS = {
      best: toRgb(themeColor("--best")),
      acceptable: toRgb(themeColor("--ok")),
      out_of_range: toRgb(themeColor("--bad")),
      face: toRgb(themeColor("--face")),
      out: toRgb(themeColor("--accent")),
      bad: toRgb(themeColor("--bad"))
    };

    function simInput(p) {
      const r = p.result;
      return {
        scene: p.profile.id,
        heightM: p.heightM,
        distanceM: p.distanceM,
        tiltDeg: r.tilt.value,
        vFovDeg: r.optics.verticalFovDeg,
        aspect: p.resolution.w / p.resolution.h,
        faceLineDistanceM: r.faceLine.distanceM,
        faceLineVisible: r.faceLine.visible,
        entranceWidthM: state.entranceM,
        offsetM: state.offsetM,
        coverageWidthM: r.optics.coverageWidthM,
        humanHeightM: p.profile.humanHeightM,
        facePointM: p.profile.facePointM,
        lens: r.optics.lens,
        fovDeg: r.optics.horizontalFovDeg,
        pixelDensity: (distance, offAxisDeg) => pixelDensity(p.camera, distance, offAxisDeg),
        fisheyeProjection: (offset) => fisheyeProjection(offset, r.optics.horizontalFovDeg),
        colors: { count: SIM_COLORS[r.feet.status], out: SIM_COLORS.out, face: SIM_COLORS.face, bad: SIM_COLORS.bad, camera: SIM_COLORS.out },
        text: {
          countingLine: t("simCountingLine"), faceLine: t("simFaceLine"), face: t("simFace"),
          readCount: t("simReadCount"), readFace: t("simReadFace"),
          in: t("simIn"), out: t("simOut"), outsideFrame: t("simOutsideFrame"), effective: t("simEffective"),
          faceViewPx: t("faceViewPx"), faceViewBest: t("faceViewBest"), faceViewNone: t("faceViewNone"),
          pause: t("pause"), resume: t("resume"), personOf: t("personOf"), fromCentre: t("fromCentre"),
          stillCount: t("simStillNote"), stillFace: t("simStillNoteFace")
        }
      };
    }

    const state = {
      profileId: RULES.defaultProfile,
      solveMode: "distance",
      entranceM: 5,
      offsetM: 0,
      presetId: CAMERA_CATALOG.defaultCamera,
      topView: "camera",
      simFailed: false,
      tiltUserAdjusted: false,
      tableProfileId: null,
      tableSelectedHeightKey: null,
      announceTimer: null,
      sideGeom: null,
      planView: null,
      planDragging: false,
      sideMode: "side",
      planFrozen: null,
      notesKey: "",
      noteIndex: 0,
      dragging: false
    };

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }

    function fmt(value, decimals, suffix) {
      if (value === null || value === undefined || Number.isNaN(value)) return t("none");
      return Number(value).toFixed(decimals) + (suffix || "");
    }

    // Turned far enough, one edge of the view never meets the counting line; past 100 m the width only reads as "a lot".
    function widthText(metres) {
      return Number.isFinite(metres) && metres <= 100 ? fmt(metres, 1) : ">100";
    }

    function pct(value, min, max) {
      if (max <= min) return 0;
      return clamp(((value - min) / (max - min)) * 100, 0, 100);
    }

    function setRangeFill(range) {
      range.style.setProperty("--fill", pct(Number(range.value), Number(range.min), Number(range.max)).toFixed(2) + "%");
    }

    function setFieldValue(input, range, value, decimals, keepText) {
      const clamped = clamp(Number(value), Number(input.min), Number(input.max));
      if (!keepText) input.value = clamped.toFixed(decimals);
      range.value = clamped.toFixed(decimals);
      setRangeFill(range);
      return clamped;
    }

    function currentProfile() {
      return RULES.profiles.find((p) => p.id === state.profileId) || RULES.profiles[0];
    }

    function selectedResolution() {
      const parts = (els.resolutionSelect.value || "1920x1080").split("x").map(Number);
      return { w: parts[0] || 1920, h: parts[1] || 1080 };
    }

    function selectedSensor() {
      return SENSOR_SIZES.find((sensor) => sensor.id === els.sensorSelect.value) || SENSOR_SIZES[1];
    }

    function feetDistanceWindow(profile, heightM) {
      const at = (deg) => heightM / Math.tan(toRad(deg));
      const feet = profile.feetAngleDeg;
      return {
        acceptableMin: at(feet.acceptable.max),
        acceptableMax: at(feet.acceptable.min),
        bestMin: at(feet.best.max),
        bestMax: at(feet.best.min)
      };
    }

    function judgedEntrance() {
      return state.entranceM === null ? undefined : state.entranceM;
    }

    // The solved distance or height puts the middle of the entrance on the target angle, wherever the camera sits sideways.
    function solvedDistance() {
      return solveDistance({ profile: currentProfile(), heightM: Number(els.heightInput.value), offsetM: state.offsetM }).distanceM;
    }

    function solvedHeight(distanceM) {
      return solveHeight({ profile: currentProfile(), distanceM: distanceM, offsetM: state.offsetM }).heightM;
    }

    function resolveSolved() {
      if (state.solveMode === "distance") setFieldValue(els.distanceInput, els.distanceRange, solvedDistance(), 2);
      if (state.solveMode === "height") setFieldValue(els.heightInput, els.heightRange, solvedHeight(Number(els.distanceInput.value)), 1);
    }

    // The sensor format only drives the view for cameras without a datasheet view; a fisheye has no zoom either.
    function syncOpticsControls(preset) {
      const fisheye = preset.lens === "fisheye";
      els.sensorField.hidden = fisheye || Boolean(preset.datasheetFov);
      els.focalField.hidden = fisheye;
    }

    // ---------- Placement from the engine ----------
    function currentPlacement() {
      const profile = currentProfile();
      const heightM = Number(els.heightInput.value);
      const distanceM = Number(els.distanceInput.value);
      const sensor = selectedSensor();
      const resolution = selectedResolution();
      const preset = presetFor(state.presetId);
      const camera = preset.lens === "fisheye"
        ? { lens: "fisheye", fovDeg: preset.fovDeg, resolution: resolution }
        : { sensorWidthMm: sensor.widthMm, focalLengthMm: Number(els.focalInput.value), resolution: resolution, datasheetFov: preset.datasheetFov };
      const result = evaluatePlacement({
        profile: profile,
        heightM: heightM,
        distanceM: distanceM,
        camera: camera,
        tiltDeg: state.tiltUserAdjusted ? Number(els.tiltInput.value) : undefined,
        entranceWidthM: judgedEntrance(),
        offsetM: state.offsetM
      });
      return { profile: profile, heightM: heightM, distanceM: distanceM, camera: camera, resolution: resolution, result: result };
    }

    function faceLineCopy(p) {
      const fl = p.result.faceLine;
      const vFov = p.result.optics.verticalFovDeg;
      if (fl.reason === "camera_below_face_point") return { visible: false, label: t("notVisible"), note: t("faceBelow", { face: fmt(p.profile.facePointM, 2) }) };
      if (fl.reason === "off_centre") return { visible: false, label: t("notVisible"), note: t("faceOffCentre") };
      if (fl.reason === "outside_frame") {
        if (p.result.optics.lens === "fisheye") return { visible: false, label: t("notVisible"), note: t("faceOutsideFisheye") };
        const lo = Math.max(0, p.result.feet.angleDeg - vFov / 2);
        const hi = Math.min(fl.angleDeg + vFov / 2, p.result.countingLine.headAngleDeg + vFov / 2);
        return {
          visible: false,
          label: t("notVisible"),
          note: lo <= hi ? t("faceOutsideTilt", { lo: fmt(lo, 1), hi: fmt(hi, 1) }) : t("faceOutsideNoTilt")
        };
      }
      if (fl.tooSmall) return { visible: true, tooSmall: true, label: t("tooSmall"), note: t("faceTooSmall", { ppm: fmt(fl.pixelsPerMetre, 0), min: p.profile.minPixelsPerMetre.face }) };
      if (fl.coincides) return { visible: true, label: t("visible"), note: t("faceSame") };
      const gap = fl.distanceM - p.distanceM;
      return { visible: true, label: t("visible"), note: t(gap > 0 ? "faceBeyond" : "faceInFront", { gap: fmt(Math.abs(gap), 2) }) };
    }

    function verdictCopy(p) {
      const r = p.result;
      if (!r.countingLine.framed) return t("cutOff");
      if (r.countingLine.window.judgedBy === null && state.solveMode !== "height") return t("noDistance");
      // In Height mode the measured line stays put; the answer is the mount height, shown before rounding too.
      if (state.solveMode === "height") return t("mountAt", { height: fmt(p.heightM, 1), exact: fmt(solvedHeight(p.distanceM), 2) });
      const delta = r.countingLine.recommendedDistanceM - p.distanceM;
      if (Math.abs(delta) < 0.01) return t("onTarget", { scene: sceneName(p.profile) });
      return t("moveLine", { delta: fmt(Math.abs(delta), 2), direction: t(delta > 0 ? "farther" : "closer"), target: fmt(r.countingLine.recommendedDistanceM, 2) });
    }

    // ---------- Controls ----------
    function populateScenes() {
      els.sceneSeg.innerHTML = RULES.profiles.map((p) => '<button type="button" data-scene="' + p.id + '" aria-pressed="false">' + sceneName(p) + '</button>').join("");
      els.sceneVersion.textContent = t("rulesVersion", { version: RULES.version });
    }

    function populatePresets() {
      els.presetSelect.innerHTML = CAMERA_CATALOG.cameras.map((c) => '<option value="' + c.id + '">' + c.name + '</option>').join("") +
        '<option value="custom">' + t("noPresetCustom") + '</option>';
      els.sensorSelect.innerHTML = SENSOR_SIZES.map((s) => '<option value="' + s.id + '">' + s.label + '</option>').join("");
    }

    function updateResolutionOptions(preset) {
      const previous = els.resolutionSelect.value;
      els.resolutionSelect.innerHTML = preset.resolutions.map((r) => '<option value="' + r.w + 'x' + r.h + '">' + r.label + '</option>').join("");
      const values = preset.resolutions.map((r) => r.w + "x" + r.h);
      els.resolutionSelect.value = values.includes(previous) ? previous : preset.defaultResolution;
    }

    function applyPreset(key) {
      state.presetId = key;
      const preset = presetFor(key);
      syncOpticsControls(preset);
      els.presetCaption.textContent = cameraCaption(key, preset);
      els.sensorField.classList.toggle("locked", preset.sensorLocked);
      els.sensorSelect.disabled = preset.sensorLocked;
      [els.focalInput, els.focalRange].forEach((el) => { el.min = preset.focalMinMm; el.max = preset.focalMaxMm; });
      els.focalMinTick.textContent = fmt(preset.focalMinMm, 1);
      els.focalMaxTick.textContent = fmt(preset.focalMaxMm, 1);
      els.sensorSelect.value = preset.sensorId;
      updateResolutionOptions(preset);
      els.resolutionSelect.value = preset.defaultResolution;
      setFieldValue(els.focalInput, els.focalRange, preset.focalDefaultMm, 1);
      update();
    }

    function setScene(id) {
      state.profileId = id;
      if (state.solveMode === "manual") setFieldValue(els.distanceInput, els.distanceRange, solvedDistance(), 2);
      resolveSolved();
      update();
    }

    function setSolveMode(mode) {
      state.solveMode = mode;
      document.querySelectorAll("[data-solve]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.solve === mode)));
      els.heightField.classList.toggle("driven", mode === "height");
      els.distanceField.classList.toggle("driven", mode === "distance");
      els.heightInput.disabled = els.heightRange.disabled = mode === "height";
      els.distanceInput.disabled = els.distanceRange.disabled = mode === "distance";
      resolveSolved();
      update();
    }

    function setHeight(value, typing) {
      if (state.solveMode === "height") return;
      const heightM = setFieldValue(els.heightInput, els.heightRange, value, 1, typing);
      if (state.solveMode === "distance") setFieldValue(els.distanceInput, els.distanceRange, solvedDistance(), 2);
      update();
    }

    function setDistance(value, typing) {
      if (state.solveMode === "distance") return;
      const distanceM = setFieldValue(els.distanceInput, els.distanceRange, value, 2, typing);
      if (state.solveMode === "height") setFieldValue(els.heightInput, els.heightRange, solvedHeight(distanceM), 1);
      update();
    }

    function setTilt(value, typing) {
      state.tiltUserAdjusted = true;
      setFieldValue(els.tiltInput, els.tiltRange, value, 1, typing);
      update();
    }

    function setEntrance(value) {
      const width = parseFloat(value);
      state.entranceM = value === "" || Number.isNaN(width) || width <= 0 ? null : width;
      update();
    }

    // Sideways from the entrance centre line, positive to the camera's right; snapped to the line when within 5 cm.
    function setOffset(value, typing) {
      const raw = Number(value);
      const snapped = Math.abs(raw) < 0.05 ? 0 : raw;
      state.offsetM = setFieldValue(els.offsetInput, els.offsetRange, snapped, 2, typing);
      resolveSolved();
      update();
    }

    function offsetCopy(p) {
      if (state.offsetM === 0) return t("offsetCentred");
      if (p.result.optics.lens === "fisheye") return t("offsetSideFisheye", { distance: fmt(Math.abs(state.offsetM), 2), side: t(state.offsetM > 0 ? "sideRight" : "sideLeft") });
      return t("offsetSide", { distance: fmt(Math.abs(state.offsetM), 2), side: t(state.offsetM > 0 ? "sideRight" : "sideLeft"), pan: fmt(p.result.pan.deg, 1) });
    }


    // The warning leads with which end and its angle, then what it means and what to do.
    function edgeParts(p, angleMarkup) {
      const edge = p.result.countingLine.edge;
      const side = t(edge.side === "right" ? "sideRightCap" : "sideLeftCap");
      const angle = fmt(edge.feetAngleDeg, 1) + " deg";
      return edge.framed
        ? { lead: t("edgeLead", { side: side, angle: angleMarkup(angle) }), body: t("edgeBody") }
        : { lead: t("edgeCutLead", { side: side }), body: t("edgeCutBody") };
    }

    // The card's notes share one reserved slot, most important first; "+N more" steps through the rest.
    // A band scale from lo to hi deg: zones drawn in order (later on top), band edges numbered, a tick at the reading.
    function renderBandBar(el, lo, hi, zones, value) {
      const at = (deg) => pct(deg, lo, hi).toFixed(2) + "%";
      const edges = [];
      zones.forEach((z) => { [z[0], z[1]].forEach((e) => { if (e > lo && e < hi && edges.indexOf(e) === -1) edges.push(e); }); });
      el.innerHTML = '<span class="track"></span>' +
        zones.map((z) => '<span class="zone ' + z[2] + '" style="left:' + at(z[0]) + ";width:calc(" + at(z[1]) + " - " + at(z[0]) + ')"></span>').join("") +
        edges.map((e) => '<span class="edge" style="left:' + at(e) + '">' + e + "</span>").join("") +
        (value === null || value === undefined ? "" : '<span class="tick" style="left:' + at(clamp(value, lo, hi)) + '"></span>');
    }

    function showNotes(candidates) {
      const notes = candidates.filter((c) => c[1]).map((c) => c[0]);
      const key = notes.map((el) => el.id).join(",");
      if (key !== state.notesKey) {
        state.notesKey = key;
        state.noteIndex = 0;
      }
      const shown = notes.length === 0 ? -1 : state.noteIndex % notes.length;
      candidates.forEach((c) => { c[0].hidden = notes.indexOf(c[0]) === -1 || notes.indexOf(c[0]) !== shown; });
      els.notesNone.hidden = notes.length > 0;
      els.notesMore.hidden = notes.length < 2;
      if (notes.length > 1) {
        els.notesMore.textContent = t("notesMore", { n: notes.length - 1 });
        els.notesMore.setAttribute("aria-label", t("notesMoreAria", { i: ((shown + 1) % notes.length) + 1, n: notes.length }));
      }
    }

    function edgeCopy(p) {
      if (p.result.countingLine.edge === null) return "";
      const parts = edgeParts(p, (angle) => angle);
      return parts.lead + " " + parts.body;
    }

    function edgeHtml(p) {
      if (p.result.countingLine.edge === null) return "";
      const parts = edgeParts(p, (angle) => '<span class="mono-chip">' + angle + "</span>");
      return SHEET_ICON.warn + "<span><b>" + parts.lead + "</b> " + parts.body + "</span>";
    }

    function entranceCopy(entrance, coverageWidthM) {
      const vars = { width: fmt(entrance.widthM, 2), covered: widthText(coverageWidthM), miss: fmt(entrance.uncoveredM, 2) };
      if (entrance.status === "too_wide") return t("entranceTooWide", vars);
      if (entrance.status === "tight") return t("entranceTight", vars);
      return t("entranceCovered", vars);
    }

    function syncDistanceBounds(p) {
      const needed = Math.max(p.result.countingLine.recommendedDistanceM, p.distanceM, p.result.faceLine.distanceM || 0);
      const maxDistance = Math.max(RULE.maxDistanceM, Math.ceil(needed + 2));
      els.distanceRange.max = String(maxDistance);
      els.distanceInput.max = String(maxDistance);
      els.distanceMaxTick.textContent = fmt(maxDistance, 2);
    }

    // ---------- Readouts ----------
    function updateStatusElement(element, status, label) {
      element.textContent = label;
      element.className = "status-chip " + status;
    }

    // Counting line distances that keep every walkable point Best or Acceptable; missing when no distance does.
    function countingWindow(p) {
      const w = p.result.countingLine.window;
      return {
        acceptableMin: w.acceptable ? w.acceptable.minM : NaN, acceptableMax: w.acceptable ? w.acceptable.maxM : NaN,
        bestMin: w.best ? w.best.minM : NaN, bestMax: w.best ? w.best.maxM : NaN
      };
    }

    function updateRangeBar(p) {
      const win = countingWindow(p);
      const rec = p.result.countingLine.recommendedDistanceM;
      const known = [win.acceptableMin, win.acceptableMax, win.bestMin, win.bestMax, p.distanceM, rec].filter(Number.isFinite);
      const domainMin = Math.max(0, Math.min.apply(null, known) - 1);
      const domainMax = Math.max.apply(null, known) + 1;
      els.acceptableZone.hidden = els.minMarker.hidden = els.maxMarker.hidden = !Number.isFinite(win.acceptableMin);
      els.bestZone.hidden = !Number.isFinite(win.bestMin);
      const setZone = (el, min, max) => {
        el.style.left = pct(min, domainMin, domainMax).toFixed(2) + "%";
        el.style.width = Math.max(0, pct(max, domainMin, domainMax) - pct(min, domainMin, domainMax)).toFixed(2) + "%";
      };
      const setMarker = (el, label, value) => {
        el.style.left = pct(value, domainMin, domainMax).toFixed(2) + "%";
        label.textContent = fmt(value, 2) + " m";
      };
      if (Number.isFinite(win.acceptableMin)) {
        setZone(els.acceptableZone, win.acceptableMin, win.acceptableMax);
        setMarker(els.minMarker, els.minMarkerLabel, win.acceptableMin);
        setMarker(els.maxMarker, els.maxMarkerLabel, win.acceptableMax);
      }
      if (Number.isFinite(win.bestMin)) setZone(els.bestZone, win.bestMin, win.bestMax);
      setMarker(els.bestMarker, els.bestMarkerLabel, rec);
      els.distanceCursor.style.left = pct(p.distanceM, domainMin, domainMax).toFixed(2) + "%";
      els.cursorLabel.textContent = fmt(p.distanceM, 2) + " m";
    }

    function updateMetrics(p, verticalPpm) {
      const o = p.result.optics;
      const fl = p.result.faceLine;
      els.countingMetric.innerHTML = fmt(p.distanceM, 2) + "<small>m</small>";
      els.faceLineMetric.innerHTML = fl.distanceM === null ? t("none") : fmt(fl.distanceM, 2) + "<small>m</small>";
      els.horizontalFovMetric.innerHTML = fmt(o.horizontalFovDeg, 2) + "<small>deg</small>";
      els.verticalFovMetric.innerHTML = fmt(o.verticalFovDeg, 2) + "<small>deg</small>";
      els.fullWidthMetric.innerHTML = widthText(o.coverageWidthM) + "<small>m</small>";
      els.effectiveWidthMetric.innerHTML = widthText(o.effectiveWidthM) + "<small>m</small>";
      els.horizontalPpmMetric.innerHTML = fmt(o.pixelsPerMetre, 0) + "<small>px/m</small>";
      els.verticalPpmMetric.innerHTML = fmt(verticalPpm, 0) + "<small>px/m</small>";
    }

    // ---------- Canvas ----------
    function colorWithAlpha(color, alpha) {
      return color.replace(")", " / " + alpha + ")");
    }

    function fitCanvas(canvas) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      const scale = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(rect.width * scale);
      canvas.height = Math.round(rect.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      return { ctx: ctx, w: rect.width, h: rect.height };
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

    function drawPerson(ctx, x, groundY, yForHeight, color, profile, withLabels) {
      const headY = yForHeight(profile.humanHeightM);
      const faceY = yForHeight(profile.facePointM);
      const hipY = yForHeight(profile.humanHeightM * 0.56);
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
      ctx.moveTo(x, hipY);
      ctx.lineTo(x - 7, groundY);
      ctx.moveTo(x, hipY);
      ctx.lineTo(x + 7, groundY);
      ctx.moveTo(x, headY + 12);
      ctx.lineTo(x - 8, hipY - 8);
      ctx.moveTo(x, headY + 12);
      ctx.lineTo(x + 8, hipY - 8);
      ctx.stroke();
      if (!withLabels) return;
      ctx.fillStyle = COL.muted;
      ctx.font = "11px JetBrains Mono, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(fmt(profile.humanHeightM, 1) + " " + t("canvasHead"), x + 12, headY - 6);
      ctx.fillText(fmt(profile.facePointM, 1) + " " + t("canvasFace"), x + 12, faceY);
    }

    // A label on a small plate in the panel colour, for text that sits where rays and figures cross.
    function plateText(ctx, text, x, y) {
      // ctx.font reads like "700 12px Inter, ..."; the number before "px" is the size.
      const size = parseFloat(ctx.font.split("px")[0].split(" ").pop()) || 12;
      const width = ctx.measureText(text).width;
      const left = ctx.textAlign === "right" ? x - width : ctx.textAlign === "center" ? x - width / 2 : x;
      const top = ctx.textBaseline === "bottom" ? y - size * 1.15 : ctx.textBaseline === "middle" ? y - size * 0.62 : y - size * 0.1;
      const fill = ctx.fillStyle;
      ctx.fillStyle = colorWithAlpha(COL.surface, "0.9");
      roundRect(ctx, left - 4, top - 2, width + 8, size * 1.25 + 4, 4);
      ctx.fill();
      ctx.fillStyle = fill;
      ctx.fillText(text, x, y);
    }

    // A thin outline in the panel colour keeps diagram labels readable where they cross rays and figures.
    function haloText(ctx, text, x, y) {
      ctx.save();
      ctx.lineWidth = 3.5;
      ctx.lineJoin = "round";
      ctx.strokeStyle = COL.surface;
      ctx.strokeText(text, x, y);
      ctx.restore();
      ctx.fillText(text, x, y);
    }

    function drawSide(p) {
      const fit = fitCanvas(els.sideCanvas);
      if (!fit) return;
      const ctx = fit.ctx, w = fit.w, h = fit.h;
      ctx.clearRect(0, 0, w, h);
      const r = p.result, profile = p.profile, heightM = p.heightM;
      const line = r.countingLine;
      // The camera's own vertical plane, from below it to the middle of the entrance; off-centre that is farther than the line.
      const slice = line.points.aim;
      const distanceM = slice.floorDistanceM;
      const fl = r.faceLine;
      const faceReach = fl.distanceM === null ? null : Math.hypot(line.offsetM, fl.distanceM);
      const padL = 60, padR = 70, padB = 58, padT = 40;
      const groundY = h - padB;
      const win = feetDistanceWindow(profile, heightM);
      const maxX = Math.max(distanceM * 1.25, win.acceptableMax * 1.15, (faceReach || 0) * 1.12, 6);
      const maxY = Math.max(heightM * 1.25, profile.humanHeightM, 4);
      const sx = (w - padL - padR) / maxX;
      const sy = (groundY - padT) / maxY;
      const xFor = (m) => padL + m * sx;
      const yFor = (m) => groundY - m * sy;
      const camX = xFor(0), camY = yFor(heightM), subX = xFor(distanceM);
      state.sideGeom = { padL: padL, sx: sx, groundY: groundY, top: yFor(profile.humanHeightM) - 24, subX: subX, lateral: Math.abs(slice.xM - line.offsetM) };
      const feetColor = slice.status === "best" ? COL.best : slice.status === "acceptable" ? COL.ok : COL.bad;
      const personColor = slice.framed ? feetColor : COL.bad;

      ctx.strokeStyle = COL.grid;
      ctx.lineWidth = 1;
      ctx.font = "11px JetBrains Mono, monospace";
      ctx.fillStyle = COL.faint;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const step = maxX > 24 ? 4 : 2;
      for (let gx = 0; gx <= maxX; gx += step) {
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
      ctx.font = "11px JetBrains Mono, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(fmt(heightM, 1, " m"), 0, 0);
      ctx.restore();

      const tilt = r.tilt.value;
      const aimDown = toRad(clamp(tilt, RULE.minTiltAngleDeg, RULE.maxTiltAngleDeg));
      const half = toRad(r.optics.verticalFovDeg / 2);
      const ray = (angle) => {
        const slope = Math.tan(angle);
        const candidates = [];
        const push = (x, y) => {
          if (Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= maxX && y >= 0 && y <= maxY) candidates.push({ x: x, y: y });
        };
        push(maxX, heightM - slope * maxX);
        if (slope > 0.0001) push(heightM / slope, 0);
        if (slope < -0.0001) push((heightM - maxY) / slope, maxY);
        const end = candidates.sort((a, b) => a.x - b.x)[0] || { x: maxX, y: clamp(heightM - slope * maxX, 0, maxY) };
        return { x: xFor(end.x), y: yFor(end.y) };
      };
      // The rule as wedges: feet that land inside the green sector are Best.
      const wedge = (nearDeg, farDeg, fill, edge) => {
        const near = xFor(clamp(heightM / Math.tan(toRad(nearDeg)), 0, maxX));
        const far = xFor(clamp(heightM / Math.tan(toRad(farDeg)), 0, maxX));
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.moveTo(camX, camY);
        ctx.lineTo(near, groundY);
        ctx.lineTo(far, groundY);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = edge;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(camX, camY);
        ctx.lineTo(near, groundY);
        ctx.moveTo(camX, camY);
        ctx.lineTo(far, groundY);
        ctx.stroke();
      };
      const feetBands = profile.feetAngleDeg;
      if (feetBands.acceptable.max > feetBands.best.max) wedge(feetBands.acceptable.max, feetBands.best.max, colorWithAlpha(COL.ok, "0.10"), colorWithAlpha(COL.ok, "0.35"));
      if (feetBands.best.min > feetBands.acceptable.min) wedge(feetBands.best.min, feetBands.acceptable.min, colorWithAlpha(COL.ok, "0.10"), colorWithAlpha(COL.ok, "0.35"));
      wedge(feetBands.best.max, feetBands.best.min, colorWithAlpha(COL.best, "0.16"), colorWithAlpha(COL.best, "0.55"));

      const upper = ray(aimDown - half), center = ray(aimDown), lower = ray(aimDown + half);
      ctx.strokeStyle = colorWithAlpha(COL.accent, "0.70");
      ctx.lineWidth = 1.25;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(camX, camY);
      ctx.lineTo(upper.x, upper.y);
      if (r.optics.lens !== "fisheye") {
        ctx.moveTo(camX, camY);
        ctx.lineTo(lower.x, lower.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = colorWithAlpha(COL.accent, "0.55");
      ctx.lineWidth = 1.5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(camX, camY);
      ctx.lineTo(center.x, center.y);
      ctx.stroke();

      const bandSegment = (start, end, color, width) => {
        const x1 = xFor(Math.max(0, start)), x2 = xFor(Math.min(maxX, end));
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
      bandSegment(win.acceptableMin, win.acceptableMax, colorWithAlpha(COL.ok, "0.55"), 5);
      bandSegment(win.bestMin, win.bestMax, COL.best, 6);

      const faceLineX = faceReach === null ? null : xFor(faceReach);
      const crowded = faceLineX !== null && !fl.coincides && Math.abs(faceLineX - subX) < 110;
      // When the lines are close, each title grows away from the other instead of centring over its figure.
      const faceRight = faceLineX !== null && faceLineX > subX;
      const nearlyTouching = crowded && Math.abs(faceLineX - subX) < 40;
      // Face line: its own person, where the face angle is best.
      if (faceLineX !== null) {
        const faceX = faceLineX;
        const faceY = yFor(profile.facePointM);
        ctx.globalAlpha = fl.visible ? 1 : 0.45;
        ctx.strokeStyle = COL.face;
        ctx.lineWidth = 2;
        ctx.setLineDash(fl.visible ? [7, 4] : [2, 5]);
        ctx.beginPath();
        ctx.moveTo(camX, camY);
        ctx.lineTo(faceX, faceY);
        ctx.stroke();
        ctx.setLineDash([]);
        if (!fl.coincides) {
          ctx.strokeStyle = COL.face;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(faceX - 9, groundY);
          ctx.lineTo(faceX + 9, groundY);
          ctx.stroke();
          // Within a hand's width of the counting line the face figure steps back, so the two do not blur together.
          ctx.globalAlpha = nearlyTouching ? 0.3 : fl.visible ? 0.75 : 0.35;
          drawPerson(ctx, faceX, groundY, yFor, COL.face, profile, false);
          ctx.globalAlpha = 1;
          ctx.fillStyle = COL.face;
          ctx.font = "700 12px Inter, 'Noto Sans Thai', sans-serif";
          ctx.textAlign = crowded ? (faceRight ? "left" : "right") : "center";
          ctx.textBaseline = "bottom";
          plateText(ctx, t("faceLine"), crowded ? faceX + (faceRight ? -6 : 6) : faceX, Math.max(22, yFor(profile.humanHeightM) - (nearlyTouching ? 30 : 14)));
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = COL.face;
        ctx.font = "700 12px Inter, 'Noto Sans Thai', sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        plateText(ctx, t("canvasFaceAngle", { angle: fmt(fl.angleDeg, 1) }), faceX + 12, faceY);
      }

      ctx.strokeStyle = feetColor;
      ctx.lineWidth = 2.25;
      ctx.setLineDash([7, 4]);
      ctx.beginPath();
      ctx.moveTo(camX, camY);
      ctx.lineTo(subX, groundY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = "700 12px Inter, 'Noto Sans Thai', sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = feetColor;
      plateText(ctx, t("canvasFeetAngle", { angle: fmt(slice.feetAngleDeg, 1) }), subX - 12, groundY - 6);

      // When the face line is the counting line, its face angle label already sits at the face point.
      drawPerson(ctx, subX, groundY, yFor, personColor, profile, !crowded && !(fl.distanceM !== null && fl.coincides));

      const aimHeightM = heightM - Math.tan(aimDown) * distanceM;
      if (aimHeightM >= 0 && aimHeightM <= maxY) {
        const aimY = yFor(aimHeightM);
        ctx.fillStyle = COL.accent;
        ctx.beginPath();
        ctx.arc(subX, aimY, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = "600 12px Inter, 'Noto Sans Thai', sans-serif";
        // The aim label sits on the side away from a close face line.
        const aimLeft = crowded && faceRight;
        ctx.textAlign = aimLeft ? "right" : "left";
        plateText(ctx, t("canvasAim", { height: fmt(aimHeightM, 2) }), subX + (aimLeft ? -10 : 10), aimY - 8);
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
      // Off-centre the drawing runs to the middle of the entrance, which is farther than the counting line.
      const floorText = Math.abs(distanceM - p.distanceM) < 0.005 ? fmt(distanceM, 2, " m") : t("alongFloor", { distance: fmt(distanceM, 2) });
      const floorHalf = ctx.measureText(floorText).width / 2 + 4;
      haloText(ctx, floorText, clamp((camX + subX) / 2, floorHalf, w - floorHalf), groundY + 34);

      ctx.font = "700 13px Inter, 'Noto Sans Thai', sans-serif";
      ctx.textBaseline = "bottom";
      haloText(ctx, t("canvasCamera"), camX, Math.max(22, camY - 14));
      ctx.fillStyle = personColor;
      ctx.textAlign = crowded ? (faceRight ? "right" : "left") : "center";
      plateText(ctx, t("countingLine"), crowded ? subX + (faceRight ? 6 : -6) : subX, Math.max(22, yFor(profile.humanHeightM) - 14));
    }

    // Plan of the entrance: the counting line coloured by the feet angle at each point, the judged points, the camera
    // where it sits (drag it), its view and the two distances that place it.
    function drawTop(p) {
      const fit = fitCanvas(els.topCanvas);
      if (!fit) return;
      const ctx = fit.ctx, w = fit.w, h = fit.h;
      ctx.clearRect(0, 0, w, h);
      const r = p.result, o = r.optics, line = r.countingLine;
      const fisheye = o.lens === "fisheye";
      const offset = state.offsetM, d = p.distanceM;
      const entranceHalf = r.entrance === null ? null : r.entrance.widthM / 2;
      const shownHalf = entranceHalf === null ? 2.5 : entranceHalf;
      const faceD = r.faceLine.distanceM !== null && !r.faceLine.coincides ? r.faceLine.distanceM : null;

      // Fit the entrance, the camera and a margin; the entrance sits near the top, the camera below it.
      const xSpan = Math.max(shownHalf + 1.6, Math.abs(offset) + 1.4);
      const yMin = Math.min(-1.6, faceD !== null ? d - faceD - 0.8 : -1.6);
      const yMax = d + 1.9;
      const pad = 26, padB = 34;
      // While the camera is dragged the plan holds still under the pointer; it re-fits once the camera is let go.
      const frozen = state.planDragging ? state.planFrozen : null;
      const scale = frozen ? frozen.scale : Math.min((w - 2 * pad) / (2 * xSpan), (h - pad - padB) / (yMax - yMin));
      const ox = frozen ? frozen.ox : w / 2;
      const oy = frozen ? frozen.oy : pad - yMin * scale;
      const S = (x, y) => [ox + x * scale, oy + y * scale];
      state.planView = { ox: ox, oy: oy, scale: scale };

      // A one-metre grid.
      ctx.strokeStyle = colorWithAlpha(COL.grid, "0.55");
      ctx.lineWidth = 1;
      for (let gx = -Math.ceil(w / scale); gx <= Math.ceil(w / scale); gx += 1) {
        const x = ox + gx * scale;
        if (x < 0 || x > w) continue;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let gy = Math.floor(yMin) - 1; gy <= Math.ceil(yMax) + 1; gy += 1) {
        const y = oy + gy * scale;
        if (y < 0 || y > h) continue;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }

      // Walls: the door frames beyond the line for an open door, the side walls of a corridor.
      if (entranceHalf !== null) {
        ctx.fillStyle = colorWithAlpha(COL.muted, "0.45");
        if (p.profile.id === "corridor") {
          const top = S(0, yMin - 1)[1], bottom = S(0, yMax + 1)[1];
          ctx.fillRect(S(-entranceHalf, 0)[0] - 0.16 * scale, top, 0.16 * scale, bottom - top);
          ctx.fillRect(S(entranceHalf, 0)[0], top, 0.16 * scale, bottom - top);
        } else {
          const wallY = S(0, -0.35)[1] - 0.16 * scale;
          ctx.fillRect(0, wallY, S(-entranceHalf, 0)[0], 0.16 * scale);
          ctx.fillRect(S(entranceHalf, 0)[0], wallY, w, 0.16 * scale);
        }
      }

      const cam = S(offset, d);
      const aimAngle = Math.atan2(-d, -offset);
      const farRay = 4 * (w + h);
      // A view edge: through where it meets the counting line, or, if it never does, at the view's angle.
      const edge = (xOnLine, sign, share) => {
        if (Number.isFinite(xOnLine)) {
          const target = S(xOnLine, 0);
          const a = Math.atan2(target[1] - cam[1], target[0] - cam[0]);
          return [cam[0] + Math.cos(a) * farRay, cam[1] + Math.sin(a) * farRay];
        }
        const a = aimAngle + sign * Math.atan(share * Math.tan(toRad(o.horizontalFovDeg / 2)));
        return [cam[0] + Math.cos(a) * farRay, cam[1] + Math.sin(a) * farRay];
      };
      if (fisheye) {
        const radius = p.heightM * Math.tan(toRad((o.horizontalFovDeg / 2) * 0.8)) * scale;
        ctx.fillStyle = colorWithAlpha(COL.accent, "0.08");
        ctx.beginPath(); ctx.arc(cam[0], cam[1], radius, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = colorWithAlpha(COL.best, "0.75");
        ctx.setLineDash([6, 5]); ctx.lineWidth = 1.25; ctx.stroke(); ctx.setLineDash([]);
      } else {
        const left = edge(o.inView.leftM, 1, 1), right = edge(o.inView.rightM, -1, 1);
        ctx.fillStyle = colorWithAlpha(COL.accent, "0.08");
        ctx.beginPath(); ctx.moveTo(cam[0], cam[1]); ctx.lineTo(left[0], left[1]); ctx.lineTo(right[0], right[1]); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = colorWithAlpha(COL.accent, "0.5");
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(left[0], left[1]); ctx.lineTo(cam[0], cam[1]); ctx.lineTo(right[0], right[1]); ctx.stroke();
        const effLeft = edge(o.inEffective.leftM, 1, 0.8), effRight = edge(o.inEffective.rightM, -1, 0.8);
        ctx.strokeStyle = colorWithAlpha(COL.best, "0.7");
        ctx.setLineDash([6, 5]);
        ctx.beginPath(); ctx.moveTo(effLeft[0], effLeft[1]); ctx.lineTo(cam[0], cam[1]); ctx.lineTo(effRight[0], effRight[1]); ctx.stroke();
        ctx.setLineDash([]);
      }

      // Entrance centre line.
      ctx.strokeStyle = colorWithAlpha(COL.ink, "0.28");
      ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.moveTo(ox, 0); ctx.lineTo(ox, h); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COL.faint;
      ctx.font = "600 11px Inter, 'Noto Sans Thai', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      haloText(ctx, t("planCentreLine"), ox, 6);

      // Face line, dashed, along the same stretch.
      if (faceD !== null) {
        const fy = S(0, d - faceD)[1];
        ctx.strokeStyle = colorWithAlpha(COL.face, r.faceLine.visible ? "0.9" : "0.4");
        ctx.lineWidth = 2;
        ctx.setLineDash([7, 5]);
        ctx.beginPath(); ctx.moveTo(S(-shownHalf, 0)[0], fy); ctx.lineTo(S(shownHalf, 0)[0], fy); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = COL.face;
        ctx.font = "600 11.5px Inter, 'Noto Sans Thai', sans-serif";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        haloText(ctx, t("faceLineLower"), Math.max(ctx.measureText(t("faceLineLower")).width + 6, S(-shownHalf, 0)[0] - 8), fy);
      }

      // The counting line, coloured by the feet angle at each point; dimmed outside the walkable width.
      const steps = 90;
      const statusColor = { best: COL.best, acceptable: COL.ok, out_of_range: COL.bad };
      const walk = line.walkable;
      const hasEnds = line.walkable.leftM !== line.walkable.rightM;
      ctx.lineWidth = 5;
      ctx.lineCap = "butt";
      for (let i = 0; i < steps; i += 1) {
        const xa = -shownHalf + (i / steps) * 2 * shownHalf, xb = -shownHalf + ((i + 1) / steps) * 2 * shownHalf;
        const mid = (xa + xb) / 2;
        const status = judgeFeet(feetAngle(p.heightM, Math.hypot(mid - offset, d)), p.profile);
        const inside = !hasEnds || (mid >= walk.leftM - 1e-6 && mid <= walk.rightM + 1e-6);
        ctx.strokeStyle = statusColor[status];
        ctx.globalAlpha = inside ? 1 : 0.35;
        ctx.beginPath(); ctx.moveTo(S(xa, 0)[0], S(0, 0)[1]); ctx.lineTo(S(xb, 0)[0], S(0, 0)[1]); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = COL.ink;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = "600 11.5px Inter, 'Noto Sans Thai', sans-serif";
      haloText(ctx, t("countingLineLower"), S(shownHalf, 0)[0] + 8, S(0, 0)[1]);
      if (hasEnds) {
        ctx.strokeStyle = COL.ink;
        ctx.lineWidth = 1.5;
        [walk.leftM, walk.rightM].forEach((x) => {
          const q = S(x, 0);
          ctx.beginPath(); ctx.moveTo(q[0], q[1] - 9); ctx.lineTo(q[0], q[1] + 9); ctx.stroke();
        });
      }
      if (entranceHalf !== null) {
        const entryColor = r.entrance.status === "covered" ? COL.best : r.entrance.status === "tight" ? COL.ok : COL.bad;
        ctx.fillStyle = entryColor;
        ctx.font = "600 11px Inter, 'Noto Sans Thai', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const entranceX = Math.abs(offset) < 0.05 || fisheye ? ox : S((offset < 0 ? 1 : -1) * entranceHalf / 2, 0)[0];
        haloText(ctx, t("entranceLabel") + " " + fmt(r.entrance.widthM, 1, " m"), entranceX, S(0, 0)[1] + 12);
      }

      // Aim line from the camera to the middle of the entrance.
      if (!fisheye) {
        ctx.strokeStyle = colorWithAlpha(COL.accent, "0.8");
        ctx.setLineDash([3, 4]);
        ctx.lineWidth = 1.2;
        const aim = S(0, 0);
        ctx.beginPath(); ctx.moveTo(cam[0], cam[1]); ctx.lineTo(aim[0], aim[1]); ctx.stroke();
        ctx.setLineDash([]);
        // How far the camera turns: the angle at the middle of the entrance between the centre line and the aim line.
        if (Math.abs(offset) >= 0.05) {
          const along = Math.PI / 2;
          const toCamera = Math.atan2(cam[1] - aim[1], cam[0] - aim[0]);
          const radius = 34;
          ctx.strokeStyle = COL.accent;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(aim[0], aim[1], radius, Math.min(along, toCamera), Math.max(along, toCamera));
          ctx.stroke();
          const middle = (along + toCamera) / 2;
          ctx.font = "700 12px JetBrains Mono, monospace";
          ctx.fillStyle = COL.accent;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          plateText(ctx, fmt(r.pan.deg, 1) + "°", aim[0] + Math.cos(middle) * (radius + 18), aim[1] + Math.sin(middle) * (radius + 18));
        }
      }

      // The aim point, which the verdict is judged at, and the walkable ends; an end that warns is ringed.
      const keys = hasEnds ? ["aim", "near", "far"] : ["aim"];
      const placed = [];
      const labelled = [];
      keys.forEach((key) => {
        const pt = line.points[key];
        const q = S(pt.xM, 0);
        if (placed.some((x) => Math.abs(x - q[0]) < 4)) return;
        placed.push(q[0]);
        const isAim = key === "aim";
        const warned = line.edge !== null && !isAim && Math.abs(pt.xM - line.edge.xM) < 1e-9;
        ctx.beginPath();
        ctx.arc(q[0], q[1], isAim ? 7 : 5, 0, Math.PI * 2);
        ctx.fillStyle = statusColor[pt.status];
        ctx.fill();
        ctx.strokeStyle = COL.surface;
        ctx.lineWidth = 2;
        ctx.stroke();
        if (warned) {
          ctx.beginPath();
          ctx.arc(q[0], q[1], 10, 0, Math.PI * 2);
          ctx.strokeStyle = COL.bad;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        // Angles sit above the strip on short leaders; a second row takes any label that would touch its neighbour.
        const text = fmt(pt.feetAngleDeg, 1) + "°";
        ctx.font = "700 12px JetBrains Mono, monospace";
        const half = ctx.measureText(text).width / 2 + 4;
        const row = labelled.some((l) => l.row === 0 && Math.abs(l.x - q[0]) < l.half + half) ? 1 : 0;
        labelled.push({ x: q[0], half: half, row: row });
        const labelY = q[1] - 18 - row * 17;
        ctx.strokeStyle = colorWithAlpha(statusColor[pt.status], "0.7");
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(q[0], q[1] - (isAim ? 8 : 6)); ctx.lineTo(q[0], labelY + 1); ctx.stroke();
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillStyle = statusColor[pt.status];
        plateText(ctx, text, clamp(q[0], half, w - half), labelY);
      });

      // Dimensions: straight back to the counting line, and sideways to the centre line.
      const dimension = (a, b, label, beside) => {
        ctx.strokeStyle = COL.ink;
        ctx.fillStyle = COL.ink;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        [[a, 1], [b, -1]].forEach((end) => {
          const q = end[0], dir = end[1];
          ctx.beginPath();
          ctx.moveTo(q[0], q[1]); ctx.lineTo(q[0] + dir * 7 * Math.cos(ang - 0.4), q[1] + dir * 7 * Math.sin(ang - 0.4));
          ctx.moveTo(q[0], q[1]); ctx.lineTo(q[0] + dir * 7 * Math.cos(ang + 0.4), q[1] + dir * 7 * Math.sin(ang + 0.4));
          ctx.stroke();
        });
        ctx.font = "700 11.5px JetBrains Mono, monospace";
        const tw = ctx.measureText(label).width + 12;
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        let bx = beside ? mx + 8 : mx - tw / 2;
        if (beside && bx + tw > w - 4) bx = mx - tw - 8;
        bx = clamp(bx, 4, w - tw - 4);
        const by = beside ? my - 10 : my + 5;
        ctx.fillStyle = colorWithAlpha(COL.surface, "0.92");
        ctx.fillRect(bx, by, tw, 20);
        ctx.strokeStyle = colorWithAlpha(COL.ink, "0.3");
        ctx.strokeRect(bx + 0.5, by + 0.5, tw - 1, 19);
        ctx.fillStyle = COL.ink;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(label, bx + 6, by + 10.5);
      };
      const onLine = S(offset, 0);
      dimension([cam[0], cam[1] - 14], [onLine[0], onLine[1] + 5], t("planToLine", { distance: fmt(d, 2) }), true);
      const sideways = Math.abs(offset) >= 0.05;
      if (sideways) {
        const yDim = cam[1] + 24;
        ctx.strokeStyle = colorWithAlpha(COL.ink, "0.35");
        ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(cam[0], cam[1] + 12); ctx.lineTo(cam[0], yDim + 4); ctx.stroke();
        ctx.setLineDash([]);
        dimension([ox, yDim], [cam[0], yDim], t(offset > 0 ? "planRight" : "planLeft", { distance: fmt(Math.abs(offset), 2) }), false);
      }

      // The camera, turned toward the aim point, inside a ring that shows it can be dragged.
      ctx.save();
      ctx.translate(cam[0], cam[1]);
      ctx.rotate(fisheye ? 0 : aimAngle + Math.PI / 2);
      ctx.fillStyle = COL.accent;
      ctx.strokeStyle = COL.surface;
      ctx.lineWidth = 2;
      if (fisheye) {
        ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      } else {
        roundRect(ctx, -11, -8, 22, 16, 4); ctx.fill(); ctx.stroke();
        ctx.fillStyle = COL.surface;
        ctx.fillRect(-4, -13, 8, 6);
      }
      ctx.restore();
      ctx.beginPath();
      ctx.arc(cam[0], cam[1], 20, 0, Math.PI * 2);
      ctx.strokeStyle = colorWithAlpha(COL.accent, state.planDragging ? "0.95" : "0.4");
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = COL.muted;
      ctx.font = "600 11px Inter, 'Noto Sans Thai', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      haloText(ctx, t("planCamera", { height: fmt(p.heightM, 1) }), cam[0], cam[1] + (sideways ? 52 : 26));

      ctx.fillStyle = COL.faint;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.font = "600 11px Inter, 'Noto Sans Thai', sans-serif";
      const hint = t(state.solveMode === "distance" ? "planDragSideways" : "planDragAnywhere");
      const width = fisheye ? t("planEffectiveOnly", { effective: widthText(o.effectiveWidthM) }) : t("planWidths", { width: widthText(o.coverageWidthM), effective: widthText(o.effectiveWidthM) });
      haloText(ctx, width, 8, h - 24);
      haloText(ctx, hint, 8, h - 8);
    }

    // Dragging the camera on the plan moves it sideways, and nearer or farther unless the distance is solved.
    function planPoint(event) {
      const rect = els.topCanvas.getBoundingClientRect();
      return [event.clientX - rect.left, event.clientY - rect.top];
    }

    function onCameraHandle(point) {
      const view = state.planView;
      if (!view || state.topView !== "top") return false;
      const cx = view.ox + state.offsetM * view.scale, cy = view.oy + Number(els.distanceInput.value) * view.scale;
      return Math.hypot(point[0] - cx, point[1] - cy) <= 28;
    }

    function dragCamera(point) {
      const view = state.planView;
      const x = (point[0] - view.ox) / view.scale;
      const limit = Number(els.offsetInput.max);
      state.offsetM = setFieldValue(els.offsetInput, els.offsetRange, Math.abs(x) < 0.12 ? 0 : clamp(Math.round(x * 20) / 20, -limit, limit), 2);
      if (state.solveMode !== "distance") {
        const y = (point[1] - view.oy) / view.scale;
        const distanceM = setFieldValue(els.distanceInput, els.distanceRange, Math.round(y * 100) / 100, 2);
        if (state.solveMode === "height") setFieldValue(els.heightInput, els.heightRange, solvedHeight(distanceM), 1);
      }
      resolveSolved();
      update();
    }

    els.topCanvas.addEventListener("pointerdown", (event) => {
      const point = planPoint(event);
      if (!onCameraHandle(point)) return;
      state.planDragging = true;
      state.planFrozen = { ox: state.planView.ox, oy: state.planView.oy, scale: state.planView.scale };
      els.topCanvas.classList.add("dragging");
      els.topCanvas.setPointerCapture(event.pointerId);
    });
    els.topCanvas.addEventListener("pointermove", (event) => {
      const point = planPoint(event);
      if (state.planDragging) { dragCamera(point); return; }
      els.topCanvas.classList.toggle("grab", onCameraHandle(point));
    });
    const endPlanDrag = () => {
      if (!state.planDragging) return;
      state.planDragging = false;
      state.planFrozen = null;
      els.topCanvas.classList.remove("dragging");
      update();
    };
    els.topCanvas.addEventListener("pointerup", endPlanDrag);
    els.topCanvas.addEventListener("pointercancel", endPlanDrag);
    // A touch on the camera drags it instead of scrolling the page; anywhere else still scrolls.
    els.topCanvas.addEventListener("touchstart", (event) => {
      const touch = event.touches[0];
      const rect = els.topCanvas.getBoundingClientRect();
      if (touch && onCameraHandle([touch.clientX - rect.left, touch.clientY - rect.top])) event.preventDefault();
    }, { passive: false });

    // What the camera sees: the frame at the current tilt, with both lines and a person on each.
    function drawCameraView(p) {
      if (p.result.optics.lens === "fisheye") { drawCameraFisheye(p); return; }
      const fit = fitCanvas(els.topCanvas);
      if (!fit) return;
      const ctx = fit.ctx, w = fit.w, h = fit.h;
      ctx.clearRect(0, 0, w, h);
      const r = p.result, profile = p.profile, heightM = p.heightM;
      const aspect = p.resolution.h / p.resolution.w;
      const fw = Math.min(w - 32, (h - 70) / aspect), fh = fw * aspect;
      const fx = (w - fw) / 2, fy = 30;
      const tilt = r.tilt.value, v = r.optics.verticalFovDeg, hf = r.optics.horizontalFovDeg;
      const yAt = (deg) => fy + fh * (0.5 + Math.tan(toRad(deg - tilt)) / (2 * Math.tan(toRad(v / 2))));
      const pxPerM = (dist) => fw / (2 * Math.hypot(heightM, dist) * Math.tan(toRad(hf / 2)));
      ctx.save();
      roundRect(ctx, fx, fy, fw, fh, 10);
      ctx.fillStyle = COL.surface2;
      ctx.fill();
      ctx.clip();
      const horizon = yAt(0);
      ctx.fillStyle = colorWithAlpha(COL.muted, "0.10");
      ctx.fillRect(fx, Math.max(fy, horizon), fw, fh);
      ctx.font = "11px JetBrains Mono, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      const far = Math.ceil(Math.max(p.distanceM, r.faceLine.distanceM || 0) * 2.5);
      let lastLabelY = Infinity;
      for (let m = 1; m <= far; m += 1) {
        const ly = yAt(feetAngle(heightM, m));
        if (ly < fy + 4 || ly > fy + fh - 2 || lastLabelY - ly < 14) continue;
        lastLabelY = ly;
        ctx.strokeStyle = colorWithAlpha(COL.muted, "0.25");
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(fx, ly);
        ctx.lineTo(fx + fw, ly);
        ctx.stroke();
        ctx.fillStyle = COL.faint;
        ctx.fillText(m + " m", fx + 6, ly - 2);
      }
      const figure = (dist, color, alpha, width) => {
        const feetY = yAt(feetAngle(heightM, dist));
        const headY = yAt(Math.atan2(heightM - profile.humanHeightM, dist) * 180 / Math.PI);
        const bodyW = 0.45 * pxPerM(dist);
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(fx, feetY);
        ctx.lineTo(fx + fw, feetY);
        ctx.stroke();
        roundRect(ctx, fx + fw / 2 - bodyW / 2, headY, bodyW, Math.max(2, feetY - headY), Math.min(bodyW / 2.5, 12));
        ctx.fillStyle = colorWithAlpha(color, "0.75");
        ctx.fill();
        ctx.globalAlpha = 1;
      };
      if (r.faceLine.distanceM !== null && !r.faceLine.coincides) figure(r.faceLine.distanceM, COL.face, r.faceLine.visible ? 1 : 0.5, 2);
      const feetColor = r.feet.status === "best" ? COL.best : r.feet.status === "acceptable" ? COL.ok : COL.bad;
      figure(p.distanceM, r.countingLine.framed ? feetColor : COL.bad, 1, 3);
      ctx.restore();
      ctx.strokeStyle = COL.grid;
      ctx.lineWidth = 1;
      roundRect(ctx, fx, fy, fw, fh, 10);
      ctx.stroke();
      ctx.fillStyle = COL.muted;
      ctx.font = "600 11px Inter, 'Noto Sans Thai', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const note = r.faceLine.reason === "outside_frame" ? t("faceAbove") : r.countingLine.framed ? t("framedNote") : t("cutOffNote");
      ctx.fillText(note, w / 2, fy + fh + 12);
    }

    // A ceiling fisheye image: floor lines curve, people stand out from the centre.
    function drawCameraFisheye(p) {
      const fit = fitCanvas(els.topCanvas);
      if (!fit) return;
      const ctx = fit.ctx, w = fit.w, h = fit.h;
      ctx.clearRect(0, 0, w, h);
      const r = p.result, profile = p.profile, heightM = p.heightM, fov = r.optics.horizontalFovDeg;
      const radius = Math.min(w - 32, h - 70) / 2;
      const cx = w / 2, cy = 30 + radius;
      const toImage = (x, y, z) => {
        const f = fisheyeProjection({ x: x, y: y - heightM, z: z }, fov);
        return { x: cx + f.u * radius, y: cy - f.v * radius, inside: f.inside };
      };
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = COL.surface2;
      ctx.fill();
      ctx.clip();
      const curve = (z, color, width) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        let started = false;
        for (let x = -30; x <= 30; x += 0.25) {
          const pt = toImage(x, 0, z);
          if (!started) { ctx.moveTo(pt.x, pt.y); started = true; } else ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
      };
      const far = Math.ceil(Math.max(p.distanceM, r.faceLine.distanceM || 0) * 2.5);
      ctx.font = "11px JetBrains Mono, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      let lastLabelY = Infinity;
      for (let m = 1; m <= far; m += 1) {
        curve(m, colorWithAlpha(COL.muted, "0.22"), 1);
        const label = toImage(0, 0, m);
        // Far lines crowd toward the image edge; label only those with room.
        if (lastLabelY - label.y < 12) continue;
        lastLabelY = label.y;
        ctx.fillStyle = COL.faint;
        ctx.fillText(m + " m", label.x + 4, label.y - 2);
      }
      const figure = (distance, color, alpha, width) => {
        ctx.globalAlpha = alpha;
        curve(distance, color, width);
        const feet = toImage(0, 0, distance);
        const head = toImage(0, profile.humanHeightM, distance);
        ctx.strokeStyle = colorWithAlpha(color, "0.8");
        ctx.lineCap = "round";
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(feet.x, feet.y);
        ctx.lineTo(head.x, head.y);
        ctx.stroke();
        ctx.lineCap = "butt";
        ctx.globalAlpha = 1;
      };
      if (r.faceLine.distanceM !== null && !r.faceLine.coincides) figure(r.faceLine.distanceM, COL.face, r.faceLine.visible ? 1 : 0.5, 2);
      const feetColor = r.feet.status === "best" ? COL.best : r.feet.status === "acceptable" ? COL.ok : COL.bad;
      figure(p.distanceM, r.countingLine.framed ? feetColor : COL.bad, 1, 3);
      ctx.restore();
      ctx.strokeStyle = COL.best;
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = COL.grid;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = COL.muted;
      ctx.font = "600 11px Inter, 'Noto Sans Thai', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(r.countingLine.framed ? t("fisheyeNote") : t("cutOffNote"), w / 2, cy + radius + 12);
    }

    // ---------- Lookup table ----------
    function lookupRows(profile) {
      return lookupTable(profile);
    }

    function renderTable(p) {
      if (state.tableProfileId !== p.profile.id) {
        const rows = lookupRows(p.profile);
        els.tableMeta.textContent = t("tableMeta", { scene: sceneName(p.profile), min: fmt(p.profile.heightRangeM.min, 1), max: fmt(p.profile.heightRangeM.max, 1), step: fmt(p.profile.heightRangeM.step, 1), version: RULES.version });
        els.lookupBody.innerHTML = rows.map((row) => {
          return '<tr data-height="' + row.heightM.toFixed(1) + '">' +
            "<td>" + fmt(row.heightM, 1, " m") + "</td>" +
            "<td>" + fmt(row.recommendedDistanceM, 2, " m") + "</td>" +
            "<td>" + fmt(row.feetAngleDeg, 2, " deg") + "</td>" +
            '<td><span class="table-pill ' + row.feetStatus + '">' + STATUS_LABEL[row.feetStatus] + "</span></td>" +
            "<td>" + fmt(row.faceAngleDeg, 2, " deg") + "</td>" +
            '<td><span class="table-pill ' + row.faceStatus + '">' + STATUS_LABEL[row.faceStatus] + "</span></td>" +
            "<td>" + (row.faceLineDistanceM === null ? t("none") : fmt(row.faceLineDistanceM, 2, " m")) + "</td>" +
            "</tr>";
        }).join("");
        state.tableProfileId = p.profile.id;
        state.tableSelectedHeightKey = null;
      }
      const key = p.heightM.toFixed(1);
      if (state.tableSelectedHeightKey === key) return;
      const previous = els.lookupBody.querySelector("tr.is-selected");
      if (previous) previous.classList.remove("is-selected");
      const selected = els.lookupBody.querySelector('tr[data-height="' + key + '"]');
      if (selected) selected.classList.add("is-selected");
      state.tableSelectedHeightKey = key;
    }

    // ---------- Copy ----------
    function copyText(text, okMessage) {
      const done = (message) => {
        els.copyStatus.textContent = message;
        window.setTimeout(() => { if (els.copyStatus.textContent === message) els.copyStatus.textContent = ""; }, 2400);
      };
      if (!navigator.clipboard) { done(t("copyUnavailable")); return; }
      navigator.clipboard.writeText(text).then(() => done(okMessage)).catch(() => done(t("copyBlocked")));
    }

    function readingsText(p) {
      const r = p.result;
      const face = faceLineCopy(p);
      const camera = els.presetSelect.options[els.presetSelect.selectedIndex].text;
      return [
        t("readingsHead", { scene: sceneName(p.profile), height: fmt(p.heightM, 1), camera: camera, focal: fmt(Number(els.focalInput.value), 1) }),
        t("readingsVerdict", { status: STATUS_LABEL[r.verdict], angle: fmt(r.feet.angleDeg, 1) }),
        t("readingsCounting", { distance: fmt(p.distanceM, 2) }),
        t("readingsFace", { distance: r.faceLine.distanceM === null ? t("none") : fmt(r.faceLine.distanceM, 2) + " m", state: face.label }),
        t("readingsTilt", { tilt: fmt(r.tilt.value, 1) })
      ].concat(r.entrance === null ? [] : [t("readingsEntrance", { text: entranceCopy(r.entrance, r.optics.coverageWidthM) })], [t("readingsRules", { version: RULES.version })]).join("\\n");
    }

    // ---------- Update ----------
    function update() {
      const heightM = Number(els.heightInput.value);
      const distanceM = Number(els.distanceInput.value);
      if (![heightM, distanceM, Number(els.focalInput.value)].every(Number.isFinite)) return;
      const p = currentPlacement();
      const r = p.result;
      const profile = p.profile;

      const fisheye = r.optics.lens === "fisheye";
      // A ceiling fisheye always looks straight down, so its tilt cannot be changed.
      els.tiltInput.disabled = els.tiltRange.disabled = els.tiltAuto.disabled = fisheye;
      els.tiltHint.hidden = !fisheye;
      if (fisheye || !state.tiltUserAdjusted) setFieldValue(els.tiltInput, els.tiltRange, r.tilt.value, 1);
      els.tiltAuto.setAttribute("aria-pressed", String(fisheye || !state.tiltUserAdjusted));
      syncDistanceBounds(p);
      [els.heightRange, els.distanceRange, els.tiltRange, els.focalRange, els.offsetRange].forEach(setRangeFill);
      els.offsetCaption.textContent = offsetCopy(p);
      els.offsetCentre.setAttribute("aria-pressed", String(state.offsetM === 0));
      els.offsetCentre.disabled = state.offsetM === 0;
      document.querySelectorAll("[data-scene]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.scene === profile.id)));
      els.sceneCaption.textContent = sceneDesc(profile);

      const face = faceLineCopy(p);
      const verdictLabel = STATUS_LABEL[r.verdict];
      const visibleClass = face.tooSmall ? "too-small" : face.visible ? "visible" : "not-visible";
      const resolution = p.resolution;
      const verticalSpanM = Math.max(0.001, 2 * Math.hypot(heightM, distanceM) * Math.tan(toRad(r.optics.verticalFovDeg / 2)));
      const verticalPpm = fisheye ? r.optics.pixelsPerMetre : resolution.h / verticalSpanM;

      els.verdict.dataset.state = r.verdict;
      els.verdictHeadline.textContent = t("headline", { status: lang === "en" ? verdictLabel.toLowerCase() : verdictLabel });
      els.verdictSub.textContent = verdictCopy(p);
      const outside = r.warnings.indexOf("height_outside_range") >= 0;
      const lowDensity = r.warnings.includes("low_pixel_density");
      els.edgeWarn.innerHTML = edgeHtml(p);
      els.densityWarn.textContent = lowDensity ? t("densityWarn", { ppm: fmt(r.optics.pixelsPerMetre, 0), min: profile.minPixelsPerMetre.counting }) : "";
      els.heightWarn.textContent = outside ? t("heightWarn", { height: fmt(heightM, 1), scene: sceneName(profile), min: fmt(profile.heightRangeM.min, 1), max: fmt(profile.heightRangeM.max, 1) }) : "";
      if (r.entrance !== null) {
        els.entranceLine.dataset.state = r.entrance.status;
        els.entranceLine.textContent = entranceCopy(r.entrance, r.optics.coverageWidthM);
      }
      showNotes([
        [els.edgeWarn, r.countingLine.edge !== null],
        [els.densityWarn, lowDensity],
        [els.heightWarn, outside],
        [els.entranceLine, r.entrance !== null]
      ]);
      els.recommendedDistance.textContent = fmt(r.countingLine.recommendedDistanceM, 2, " m");
      // Only Manual mode leaves the line where the installer put it, so only there can the button act.
      const onTarget = Math.abs(r.countingLine.recommendedDistanceM - distanceM) < 0.01;
      els.snapButton.hidden = state.solveMode !== "manual";
      els.snapButton.disabled = onTarget;
      els.snapButton.classList.toggle("on-target", onTarget);
      els.snapLabel.textContent = t(onTarget ? "onRecommended" : "useRecommended");

      updateStatusElement(els.feetStatus, r.feet.status, STATUS_LABEL[r.feet.status]);
      els.feetAngle.innerHTML = fmt(r.feet.angleDeg, 2) + "<small>deg</small>";
      els.feetPpm.innerHTML = fmt(r.optics.pixelsPerMetre, 0) + "<small>px/m</small>";
      const feetBandsDeg = profile.feetAngleDeg;
      renderBandBar(els.feetBar, feetBandsDeg.acceptable.min - 6, feetBandsDeg.acceptable.max + 6,
        [[feetBandsDeg.acceptable.min, feetBandsDeg.acceptable.max, "acceptable"], [feetBandsDeg.best.min, feetBandsDeg.best.max, "best"]], r.feet.angleDeg);
      const faceBandsDeg = profile.faceAngleDeg;
      renderBandBar(els.faceBar, 0, faceBandsDeg.acceptableMax + 10,
        [[0, faceBandsDeg.acceptableMax, "acceptable"], [faceBandsDeg.best.min, faceBandsDeg.best.max, "best"]], r.faceLine.angleDeg);
      // Height mode solves the mount, so the big number is the height; otherwise it is the counting line distance.
      const readingIsHeight = state.solveMode === "height";
      els.verdictReading.textContent = readingIsHeight ? fmt(heightM, 1) : fmt(distanceM, 2);
      els.verdictReadingLabel.textContent = t(readingIsHeight ? "mountHeightLower" : "countingLineLower");
      els.countNote.textContent = r.countingLine.framed ? t("countFramed", { target: profile.feetAngleDeg.target }) : t("countCut");
      updateStatusElement(els.faceStatus, visibleClass, face.label);
      els.faceLineDistance.innerHTML = r.faceLine.distanceM === null ? t("none") : fmt(r.faceLine.distanceM, 2) + "<small>m</small>";
      els.faceAngle.innerHTML = r.faceLine.angleDeg === null ? t("none") : fmt(r.faceLine.angleDeg, 1) + "<small>deg</small>";
      els.faceNote.textContent = face.note;

      els.stageBadge.textContent = sceneName(profile);
      els.sideFeetReading.textContent = t("sideFeet", { status: STATUS_LABEL[r.feet.status], angle: fmt(r.feet.angleDeg, 1) });
      els.sideFeetReading.className = "reading-chip " + r.feet.status;
      els.sideFaceReading.textContent = t("sideFace", { distance: r.faceLine.distanceM === null ? t("none") : fmt(r.faceLine.distanceM, 2, " m"), state: face.label });
      els.sideFaceReading.className = "reading-chip " + (face.visible ? "face" : "not-visible");
      els.sideTiltReading.textContent = t("sideTilt", { tilt: fmt(r.tilt.value, 1), mode: t(fisheye ? "tiltFisheye" : state.tiltUserAdjusted ? "tiltManual" : "tiltRecommended"), fov: fmt(r.optics.verticalFovDeg, 1) });
      els.topTitle.textContent = t({ top: "titleTop", camera: "titleCamera" }[state.topView]);

      updateRangeBar(p);
      updateMetrics(p, verticalPpm);
      els.sideCanvas.setAttribute("aria-label", t("sideAria", { height: fmt(heightM, 1), distance: fmt(distanceM, 2), angle: fmt(r.feet.angleDeg, 1), status: STATUS_LABEL[r.feet.status] }));
      els.topCanvas.setAttribute("aria-label", state.topView === "top" ? t("topAria", { width: widthText(r.optics.coverageWidthM) }) : t("cameraAria", { tilt: fmt(r.tilt.value, 1) }));
      const orbitOn = state.sideMode === "orbit" && !state.simFailed;
      els.sideCanvas.hidden = orbitOn;
      els.orbitCanvas.hidden = els.orbitNote.hidden = !orbitOn;
      els.sideModeSeg.hidden = state.simFailed;
      document.querySelectorAll("[data-sidemode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.sidemode === state.sideMode)));
      if (!orbitOn) drawSide(p);
      // The camera view is the 3D scene; the flat drawing stands in only when three.js could not load.
      const simOn = state.topView === "camera" && !state.simFailed;
      els.topCanvas.hidden = simOn;
      els.simWrap.hidden = !simOn;
      els.simFallback.hidden = !(state.topView === "camera" && state.simFailed);
      // The plan is dragged on, so it gets the wide column too.
      els.dual.classList.toggle("sim-mode", simOn || state.topView === "top");
      if (state.topView === "top") drawTop(p);
      if (state.topView === "camera" && state.simFailed) drawCameraView(p);
      if (window.walkSim) {
        window.walkSim.setPlacement(simInput(p));
        window.walkSim.setActive(simOn && !els.visualizerView.hidden);
        if (window.OrbitControlsClass) window.walkSim.setOrbit(els.orbitCanvas, window.OrbitControlsClass, orbitOn && !els.visualizerView.hidden);
      }
      if (!els.tableView.hidden) renderTable(p);

      updateAnswer(p, verdictLabel);
      els.mobileAnswer.dataset.state = r.verdict;
      els.mobileAnswerOverall.textContent = verdictLabel;
      els.mobileAnswerFeet.textContent = STATUS_LABEL[r.feet.status];
      els.mobileAnswerFeet.className = r.feet.status;
      els.mobileAnswerFace.textContent = face.label;
      els.mobileAnswerFace.className = visibleClass;
      els.mobileAnswerDistance.textContent = fmt(distanceM, 2, " m");
      els.statusbar.dataset.state = r.verdict;
      els.sbOverall.textContent = verdictLabel;
      els.sbFeet.textContent = STATUS_LABEL[r.feet.status];
      els.sbFeet.className = r.feet.status;
      els.sbFace.textContent = face.label;
      els.sbFace.className = visibleClass;
      els.sbDistance.textContent = fmt(distanceM, 2, " m");

      const announcement = t("announce", { status: verdictLabel, feet: STATUS_LABEL[r.feet.status], face: face.label, distance: fmt(distanceM, 2) });
      window.clearTimeout(state.announceTimer);
      state.announceTimer = window.setTimeout(() => { els.placementAnnouncement.textContent = announcement; }, 240);
      syncShareState(p);
    }

    // ---------- Phone and tablet ----------
    const ENTRY_STATE = { covered: "entryCovered", tight: "entryTight", too_wide: "entryTooWide" };

    function updateAnswer(p, verdictLabel) {
      const r = p.result;
      els.answer.dataset.state = r.verdict;
      els.answerPill.textContent = verdictLabel;
      els.answerFeet.textContent = fmt(r.feet.angleDeg, 1, " deg");
      els.answerDistance.textContent = fmt(p.distanceM, 2);
      els.answerSub.textContent = verdictCopy(p);
      els.answerFace.textContent = r.faceLine.distanceM === null ? t("none") : fmt(r.faceLine.distanceM, 2, " m");
      els.answerEntry.hidden = r.entrance === null;
      if (r.entrance !== null) {
        els.answerEntry.dataset.state = r.entrance.status;
        els.answerEntryWidth.textContent = fmt(r.entrance.widthM, 1, " m");
        els.answerEntryState.textContent = t(ENTRY_STATE[r.entrance.status]);
      }
      els.answerPpm.textContent = fmt(r.optics.pixelsPerMetre, 0);
      els.answerPpmChip.dataset.state = r.warnings.includes("low_pixel_density") ? "low" : "ok";
      const faceState = !r.faceLine.visible ? "not_visible" : r.faceLine.tooSmall ? "too_small" : "visible";
      els.answerFaceChip.dataset.state = faceState;
      els.answerFaceState.textContent = faceState === "visible" ? "" : t(faceState === "too_small" ? "tooSmall" : "notVisible");
      els.sheetScene.textContent = sceneName(p.profile);
      els.sheetCamera.textContent = els.presetSelect.selectedOptions[0] ? els.presetSelect.selectedOptions[0].textContent : "";
      if (document.activeElement !== els.quickHeight) els.quickHeight.value = fmt(p.heightM, 1);
      if (document.activeElement !== els.quickEntrance) els.quickEntrance.value = state.entranceM === null ? "" : String(state.entranceM);
      // In height mode the height is the answer, so the quick height control is read-only.
      const heightSolved = state.solveMode === "height";
      els.quickHeight.disabled = heightSolved;
      els.quickHeightStepper.querySelectorAll("button").forEach((button) => { button.disabled = heightSolved; });
    }

    function setQuickEntrance(value) {
      els.entranceInput.value = value;
      setEntrance(value);
    }

    function stepQuick(target, direction) {
      if (target === "height") {
        setHeight(Number(els.heightInput.value) + direction * RULE.cameraHeightStepM);
        return;
      }
      const next = Math.max(0.5, Math.round(((state.entranceM === null ? 0 : state.entranceM) + direction * 0.5) * 10) / 10);
      setQuickEntrance(String(next));
    }

    function setSheet(open) {
      els.rail.classList.toggle("open", open);
      els.sheetHandle.setAttribute("aria-expanded", String(open));
      els.sheetSummary.setAttribute("aria-expanded", String(open));
    }

    // Sticky offsets and the sheet's resting height follow the real rendered sizes, which change with language and wrapping.
    function trackHeights() {
      const pairs = [[document.querySelector(".topbar"), "--topbar-h"], [els.answer, "--answer-h"], [els.sheetBar, "--sheet-h"]];
      const apply = () => pairs.forEach((pair) => document.documentElement.style.setProperty(pair[1], pair[0].offsetHeight + "px"));
      if ("ResizeObserver" in window) {
        const observer = new ResizeObserver(apply);
        pairs.forEach((pair) => observer.observe(pair[0]));
      }
      apply();
    }

    // ---------- Tabs and tip ----------
    function setTab(tab) {
      const isTable = tab === "table";
      els.tableToggle.setAttribute("aria-pressed", String(isTable));
      document.body.classList.toggle("on-table", isTable);
      els.visualizerView.hidden = isTable;
      els.tableView.hidden = !isTable;
      els.visualizerTab.setAttribute("aria-selected", String(!isTable));
      els.tableTab.setAttribute("aria-selected", String(isTable));
      els.visualizerTab.tabIndex = isTable ? -1 : 0;
      els.tableTab.tabIndex = isTable ? 0 : -1;
      if (isTable) {
        if (window.walkSim) {
          window.walkSim.setActive(false);
          if (window.OrbitControlsClass) window.walkSim.setOrbit(els.orbitCanvas, window.OrbitControlsClass, false);
        }
        renderTable(currentPlacement());
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
      els.priorityTip.style.left = Math.min(window.innerWidth - 296, Math.max(16, rect.left)) + "px";
      els.priorityTip.style.top = Math.min(window.innerHeight - 140, rect.bottom + 8) + "px";
      els.priorityTip.classList.add("show");
      els.priorityInfo.setAttribute("aria-expanded", "true");
    }

    function hidePriorityTip() {
      els.priorityTip.classList.remove("show");
      els.priorityInfo.setAttribute("aria-expanded", "false");
    }

    // ---------- Events ----------
    els.viewTabs.addEventListener("click", (event) => {
      const button = event.target.closest("[data-tab]");
      if (button) setTab(button.dataset.tab);
    });
    els.viewTabs.addEventListener("keydown", onTabKey);
    els.tableToggle.addEventListener("click", () => setTab(els.tableView.hidden ? "table" : "visualizer"));
    let sheetDragged = false;
    [els.sheetHandle, els.sheetSummary].forEach((button) => button.addEventListener("click", () => {
      if (sheetDragged) { sheetDragged = false; return; }
      setSheet(!els.rail.classList.contains("open"));
    }));

    // The sheet follows the finger from its handle or summary row, then settles open or closed.
    function enableSheetDrag(handle) {
      let start = null;
      handle.addEventListener("pointerdown", (event) => {
        if (!window.matchMedia("(max-width: 760px)").matches) return;
        start = { y: event.clientY, height: els.rail.getBoundingClientRect().height, moved: false };
        try { handle.setPointerCapture(event.pointerId); } catch (error) { /* synthetic or released pointer; the drag still works */ }
      });
      handle.addEventListener("pointermove", (event) => {
        if (!start) return;
        const delta = start.y - event.clientY;
        if (!start.moved && Math.abs(delta) < 6) return;
        start.moved = true;
        const closed = els.sheetBar.offsetHeight;
        const open = window.innerHeight * 0.82;
        els.rail.classList.add("dragging");
        els.rail.style.maxHeight = Math.min(open, Math.max(closed, start.height + delta)) + "px";
      });
      const finish = (event) => {
        if (!start) return;
        if (start.moved) {
          const delta = start.y - event.clientY;
          const wasOpen = els.rail.classList.contains("open");
          sheetDragged = true;
          els.rail.classList.remove("dragging");
          els.rail.style.maxHeight = "";
          // A short flick is enough: 40 px toward the other state switches it.
          setSheet(wasOpen ? delta > -40 : delta > 40);
          window.setTimeout(() => { sheetDragged = false; }, 350);
        }
        start = null;
      };
      handle.addEventListener("pointerup", finish);
      handle.addEventListener("pointercancel", finish);
    }
    enableSheetDrag(els.sheetHandle);
    enableSheetDrag(els.sheetSummary);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && els.rail.classList.contains("open")) setSheet(false);
    });
    document.querySelectorAll("[data-quick]").forEach((button) => button.addEventListener("click", () => stepQuick(button.dataset.quick, Number(button.dataset.dir))));
    els.quickHeight.addEventListener("change", (event) => {
      const text = event.target.value.trim();
      if (text !== "" && Number.isFinite(Number(text))) setHeight(text);
      event.target.value = els.heightInput.value;
    });
    els.quickEntrance.addEventListener("change", (event) => setQuickEntrance(event.target.value));
    els.sceneSeg.addEventListener("click", (event) => {
      const button = event.target.closest("[data-scene]");
      if (button) setScene(button.dataset.scene);
    });
    document.querySelectorAll("[data-solve]").forEach((button) => button.addEventListener("click", () => setSolveMode(button.dataset.solve)));
    document.querySelectorAll("[data-sidemode]").forEach((button) => button.addEventListener("click", () => {
      state.sideMode = button.dataset.sidemode;
      update();
    }));
    // Expanded view: the Top / Camera panel over the whole window, for a closer look at the picture and the face.
    const stagePanel = document.getElementById("stageExpand").closest(".stage");
    function syncExpandButton() {
      const button = document.getElementById("stageExpand");
      const on = button.closest(".stage").classList.contains("expanded");
      const label = t(on ? "collapseView" : "expandView");
      button.setAttribute("aria-pressed", String(on));
      button.setAttribute("aria-label", label);
      button.title = label;
    }
    function setExpanded(on) {
      stagePanel.classList.toggle("expanded", on);
      document.documentElement.classList.toggle("view-expanded", on);
      document.getElementById("simStage").dataset.fill = String(on);
      syncExpandButton();
      update();
    }
    document.getElementById("stageExpand").addEventListener("click", () => setExpanded(!stagePanel.classList.contains("expanded")));
    document.addEventListener("keydown", (event) => {
      // Esc belongs to an open dialog or tour first.
      if (event.key !== "Escape" || !stagePanel.classList.contains("expanded") || document.querySelector("dialog[open]")) return;
      const tour = document.getElementById("tour");
      if (tour && !tour.hidden) return;
      setExpanded(false);
      document.getElementById("stageExpand").focus();
    });

    document.querySelectorAll("[data-topview]").forEach((button) => button.addEventListener("click", () => {
      state.topView = button.dataset.topview;
      document.querySelectorAll("[data-topview]").forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
      update();
    }));
    els.presetSelect.addEventListener("change", (event) => applyPreset(event.target.value));
    els.heightRange.addEventListener("input", (event) => setHeight(event.target.value));
    // While typing, a half-written number ("", "1.", "0") must not be clamped and rewritten under the cursor.
    // Valid values apply live; the field is tidied (clamped and formatted) only when the edit is committed.
    function whileTyping(input, apply) {
      input.addEventListener("input", () => {
        const text = input.value.trim();
        const value = Number(text);
        const isNumber = text !== "" && Number.isFinite(value);
        const inRange = isNumber && value >= Number(input.min) && value <= Number(input.max);
        // Only a finished number outside the range is flagged; "" or "4." mid-typing is simply not applied yet.
        input.setAttribute("aria-invalid", String(isNumber && !inRange));
        if (inRange) apply(text, true);
      });
      input.addEventListener("change", () => {
        input.setAttribute("aria-invalid", "false");
        const text = input.value.trim();
        // An emptied or unreadable field goes back to the last value, not to the minimum.
        apply(text === "" || !Number.isFinite(Number(text)) ? input.dataset.lastValue : text, false);
        input.dataset.lastValue = input.value;
      });
      input.addEventListener("focus", () => { input.dataset.lastValue = input.value; });
      input.dataset.lastValue = input.value;
    }
    whileTyping(els.heightInput, setHeight);
    // Tapping a solved value means the installer wants to set it: switch to Manual and put the cursor there.
    [els.heightField, els.distanceField].forEach((field) => {
      field.querySelector(".value-edit").addEventListener("click", () => {
        if (!field.classList.contains("driven")) return;
        setSolveMode("manual");
        const input = field.querySelector('input[type="number"]');
        input.focus();
        input.select();
      });
    });
    els.distanceRange.addEventListener("input", (event) => setDistance(event.target.value));
    whileTyping(els.distanceInput, setDistance);
    els.entranceInput.addEventListener("input", (event) => setEntrance(event.target.value));
    els.tiltRange.addEventListener("input", (event) => setTilt(event.target.value));
    whileTyping(els.tiltInput, setTilt);
    els.tiltAuto.addEventListener("click", () => { state.tiltUserAdjusted = false; update(); });
    els.sensorSelect.addEventListener("change", update);
    els.focalRange.addEventListener("input", (event) => { setFieldValue(els.focalInput, els.focalRange, event.target.value, 1); update(); });
    whileTyping(els.focalInput, (value, typing) => { setFieldValue(els.focalInput, els.focalRange, value, 1, typing); update(); });
    els.resolutionSelect.addEventListener("change", update);
    els.snapButton.addEventListener("click", () => setDistance(solvedDistance()));
    els.notesMore.addEventListener("click", () => {
      state.noteIndex += 1;
      update();
    });
    whileTyping(els.offsetInput, setOffset);
    els.offsetRange.addEventListener("input", (event) => setOffset(event.target.value));
    els.offsetCentre.addEventListener("click", () => setOffset(0));
    els.copyReadings.addEventListener("click", () => copyText(readingsText(currentPlacement()), t("copiedReadings")));
    els.copyCsv.addEventListener("click", () => copyText(toCsv(lookupRows(currentProfile())), t("copiedCsv")));
    els.lookupBody.addEventListener("click", (event) => {
      const row = event.target.closest("tr[data-height]");
      if (!row) return;
      // Height mode solves the height, so a table row can only load in another mode.
      if (state.solveMode === "height") setSolveMode("distance");
      setFieldValue(els.heightInput, els.heightRange, Number(row.dataset.height), 1);
      setFieldValue(els.distanceInput, els.distanceRange, solvedDistance(), 2);
      setTab("visualizer");
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
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") hidePriorityTip(); });
    window.addEventListener("resize", () => requestAnimationFrame(update));

    // Drag the counting line along the floor; the face line follows from the engine.
    function sidePoint(event) {
      const rect = els.sideCanvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }
    function nearCountingLine(pt) {
      const g = state.sideGeom;
      return g && state.solveMode !== "distance" && pt.y >= g.top && pt.y <= g.groundY + 14 && Math.abs(pt.x - g.subX) < 26;
    }
    // The slice may run at an angle to the counting line, so its floor distance converts back to the line's distance.
    function dragTo(pt) {
      const g = state.sideGeom;
      const reach = (pt.x - g.padL) / g.sx;
      setDistance(Math.sqrt(Math.max(0.0001, reach * reach - g.lateral * g.lateral)));
    }
    els.sideCanvas.addEventListener("pointerdown", (event) => {
      const pt = sidePoint(event);
      const g = state.sideGeom;
      if (!g || state.solveMode === "distance") return;
      const onFloor = pt.y >= g.groundY - 18 && pt.y <= g.groundY + 18;
      if (!nearCountingLine(pt) && !onFloor) return;
      state.dragging = true;
      els.sideCanvas.setPointerCapture(event.pointerId);
      dragTo(pt);
      event.preventDefault();
    });
    els.sideCanvas.addEventListener("pointermove", (event) => {
      const pt = sidePoint(event);
      if (state.dragging) { dragTo(pt); return; }
      els.sideCanvas.style.cursor = nearCountingLine(pt) ? "ew-resize" : "";
    });
    const endDrag = () => { state.dragging = false; };
    els.sideCanvas.addEventListener("pointerup", endDrag);
    els.sideCanvas.addEventListener("pointercancel", endDrag);

    // Switching language re-labels everything in place; inputs and the simulation keep their state.
    function setLanguage(next) {
      lang = next;
      try {
        window.localStorage.setItem("cpl-lang", next);
      } catch (error) {
        // The choice still applies for this visit.
      }
      applyStaticText();
      populateScenes();
      const presetValue = els.presetSelect.value;
      const sensorValue = els.sensorSelect.value;
      populatePresets();
      els.presetSelect.value = presetValue;
      els.sensorSelect.value = sensorValue;
      els.presetCaption.textContent = cameraCaption(state.presetId, presetFor(state.presetId));
      state.tableProfileId = null;
      update();
    }
    document.querySelectorAll("[data-lang]").forEach((button) => button.addEventListener("click", () => setLanguage(button.dataset.lang)));

${sheetSource}
${tourPlacementSource}
${helpSource}
${pwaSource}
    // ---------- Start ----------
    trackHeights();
    applyStaticText();
    populateScenes();
    populatePresets();
    els.presetSelect.value = state.presetId;
    const startPreset = presetFor(state.presetId);
    syncOpticsControls(startPreset);
    els.presetCaption.textContent = cameraCaption(state.presetId, startPreset);
    els.sensorSelect.value = startPreset.sensorId;
    els.sensorSelect.disabled = startPreset.sensorLocked;
    els.sensorField.classList.toggle("locked", startPreset.sensorLocked);
    [els.focalInput, els.focalRange].forEach((el) => { el.min = startPreset.focalMinMm; el.max = startPreset.focalMaxMm; });
    els.focalMinTick.textContent = fmt(startPreset.focalMinMm, 1);
    els.focalMaxTick.textContent = fmt(startPreset.focalMaxMm, 1);
    updateResolutionOptions(startPreset);
    setFieldValue(els.focalInput, els.focalRange, startPreset.focalDefaultMm, 1);
    setFieldValue(els.heightInput, els.heightRange, RULE.defaultCameraHeightM, 1);
    setFieldValue(els.distanceInput, els.distanceRange, solvedDistance(), 2);
    setSolveMode(state.solveMode);
    restoreSharedPlacement();
  </script>
  <script type="importmap">{ "imports": { "three": "${THREE_URL}" } }</script>
  <script type="module">
${simSource}
${peopleSource}
    try {
      const THREE = await import("three");
      // The orbit view is an extra; without its controls the side view simply has no Orbit mode.
      try {
        window.OrbitControlsClass = (await import("${ORBIT_URL}")).OrbitControls;
      } catch (error) {
        document.getElementById("sideModeSeg").hidden = true;
        console.error("Orbit controls could not load", error);
      }
      window.walkSim = createWalkSim(THREE, {
        canvas: document.getElementById("simCanvas"),
        overlay: document.getElementById("simOverlay"),
        walkButton: document.getElementById("simWalk"),
        walkOnly: ["simCounts", "simCross", "simReset", "simPause", "simNote"].map((id) => document.getElementById(id)),
        pauseButton: document.getElementById("simPause"),
        stillNote: document.getElementById("simStillNote"),
        stand: {
          row: document.getElementById("simStand"),
          buttons: Array.from(document.querySelectorAll("[data-stand]")),
          dots: { count: document.getElementById("simStandCountDot"), face: document.getElementById("simStandFaceDot") }
        },
        person: { row: document.getElementById("simPerson"), label: document.getElementById("simPersonLabel"), prev: document.getElementById("simPersonPrev"), next: document.getElementById("simPersonNext") },
        // The avatars are large and optional: the box figures stand in until they arrive, and for good if they fail.
        loadPeople: () => Promise.all([import("${FBX_URL}"), import("${SKELETON_URL}")])
          .then(([fbx, skeleton]) => loadPeople(THREE, { FBXLoader: fbx.FBXLoader, clone: skeleton.clone, base: "people/", heightM: MODEL_HEIGHT_M })),
        stillOnly: [document.getElementById("simStillNote")],
        resetButton: document.getElementById("simReset"),
        crossButton: document.getElementById("simCross"),
        passersRow: document.getElementById("simPassersRow"),
        counts: {
          in: document.getElementById("simIn"),
          out: document.getElementById("simOut"),
          faces: document.getElementById("simFaces"),
          passers: document.getElementById("simPassers")
        }
      });
      update();
    } catch (error) {
      state.simFailed = true;
      update();
      console.error("Walk simulation could not load", error);
    }
  </script>
</body>
</html>
`;
}

const publicDir = path.join(__dirname, "public");

await fs.mkdir(publicDir, { recursive: true });
const html = buildHtml();
await fs.writeFile(path.join(publicDir, "index.html"), html, "utf8");
const csvs = rules.profiles.map((profile) => [`camera-placement-lookup-${profile.id}.csv`, toCsv(lookupTable(profile))]);
for (const [name, csv] of csvs) {
  await fs.writeFile(path.join(publicDir, name), csv, "utf8");
}

// ---------- Installable, offline app ----------
const ICONS = ["icon.svg", "icon-192.png", "icon-512.png", "maskable-512.png", "apple-touch-icon.png"];
await fs.mkdir(path.join(publicDir, "icons"), { recursive: true });
const iconBytes = [];
for (const icon of ICONS) {
  const bytes = await fs.readFile(path.join(__dirname, "assets/icons", icon));
  iconBytes.push(bytes);
  await fs.writeFile(path.join(publicDir, "icons", icon), bytes);
}
// The avatars: copied as they are. They are cached when a 3D view first fetches them, not at install, being 13 MB.
const peopleSourceDir = path.join(__dirname, "assets/people");
const peopleFiles = (await fs.readdir(peopleSourceDir, { recursive: true, withFileTypes: true }))
  .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
  .map((entry) => path.relative(peopleSourceDir, path.join(entry.parentPath ?? entry.path, entry.name)).split(path.sep).join("/"))
  .sort();
await fs.rm(path.join(publicDir, "people"), { recursive: true, force: true });
const peopleBytes = [];
for (const file of peopleFiles) {
  const bytes = await fs.readFile(path.join(peopleSourceDir, file));
  peopleBytes.push(bytes);
  await fs.mkdir(path.dirname(path.join(publicDir, "people", file)), { recursive: true });
  await fs.writeFile(path.join(publicDir, "people", file), bytes);
}
const manifest = JSON.stringify(buildManifest({ themeColor: APP_BACKGROUND, backgroundColor: APP_BACKGROUND }), null, 2) + "\n";
await fs.writeFile(path.join(publicDir, "manifest.webmanifest"), manifest, "utf8");
const localFiles = ["/", "/index.html", "/manifest.webmanifest", ...ICONS.map((icon) => "/icons/" + icon), ...csvs.map(([name]) => "/" + name)];
const version = cacheVersion([html, manifest, serviceWorkerTemplate, ...csvs.map(([, csv]) => csv), ...iconBytes, ...peopleBytes]);
const serviceWorker = renderServiceWorker(serviceWorkerTemplate, { version, local: localFiles, remote: [FONTS_URL, THREE_URL, ORBIT_URL, QR_URL, FBX_URL, SKELETON_URL, ...FBX_DEPENDENCIES] });
await fs.writeFile(path.join(publicDir, "sw.js"), serviceWorker, "utf8");

console.log(`Generated index.html, ${rules.profiles.length} lookup CSVs and the offline app (cache ${version}, rules ${rules.version}).`);
console.log(publicDir);
