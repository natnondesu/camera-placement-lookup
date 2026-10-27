# Camera Placement Rule Handoff

How the placement rule works, for business stakeholders and engineers. Terms in **bold** are defined in [GLOSSARY.md](GLOSSARY.md); the big decisions are recorded in [docs/adr](docs/adr).

## The rule in one paragraph

A camera can watch more than one line. The **counting line** is where people are counted; it sits at the **recommended distance**, where the **feet angle** equals the scene's **target feet angle**. The **face line** is a separate line for demographics; it sits at the distance closest to the counting line where the **face angle** is Best. The **verdict** comes from the counting line only: its feet status, or Out of range if a whole person standing there is not in frame. The face line never fails a placement; it is either visible or **Not visible** (outside the frame). The **entrance width** (5 m unless entered) is checked against the width the camera covers at the counting line, without changing the verdict.

## Scene profiles

The thresholds live in [rules/scene-profiles.json](rules/scene-profiles.json), one entry per **scene profile**. Change them there, through a reviewed PR.

| Rule | Open door (default) | Corridor |
| --- | --- | --- |
| When to use | People can also walk across the front of the counted doorway, e.g. a store entrance | People only move one way through the view, e.g. a mall entrance or escalator |
| Height range | 2.0-10.0 m | 2.0-10.0 m |
| Feet Best | 38-43 deg | 35-43 deg |
| Feet target | 41 deg | 38 deg |
| Feet Acceptable | 38-48 deg | 33-48 deg |
| Face Best | 10 deg up to (not including) 25 deg | same |
| Face Acceptable | up to 30 deg; under 10 deg (too flat) is also Acceptable | same |
| Face point / human height | 1.5 m / 1.7 m | same |
| Pixel floor, counting / face | 80 / 200 px/m | same |

Open door has no Acceptable zone farther than its Best band: a counting line too far away is Out of range, because passers-by in front of the door would be miscounted.

## How each number is worked out

All angles are rounded to 0.1 deg before they are judged; feet band edges count as inside.

```text
feet angle            = atan(H / D)
face angle            = atan((H - face point) / D)
recommended distance  = H / tan(target feet angle), rounded to 0.01 m
face line distance    = first distance from the counting line where the face angle is Best
recommended tilt      = atan((H - human height / 2) / D)    aims at the middle of the person
```

`H` is the camera height and `D` the horizontal distance from the point below the camera. Heights outside the profile's range are still judged, with a warning. The framing check uses the camera's vertical field of view around the tilt: the **datasheet field of view** when the camera model has one (exact at both ends of the zoom, estimated in between), otherwise worked out from sensor width, focal length and resolution aspect. A vertical view quoted for one stream shape is cropped or extended for another, keeping the horizontal view.

A **ceiling fisheye** looks straight down (tilt fixed at 90 deg) through an equidistant lens: the image radius grows in step with the angle from straight down. The same rule places its counting line; coverage at the line is the floor seen within 80 deg of straight down, effective coverage the floor inside 80% of the image radius, and pixel density follows the lens model.

The **pixel floor** never changes the verdict: a counting line below it carries a low-density warning, and a face line below the face floor is shown as **too small** ([ADR 0004](docs/adr/0004-pixel-density-floor-warns-without-changing-the-verdict.md)). The starting numbers are defaults; replace them with the analytics vendor's minimums.

## Where it lives

| Piece | File |
| --- | --- |
| Rule engine (pure functions, tested) | `src/placement-rule.js`, tests in `src/placement-rule.test.js` (`pnpm test`) |
| Scene profiles | `rules/scene-profiles.json` |
| Camera catalogue | `rules/cameras.json` |
| Web console | `generate.mjs` builds `public/index.html` with the engine and rules inlined (`npm run build`) |
| Lookup tables | `public/camera-placement-lookup-<profile>.csv`, written by the same build; the Rule table tab can also copy them |
| Share links and site sheet | `src/share-link.js` (tested), `src/site-sheet.js` and `src/site-sheet.css`, inlined by the build |

A **share link** carries the placement in the address itself, so it keeps working for as long as the app stays at its address. Keep camera ids in `rules/cameras.json` once published (retire a camera rather than delete it) so old links still find their camera. The office keeps the **site sheet** PDF in the job folder; its QR code reopens the live placement.

The Excel workbook is no longer a source: export the table from the console instead of editing a spreadsheet copy.
