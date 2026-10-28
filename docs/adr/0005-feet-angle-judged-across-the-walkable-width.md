# The feet angle is judged across the walkable width

Real mounts rarely sit on the entrance centre line, and an off-centre camera sees one side of the doorway much closer than the other. Judging only the middle of the entrance hid that: a camera 1.2 m off-centre over a 5 m entrance at 4 m height was rated on its middle point while the far side of the doorway sat at 37.5 deg, outside Open door's bands. The camera now has an offset from the entrance centre line and turns to aim at the middle; the feet angle is judged at the nearest and farthest points of the walkable width (the entrance less 0.35 m clear of each frame) and at the middle, and the worst decides. The rule applies to centred cameras too.

## Considered Options

- **Whole entrance width**: strict to the frames. At 4 m a 5 m entrance would be Best only from 4.29 to 4.47 m, and the long-standing recommended 4.60 m would become Out of range at the frames (37.4 deg), where nobody walks.
- **Middle of the entrance only**, as before: keeps every old answer but cannot judge an off-centre camera, which is the case the feature exists for.
- **Walkable width** (chosen): the 0.35 m margin is the one the walk simulation already keeps people inside. A centred 5 m entrance keeps its 4.60 m answer; an off-centre camera is caught.

## Consequences

- Solving for distance or height now searches for the window where every walkable point is Best (then Acceptable), and picks the value closest to the target angle at the middle. Some placements have no Best distance at all from a given offset, and a wide enough entrance has none even when centred; the console says so instead of recommending a distance that fails.
- Whole-person framing is checked at every judged point, so a narrow vertical view on a panned camera can lose the far edge of the doorway.
- The entrance coverage check still warns without changing the verdict; it now follows the panned view, which covers a shifted stretch of the counting line.
- The face line is judged along the middle of the entrance. Far enough off-centre there is no face-Best spot on it, and the console says so.
- The lookup table stays a centred, middle-only table: it has no entrance width or camera to judge across.
