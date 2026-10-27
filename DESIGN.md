---
name: Camera Placement Console
description: A surveyor's field book for camera placement. A yellow cover band holds the inputs, and the page holds a keyed side-view sketch with its tagged readings.
colors:
  cover-yellow: "#f2c230"
  cover-ink: "#3a2e05"
  page-white: "#fbfcf8"
  sheet-white: "#ffffff"
  graphite-ink: "#23262a"
  graphite-2: "#4f545a"
  graphite-3: "#6b7076"
  hairline: "#c9cec2"
  hairline-soft: "#e3e6de"
  rule-blue: "#2659a8"
  rule-blue-tint: "#e6eef9"
  face-violet: "#6a3db0"
  face-violet-tint: "#f0e9f9"
  ochre: "#855d00"
  ochre-tint: "#fbf0d2"
  margin-red: "#b3302a"
  ruled-line: "rgba(46, 109, 180, 0.12)"
typography:
  headline:
    fontFamily: "Noto Sans, Noto Sans Thai, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.015em"
  reading-value:
    fontFamily: "Noto Sans, Noto Sans Thai, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
  control-value:
    fontFamily: "Noto Sans, Noto Sans Thai, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    fontFeature: "tnum"
  title:
    fontFamily: "Noto Sans, Noto Sans Thai, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 700
  body:
    fontFamily: "Noto Sans, Noto Sans Thai, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum"
  callout:
    fontFamily: "Noto Sans, Noto Sans Thai, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    fontFeature: "tnum"
  label:
    fontFamily: "Noto Sans, Noto Sans Thai, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "12.5px"
    fontWeight: 600
rounded:
  hairline: "6px"
  chip: "13px"
  station: "50%"
spacing:
  tight: "8px"
  gap: "12px"
  module-inset: "14px"
  gutter: "16px"
  gutter-wide: "24px"
components:
  cover-band:
    backgroundColor: "{colors.cover-yellow}"
    textColor: "{colors.graphite-ink}"
    padding: "14px 16px 16px"
  module:
    backgroundColor: "{colors.sheet-white}"
    rounded: "{rounded.hairline}"
    padding: "{spacing.module-inset}"
  stepper:
    backgroundColor: "{colors.page-white}"
    textColor: "{colors.graphite-ink}"
    typography: "{typography.control-value}"
    rounded: "{rounded.hairline}"
    height: "44px"
  segmented:
    backgroundColor: "{colors.page-white}"
    textColor: "{colors.graphite-ink}"
    rounded: "{rounded.hairline}"
    height: "44px"
  segmented-selected:
    backgroundColor: "{colors.graphite-ink}"
    textColor: "{colors.page-white}"
  select:
    backgroundColor: "{colors.page-white}"
    textColor: "{colors.graphite-ink}"
    rounded: "{rounded.hairline}"
    height: "44px"
    padding: "0 40px 0 12px"
  button:
    backgroundColor: "{colors.page-white}"
    textColor: "{colors.graphite-ink}"
    rounded: "{rounded.hairline}"
    height: "36px"
    padding: "0 12px"
  button-hover:
    backgroundColor: "{colors.hairline-soft}"
  button-quiet:
    backgroundColor: "{colors.page-white}"
    textColor: "{colors.graphite-2}"
    rounded: "{rounded.hairline}"
    height: "36px"
    padding: "0 12px"
  chip-best:
    backgroundColor: "{colors.rule-blue}"
    textColor: "{colors.sheet-white}"
    rounded: "{rounded.chip}"
    height: "26px"
  chip-acceptable:
    backgroundColor: "{colors.ochre-tint}"
    textColor: "{colors.ochre}"
    rounded: "{rounded.chip}"
    height: "26px"
  chip-out-of-range:
    backgroundColor: "{colors.margin-red}"
    textColor: "{colors.sheet-white}"
    rounded: "{rounded.chip}"
    height: "26px"
  chip-face-visible:
    backgroundColor: "{colors.face-violet-tint}"
    textColor: "{colors.face-violet}"
    rounded: "{rounded.chip}"
    height: "26px"
  station-tag-1:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.rule-blue}"
    rounded: "{rounded.station}"
    size: "32px"
  station-tag-2:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.face-violet}"
    rounded: "{rounded.station}"
    size: "32px"
  station-tag-c:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.graphite-ink}"
    rounded: "{rounded.station}"
    size: "32px"
  reading-row-1-active:
    backgroundColor: "{colors.rule-blue-tint}"
    padding: "12px 14px"
  reading-row-2-active:
    backgroundColor: "{colors.face-violet-tint}"
    padding: "12px 14px"
  reading-row-c-active:
    backgroundColor: "{colors.hairline-soft}"
    padding: "12px 14px"
