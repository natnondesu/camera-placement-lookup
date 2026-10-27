# Camera Placement

Deciding where to mount a people-counting camera relative to where people walk, so that counting is reliable first and demographic capture is possible second.

## Rules

**Placement rule**:
The logic that judges a placement and places the counting line and face line, given a camera height and a scene profile.
_Avoid_: Golden rule, lookup rule

**Scene profile**:
A named set of thresholds for one kind of scene, such as Open door (the default) or Corridor. Holds the target feet angle, the feet and face bands, the face point, the human height and the height range it was designed for.
_Avoid_: Preset, mode, rule tab

**Open door**:
A scene where people can also walk across the front of the counted doorway, so passers-by can be miscounted; for example a store entrance. The stricter scene profile and the default.

**Corridor**:
A scene where people can only move in one direction through the view, with no crossing path; for example a mall entrance or an escalator.
_Avoid_: Corlidor

**Target feet angle**:
The feet angle a scene profile aims the counting line at. A deliberate setting, not the middle of the Best band.
_Avoid_: Ideal angle, priority angle

**Height range**:
The camera heights a scene profile was designed for. Heights outside it are still judged, with a warning.

## Geometry

**Distance**:
Horizontal ground distance from the point directly below the camera to a person's feet.
_Avoid_: Subject distance, range

**Feet angle**:
The downward angle from the camera to a person's feet on the ground.
_Avoid_: Ground angle, best angle, depression angle

**Face point**:
The assumed height of a person's face above the ground, set per scene profile.
_Avoid_: Face height (when it could be confused with human height)

**Face angle**:
The downward angle from the camera to a person's face point.
_Avoid_: Face tilt angle

**Human height**:
The assumed height of a person, set per scene profile. A person at the counting line must fit in the frame from feet to this height.

**Tilt**:
How far the camera itself is aimed downward. Not a property of a person's position.

**Recommended tilt**:
The tilt the tool suggests: aimed at half the human height of a person standing at the counting line. The face line is checked at that aim, not chased. The installer may override it.

**Entrance width**:
The on-site width of the door or entrance people pass through, 5 m unless entered, checked against the width the camera covers at the counting line. Fully covered within the effective coverage, tight beyond it but still in view, too wide past the view. Never changes the verdict.
_Avoid_: Door size, opening

**Effective coverage**:
The part of the image where detection is reliable: the middle 80% of a normal lens's width, or the inner 80% of a fisheye's image radius.
_Avoid_: Usable area, safe zone

**Camera model**:
A specific camera's sensor, lens range and resolutions, used to work out what is in frame. Independent of any scene profile.
_Avoid_: Preset

**Datasheet field of view**:
The horizontal and vertical view the manufacturer states for a camera model, at the wide and tele ends of its zoom (the same at both for a fixed lens). The tool matches it exactly at both ends and estimates the zoom steps in between, because wide lenses see more than sensor size and focal length predict.
_Avoid_: Lens option, nominal FOV

**Ceiling fisheye**:
A camera model with a fisheye lens mounted on the ceiling looking straight down, so its tilt is always 90 degrees. Judged by the same placement rule as other cameras: the counting line still sits at the recommended distance from the point below it.
_Avoid_: 360 camera, panoramic camera

## Lines

**Counting line**:
The line in the camera's view where people are counted. It sits at the recommended distance.
_Avoid_: Detection line, trigger line

**Recommended distance**:
The distance of the counting line: the distance at which the feet angle equals the profile's target feet angle.
_Avoid_: Target best distance, counting distance

**Face line**:
A separate line in the same camera's view used for demographic capture. It sits at the face line distance and coincides with the counting line when the face angle there is already Best.
_Avoid_: Demographic line, capture zone

**Face line distance**:
The distance closest to the counting line at which the face angle is Best.

**Not visible**:
The face line's state when demographic capture is impossible at the placement, because the face point is outside the frame or the camera is not above the face point. Always shown with its reason.
_Avoid_: Out of view

**Too small**:
The face line's state when it is in frame but the pixel density at the face is below the profile's face floor, so faces are too few pixels across for demographics. Never fails a placement.
_Avoid_: Blurry, low quality

**Pixel density**:
How many image pixels cover one metre across at a point, in px/m. Read at the counting line for counting and at the face point on the face line for faces.
_Avoid_: PPM (in prose), resolution

**Pixel floor**:
The minimum pixel density a scene profile asks for, one for counting and one for faces. A counting line below its floor carries a low-density warning; the verdict is unchanged.
_Avoid_: Minimum resolution

## Judgement

**Status**:
How well one angle fits its bands: Best, Acceptable, or Out of range. A feet status and a face status are judged separately. A face angle that is too flat to be Best is Acceptable, never Out of range.
_Avoid_: Tier, ideal, pass/fail

**Verdict**:
The single overall status of a placement: the feet status at the counting line, or Out of range if the whole person at the counting line is not in frame. The face line never fails a placement.
_Avoid_: Overall status, pass/fail

**Lookup table**:
For one scene profile, the recommended distance, angles and face line distance at each camera height in its height range. Valid for any camera model.
_Avoid_: Rule table, golden table

**Share link**:
A link that holds a whole placement (scene, camera, zoom, height, line, entrance, site and location), the rules version and the verdict when it was made. Nothing is stored anywhere else; opening the link restores the placement and says if today's rules give a different verdict.
_Avoid_: Saved placement, permalink

**Site sheet**:
The printable one-page record of a placement for the installer: install steps, side elevation, simulated camera view, readings, warnings, an as-installed check-off and a QR code of its share link.
_Avoid_: Report, install sheet
