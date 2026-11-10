# Datasheet cameras see through a fitted barrel lens, in every view

A datasheet quotes a horizontal and a vertical view (the Dahua HDBW2531R at 2.7 mm: 100 by 72 deg on a 4:3 picture). A distortion-free (pinhole) lens cannot match both: one with a 72 deg vertical view reaches only 88 deg across. A wide lens covers the rest by squeezing more into the edges of its picture (barrel distortion). The console used the 100 deg for the plan and the coverage figures, but drew the 3D views through a pinhole built from the 72 deg, so the plan looked wider than the camera view (10.8 m against 8.7 m at 3 m high, 3.45 m out).

Now a datasheet camera has one lens, used by the coverage figures, the plan, the whole-person framing check, the camera view and the orbit view: the image radius is f(θ + aθ³), θ from the lens axis, with f and a set so both quoted views land exactly on the picture's edges. A camera known by its sensor and focal length stays a pinhole, and a ceiling fisheye keeps its own model (ADR 0003).

## Considered Options

- **Pinhole at the quoted horizontal view**: then it sees 83 deg vertically, not 72, and the framing check and the 3D view would disagree with the datasheet.
- **Pinhole at the quoted vertical view (shrink the coverage)**: under-reports what the camera covers, against the datasheet.
- **A fitted radial lens** (chosen): one free parameter beyond the scale fits both quoted views; a cubic in θ stays monotonic across the whole picture for the wide ends seen so far (a pure sine or tangent family cannot reach the corners of a 100 by 72 deg lens).

## Consequences

- The picture's edges are curves on the floor, so the coverage along the counting line is found by search rather than in closed form; for a pinhole the exact solve is kept.
- The effective 80% is the middle 80% of the picture. Through a barrel lens that covers less floor than a pinhole calculation assumed (7.3 m instead of 8.6 m in the example), because the outer tenth of each side holds more of the scene.
- The camera view shows the bend (straight floor lines bow) and the person at the centre appears larger than before, closer to the real 2.7 mm lens.
- Pixel density is unchanged and still uniform across the picture for a rectilinear camera; making it follow the lens (denser in the middle, thinner at the edges) is a separate decision.
- The fitted lens is a model of the datasheet, not a calibration of a real unit; a measured distortion profile would replace it.
