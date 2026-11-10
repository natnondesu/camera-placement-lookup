# Datasheet cameras see through a fitted barrel lens, in every view

A datasheet quotes a horizontal and a vertical view (the Dahua HDBW2531R at 2.7 mm: 100 by 72 deg on a 4:3 picture). A distortion-free (pinhole) lens cannot match both: one with a 72 deg vertical view reaches only 88 deg across. A wide lens covers the rest by squeezing more into the edges of its picture (barrel distortion). The console used the 100 deg for the plan and the coverage figures, but drew the 3D views through a pinhole built from the 72 deg, so the plan looked wider than the camera view (10.8 m against 8.7 m at 3 m high, 3.45 m out).

Now a datasheet camera has one lens, used by the coverage figures, the plan, the whole-person framing check, the camera view and the orbit view. Its shape, an image radius in proportion to θ + aθ³ (θ from the lens axis), is fitted once at the wide end, on the picture the datasheet quotes that end for, so both quoted views land on its edges. Toward the long end the lens straightens into a pinhole, in step with the tangent of the half view across. The scale comes from the horizontal view, and every stream is cut from that picture, so its vertical view follows from the lens rather than being quoted or interpolated. A camera known by its sensor and focal length stays a pinhole, and a ceiling fisheye keeps its own model (ADR 0003).

## Considered Options

- **Pinhole at the quoted horizontal view**: then it sees 83 deg vertically, not 72, and the framing check and the 3D view would disagree with the datasheet.
- **Pinhole at the quoted vertical view (shrink the coverage)**: under-reports what the camera covers, against the datasheet.
- **A radial lens refitted at every zoom and stream from the interpolated views**: built first. Right at the wide end, but between the ends the interpolated vertical view is not reliable (20.9 deg at 9 mm on 16:9 where the real camera measures 22.4 deg), and fitting to it invented strong distortion: the 6.0 m line landed 12 px from the real one, worse than the old pinhole.
- **One wide-end shape blended into a pinhole** (chosen): reproduces every check below without being fitted to any of them.

## Evidence

From the report "Lens model vs real camera" (10 Nov 2026), against the camera ICON-CA-B1B-04B and Dahua's datasheet:

- Diagonal at 2.7 mm: 134.4 deg against the quoted 133 deg; only the horizontal and vertical were fitted.
- Dahua's DORI distances: the lens's centre pixels give Identify (250 px/m) at 6.4 m within 1% at 2.7 mm and at 22 m within 2% at 13.5 mm.
- The real frame at about 9 mm on the 16:9 stream: the vertical view comes out at 22.36 deg against the measured 22.39 deg, the centre scale within 0.2%, and the rendered 6.0 m line 1.4 px from the real glass line (the camera fitted to that frame is itself 1.8 px off).

These are tests in the engine's test file.

## Consequences

- The picture's edges are curves on the floor, so the coverage along the counting line is found by search rather than in closed form; for a pinhole the exact solve is kept.
- The effective 80% is the middle 80% of the picture. Through a barrel lens that covers less floor than a pinhole calculation assumed (7.3 m instead of 8.6 m at 3 m high, 3.45 m out, 2.7 mm), because the outer tenth of each side holds more of the scene.
- The vertical view the console shows for a stream other than the datasheet's own shape is now the lens's, not a scaled quote; at the long end it is the pinhole's (19.6 deg against a quoted 20 deg).
- The camera view shows the bend at the wide end (straight floor lines bow) and almost none at the long end.
- Pixel density is unchanged and still uniform across the picture for a rectilinear camera; making it follow the lens is a separate decision (deferred on 10 Nov).
- The lens is a model of the datasheet checked against one real camera at one zoom; a field test at the wide end, or a measured distortion profile, would replace or confirm it.