---

# Design System: Camera Placement Console

## Overview

**Creative North Star: "The Surveyor's Field Book"**

The console reads like a surveyor's field book that has been opened on site. A field-book yellow cover band runs across the top and holds the three inputs that define a placement: scene, mount height and camera. Below it is the page, a near-white ground carrying a side-view sketch and the readings taken from it. Each reading is keyed to a circled station tag (1, 2, C) that appears both on the sketch and on its reading row, so every number points back to the spot where it was measured. The readings are not a floating result card next to an unrelated diagram.

The system is calm and instrument-like. Inputs use one control vocabulary (44px tall, 1px ink border, 6px radius). Modules are white sheets edged with one hairline. Color carries meaning and nothing else: rule blue is the counting line, violet is the face line, ochre is the Acceptable middle state, margin red is failure, and graphite is everything else. Faint blue ruled lines appear only behind the sketch, where the field-book page shows through. Motion is limited to what a pencil would do. A changed value gets a brief underline in cover yellow, and nothing moves or reflows.

The world is single-theme light by choice. The tool is used on site on a phone or tablet in bright store light, where a light page with dark ink reads best. There is no dark theme, and `color-scheme: light` is declared.

**Key Characteristics:**
- Yellow cover band as the input shell, with a 1px graphite rule at its bottom edge.
- Circled station tags 1, 2, C link sketch marks to reading rows.
- Fixed reading slots. Values change in place and the layout never reflows.
- One hairline border system (1px, 6px radius). Flat, with a single soft shadow on the drag grip.
- Noto Sans with Noto Sans Thai, tabular figures throughout, no monospace.
- Single light theme, tuned for bright on-site light.

## Colors

The palette is a field-book page in graphite ink with three survey colors and one yellow cover. Hue is reserved for meaning.

### Primary
- **Field-Book Cover Yellow** (cover-yellow): The cover band behind scene, height and camera. Also the camera body on the sketch, text selection, and the brief changed-value underline. Text never sits on yellow except in graphite or cover-ink.
- **Cover Ink** (cover-ink): Field labels and the rules version on the yellow band, where graphite-2 would read muddy.

### Secondary
- **Rule Blue** (rule-blue): The counting line (station 1). Covers the counting line and its dashed sight ray on the sketch, the station-1 tag, the counting-line distance value, the Best verdict mark and chip, the drag grip, the camera's view wedge (7% fill, 28% stroke), focus rings and the text caret. Its tint (rule-blue-tint) fills the active station-1 row and the current lookup-table row.
- **Face Violet** (face-violet): The face line (station 2). Covers the face line, its sight ray and figure on the sketch, the station-2 tag, the face distance value, and the Visible chip. Its tint (face-violet-tint) fills the active station-2 row and the Visible chip.

### Tertiary
- **Ochre** (ochre): The Acceptable state, plus the height warning strip. Ochre on ochre-tint, with an inset ochre ring.
- **Margin Red** (margin-red): Failure only. Covers the Out of range verdict mark, chip and headline, field errors, the invalid stepper border, the counting figure on the sketch when it falls outside the frame, and bad reading notes.

