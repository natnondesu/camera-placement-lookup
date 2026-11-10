// On a phone, in WebKit (Safari's engine) as an iPhone 13.
import { test, expect } from "@playwright/test";
import { openConsole, waitForPeople, realErrors } from "./helpers.mjs";

const peopleFiles = (page) => page.evaluate(() => performance.getEntriesByType("resource").filter((e) => e.name.includes("/people/")).length);

test("the page fits the phone's width, in English and Thai", async ({ page }) => {
  await openConsole(page);
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(await fits()).toBe(true);
  await page.evaluate(() => setLanguage("th"));
  expect(await fits()).toBe(true);
});

test("a phone loads only the first person until the crowd is asked for", async ({ page }) => {
  const errors = await openConsole(page);
  await waitForPeople(page);
  const first = await peopleFiles(page);
  expect(first).toBeGreaterThan(0);
  expect(first).toBeLessThanOrEqual(6);
  await expect(page.locator("#simPersonLabel")).toHaveText("Person 1 of 8");

  await page.click("#simWalk");
  await expect.poll(() => peopleFiles(page), { timeout: 45_000 }).toBeGreaterThan(30);
  expect(realErrors(errors)).toEqual([]);
});

test("the expanded camera view keeps its overlay laid over the picture", async ({ page }) => {
  await openConsole(page);
  await page.locator("#simWrap").scrollIntoViewIfNeeded();
  await page.click("#stageExpand");
  const layout = await page.evaluate(() => {
    const canvas = document.getElementById("simCanvas").getBoundingClientRect();
    const overlay = document.getElementById("simOverlay");
    const box = overlay.getBoundingClientRect();
    return {
      position: getComputedStyle(overlay).position,
      sameBox: Math.abs(box.left - canvas.left) < 1 && Math.abs(box.top - canvas.top) < 1 && Math.abs(box.width - canvas.width) < 1,
      painted: overlay.getContext("2d").getImageData(0, 0, overlay.width, overlay.height).data.some((v, i) => i % 4 === 3 && v > 0),
    };
  });
  // Absolutely positioned over the 3D canvas: WebKit paints a grid-stacked sibling under the WebGL layer.
  expect(layout).toEqual({ position: "absolute", sameBox: true, painted: true });
});
