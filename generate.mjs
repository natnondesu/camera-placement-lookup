import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lookupTable, toCsv, validateProfile } from "./src/placement-rule.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Control ranges only. Placement thresholds live in rules/scene-profiles.json.
const RULE = {
  minCameraHeightM: 1.6,
  maxCameraHeightM: 20,
  cameraHeightStepM: 0.1,
  defaultCameraHeightM: 4,
  minDistanceM: 0.3,
  maxDistanceM: 36,
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
const engineSource = (await fs.readFile(path.join(__dirname, "src/placement-rule.js"), "utf8")).replace(/^export /gm, "");
const simSource = (await fs.readFile(path.join(__dirname, "src/walk-sim.js"), "utf8")).replace(/^export /gm, "");

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
      font-size: 10.5px;
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
      align-items: center;
      gap: 10px;
      margin-top: 14px;
    }

    .copy-status {
      color: var(--muted);
      font-size: 12px;
    }

    .pillar-note {
      margin: 10px 0 0;
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
      font-size: 11px;
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

    .sim-stage {
      position: relative;
    }

    .sim-overlay {
      position: absolute;
      left: 0;
      top: 0;
      pointer-events: none;
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
        <span>Face line <b id="mobileAnswerFace" class="visible">Visible</b></span>
      </span>
      <span class="mobile-answer-distance" id="mobileAnswerDistance"></span>
    </div>
    <div class="workspace">
      <aside class="rail" aria-label="Placement controls">
        <section class="panel">
          <div class="panel-head">
            <h2>Scene</h2>
            <span id="sceneVersion">rules</span>
          </div>
          <div class="panel-body">
            <div class="solve-seg scene-seg" role="group" aria-label="Scene profile" id="sceneSeg"></div>
            <p class="preset-caption" id="sceneCaption"></p>
          </div>
        </section>
        <section class="panel">
          <div class="panel-head">
            <h2>Camera preset</h2>
            <span>optics</span>
          </div>
          <div class="panel-body">
            <div class="select-wrap">
              <select id="presetSelect" aria-label="Camera preset"></select>
            </div>
            <p class="preset-caption" id="presetCaption"></p>
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
                <button type="button" data-solve="manual" aria-pressed="false">Manual</button>
                <button type="button" data-solve="distance" aria-pressed="true">Distance</button>
                <button type="button" data-solve="height" aria-pressed="false">Height</button>
              </div>
            </div>
            <div class="field" id="heightField">
              <div class="field-top">
                <label class="field-label" for="heightRange">Mounting height <span class="driven-badge">solved</span></label>
                <span class="value-edit">
                  <input id="heightInput" type="number" min="${RULE.minCameraHeightM}" max="${RULE.maxCameraHeightM}" step="${RULE.cameraHeightStepM}" value="${RULE.defaultCameraHeightM.toFixed(1)}" aria-label="Mounting height in meters">
                  <span class="unit">m</span>
                </span>
              </div>
              <input id="heightRange" type="range" min="${RULE.minCameraHeightM}" max="${RULE.maxCameraHeightM}" step="${RULE.cameraHeightStepM}" value="${RULE.defaultCameraHeightM}">
              <div class="ticks"><span>${RULE.minCameraHeightM.toFixed(1)}</span><span>${RULE.maxCameraHeightM.toFixed(1)}</span></div>
            </div>
            <div class="field" id="distanceField">
              <div class="field-top">
                <label class="field-label" for="distanceRange">Counting line distance <span class="driven-badge">solved</span></label>
                <span class="value-edit">
                  <input id="distanceInput" type="number" min="${RULE.minDistanceM}" max="${RULE.maxDistanceM}" step="0.01" value="4.60" aria-label="Counting line distance in meters">
                  <span class="unit">m</span>
                </span>
              </div>
              <input id="distanceRange" type="range" min="${RULE.minDistanceM}" max="${RULE.maxDistanceM}" step="0.01" value="4.60">
              <div class="ticks"><span id="distanceMinTick">${RULE.minDistanceM.toFixed(2)}</span><span id="distanceMaxTick">${RULE.maxDistanceM.toFixed(2)}</span></div>
            </div>
            <div class="rec-row" aria-label="Recommended placement action">
              <span class="rec-pill"><small>recommended distance</small><b id="recommendedDistance" class="mono"></b></span>
              <button class="use-button" type="button" id="snapButton">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 6 9 17l-5-5"></path>
                </svg>
                Use recommended distance
              </button>
            </div>
            <div class="field" id="depthField">
              <div class="field-top">
                <label class="field-label" for="depthInput">Floor depth in view</label>
                <span class="value-edit">
                  <input id="depthInput" type="number" min="0" max="80" step="0.1" placeholder="none" aria-describedby="depthHint" aria-label="Floor depth in view in meters">
                  <span class="unit">m</span>
                </span>
              </div>
              <p class="field-hint" id="depthHint">Optional. From below the camera to the farthest floor where people can stand.</p>
            </div>
            <div class="field" id="entranceField">
              <div class="field-top">
                <label class="field-label" for="entranceInput">Entrance width</label>
                <span class="value-edit">
                  <input id="entranceInput" type="number" min="0" max="60" step="0.1" placeholder="none" aria-describedby="entranceHint" aria-label="Entrance width in meters">
                  <span class="unit">m</span>
                </span>
              </div>
              <p class="field-hint" id="entranceHint">Optional. Width of the door or entrance people pass through, checked against what the camera covers at the counting line.</p>
            </div>
            <details class="advanced" id="advancedPanel">
              <summary>Advanced optics <span aria-hidden="true">v</span></summary>
              <div class="advanced-body">
                <div class="field" id="tiltField">
                  <div class="field-top">
                    <label class="field-label" for="tiltRange">Tilt angle</label>
                    <button type="button" class="tilt-auto" id="tiltAuto" aria-pressed="true">Recommended</button>
                    <span class="value-edit">
                      <input id="tiltInput" type="number" min="${RULE.minTiltAngleDeg}" max="${RULE.maxTiltAngleDeg}" step="${RULE.tiltAngleStepDeg}" value="30" aria-label="Tilt angle in degrees">
                      <span class="unit">deg</span>
                    </span>
                  </div>
                  <input id="tiltRange" type="range" min="${RULE.minTiltAngleDeg}" max="${RULE.maxTiltAngleDeg}" step="${RULE.tiltAngleStepDeg}" value="30">
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
                <p class="verdict-sub" id="verdictSub"></p>
                <p class="warn-line" id="heightWarn" hidden></p>
                <p class="entrance-line" id="entranceLine" data-state="covered" hidden></p>
                <div class="verdict-actions">
                  <button type="button" class="button" id="copyReadings">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"></path></svg>
                    Copy readings
                  </button>
                  <span class="copy-status" id="copyStatus" aria-live="polite"></span>
                </div>
                <p class="sr-only" id="placementAnnouncement" aria-live="polite" aria-atomic="true"></p>
              </div>
              <div class="pillar">
                <div class="pillar-head">
                  <span class="pillar-name">Counting line</span>
                  <button class="tag-info" type="button" id="priorityInfo" aria-expanded="false" aria-describedby="priorityTip">
                    verdict
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"></circle>
                      <path d="M12 16v-4"></path>
                      <path d="M12 8h.01"></path>
                    </svg>
                  </button>
                </div>
                <span class="status-chip best" id="feetStatus">Best</span>
                <div class="pillar-meta">
                  <span class="meta"><span>feet angle</span><b id="feetAngle"></b></span>
                  <span class="meta"><span>bands</span><b id="feetBands"></b></span>
                </div>
                <p class="pillar-note" id="countNote"></p>
              </div>
              <div class="pillar">
                <div class="pillar-head">
                  <span class="pillar-name">Face line</span>
                  <span class="tag">demographics</span>
                </div>
                <span class="status-chip visible" id="faceStatus">Visible</span>
                <div class="pillar-meta">
                  <span class="meta"><span>distance</span><b id="faceLineDistance"></b></span>
                  <span class="meta"><span>face angle</span><b id="faceAngle"></b></span>
                </div>
                <p class="pillar-note" id="faceNote"></p>
              </div>
            </section>
            <div class="dual sim-mode">
              <section class="stage" aria-label="Side-view placement and distance range">
                <div class="stage-head">
                  <div class="stage-title"><h2>Side view</h2><span class="stage-badge" id="stageBadge"></span></div>
                  <div class="stage-readings" aria-label="Current side-view readings">
                    <span class="reading-chip best" id="sideFeetReading"></span>
                    <span class="reading-chip face" id="sideFaceReading"></span>
                    <span class="reading-chip" id="sideTiltReading"></span>
                  </div>
                </div>
                <div class="diagram-wrap">
                  <canvas id="sideCanvas" width="980" height="560" role="img" aria-label="Side elevation diagram" style="touch-action: none"></canvas>
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
              <section class="stage" aria-label="Top-down coverage and camera view">
                <div class="stage-head">
                  <div class="stage-title">
                    <h2 id="topTitle">Simulation</h2>
                    <div class="solve-seg view-seg" role="group" aria-label="Second diagram">
                      <button type="button" data-topview="top" aria-pressed="false">Top</button>
                      <button type="button" data-topview="camera" aria-pressed="false">Camera</button>
                      <button type="button" data-topview="sim" aria-pressed="true">Simulate</button>
                    </div>
                  </div>
                </div>
                <div class="diagram-wrap">
                  <canvas id="topCanvas" width="600" height="560" role="img" aria-label="Top-down coverage diagram" hidden></canvas>
                  <div class="sim" id="simWrap">
                    <div class="sim-stage">
                      <canvas id="simCanvas" role="img" aria-label="Simulated camera view with people walking past"></canvas>
                      <canvas id="simOverlay" class="sim-overlay" aria-hidden="true"></canvas>
                    </div>
                    <div class="sim-hud" aria-live="off">
                      <span>In <b id="simIn">0</b></span>
                      <span>Out <b id="simOut">0</b></span>
                      <span>Faces <b id="simFaces">0</b></span>
                      <span id="simPassersRow">Passers-by, not counted <b id="simPassers">0</b></span>
                      <span class="sim-actions">
                        <button type="button" class="button sim-toggle" id="simCross" aria-pressed="false" title="People also walk left to right across the view, without crossing the counting line">Cross traffic</button>
                        <button type="button" class="button" id="simPlay" aria-pressed="true">Pause</button>
                        <button type="button" class="button" id="simReset">Reset</button>
                      </span>
                    </div>
                    <p class="field-hint sim-note">Simulated people through this camera. Counts come from the simulation, not real traffic.</p>
                    <p class="warn-line" id="simFallback" hidden>The 3D simulation could not load. It needs an internet connection; Top and Camera still work.</p>
                  </div>
                </div>
              </section>
            </div>
            <section class="clusters" aria-label="Placement metrics">
              <div class="cluster">
                <h3>Lines on the floor</h3>
                <div class="metrics">
                  <div class="metric"><span class="value" id="countingMetric"></span><span class="label">counting line</span></div>
                  <div class="metric"><span class="value" id="faceLineMetric"></span><span class="label">face line</span></div>
                </div>
              </div>
              <div class="cluster">
                <h3>Optics - field of view</h3>
                <div class="metrics">
                  <div class="metric"><span class="value" id="horizontalFovMetric"></span><span class="label">horizontal FOV</span></div>
                  <div class="metric"><span class="value" id="verticalFovMetric"></span><span class="label">vertical FOV</span></div>
                </div>
              </div>
              <div class="cluster">
                <h3>Coverage at counting line</h3>
                <div class="metrics">
                  <div class="metric"><span class="value" id="fullWidthMetric"></span><span class="label">full width</span></div>
                  <div class="metric"><span class="value" id="effectiveWidthMetric"></span><span class="label">effective 80%</span></div>
                </div>
              </div>
              <div class="cluster">
                <h3>Resolution density</h3>
                <div class="metrics">
                  <div class="metric"><span class="value" id="horizontalPpmMetric"></span><span class="label">horizontal PPM</span></div>
                  <div class="metric"><span class="value" id="verticalPpmMetric"></span><span class="label">vertical PPM</span></div>
                </div>
              </div>
            </section>
          </div>
        </section>
        <section id="tableView" role="tabpanel" aria-labelledby="tableTab" hidden>
          <div class="table-card">
            <div class="table-head">
              <h2>Lookup table</h2>
              <div class="table-meta" id="tableMeta"></div>
              <button type="button" class="button" id="copyCsv">Copy CSV</button>
            </div>
            <div class="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Height</th>
                    <th>Counting line</th>
                    <th>Feet angle</th>
                    <th>Feet</th>
                    <th>Face there</th>
                    <th>Face</th>
                    <th>Face line</th>
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
      <b>Why the counting line decides</b>
      The feet angle at the counting line drives reliable people counting, so it alone decides the verdict. Demographics use a separate face line where the face angle is best; it never fails a placement.
    </div>
    <div class="statusbar" id="statusbar" data-state="best">
      <button type="button" id="jumpToDiagram" aria-label="Current placement status. Jump to placement diagram">
        <span class="sb-dot"></span>
        <span class="sb-overall" id="sbOverall">Best</span>
        <span class="sb-pairs">
          <span>Feet <b id="sbFeet" class="best">Best</b></span>
          <span>Face line <b id="sbFace" class="visible">Visible</b></span>
        </span>
        <span class="sb-spacer"></span>
        <span class="sb-distance" id="sbDistance"></span>
      </button>
    </div>
  </div>
  <script>
${engineSource}
    const RULE = ${ruleJson};
    const RULES = ${rulesJson};
    const CAMERA_CATALOG = ${camerasJson};

    const SENSOR_SIZES = [
      { id: "1/4", label: "1/4\\" format - 3.6 mm width", widthMm: 3.6 },
      { id: "1/2.7", label: "1/2.7\\" format - 4.8 mm width", widthMm: 4.8 },
      { id: "1/2.3", label: "1/2.3\\" format - 5.37 mm width", widthMm: 5.37 },
      { id: "1/2", label: "1/2\\" format - 6.4 mm width", widthMm: 6.4 },
      { id: "1/1.2", label: "1/1.2\\" format - 8.8 mm width", widthMm: 8.8 }
    ];

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
      return {
        caption: camera.description,
        sensorId: sensor ? sensor.id : "1/2.7",
        sensorLocked: true,
        focalMinMm: camera.focalLengthMm.min,
        focalMaxMm: camera.focalLengthMm.max,
        // Start at the widest end of the lens: the most coverage for the entrance.
        focalDefaultMm: camera.focalLengthMm.min,
        resolutions: camera.resolutions.map((r) => ({ label: r.label + " - " + r.w + " x " + r.h, w: r.w, h: r.h })),
        defaultResolution: first.w + "x" + first.h
      };
    }

    const STATUS_LABEL = { best: "Best", acceptable: "Acceptable", out_of_range: "Out of range" };

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
      depthInput: byId("depthInput"), entranceInput: byId("entranceInput"), entranceLine: byId("entranceLine"),
      tiltRange: byId("tiltRange"), tiltInput: byId("tiltInput"), tiltAuto: byId("tiltAuto"),
      sensorField: byId("sensorField"), sensorSelect: byId("sensorSelect"),
      focalRange: byId("focalRange"), focalInput: byId("focalInput"), focalMinTick: byId("focalMinTick"), focalMaxTick: byId("focalMaxTick"),
      resolutionSelect: byId("resolutionSelect"),
      verdict: byId("verdict"), verdictHeadline: byId("verdictHeadline"), verdictSub: byId("verdictSub"), heightWarn: byId("heightWarn"),
      copyReadings: byId("copyReadings"), copyStatus: byId("copyStatus"), placementAnnouncement: byId("placementAnnouncement"),
      recommendedDistance: byId("recommendedDistance"), snapButton: byId("snapButton"),
      feetStatus: byId("feetStatus"), feetAngle: byId("feetAngle"), feetBands: byId("feetBands"), countNote: byId("countNote"),
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
      mobileAnswer: byId("mobileAnswer"), mobileAnswerOverall: byId("mobileAnswerOverall"), mobileAnswerFeet: byId("mobileAnswerFeet"),
      mobileAnswerFace: byId("mobileAnswerFace"), mobileAnswerDistance: byId("mobileAnswerDistance"),
      statusbar: byId("statusbar"), sbOverall: byId("sbOverall"), sbFeet: byId("sbFeet"), sbFace: byId("sbFace"), sbDistance: byId("sbDistance"),
      jumpToDiagram: byId("jumpToDiagram"),
      dual: document.querySelector(".dual"), simWrap: byId("simWrap")
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
        depthM: state.depthM,
        entranceWidthM: state.entranceM,
        coverageWidthM: r.optics.coverageWidthM,
        humanHeightM: p.profile.humanHeightM,
        facePointM: p.profile.facePointM,
        resolutionW: p.resolution.w,
        hFovDeg: r.optics.horizontalFovDeg,
        colors: { count: SIM_COLORS[r.feet.status], face: SIM_COLORS.face, bad: SIM_COLORS.bad }
      };
    }

    const state = {
      profileId: RULES.defaultProfile,
      solveMode: "distance",
      depthM: null,
      entranceM: null,
      topView: "sim",
      tiltUserAdjusted: false,
      tableProfileId: null,
      tableSelectedHeightKey: null,
      announceTimer: null,
      sideGeom: null,
      dragging: false
    };

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }

    function fmt(value, decimals, suffix) {
      if (value === null || value === undefined || Number.isNaN(value)) return "none";
      return Number(value).toFixed(decimals) + (suffix || "");
    }

    function pct(value, min, max) {
      if (max <= min) return 0;
      return clamp(((value - min) / (max - min)) * 100, 0, 100);
    }

    function setRangeFill(range) {
      range.style.setProperty("--fill", pct(Number(range.value), Number(range.min), Number(range.max)).toFixed(2) + "%");
    }

    function setFieldValue(input, range, value, decimals) {
      const clamped = clamp(Number(value), Number(input.min), Number(input.max));
      input.value = clamped.toFixed(decimals);
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

    function heightForDistance(profile, distanceM) {
      return distanceM * Math.tan(toRad(profile.feetAngleDeg.target));
    }

    // ---------- Placement from the engine ----------
    function currentPlacement() {
      const profile = currentProfile();
      const heightM = Number(els.heightInput.value);
      const distanceM = Number(els.distanceInput.value);
      const sensor = selectedSensor();
      const resolution = selectedResolution();
      const camera = { sensorWidthMm: sensor.widthMm, focalLengthMm: Number(els.focalInput.value), resolution: resolution };
      const result = evaluatePlacement({
        profile: profile,
        heightM: heightM,
        distanceM: distanceM,
        camera: camera,
        tiltDeg: state.tiltUserAdjusted ? Number(els.tiltInput.value) : undefined,
        availableDepthM: state.depthM === null ? undefined : state.depthM,
        entranceWidthM: state.entranceM === null ? undefined : state.entranceM
      });
      return { profile: profile, heightM: heightM, distanceM: distanceM, camera: camera, resolution: resolution, result: result };
    }

    function faceLineCopy(p) {
      const fl = p.result.faceLine;
      const vFov = p.result.optics.verticalFovDeg;
      if (fl.reason === "camera_below_face_point") return { visible: false, label: "Not visible", note: "The camera is not above the " + fmt(p.profile.facePointM, 2) + " m face point." };
      if (fl.reason === "beyond_available_depth") return { visible: false, label: "Not visible", note: "Needs " + fmt(fl.distanceM, 2) + " m of floor; the site has " + fmt(state.depthM, 2) + " m. Mount lower to bring it closer." };
      if (fl.reason === "outside_frame") {
        const lo = Math.max(0, p.result.feet.angleDeg - vFov / 2);
        const hi = Math.min(fl.angleDeg + vFov / 2, p.result.countingLine.headAngleDeg + vFov / 2);
        return {
          visible: false,
          label: "Not visible",
          note: lo <= hi
            ? "Outside the frame. A tilt between " + fmt(lo, 1) + " and " + fmt(hi, 1) + " deg shows both lines."
            : "Outside the frame, and no single tilt shows both lines. Use a shorter focal length."
        };
      }
      if (fl.coincides) return { visible: true, label: "Visible", note: "Face is already best at the counting line, so both lines are the same." };
      const gap = fl.distanceM - p.distanceM;
      return { visible: true, label: "Visible", note: fmt(Math.abs(gap), 2) + " m " + (gap > 0 ? "beyond" : "in front of") + " the counting line. Demographics only; never fails the placement." };
    }

    function verdictCopy(p) {
      const r = p.result;
      if (!r.countingLine.framed) return "The person at the counting line is cut off in the frame. Adjust tilt or use a shorter focal length.";
      const delta = r.countingLine.recommendedDistanceM - p.distanceM;
      if (Math.abs(delta) < 0.01) return "On the recommended distance for " + p.profile.name + ".";
      return "Move the counting line " + fmt(Math.abs(delta), 2) + " m " + (delta > 0 ? "farther" : "closer") + ", to " + fmt(r.countingLine.recommendedDistanceM, 2) + " m.";
    }

    // ---------- Controls ----------
    function populateScenes() {
      els.sceneSeg.innerHTML = RULES.profiles.map((p) => '<button type="button" data-scene="' + p.id + '" aria-pressed="false">' + p.name + '</button>').join("");
      els.sceneVersion.textContent = "rules " + RULES.version;
    }

    function populatePresets() {
      els.presetSelect.innerHTML = CAMERA_CATALOG.cameras.map((c) => '<option value="' + c.id + '">' + c.name + '</option>').join("") +
        '<option value="custom">No preset - custom</option>';
      els.sensorSelect.innerHTML = SENSOR_SIZES.map((s) => '<option value="' + s.id + '">' + s.label + '</option>').join("");
    }

    function updateResolutionOptions(preset) {
      const previous = els.resolutionSelect.value;
      els.resolutionSelect.innerHTML = preset.resolutions.map((r) => '<option value="' + r.w + 'x' + r.h + '">' + r.label + '</option>').join("");
      const values = preset.resolutions.map((r) => r.w + "x" + r.h);
      els.resolutionSelect.value = values.includes(previous) ? previous : preset.defaultResolution;
    }

    function applyPreset(key) {
      const preset = presetFor(key);
      els.presetCaption.textContent = preset.caption;
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
      if (state.solveMode === "height") {
        setFieldValue(els.heightInput, els.heightRange, heightForDistance(currentProfile(), Number(els.distanceInput.value)), 1);
      } else {
        setFieldValue(els.distanceInput, els.distanceRange, recommendedDistance(Number(els.heightInput.value), currentProfile()), 2);
      }
      update();
    }

    function setSolveMode(mode) {
      state.solveMode = mode;
      document.querySelectorAll("[data-solve]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.solve === mode)));
      els.heightField.classList.toggle("driven", mode === "height");
      els.distanceField.classList.toggle("driven", mode === "distance");
      els.heightInput.disabled = els.heightRange.disabled = mode === "height";
      els.distanceInput.disabled = els.distanceRange.disabled = mode === "distance";
      if (mode === "distance") setFieldValue(els.distanceInput, els.distanceRange, recommendedDistance(Number(els.heightInput.value), currentProfile()), 2);
      if (mode === "height") setFieldValue(els.heightInput, els.heightRange, heightForDistance(currentProfile(), Number(els.distanceInput.value)), 1);
      update();
    }

    function setHeight(value) {
      if (state.solveMode === "height") return;
      const heightM = setFieldValue(els.heightInput, els.heightRange, value, 1);
      if (state.solveMode === "distance") setFieldValue(els.distanceInput, els.distanceRange, recommendedDistance(heightM, currentProfile()), 2);
      update();
    }

    function setDistance(value) {
      if (state.solveMode === "distance") return;
      const distanceM = setFieldValue(els.distanceInput, els.distanceRange, value, 2);
      if (state.solveMode === "height") setFieldValue(els.heightInput, els.heightRange, heightForDistance(currentProfile(), distanceM), 1);
      update();
    }

    function setTilt(value) {
      state.tiltUserAdjusted = true;
      setFieldValue(els.tiltInput, els.tiltRange, value, 1);
      update();
    }

    function setDepth(value) {
      const depth = parseFloat(value);
      state.depthM = value === "" || Number.isNaN(depth) || depth <= 0 ? null : depth;
      update();
    }

    function setEntrance(value) {
      const width = parseFloat(value);
      state.entranceM = value === "" || Number.isNaN(width) || width <= 0 ? null : width;
      update();
    }

    function entranceCopy(entrance, coverageWidthM) {
      const covered = fmt(coverageWidthM, 1) + " m";
      if (entrance.status === "too_wide") {
        return "Entrance " + fmt(entrance.widthM, 2) + " m is wider than the " + covered + " the camera covers at the counting line; " + fmt(entrance.uncoveredM, 2) + " m is out of view. Mount higher, use a shorter focal length, or add a camera.";
      }
      if (entrance.status === "tight") {
        return "Entrance " + fmt(entrance.widthM, 2) + " m fits the " + covered + " view, but its edges fall in the outer 20% of the frame where detection is weaker.";
      }
      return "Entrance " + fmt(entrance.widthM, 2) + " m is fully in view: the camera covers " + covered + " at the counting line.";
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

    function updateRangeBar(p) {
      const win = feetDistanceWindow(p.profile, p.heightM);
      const rec = p.result.countingLine.recommendedDistanceM;
      const domainMin = Math.max(0, Math.min(win.acceptableMin, win.bestMin, p.distanceM, rec) - 1);
      const domainMax = Math.max(win.acceptableMax, win.bestMax, p.distanceM, rec) + 1;
      const setZone = (el, min, max) => {
        el.style.left = pct(min, domainMin, domainMax).toFixed(2) + "%";
        el.style.width = Math.max(0, pct(max, domainMin, domainMax) - pct(min, domainMin, domainMax)).toFixed(2) + "%";
      };
      const setMarker = (el, label, value) => {
        el.style.left = pct(value, domainMin, domainMax).toFixed(2) + "%";
        label.textContent = fmt(value, 2) + " m";
      };
      setZone(els.acceptableZone, win.acceptableMin, win.acceptableMax);
      setZone(els.bestZone, win.bestMin, win.bestMax);
      setMarker(els.minMarker, els.minMarkerLabel, win.acceptableMin);
      setMarker(els.bestMarker, els.bestMarkerLabel, rec);
      setMarker(els.maxMarker, els.maxMarkerLabel, win.acceptableMax);
      els.distanceCursor.style.left = pct(p.distanceM, domainMin, domainMax).toFixed(2) + "%";
      els.cursorLabel.textContent = fmt(p.distanceM, 2) + " m";
    }

    function updateMetrics(p, verticalPpm) {
      const o = p.result.optics;
      const fl = p.result.faceLine;
      els.countingMetric.innerHTML = fmt(p.distanceM, 2) + "<small>m</small>";
      els.faceLineMetric.innerHTML = fl.distanceM === null ? "none" : fmt(fl.distanceM, 2) + "<small>m</small>";
      els.horizontalFovMetric.innerHTML = fmt(o.horizontalFovDeg, 2) + "<small>deg</small>";
      els.verticalFovMetric.innerHTML = fmt(o.verticalFovDeg, 2) + "<small>deg</small>";
      els.fullWidthMetric.innerHTML = fmt(o.coverageWidthM, 1) + "<small>m</small>";
      els.effectiveWidthMetric.innerHTML = fmt(o.coverageWidthM * 0.8, 1) + "<small>m</small>";
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
      ctx.font = "10px JetBrains Mono, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(fmt(profile.humanHeightM, 1) + " head", x + 12, headY - 6);
      ctx.fillText(fmt(profile.facePointM, 1) + " face", x + 12, faceY);
    }

    function drawSide(p) {
      const fit = fitCanvas(els.sideCanvas);
      if (!fit) return;
      const ctx = fit.ctx, w = fit.w, h = fit.h;
      ctx.clearRect(0, 0, w, h);
      const r = p.result, profile = p.profile, heightM = p.heightM, distanceM = p.distanceM;
      const fl = r.faceLine;
      const padL = 60, padR = 70, padB = 58, padT = 40;
      const groundY = h - padB;
      const win = feetDistanceWindow(profile, heightM);
      const maxX = Math.max(distanceM * 1.25, win.acceptableMax * 1.15, (fl.distanceM || 0) * 1.12, (state.depthM || 0) * 1.08, 6);
      const maxY = Math.max(heightM * 1.25, profile.humanHeightM, 4);
      const sx = (w - padL - padR) / maxX;
      const sy = (groundY - padT) / maxY;
      const xFor = (m) => padL + m * sx;
      const yFor = (m) => groundY - m * sy;
      const camX = xFor(0), camY = yFor(heightM), subX = xFor(distanceM);
      state.sideGeom = { padL: padL, sx: sx, groundY: groundY, top: yFor(profile.humanHeightM) - 24, subX: subX };
      const feetColor = r.feet.status === "best" ? COL.best : r.feet.status === "acceptable" ? COL.ok : COL.bad;
      const personColor = r.countingLine.framed ? feetColor : COL.bad;

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

      if (state.depthM !== null) {
        const wallX = xFor(state.depthM);
        ctx.fillStyle = colorWithAlpha(COL.muted, "0.10");
        ctx.fillRect(wallX, padT - 10, Math.max(0, w - padR + 10 - wallX), groundY - padT + 10);
        ctx.strokeStyle = COL.muted;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(wallX, padT - 10);
        ctx.lineTo(wallX, groundY);
        ctx.stroke();
        ctx.fillStyle = COL.ink;
        ctx.font = "600 11px Inter, sans-serif";
        ctx.textAlign = "right";
        ctx.textBaseline = "top";
        ctx.fillText("floor ends " + fmt(state.depthM, 2, " m"), wallX - 6, padT - 6);
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
      ctx.moveTo(camX, camY);
      ctx.lineTo(lower.x, lower.y);
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

      const faceLineX = fl.distanceM === null ? null : xFor(fl.distanceM);
      const crowded = faceLineX !== null && !fl.coincides && Math.abs(faceLineX - subX) < 110;
      // Face line: its own person, where the face angle is best.
      if (fl.distanceM !== null) {
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
          ctx.globalAlpha = fl.visible ? 0.75 : 0.35;
          drawPerson(ctx, faceX, groundY, yFor, COL.face, profile, false);
          ctx.globalAlpha = 1;
          ctx.fillStyle = COL.face;
          ctx.font = "700 12px Inter, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillText("Face line", faceX, Math.max(22, yFor(profile.humanHeightM) - (crowded ? 30 : 14)));
          ctx.font = "600 11px JetBrains Mono, monospace";
          ctx.textBaseline = "top";
          ctx.fillText(fmt(fl.distanceM, 2, " m"), faceX, groundY + 22);
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = COL.face;
        ctx.font = "700 12px Inter, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText("face " + fmt(fl.angleDeg, 1, " deg"), faceX + 12, faceY);
      }

      ctx.strokeStyle = feetColor;
      ctx.lineWidth = 2.25;
      ctx.setLineDash([7, 4]);
      ctx.beginPath();
      ctx.moveTo(camX, camY);
      ctx.lineTo(subX, groundY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = "700 12px Inter, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = feetColor;
      ctx.fillText("feet " + fmt(r.feet.angleDeg, 1, " deg"), subX - 12, groundY - 6);

      drawPerson(ctx, subX, groundY, yFor, personColor, profile, !crowded);

      const aimHeightM = heightM - Math.tan(aimDown) * distanceM;
      if (aimHeightM >= 0 && aimHeightM <= maxY) {
        const aimY = yFor(aimHeightM);
        ctx.fillStyle = COL.accent;
        ctx.beginPath();
        ctx.arc(subX, aimY, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = "600 12px Inter, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(fmt(aimHeightM, 2, " m aim"), subX + 10, aimY - 8);
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

      ctx.font = "700 13px Inter, sans-serif";
      ctx.textBaseline = "bottom";
      ctx.fillText("Camera", camX, Math.max(22, camY - 14));
      ctx.fillStyle = personColor;
      ctx.fillText("Counting line", subX, Math.max(22, yFor(profile.humanHeightM) - 14));
    }

    function drawTop(p) {
      const fit = fitCanvas(els.topCanvas);
      if (!fit) return;
      const ctx = fit.ctx, w = fit.w, h = fit.h;
      ctx.clearRect(0, 0, w, h);
      const o = p.result.optics;
      const camX = w / 2, camY = 34, padB = 50;
      const half = toRad(o.horizontalFovDeg / 2);
      const reach = h - camY - padB;
      const maxSubjectPx = reach * 0.82;
      const fitSubjectPx = Math.tan(half) > 0 ? (w * 0.42) / Math.tan(half) : maxSubjectPx;
      const subjectPx = Math.max(100, Math.min(maxSubjectPx, fitSubjectPx));
      const subjectY = camY + subjectPx;
      const halfWidthPx = Math.tan(half) * subjectPx;
      const leftX = camX - halfWidthPx, rightX = camX + halfWidthPx;
      const r = p.result;
      const feetColor = r.feet.status === "best" ? COL.best : r.feet.status === "acceptable" ? COL.ok : COL.bad;
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
      ctx.strokeStyle = COL.best;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(camX - halfWidthPx * 0.8, subjectY);
      ctx.lineTo(camX + halfWidthPx * 0.8, subjectY);
      ctx.stroke();
      ctx.setLineDash([]);

      // The entrance to scale against what the camera covers; any part outside the view is red.
      if (r.entrance !== null) {
        const pxPerMetre = (halfWidthPx * 2) / o.coverageWidthM;
        const entranceHalfPx = Math.min(w / 2 - 6, (r.entrance.widthM / 2) * pxPerMetre);
        const entranceY = subjectY - 14;
        const statusColor = r.entrance.status === "covered" ? COL.best : r.entrance.status === "tight" ? COL.ok : COL.bad;
        const inView = Math.min(entranceHalfPx, halfWidthPx);
        ctx.lineCap = "butt";
        ctx.lineWidth = 5;
        ctx.strokeStyle = statusColor;
        ctx.beginPath();
        ctx.moveTo(camX - inView, entranceY);
        ctx.lineTo(camX + inView, entranceY);
        ctx.stroke();
        if (entranceHalfPx > halfWidthPx) {
          ctx.strokeStyle = COL.bad;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(camX - entranceHalfPx, entranceY);
          ctx.lineTo(camX - halfWidthPx, entranceY);
          ctx.moveTo(camX + halfWidthPx, entranceY);
          ctx.lineTo(camX + entranceHalfPx, entranceY);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = statusColor;
        ctx.beginPath();
        ctx.moveTo(camX - entranceHalfPx, entranceY - 7);
        ctx.lineTo(camX - entranceHalfPx, entranceY + 7);
        ctx.moveTo(camX + entranceHalfPx, entranceY - 7);
        ctx.lineTo(camX + entranceHalfPx, entranceY + 7);
        ctx.stroke();
        ctx.fillStyle = statusColor;
        ctx.font = "600 11px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText("entrance " + fmt(r.entrance.widthM, 1, " m"), camX, entranceY - 8);
      }
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
      ctx.fillText(fmt(o.coverageWidthM, 1, " m"), camX, subjectY + 8);
      ctx.fillStyle = COL.best;
      ctx.fillText(fmt(o.coverageWidthM * 0.8, 1, " m") + " (80%)", camX, subjectY + 25);
      ctx.fillStyle = COL.muted;
      ctx.font = "600 11px Inter, sans-serif";
      ctx.fillText("counting line", camX, Math.min(bottomY - 18, subjectY + 47));
    }

    // What the camera sees: the frame at the current tilt, with both lines and a person on each.
    function drawCameraView(p) {
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
      ctx.font = "10px JetBrains Mono, monospace";
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
      ctx.font = "600 11px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const note = r.faceLine.reason === "outside_frame" ? "Face line is above the frame" : r.countingLine.framed ? "Whole person in frame at the counting line" : "Person cut off at the counting line";
      ctx.fillText(note, w / 2, fy + fh + 12);
    }

    // ---------- Lookup table ----------
    function lookupRows(profile) {
      return lookupTable(profile);
    }

    function renderTable(p) {
      if (state.tableProfileId !== p.profile.id) {
        const rows = lookupRows(p.profile);
        els.tableMeta.textContent = p.profile.name + ", " + fmt(p.profile.heightRangeM.min, 1) + "-" + fmt(p.profile.heightRangeM.max, 1) + " m in " + fmt(p.profile.heightRangeM.step, 1) + " m steps, rules " + RULES.version;
        els.lookupBody.innerHTML = rows.map((row) => {
          return '<tr data-height="' + row.heightM.toFixed(1) + '">' +
            "<td>" + fmt(row.heightM, 1, " m") + "</td>" +
            "<td>" + fmt(row.recommendedDistanceM, 2, " m") + "</td>" +
            "<td>" + fmt(row.feetAngleDeg, 2, " deg") + "</td>" +
            '<td><span class="table-pill ' + row.feetStatus + '">' + STATUS_LABEL[row.feetStatus] + "</span></td>" +
            "<td>" + fmt(row.faceAngleDeg, 2, " deg") + "</td>" +
            '<td><span class="table-pill ' + row.faceStatus + '">' + STATUS_LABEL[row.faceStatus] + "</span></td>" +
            "<td>" + (row.faceLineDistanceM === null ? "none" : fmt(row.faceLineDistanceM, 2, " m")) + "</td>" +
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
      if (!navigator.clipboard) { done("Copy is not available in this browser."); return; }
      navigator.clipboard.writeText(text).then(() => done(okMessage)).catch(() => done("Copy was blocked by the browser."));
    }

    function readingsText(p) {
      const r = p.result;
      const face = faceLineCopy(p);
      const camera = els.presetSelect.options[els.presetSelect.selectedIndex].text;
      return [
        p.profile.name + ", mount height " + fmt(p.heightM, 1) + " m, " + camera + " at " + fmt(Number(els.focalInput.value), 1) + " mm",
        "Verdict: " + STATUS_LABEL[r.verdict] + " (feet angle " + fmt(r.feet.angleDeg, 1) + " deg)",
        "Counting line: " + fmt(p.distanceM, 2) + " m from below the camera",
        "Face line: " + (r.faceLine.distanceM === null ? "none" : fmt(r.faceLine.distanceM, 2) + " m") + " (" + face.label.toLowerCase() + ")",
        "Tilt: " + fmt(r.tilt.value, 1) + " deg down"
      ].concat(r.entrance === null ? [] : ["Entrance: " + entranceCopy(r.entrance, r.optics.coverageWidthM)], ["Rules " + RULES.version]).join("\\n");
    }

    // ---------- Update ----------
    function update() {
      const heightM = Number(els.heightInput.value);
      const distanceM = Number(els.distanceInput.value);
      if (![heightM, distanceM, Number(els.focalInput.value)].every(Number.isFinite)) return;
      const p = currentPlacement();
      const r = p.result;
      const profile = p.profile;

      if (!state.tiltUserAdjusted) setFieldValue(els.tiltInput, els.tiltRange, r.tilt.recommended, 1);
      els.tiltAuto.setAttribute("aria-pressed", String(!state.tiltUserAdjusted));
      syncDistanceBounds(p);
      [els.heightRange, els.distanceRange, els.tiltRange, els.focalRange].forEach(setRangeFill);
      document.querySelectorAll("[data-scene]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.scene === profile.id)));
      els.sceneCaption.textContent = profile.description;

      const face = faceLineCopy(p);
      const verdictLabel = STATUS_LABEL[r.verdict];
      const visibleClass = face.visible ? "visible" : "not-visible";
      const resolution = p.resolution;
      const verticalSpanM = Math.max(0.001, 2 * Math.hypot(heightM, distanceM) * Math.tan(toRad(r.optics.verticalFovDeg / 2)));
      const verticalPpm = resolution.h / verticalSpanM;

      els.verdict.dataset.state = r.verdict;
      els.verdictHeadline.textContent = "Placement is " + verdictLabel.toLowerCase();
      els.verdictSub.textContent = verdictCopy(p);
      const outside = r.warnings.indexOf("height_outside_range") >= 0;
      els.heightWarn.hidden = !outside;
      els.heightWarn.textContent = outside ? fmt(heightM, 1) + " m is outside the " + profile.name + " height range (" + fmt(profile.heightRangeM.min, 1) + "-" + fmt(profile.heightRangeM.max, 1) + " m). Judged anyway." : "";
      els.entranceLine.hidden = r.entrance === null;
      if (r.entrance !== null) {
        els.entranceLine.dataset.state = r.entrance.status;
        els.entranceLine.textContent = entranceCopy(r.entrance, r.optics.coverageWidthM);
      }
      els.recommendedDistance.textContent = fmt(r.countingLine.recommendedDistanceM, 2, " m");
      els.snapButton.disabled = Math.abs(r.countingLine.recommendedDistanceM - distanceM) < 0.01 || state.solveMode === "distance";

      updateStatusElement(els.feetStatus, r.feet.status, STATUS_LABEL[r.feet.status]);
      els.feetAngle.innerHTML = fmt(r.feet.angleDeg, 2) + "<small>deg</small>";
      els.feetBands.innerHTML = profile.feetAngleDeg.best.min + "-" + profile.feetAngleDeg.best.max + " <small>best</small> / " + profile.feetAngleDeg.acceptable.min + "-" + profile.feetAngleDeg.acceptable.max + " <small>ok</small>";
      els.countNote.textContent = r.countingLine.framed ? "Whole person in frame. Target " + profile.feetAngleDeg.target + " deg." : "The person here is cut off in the frame.";
      updateStatusElement(els.faceStatus, visibleClass, face.label);
      els.faceLineDistance.innerHTML = r.faceLine.distanceM === null ? "none" : fmt(r.faceLine.distanceM, 2) + "<small>m</small>";
      els.faceAngle.innerHTML = r.faceLine.angleDeg === null ? "none" : fmt(r.faceLine.angleDeg, 1) + "<small>deg</small>";
      els.faceNote.textContent = face.note;

      els.stageBadge.textContent = profile.name;
      els.sideFeetReading.textContent = "Feet: " + STATUS_LABEL[r.feet.status] + ", " + fmt(r.feet.angleDeg, 1, " deg");
      els.sideFeetReading.className = "reading-chip " + r.feet.status;
      els.sideFaceReading.textContent = "Face line: " + (r.faceLine.distanceM === null ? "none" : fmt(r.faceLine.distanceM, 2, " m")) + ", " + face.label.toLowerCase();
      els.sideFaceReading.className = "reading-chip " + (face.visible ? "face" : "not-visible");
      els.sideTiltReading.textContent = "Tilt: " + fmt(r.tilt.value, 1, " deg") + (state.tiltUserAdjusted ? " manual" : " recommended") + " / FOV " + fmt(r.optics.verticalFovDeg, 1, " deg");
      els.topTitle.textContent = { top: "Top view", camera: "Camera view", sim: "Simulation" }[state.topView];

      updateRangeBar(p);
      updateMetrics(p, verticalPpm);
      els.sideCanvas.setAttribute("aria-label", "Side elevation. Camera height " + fmt(heightM, 1, " meters") + ", counting line at " + fmt(distanceM, 2, " meters") + ", feet angle " + fmt(r.feet.angleDeg, 1, " degrees") + ", " + STATUS_LABEL[r.feet.status] + ". Face line " + (r.faceLine.distanceM === null ? "none" : "at " + fmt(r.faceLine.distanceM, 2, " meters") + ", " + face.label) + ".");
      els.topCanvas.setAttribute("aria-label", state.topView === "top" ? "Top-down coverage. Width " + fmt(r.optics.coverageWidthM, 1, " meters") + " at the counting line." : "Camera view at " + fmt(r.tilt.value, 1, " degrees") + " tilt.");
      drawSide(p);
      const simOn = state.topView === "sim";
      els.topCanvas.hidden = simOn;
      els.simWrap.hidden = !simOn;
      els.dual.classList.toggle("sim-mode", simOn);
      if (state.topView === "top") drawTop(p);
      if (state.topView === "camera") drawCameraView(p);
      if (window.walkSim) {
        window.walkSim.setPlacement(simInput(p));
        window.walkSim.setActive(simOn && !els.visualizerView.hidden);
      }
      if (!els.tableView.hidden) renderTable(p);

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

      const announcement = "Placement is " + verdictLabel.toLowerCase() + ". Feet " + STATUS_LABEL[r.feet.status] + ". Face line " + face.label + ". Counting line " + fmt(distanceM, 2, " meters") + ".";
      window.clearTimeout(state.announceTimer);
      state.announceTimer = window.setTimeout(() => { els.placementAnnouncement.textContent = announcement; }, 240);
    }

    // ---------- Tabs and tip ----------
    function setTab(tab) {
      const isTable = tab === "table";
      els.visualizerView.hidden = isTable;
      els.tableView.hidden = !isTable;
      els.visualizerTab.setAttribute("aria-selected", String(!isTable));
      els.tableTab.setAttribute("aria-selected", String(isTable));
      els.visualizerTab.tabIndex = isTable ? -1 : 0;
      els.tableTab.tabIndex = isTable ? 0 : -1;
      if (isTable) {
        if (window.walkSim) window.walkSim.setActive(false);
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
    els.sceneSeg.addEventListener("click", (event) => {
      const button = event.target.closest("[data-scene]");
      if (button) setScene(button.dataset.scene);
    });
    document.querySelectorAll("[data-solve]").forEach((button) => button.addEventListener("click", () => setSolveMode(button.dataset.solve)));
    document.querySelectorAll("[data-topview]").forEach((button) => button.addEventListener("click", () => {
      state.topView = button.dataset.topview;
      document.querySelectorAll("[data-topview]").forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
      update();
    }));
    els.presetSelect.addEventListener("change", (event) => applyPreset(event.target.value));
    els.heightRange.addEventListener("input", (event) => setHeight(event.target.value));
    els.heightInput.addEventListener("input", (event) => setHeight(event.target.value));
    els.heightInput.addEventListener("change", (event) => setHeight(event.target.value));
    els.distanceRange.addEventListener("input", (event) => setDistance(event.target.value));
    els.distanceInput.addEventListener("input", (event) => setDistance(event.target.value));
    els.distanceInput.addEventListener("change", (event) => setDistance(event.target.value));
    els.depthInput.addEventListener("input", (event) => setDepth(event.target.value));
    els.entranceInput.addEventListener("input", (event) => setEntrance(event.target.value));
    els.tiltRange.addEventListener("input", (event) => setTilt(event.target.value));
    els.tiltInput.addEventListener("input", (event) => setTilt(event.target.value));
    els.tiltInput.addEventListener("change", (event) => setTilt(event.target.value));
    els.tiltAuto.addEventListener("click", () => { state.tiltUserAdjusted = false; update(); });
    els.sensorSelect.addEventListener("change", update);
    els.focalRange.addEventListener("input", (event) => { setFieldValue(els.focalInput, els.focalRange, event.target.value, 1); update(); });
    els.focalInput.addEventListener("input", (event) => { setFieldValue(els.focalInput, els.focalRange, event.target.value, 1); update(); });
    els.resolutionSelect.addEventListener("change", update);
    els.snapButton.addEventListener("click", () => setDistance(recommendedDistance(Number(els.heightInput.value), currentProfile())));
    els.copyReadings.addEventListener("click", () => copyText(readingsText(currentPlacement()), "Readings copied."));
    els.copyCsv.addEventListener("click", () => copyText(toCsv(lookupRows(currentProfile())), "CSV copied."));
    els.lookupBody.addEventListener("click", (event) => {
      const row = event.target.closest("tr[data-height]");
      if (!row) return;
      // Height mode solves the height, so a table row can only load in another mode.
      if (state.solveMode === "height") setSolveMode("distance");
      setFieldValue(els.heightInput, els.heightRange, Number(row.dataset.height), 1);
      setFieldValue(els.distanceInput, els.distanceRange, recommendedDistance(Number(row.dataset.height), currentProfile()), 2);
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
    function dragTo(pt) {
      const g = state.sideGeom;
      setDistance((pt.x - g.padL) / g.sx);
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

    // ---------- Start ----------
    populateScenes();
    populatePresets();
    els.presetSelect.value = CAMERA_CATALOG.defaultCamera;
    const startPreset = presetFor(CAMERA_CATALOG.defaultCamera);
    els.presetCaption.textContent = startPreset.caption;
    els.sensorSelect.value = startPreset.sensorId;
    els.sensorSelect.disabled = startPreset.sensorLocked;
    els.sensorField.classList.toggle("locked", startPreset.sensorLocked);
    [els.focalInput, els.focalRange].forEach((el) => { el.min = startPreset.focalMinMm; el.max = startPreset.focalMaxMm; });
    els.focalMinTick.textContent = fmt(startPreset.focalMinMm, 1);
    els.focalMaxTick.textContent = fmt(startPreset.focalMaxMm, 1);
    updateResolutionOptions(startPreset);
    setFieldValue(els.focalInput, els.focalRange, startPreset.focalDefaultMm, 1);
    setFieldValue(els.heightInput, els.heightRange, RULE.defaultCameraHeightM, 1);
    setFieldValue(els.distanceInput, els.distanceRange, recommendedDistance(RULE.defaultCameraHeightM, currentProfile()), 2);
    setSolveMode(state.solveMode);
  </script>
  <script type="module">
${simSource}
    try {
      const THREE = await import("https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js");
      window.walkSim = createWalkSim(THREE, {
        canvas: document.getElementById("simCanvas"),
        overlay: document.getElementById("simOverlay"),
        playButton: document.getElementById("simPlay"),
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
      document.getElementById("simFallback").hidden = false;
      document.getElementById("simPlay").disabled = true;
      document.getElementById("simReset").disabled = true;
      console.error("Walk simulation could not load", error);
    }
  </script>
</body>
</html>
`;
}

const publicDir = path.join(__dirname, "public");

await fs.mkdir(publicDir, { recursive: true });
await fs.writeFile(path.join(publicDir, "index.html"), buildHtml(), "utf8");
for (const profile of rules.profiles) {
  await fs.writeFile(path.join(publicDir, `camera-placement-lookup-${profile.id}.csv`), toCsv(lookupTable(profile)), "utf8");
}

console.log(`Generated index.html and ${rules.profiles.length} lookup CSVs (rules ${rules.version}).`);
console.log(publicDir);