### Neutral
- **Graphite Ink** (graphite-ink): Body text, every control border, the selected segment and tab fill, the floor line, mast, tilt arc, and the station-C tag.
- **Graphite 2** (graphite-2): Secondary prose such as the verdict reason, hints, notes, sketch scale numerals and quiet buttons.
- **Graphite 3** (graphite-3): Units, value labels (dt), table headers and the height dimension line.
- **Page White** (page-white): The page ground, control fills, and hover rows.
- **Sheet White** (sheet-white): Module sheets, the stepper value well, text inputs and sticky table headers.
- **Hairline** (hairline): Module borders, quiet button borders, scrollbar and chip rings.
- **Hairline Soft** (hairline-soft): Dividers inside modules, control hover, and the active station-C row.
- **Ruled Line** (ruled-line): Faint 1px blue rules every 22px, drawn only behind the sketch stage.

### Named Rules
**The Survey Color Rule.** Rule blue means counting line, violet means face line, and graphite means camera. These hues are never used for decoration, and a station keeps its hue everywhere it appears: line, tag, value, row tint and chip.

**The Forced Ochre Rule.** The verdict ladder has three states (Best, Acceptable, Out of range), but the world supplied only blue and red. Ochre is a forced adaptation to fill the middle rung. It is used for Acceptable and the height warning and nothing else. It is always ochre text on ochre-tint with an inset ochre ring, never a solid ochre fill, so it stays visibly weaker than Best and Out of range.

**The Margin Red Rule.** Red marks failure: Out of range, a figure outside the frame, invalid input. It never marks emphasis, a selection or a warning.

**The Never Color Alone Rule.** Every state chip and verdict mark pairs its color with a drawn shape (check, triangle, cross, eye, eye-off, dot) and a word.

## Typography

**Display Font:** none. The largest type is the 26px verdict and reading values.
**Body Font:** Noto Sans with Noto Sans Thai (fallback system-ui, -apple-system, Segoe UI, sans-serif)
**Label/Mono Font:** none. Numbers use tabular figures in Noto Sans.

**Character:** One humanist sans covers Thai and Latin, set heavy (700) for values and plain (400) for prose. The type is legible at arm's length in bright light, and figures line up because `tabular-nums` is set on body and inherited everywhere.

**Online-only dependency.** Noto Sans (400, 500, 600, 700) and Noto Sans Thai (400, 600, 700) load from fonts.googleapis.com with `display=swap`, and the page preconnects to fonts.googleapis.com and fonts.gstatic.com. Offline, the page falls back to system-ui. This is a known dependency. Self-hosting woff2 subsets was considered and declined because the artifact is served from claude.ai.

### Hierarchy
- **Headline** (700, 26px, 1.1, -0.015em): The verdict headline. It turns margin red only when the verdict is Out of range.
- **Reading value** (700, 26px, 1.1, -0.01em, tabular): The numbers in reading rows. Units follow at 15px/600 in graphite-3. The lead value of a station takes its station hue.
- **Control value** (700, 18px, tabular): The number inside a stepper.
- **Title** (700, 16px): Reading row titles. Module headings run at 15px/700 and the masthead at 17px/700, -0.01em.
- **Body** (400, 15px, 1.45): Default text. Inputs and selects are 16px/600 to avoid mobile zoom. Hints and notes are 13 to 14px in graphite-2.
- **Callout** (700, 13px, tabular): Numbers drawn on the sketch, such as distances, tilt and height. They have a 3px white halo (`paint-order: stroke`) so they stay legible over lines.
- **Label** (600, 12.5px): Field labels, value labels and table headers. Sentence case, never uppercase-tracked.

