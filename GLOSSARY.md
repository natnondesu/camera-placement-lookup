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
The tilt the tool suggests: it frames the whole person at the counting line first, and the face point at the face line if it can. The installer may override it.

**Available depth**:
The optional on-site distance to the farthest floor where people can stand in view. Entered per placement, not part of a scene profile.
_Avoid_: Floor depth, room length

**Camera model**:
A specific camera's sensor, lens range and resolutions, used to work out what is in frame. Independent of any scene profile.
_Avoid_: Preset

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
The face line's state when demographic capture is impossible at the placement, either because the face point is outside the frame or because the face line lies beyond the available depth. Always shown with its reason.
_Avoid_: Out of view, no floor

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
