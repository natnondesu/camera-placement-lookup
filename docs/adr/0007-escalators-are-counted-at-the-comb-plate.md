# Escalators are counted at the comb plate with the Open door thresholds

People ride an escalator in a straight line and step off onto a flat landing. The Escalator scene counts them at the comb plate, the edge of the escalator where the steps meet the landing floor, and judges the placement with exactly the Open door thresholds. The counting line sits exactly on that edge, so the recommended distance is measured from the camera to the escalator's edge. The engine keeps its flat floor. Escalators come as a pair (one brings people to the landing, the other takes them away), and a Landing switch says whether the camera is above them (top landing, the escalators drop away) or below them (bottom landing, they rise away). The landing and the escalator pair are drawn as scenery; they do not change the thresholds or the verdict. The pair width is the only input the rule takes from them, as the walkable width it judges.

## Considered Options

- **Escalator thresholds of their own**: the owner decided the scene uses exactly the Open door rule, with no new thresholds.
- **An inclined-floor engine**: the owner decided the engine keeps its flat floor; the counting line is on the landing floor, at the comb plate.
- **A counting line on the landing, a few steps after the comb plate**: the first version put the line 1.5 m in front of the escalator. The owner moved it to the escalator's edge, which an installer can find and measure to on site.
- **A label on Open door**: a separate scene lets the console draw the pair of escalators and the landing, which a label could not.
- **Own scene on the Open door thresholds** (chosen): the scene exists to place and draw the escalators correctly while the rule stays the one installers already trust.

## Consequences

- The thresholds are duplicated in `rules/scene-profiles.json` and held equal to Open door by a test, so they cannot drift quietly.
- The face line is placed on a flat floor. It falls on the comb plate or beyond it, on the escalator itself. Up to a 4.0 m mount it is on the counting line or the level steps; from a 4.1 m mount upward it falls on the incline, where people ride lower (top landing) or higher (bottom landing), so the console says that face reading is approximate there. The 3D view shows people where they really are, on the steps.
- The pair is judged as one walkable stretch, divider included: the width field means the outer step edge to the outer step edge (a standard pair is 2.6 m), and the ends that warn are the outer step edges.
- The landing is part of the link (written only for this scene) and Reset keeps it. The rules version does not change: no existing scene's thresholds moved.
- People arrive on the right-hand escalator as the camera faces the pair and leave on the left-hand one. The 3D view and the standing person on the face line follow this.
- The far incline is not measured: riders more than 2 m beyond the comb plate get no detection box, label or occlusion sample, except one at the face line, which is the face window's subject. Their faces still count at the face line.
