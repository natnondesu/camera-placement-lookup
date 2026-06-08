# Camera Placement Lookup Rule Handoff

## Purpose

This document explains the camera placement lookup rule for both business stakeholders and software engineers. It covers the rule intent, accepted angle bands, conflict handling, generated lookup table, and implementation details for the current static HTML playground.

## Business Explanation

The lookup table recommends a horizontal camera-to-human distance for each camera height. The goal is to keep the camera view geometrically useful for full-body capture while avoiding a face angle that is too steep.

The rule uses two measured angles:

- Feet angle: angle from the camera down to the subject's feet. This is the primary rule.
- Face angle: angle from the camera to the subject's face point. This is the safety rule.

The feet angle is prioritized because it controls the full-body perspective and is the main placement target. The face angle is still shown separately so operators can see when a camera placement may be too steep for face viewing.

## Assumptions

- Human height: `1.7 m`
- Face point height: `1.5 m` from ground
- Camera height range: `1.8 m` to `20.0 m`
- Camera height increment: `0.1 m`
- Distance means horizontal distance from camera position to subject position
- Recommended distances are rounded to `2` decimal places

## Angle Status Rules

### Feet Angle

| Status       | Rule                             |
| ------------ | -------------------------------- |
| Best         | `36 deg` to `39 deg`             |
| Acceptable   | `32 deg` to `45 deg`             |
| Out of range | Below `32 deg` or above `45 deg` |

Feet status is visually emphasized in the playground because it is the priority rule.

### Face Angle

| Status       | Rule                 |
| ------------ | -------------------- |
| Best         | Less than `25 deg`   |
| Acceptable   | `25 deg` to `30 deg` |
| Out of range | More than `30 deg`   |

## Recommendation Logic

For each camera height, the system tries to find a recommended distance that satisfies both:

- Feet angle is in the best band: `36-39 deg`
- Face angle is best: `<25 deg`

When both can be satisfied, the system prefers a feet angle near `37.5 deg`.

When the best face rule conflicts with the best feet rule, the system prioritizes feet angle and recommends a fixed target of about `38 deg` for feet. This begins around the higher camera-height region, where keeping face angle under `25 deg` while also keeping feet angle at `36-39 deg` may be impossible.

Important business nuance:

- The lookup table can still show a feet-prioritized recommendation even when the face status is only acceptable or out of range.
- The face status column must be read together with the recommended distance.
- A recommendation with face status `out of range` means the feet target is still being honored, but the placement does not satisfy the face-angle safety rule.

## Live Classification Logic

The playground classifies the current slider/input distance with separate labels:

- Feet status: `Best`, `Acceptable`, or `Out of range`
- Face status: `Best`, `Acceptable`, or `Out of range`

The overall status is:

| Overall Status | Rule                                                                       |
| -------------- | -------------------------------------------------------------------------- |
| Best           | Feet is best and face is best                                              |
| Acceptable     | Neither feet nor face is out of range, but at least one is only acceptable |
| Out of range   | Feet is out of range or face is out of range                               |

## Engineering Formula Reference

Let:

- `Hcamera` = camera height in meters
- `Hface` = `1.5 m`
- `D` = horizontal camera-to-subject distance in meters

Feet angle:

```text
feet_angle_deg = atan(Hcamera / D) * 180 / PI
```

Face angle:

```text
face_angle_deg = atan(abs(Hcamera - Hface) / D) * 180 / PI
```

Distance for a target feet angle:

```text
distance_m = Hcamera / tan(target_feet_angle_deg)
```

Minimum distance required to keep face angle under a threshold:

```text
min_face_safe_distance_m = abs(Hcamera - Hface) / tan(max_face_angle_deg)
```

## Lookup Table Generation

For every height from `1.8 m` to `20.0 m`, inclusive, in `0.1 m` steps:

1. Calculate best feet distance band:
   - Min distance uses `39 deg`
   - Max distance uses `36 deg`
2. Calculate acceptable feet distance band:
   - Min distance uses `45 deg`
   - Max distance uses `32 deg`
3. Calculate face-safe best minimum distance:
   - Uses face threshold `<25 deg`
4. Calculate face-safe acceptable minimum distance:
   - Uses face threshold `<=30 deg`
5. Try strict best:
   - Min = max(best feet min, best face-safe min)
   - Max = best feet max
   - If min < max, recommend the `37.5 deg` feet target if it fits; otherwise use the midpoint.
6. If strict best does not exist:
   - Recommend distance for fixed `38 deg` feet angle.
   - Mark priority mode as `feet_priority_38deg`.
7. Round recommended distance to `2` decimals.
8. Recalculate feet and face angles from the rounded recommended distance.
9. Store the face status for the rounded recommendation.

The generated lookup table currently has `183` rows.

## Current Files

Project directory:

```text
./camera-placement-lookup
```

Source generator:

```text
./camera-placement-lookup/generate.mjs
```

Generated static playground:

```text
./camera-placement-lookup/public/index.html
```

Generated CSV:

```text
./camera-placement-lookup/public/camera-placement-lookup.csv
```

Vercel config:

```text
./camera-placement-lookup/vercel.json
```

Run this command from the project directory to regenerate the CSV and HTML:

```bash
npm run build
```

Run this syntax check before regeneration or handoff:

```bash
npm run check
```

## CSV Column Meanings

| Column                                | Meaning                                                                                                                           |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `camera_height_m`                     | Camera height for the row                                                                                                         |
| `face_height_m`                       | Face point assumption, currently `1.5`                                                                                            |
| `human_height_m`                      | Human height assumption, currently `1.7`                                                                                          |
| `recommended_distance_m`              | Recommended horizontal distance, rounded to 2 decimals                                                                            |
| `recommendation_tier`                 | Current recommendation tier. In this implementation, it is feet-priority oriented and should not be used alone as full pass/fail. |
| `priority_mode`                       | `strict_best` or `feet_priority_38deg`                                                                                            |
| `recommended_feet_angle_deg`          | Feet angle at the rounded recommended distance                                                                                    |
| `recommended_face_angle_deg`          | Face angle at the rounded recommended distance                                                                                    |
| `face_status`                         | Face classification at the rounded recommended distance                                                                           |
| `best_feet_distance_min_m`            | Minimum distance for the best feet band                                                                                           |
| `best_feet_distance_max_m`            | Maximum distance for the best feet band                                                                                           |
| `face_safe_acceptable_distance_min_m` | Minimum distance that keeps face angle `<=30 deg`, combined with acceptable feet lower bound                                      |
| `face_safe_acceptable_distance_max_m` | Maximum distance from acceptable feet band                                                                                        |
| `note`                                | Human-readable explanation of the selected recommendation                                                                         |

## Known Implementation Nuance

`recommendation_tier` in the generated table currently remains `best` for feet-prioritized recommendations. Engineers should not treat this column alone as the final business acceptability status.

For full acceptability:

- Use feet status and face status together in live classification.
- In the table, read `recommended_distance_m`, `recommended_feet_angle_deg`, `recommended_face_angle_deg`, and `face_status` together.
- If business wants table-level overall status, add a separate `overall_status` column rather than changing the meaning of `recommendation_tier`.

## Recommended Next Engineering Tasks

- Add a table-level `overall_status` column if business stakeholders need one-pass filtering.
- Add small unit tests for angle formulas, threshold boundaries, and strict-best conflict cases.
- Consider separating generator logic from HTML template if this grows beyond a static playground.
- Decide whether high camera heights with face `out of range` should remain listed as feet-prioritized recommendations or require a separate warning tier.
