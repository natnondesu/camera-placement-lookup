# Vercel Deployment Plan

## Goal

Deploy the camera placement lookup as a static Vercel site with:

- `index.html` served as the main page.
- `camera-placement-lookup.csv` available for download.
- `generate.mjs` kept as the source generator.
- predictable rebuilds when the rule changes.
- no accidental exposure of source or handoff files in production.

## Current Repo Facts

- The repo is currently static and dependency-free.
- `generate.mjs` generates both:
  - `public/index.html`
  - `public/camera-placement-lookup.csv`
- `package.json` provides `check` and `build` scripts.
- `vercel.json` configures Vercel to serve only the `public/` output directory.
- A Git repository exists locally on `master`, but no remote is configured yet.
- `npm run check` and `npm run build` pass.

## Deployment Recommendation

Use a small build step and serve only generated public artifacts.

This is better than deploying the repo root directly because a root deployment can expose files like `generate.mjs` and Markdown handoff docs if someone requests them by path.

Implemented output structure:

```text
camera-placement-lookup/
  generate.mjs
  package.json
  vercel.json
  public/
    index.html
    camera-placement-lookup.csv
```

## Deployment Options

| Option | Approach | Pros | Cons | Recommendation |
| --- | --- | --- | --- | --- |
| A | Deploy repo root as static files, no build command | Fastest setup, no code changes | May expose source/docs; generated files can drift from generator | Good only for quick preview |
| B | Build with `node generate.mjs`, output to `public/` | Clean production output; generated files are always fresh | Requires small repo change | Recommended |

## Implementation Plan

### 1. Prepare the Repo

A local Git repository already exists. Commit the deployment-ready project before using Git-based Vercel deployments.

```bash
git add .
git commit -m "Prepare camera placement lookup for deployment"
```

If this directory should live inside an existing repo instead, use this folder as the Vercel project root.

### 2. Add a Build Script

Implemented `package.json`:

```json
{
  "name": "camera-placement-lookup",
  "private": true,
  "type": "module",
  "scripts": {
    "check": "node --check generate.mjs",
    "build": "node generate.mjs"
  }
}
```

### 3. Change Generated Output to `public/`

Implemented in `generate.mjs`:

```js
const publicDir = path.join(__dirname, "public");
await fs.mkdir(publicDir, { recursive: true });
await fs.writeFile(path.join(publicDir, "camera-placement-lookup.csv"), csvText, "utf8");
await fs.writeFile(path.join(publicDir, "index.html"), buildHtml(csvText), "utf8");
```

Keep the generator as the source of truth. Do not manually edit generated `public/index.html` unless it is a temporary debugging step.

### 4. Add Vercel Config

Implemented `vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "installCommand": "",
  "buildCommand": "npm run build",
  "outputDirectory": "public"
}
```

Reasoning:

- `framework: null` selects Vercel's "Other" framework preset.
- Empty `installCommand` skips dependency installation because this repo has no dependencies.
- `buildCommand` regenerates the static files on each deploy.
- `outputDirectory: public` ensures only generated deploy artifacts are served.

### 5. Local Preflight

Run:

```bash
npm run check
npm run build
```

Then inspect:

```text
public/index.html
public/camera-placement-lookup.csv
```

Expected:

- `public/index.html` exists.
- `public/camera-placement-lookup.csv` exists.
- CSV row count remains `183`.
- The first feet-priority row remains `4.20m` unless the rule intentionally changes.
- The first face out-of-range row remains `5.80m` unless the rule intentionally changes.

### 6. Deploy Through Vercel

Preferred path:

1. Push the repo to GitHub, GitLab, or Bitbucket.
2. Import the repo in Vercel.
3. Confirm project settings:
   - Framework Preset: `Other`
   - Build Command: `npm run build`
   - Output Directory: `public`
   - Install Command: empty
4. Deploy a preview.
5. Promote to production after verification.

CLI path:

```bash
npx vercel
npx vercel --prod
```

Use the CLI path only if a Git integration is not desired yet.

## Verification Checklist

After preview deployment:

- Open the preview URL.
- Confirm the main UI loads without console errors.
- Move the camera height slider and confirm values update.
- Change distance and confirm feet/face statuses update.
- Click "Snap to recommended" and confirm it moves to the recommended distance.
- Click "Download CSV" and confirm the CSV downloads.
- Visit `/camera-placement-lookup.csv` directly and confirm the CSV is served.
- Confirm `/generate.mjs` is not served.
- Confirm `/camera-placement-rule-handoff.md` is not served.

## Production Acceptance Criteria

- Production URL serves the lookup UI.
- CSV download works.
- Vercel deploy logs show a successful `npm run build`.
- Only files under `public/` are publicly reachable.
- Rule output matches the intended current generated table.

## Rollback Plan

Use Vercel's deployments list to promote the previous successful deployment if:

- the generated UI is broken,
- the CSV is missing,
- a rule change produces unexpected recommendations,
- or production serves source files.

Do not force-push or delete deployment history as a rollback mechanism.

## Known Risks

- There are no automated tests yet. At minimum, add focused tests around angle formulas and threshold boundaries before changing rule logic.
- `recommendation_tier` currently remains `best` even for feet-priority rows. Consumers should not treat it as an overall pass/fail status.
- Deploying the repo root directly is convenient but can expose non-public files.

## References Checked

- Vercel project settings: https://vercel.com/docs/project-configuration/project-settings
- Vercel build configuration: https://vercel.com/docs/builds/configure-a-build
- Vercel `vercel.json` configuration: https://vercel.com/docs/project-configuration/vercel-json
- Vercel CLI deploy command: https://vercel.com/docs/cli/deploy
