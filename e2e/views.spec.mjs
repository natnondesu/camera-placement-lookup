// The 3D camera view, the walk, the Top view's turning knob, the expanded view and Help.
import { test, expect } from "@playwright/test";
import { openConsole, placement, waitForPeople, realErrors } from "./helpers.mjs";

// Average brightness (0-255) of the face picture in the camera view's overlay.
const faceBrightness = (page) => page.evaluate(() => {
  const overlay = document.getElementById("simOverlay");
  const w = parseFloat(overlay.style.width);
  const scale = overlay.width / w;
  const size = Math.round(Math.min(w >= 900 ? 220 : 132, Math.max(84, w * 0.2)));
  const top = 8 + 10 + 2 * 17 + 8;
  const x = (w - 8 - size + 4 + size * 0.25) * scale;
  const y = (top + 4 + size * 0.25) * scale;
  const data = overlay.getContext("2d").getImageData(x, y, size * 0.5 * scale, size * 0.5 * scale).data;
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
  return sum / (data.length / 4);
});

test("the 3D view loads the avatars with their textures: the face window shows a lit face", async ({ page }) => {
  const errors = await openConsole(page);
  await waitForPeople(page);
  await expect.poll(() => faceBrightness(page), { timeout: 20_000 }).toBeGreaterThan(45);
  expect(realErrors(errors)).toEqual([]);
});

test("walking people are counted, and Pause holds the counts", async ({ page }) => {
  await openConsole(page);
  await waitForPeople(page);
  await page.click("#simWalk");
  const counted = async () => Number(await page.textContent("#simIn")) + Number(await page.textContent("#simOut"));
  await expect.poll(counted, { timeout: 40_000 }).toBeGreaterThan(0);

  await page.click("#simPause");
  const held = await counted();
  await page.waitForTimeout(2500);
  expect(await counted()).toBe(held);
  await expect(page.locator("#simPause")).toHaveAttribute("aria-pressed", "true");
});

test("Crowded mode reports how many people are hidden behind others", async ({ page }) => {
  await openConsole(page);
  await waitForPeople(page);
  await page.click("#simWalk");
  await page.click('[data-crowd="crowded"]');
  await expect(page.locator("#simHidden")).toHaveText(/^\d+%$/, { timeout: 20_000 });
});

test("the Top view's knob turns the camera by hand, and Aim at middle turns it back", async ({ page }) => {
  await openConsole(page, "s=open_door&h=4&e=5&o=1.5&m=distance");
  await page.click('[data-topview="top"]');
  await page.locator("#topCanvas").scrollIntoViewIfNeeded();
  const knob = await page.evaluate(() => state.planKnob);
  const box = await page.locator("#topCanvas").boundingBox();

  await page.mouse.move(box.x + knob[0], box.y + knob[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + knob[0] + 60, box.y + knob[1] - 10, { steps: 8 });
  await page.mouse.up();

  const turned = await placement(page);
  expect(turned.panManual).toBe(true);
  expect(turned.pan).toBeGreaterThan(0);
  await page.locator("#advancedPanel summary").click();
  await page.click("#panAuto");
  expect((await placement(page)).panManual).toBe(false);
});

test("the expanded view fills the window and Esc brings it back", async ({ page }) => {
  await openConsole(page);
  const normal = (await page.locator("#simCanvas").boundingBox()).width;
  await page.click("#stageExpand");
  await expect.poll(async () => (await page.locator("#simCanvas").boundingBox()).width).toBeGreaterThan(normal * 1.5);
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await page.locator("#simCanvas").boundingBox()).width).toBeLessThan(normal * 1.1);
});

test("Help: Show me walks through a guide to its end", async ({ page }) => {
  await openConsole(page);
  await page.click("#helpButton");
  await page.locator(".help-show").first().click();
  await expect(page.locator("#tour")).toBeVisible();
  for (let i = 0; i < 8 && (await page.locator("#tourNext").isVisible()); i += 1) await page.click("#tourNext");
  await expect(page.locator("#tour")).toBeHidden();
});
