# Face angle is judged on a separate face line, not the counting line

The application supports several lines per camera, so demographic capture does not have to happen where people are counted. We place the counting line by the feet angle alone and put a separate face line at the distance closest to the counting line where the face angle is Best (checked to be inside the camera's frame). The verdict depends only on the counting line: its feet status, or Out of range if the whole person there is not in frame. The face line never fails a placement.

## Considered Options

- **Worse of feet and face at one line** (the original v1/v2 behaviour): on mounts above roughly 4.5-5.8 m the face angle at the counting line is over 30 degrees, so most heights failed even though counting was fine.
- **Flatten the feet angle until the face fits** ("face guard"): weakens counting to serve a secondary goal, and cannot succeed for Open door above about 5.7 m.