### Named Rules
**The Tabular Figures Rule.** Every number uses tabular figures in the body face. Monospace is not used. (PRODUCT.md's principle mentions monospace for measurements. The build replaced it with tabular Noto Sans, and the build is authoritative.)

## Layout

The layout is mobile-first and single column at 390px. The cover band comes first (scene and height side by side, camera full width), then the modules stack in reading order: verdict, sketch, readings, fine-tune, lookup table. The page inset is 16px and modules are 12px apart.

At 720px the band fields move to three columns and the masthead (title plus rules version) appears. At 1024px the band becomes a two-column grid (masthead, fields) with a 24px inset, and the page splits into a 360 to 420px left column (verdict, readings, fine-tune) and a fluid right column (sketch, lookup table) with 16px gaps. The maximum content width is 1280px.

The spacing rhythm is tight and even: 8px between controls in a row, 12px between modules and grid cells, 14px inside modules, and 16 to 24px at the page edge. Every touch target is at least 44px. Controls are 44px tall, the sketch grip has a 44px hit area, and SVG tags have a 22px-radius invisible hit circle.

**The Fixed Slot Rule.** Every value lives in a fixed slot. When inputs change, text is replaced in place and the layout does not move. The sketch resizes to its content, but readings never reflow.

## Elevation & Depth

The system is flat. Depth comes from the yellow band over a white page, white sheets on a near-white page, and 1px borders. Chips and the Acceptable mark use inset rings (`box-shadow: inset 0 0 0 1px` or `2px`), which act as borders rather than elevation.

### Shadow Vocabulary
- **Grip lift** (`box-shadow: 0 2px 6px rgba(35, 38, 42, 0.35)`): Used only on the round counting-line drag grip, so it reads as something you can pick up. On hover, focus or drag it scales to 1.12.

### Named Rules
**The One Lift Rule.** The drag grip is the only element with a drop shadow. Everything else sits flat on the page.

## Shapes

All borders are 1px. Corners are 6px on modules, controls, buttons, tabs and the warning strip. Chips are pill-shaped (13px on a 26px height). Station tags, the verdict mark and the grip are circles. Controls take a graphite-ink border because they are what you touch. Modules take a hairline border because they hold things. The cover band ends in a 1px graphite rule instead of a radius. The only dashed outline is the fixed-lens indicator, a dashed hairline that marks a value you cannot change.

On the sketch, line style encodes status. Sight rays are dashed (7 4 for counting, 5 4 for face). A face line that is not visible becomes dotted (2 5, with the vertical at 4 4) and its figure fades to 20%. The floor beyond the measured depth is hatched at 45°.

## Components

### Cover Band
- **Character:** The yellow cover of the field book, holding the inputs.
- **Contents:** Scene segmented control, mount height stepper (the primary action), camera select. Labels are in cover-ink.
- **Edge:** 1px graphite-ink bottom border. There is no shadow.

### Controls (stepper, segmented, select, text input)
- **Shape:** 44px tall, 1px graphite-ink border, 6px radius, page-white fill.
- **Stepper:** 44px minus and plus buttons (40px in the band) around a sheet-white value well with ink side borders. The value is 18px/700, right-aligned, with its unit in graphite-3.
- **Segmented:** Equal columns with ink dividers. The selected segment is solid graphite with page-white text.
- **Hover / Active:** hairline-soft on hover, hairline on press, 160ms transition.
- **Focus:** 2px rule-blue outline at 2px offset. Composite controls show it on the wrapper (`:focus-within`).
- **Error:** The stepper border turns margin red, and a 13px/600 red message appears below.

### Buttons
- **Shape:** 36px tall, 6px radius, 1px graphite-ink border, page-white fill, 14px/600, with a leading 18px stroke icon.
- **Hover / Active:** hairline-soft on hover, hairline on press.
- **Quiet:** Hairline border and graphite-2 text. Used for Use recommended, Clear and Copy CSV.

### Chips
- **Style:** 26px pill, 13px/700, with a 14px icon. In the lookup table they are 22px tall and 12px type.
- **States:** Best is solid rule blue with white text. Acceptable is ochre on ochre-tint with an ochre ring. Out of range is solid margin red with white text. Visible is violet on violet-tint with a violet ring. Hidden is graphite-2 on page-white with a hairline ring. Neutral is ink on page-white with a hairline ring.

### Verdict
- **Layout:** A 40px circular mark (check, triangle or cross) next to the 26px headline and a 14px graphite-2 reason.
- **States:** The mark follows the chip ladder. Only Out of range turns the headline red.
- **Height warning:** A full-width ochre-tint strip with ochre 13.5px/600 text and a triangle icon.

### Station Tags (signature)
- **Set:** 1 is the counting line in rule blue, with a heavier 3px ring. 2 is the face line in violet, with a 2px ring. C is the camera in graphite ink, with a 2px ring.
- **At rest:** A sheet-white circle with a hue ring and hue numeral. In rows the tag is 32px. On the sketch it is a 14px-radius circle with 14px/700 type and a 22px hit area.
- **Active:** Solid hue fill with a white numeral.
- **Linking:** Selecting a reading row or its sketch tag activates both. The row takes its station tint, and the station's line on the sketch thickens (counting 3.5 to 5px, face 1.8 to 3px).

**The Never Dim Numbers Rule.** When a station is active, the line groups of the other stations dim to 60% opacity. Numeric callouts and station tags are drawn outside the dimmed groups and always stay at full strength, so every number on the sketch stays readable whichever station is selected.

### Reading Rows
- **Layout:** A 32px tag column, then the title row with its chip pushed right, a two-column value list (12.5px label over a 26px value), and a 13.5px note.
- **Rows:** Separated by hairline-soft rules. Hover fills page-white. The active row takes its station tint.
- **Copy readings** sits in the module header. If the clipboard is blocked, a read-only textarea appears instead.

### Changed-Value Underline
- **Behavior:** When a slot's text changes outside a drag, a cover-yellow bar 0.32em tall appears under the text and shrinks to zero over 900ms on cubic-bezier(0.16, 1, 0.3, 1). It is drawn as a background-size animation, so nothing reflows.
- **Reduced motion:** Disabled. The animation only exists under `prefers-reduced-motion: no-preference`, and reduced motion also removes all transitions.

### Sketch
- **Stage:** Faint blue ruled lines every 22px behind a full-width SVG. A Side and Camera view tab pair sits in the header (34px, ink fill when selected).
- **Drawing:** Graphite floor line with metre ticks, camera mast, a yellow camera body, the rule-blue view wedge, stick figures at each line, and a height dimension in graphite-3.
- **Grip:** A rule-blue circle on the counting line (44px hit area) with a white drag icon. It is also a keyboard slider.
- **Legend:** A foot strip with line keys (3px blue, 2px violet) and a one-line instruction.

### Lookup Table
- **Container:** A collapsible module (details element) with a rotating chevron (200ms).
- **Table:** 14px. Sticky 12.5px headers. Numbers are right-aligned, and the first column is left-aligned. The current row is filled with rule-blue-tint and set in bold. Clicking a row loads that height.

## Do's and Don'ts

### Do:
- **Do** keep scene, height and camera in the cover-yellow band, with the height stepper as the primary action.
- **Do** key every measured value to its station tag and hue: 1 in rule blue, 2 in violet, C in graphite.
- **Do** keep numeric callouts and station tags at full opacity when other stations dim to 60%.
- **Do** update values in fixed slots with the cover-yellow underline, and drop it under reduced motion.
- **Do** use one control vocabulary: 44px height, 1px graphite-ink border, 6px radius, 2px rule-blue focus ring.
- **Do** pair every state color with an icon and a word.
- **Do** use tabular figures in Noto Sans for all numbers.

### Don't:
- **Don't** use rule blue, violet, ochre or margin red for decoration or emphasis. They are reserved for stations and states.
- **Don't** fill a surface with solid ochre. Acceptable is always ochre on ochre-tint with a ring.
- **Don't** draw the blue ruled lines anywhere except behind the sketch.
- **Don't** add drop shadows beyond the drag grip.
- **Don't** introduce a monospace face or a dark theme. The world is single-theme light for bright on-site use.
- **Don't** animate layout. Changed values never shift, grow or reflow.
