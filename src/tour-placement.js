// Where a tour caption goes beside the control it describes. Pure geometry, so it is tested on its own and inlined
// into the console by generate.mjs.

const GAP = 14;
const MARGIN = 12;

/**
 * Below the control when it fits, else above, else pinned inside the screen's bottom edge (a control taller than
 * the free space). Kept inside the screen sideways, and never wider than the screen less its margins.
 * @param {{ left: number, top: number, width: number, height: number }} target the control's box on screen
 * @param {{ width: number, height: number }} pop the caption's size
 * @param {{ width: number, height: number }} viewport
 * @returns {{ left: number, top: number, width: number, side: "below" | "above" | "inside" }}
 */
export function placeTourPopover(target, pop, viewport) {
  const width = Math.min(pop.width, viewport.width - 2 * MARGIN);
  const left = Math.min(Math.max(MARGIN, target.left), viewport.width - MARGIN - width);
  const below = target.top + target.height + GAP;
  if (below + pop.height <= viewport.height - MARGIN) return { left, top: below, width, side: "below" };
  const above = target.top - GAP - pop.height;
  if (above >= MARGIN) return { left, top: above, width, side: "above" };
  return { left, top: viewport.height - MARGIN - pop.height, width, side: "inside" };
}
