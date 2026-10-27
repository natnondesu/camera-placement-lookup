---
version: 1
slug: "prototype-placement-console-prototype-html"
primary_target: "prototype/placement-console.prototype.html"
related_targets: []
---

# Placement Console (prototype/placement-console.prototype.html)

Scope: the single working screen of the camera placement tool. Visitor mode: Operate. Used on site on a phone or tablet in bright store light; desk use secondary. Job: check one placement and get the numbers (counting line distance, face line distance, tilt) to hand to the installer. Must not feel dense or decorative. The lookup table stays available as the engineering source of truth.

## Direction contract

THESIS: Every reading is keyed to the spot on the side-view sketch where it was measured. Refuses the category default of an input form, a floating result card and a separate diagram whose numbers are not tied to the geometry.

OWN-WORLD: Surveyor's field book. Field-book yellow cover band (#f2c230) is the shell and holds scene, mount height and camera. Page-white ground; faint blue rules only behind the sketch. Rule blue is the counting line, violet the face line, margin red only for Out of range, graphite ink. Circled station tags 1, 2, C. One hairline border system (1px, radius 6). Noto Sans with Noto Sans Thai, tabular figures, no monospace.

STORY: The installer picks the scene, height and camera in the yellow band, reads the verdict, sees on the sketch where each line goes, reads the tagged rows for the numbers, fine-tunes distance, tilt, lens or floor depth if needed, and copies the readings.

FIRST VIEWPORT: Phone 390: yellow band (scene, height stepper, camera) on top; verdict module; side-view sketch with tags and a draggable counting line; reading rows 1, 2, C start at the fold. Desktop: band across the top, readings and fine-tune in a left column, a large sketch on the right. Primary action: the height stepper in the band; Copy readings sits on the readings module.

FORM: Field Book, position 4 of the ordered grounded list, seed key df5d2c6a. Signature interaction: selecting a reading row or its tag lights both the row and its mark on the sketch; dragging the counting line updates every reading in its fixed slot. Motion: a changed value briefly underlines in cover yellow, nothing reflows.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
