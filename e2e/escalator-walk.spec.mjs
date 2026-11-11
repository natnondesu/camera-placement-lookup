// People ride the escalator pair in the 3D walk: they ride, step off, are counted on the landing, and Pause holds the steps.
import { test, expect } from "@playwright/test";
import { openConsole, waitForPeople, realErrors } from "./helpers.mjs";

for (const landing of ["top", "bottom"]) {
  test("walking on the " + landing + " landing: riders ride, In and Out are counted, and Pause holds the steps", async ({ page }) => {
    test.setTimeout(200_000);
    const errors = await openConsole(page, "s=escalator&h=4&e=2.6&m=distance&l=" + landing);
    await waitForPeople(page);
    await page.click("#simWalk");
    await page.click('[data-crowd="busy"]');
    const stats = () => page.evaluate(() => window.walkSim.stats());
    await expect.poll(async () => (await stats()).riding, { timeout: 20_000 }).toBeGreaterThan(0);
    await expect.poll(async () => { const s = await stats(); return Math.min(s.counts.in, s.counts.out); }, { timeout: 100_000 }).toBeGreaterThan(0);
    expect((await stats()).beltTravelM).toBeGreaterThan(0);
    const riders = (await stats()).ridersY;
    expect(riders.every((y) => (landing === "top" ? y <= 0.05 : y >= -0.05))).toBe(true);

    // In and Out change only when a visible person is at the counting line, never when a group respawns.
    const falseCounts = await page.evaluate(() => new Promise((resolve) => {
      const d = currentPlacement().distanceM;
      let last = window.walkSim.stats();
      const bad = [];
      const timer = setInterval(() => {
        const now = window.walkSim.stats();
        const changed = now.counts.in + now.counts.out > last.counts.in + last.counts.out;
        if (changed && !now.people.concat(last.people).some((q) => Math.abs(q.z - d) < 0.7)) bad.push(now.counts);
        last = now;
      }, 40);
      setTimeout(() => { clearInterval(timer); resolve(bad); }, 25_000);
    }));
    expect(falseCounts).toEqual([]);

    await page.click("#simPause");
    const held = await stats();
    await page.waitForTimeout(2000);
    const later = await stats();
    expect(later.beltTravelM).toBe(held.beltTravelM);
    expect(later.ridersY).toEqual(held.ridersY);
    expect(realErrors(errors)).toEqual([]);
  });
}
