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

    // In and Out change only when a visible person is at the counting line, never when a group respawns, and nobody on
    // the landing jumps from one frame to the next.
    const watched = await page.evaluate(() => new Promise((resolve) => {
      const d = currentPlacement().distanceM;
      const comb = d + 1.5;
      let last = window.walkSim.stats();
      let lastAt = performance.now();
      const falseCounts = [];
      const jumps = [];
      const look = () => {
        const now = window.walkSim.stats();
        const at = performance.now();
        const dt = (at - lastAt) / 1000;
        const changed = now.counts.in + now.counts.out > last.counts.in + last.counts.out;
        if (changed && !now.people.concat(last.people).some((q) => Math.abs(q.z - d) < 0.7)) falseCounts.push(now.counts);
        const onLanding = (q) => q.z > d - 0.2 && q.z < comb + 1;
        // Groups that stop to chat step into a ring by design; everyone else must not jump.
        now.people.filter((q) => onLanding(q) && (q.kind === "in" || q.kind === "out")).forEach((q) => {
          const before = last.people.find((o) => o.id === q.id);
          if (!before || !onLanding(before) || before.chatting || q.chatting) return;
          const moved = Math.hypot(q.x - before.x, q.z - before.z);
          if (moved > 2.7 * Math.max(dt, 0.033) + 0.05) jumps.push({ id: q.id, moved: Math.round(moved * 100) / 100, dt });
        });
        last = now;
        lastAt = at;
        if (at - started < 25_000) requestAnimationFrame(look); else resolve({ falseCounts, jumps });
      };
      const started = performance.now();
      requestAnimationFrame(look);
    }));
    expect(watched.falseCounts).toEqual([]);
    expect(watched.jumps).toEqual([]);

    await page.click("#simPause");
    const held = await stats();
    await page.waitForTimeout(2000);
    const later = await stats();
    expect(later.beltTravelM).toBe(held.beltTravelM);
    expect(later.ridersY).toEqual(held.ridersY);
    expect(realErrors(errors)).toEqual([]);
  });
}

test("switching scenes while people walk: riders only in the Escalator scene, counts keep rising, no errors", async ({ page }) => {
  test.setTimeout(200_000);
  const errors = await openConsole(page, "s=escalator&h=4&e=2.6&m=distance");
  await waitForPeople(page);
  await page.click("#simWalk");
  await page.click('[data-crowd="busy"]');
  const stats = () => page.evaluate(() => window.walkSim.stats());
  const total = async () => { const s = await stats(); return s.counts.in + s.counts.out; };
  await expect.poll(async () => (await stats()).riding, { timeout: 20_000 }).toBeGreaterThan(0);

  for (const scene of ["open_door", "corridor"]) {
    await page.click("[data-scene=" + scene + "]");
    await expect.poll(async () => (await stats()).riding, { timeout: 10_000 }).toBe(0);
    const before = await total();
    await expect.poll(total, { timeout: 60_000 }).toBeGreaterThan(before);
  }

  await page.click("[data-scene=escalator]");
  await page.click("[data-landing=bottom]");
  await expect.poll(async () => (await stats()).riding, { timeout: 20_000 }).toBeGreaterThan(0);
  const before = await total();
  await expect.poll(total, { timeout: 100_000 }).toBeGreaterThan(before);
  expect(realErrors(errors)).toEqual([]);
});

for (const landing of ["top", "bottom"]) {
  test("extreme heights and widths on the " + landing + " landing do not throw, and people still walk", async ({ page }) => {
    test.setTimeout(400_000);
    const errors = await openConsole(page, "s=escalator&h=4&e=2.6&m=distance&l=" + landing);
    const sane = (value) => Number.isFinite(value) && value >= 0;
    for (const [h, e] of [[2, 1.2], [2, 8], [10, 1.2], [10, 8]]) {
      await page.goto("/#s=escalator&h=" + h + "&e=" + e + "&m=distance&l=" + landing);
      await page.reload();
      await expect(page.locator("#verdictHeadline")).not.toBeEmpty();
      await page.locator("#simWrap").scrollIntoViewIfNeeded();
      await expect.poll(() => page.evaluate(() => typeof window.walkSim === "object" && window.walkSim !== null), { timeout: 30_000 }).toBe(true);
      await page.waitForTimeout(1500);
      await page.click("#simWalk");
      await page.click('[data-crowd="crowded"]');
      await expect.poll(async () => { const s = await page.evaluate(() => window.walkSim.stats()); return s.riding + s.onLanding; }, { timeout: 30_000, message: "h=" + h + " e=" + e }).toBeGreaterThan(0);
      await page.waitForTimeout(3000);
      const s = await page.evaluate(() => window.walkSim.stats());
      expect([s.beltTravelM, s.counts.in, s.counts.out, s.riding, s.onLanding].every(sane), "stats h=" + h + " e=" + e).toBe(true);
      await expect.poll(async () => { const c = (await page.evaluate(() => window.walkSim.stats())).counts; return c.in + c.out; }, { timeout: 60_000, message: "counting at h=" + h + " e=" + e }).toBeGreaterThan(0);
      expect(s.ridersY.every(Number.isFinite)).toBe(true);
      expect(s.people.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z))).toBe(true);
    }
    expect(realErrors(errors)).toEqual([]);
  });
}

test("at the Bottom landing with a 7 m mount, a rider crossing the face line is the face window's subject and Faces counts", async ({ page }) => {
  test.setTimeout(200_000);
  const errors = await openConsole(page, "s=escalator&h=7&e=2.6&m=distance&l=bottom");
  await waitForPeople(page);
  await page.click("#simWalk");
  await page.click('[data-crowd="busy"]');
  const crossings = await page.evaluate(() => new Promise((resolve) => {
    const p = currentPlacement();
    const faceZ = p.result.faceLine.distanceM;
    const started = performance.now();
    const seen = [];
    const look = () => {
      const s = window.walkSim.stats();
      const rider = s.people.filter((q) => q.riding && Math.abs(q.z - faceZ) < 0.3 && q.y > -0.5).sort((a, b) => Math.abs(a.z - faceZ) - Math.abs(b.z - faceZ))[0];
      if (rider) seen.push({ riderZ: rider.z, subjectZ: s.faceSubjectZ, faceZ });
      if (performance.now() - started < 90_000 && seen.length < 40) requestAnimationFrame(look); else resolve({ seen, faces: s.counts.faces });
    };
    requestAnimationFrame(look);
  }));
  expect(crossings.seen.length).toBeGreaterThan(0);
  expect(crossings.seen.every((c) => c.subjectZ !== null && Math.abs(c.subjectZ - c.faceZ) < 0.5), JSON.stringify(crossings.seen.find((c) => c.subjectZ === null || Math.abs(c.subjectZ - c.faceZ) >= 0.5))).toBe(true);
  expect(crossings.faces).toBeGreaterThan(0);
  expect(realErrors(errors)).toEqual([]);
});

test("changing the crowd while paused puts people on their start poses, not in a heap at the camera", async ({ page }) => {
  test.setTimeout(120_000);
  await openConsole(page, "s=escalator&h=4&e=2.6&m=distance");
  await waitForPeople(page);
  await page.click("#simWalk");
  await page.click("#simPause");
  await page.click('[data-crowd="crowded"]');
  const people = (await page.evaluate(() => window.walkSim.stats())).people;
  expect(people.length).toBeGreaterThan(5);
  const heap = people.filter((q) => Math.abs(q.z) < 1);
  expect(heap.length).toBeLessThan(3);
});
