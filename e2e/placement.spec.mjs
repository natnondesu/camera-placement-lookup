// The placement controls, links, Reset and the messages they drive.
import { test, expect } from "@playwright/test";
import { openConsole, placement, choosePreset, realErrors } from "./helpers.mjs";

test("the console loads without errors", async ({ page }) => {
  const errors = await openConsole(page);
  await expect(page.locator("#verdictHeadline")).toContainText(/best/i);
  expect(realErrors(errors)).toEqual([]);
});

test("a hand-set pan from a link shows in the Pan field", async ({ page }) => {
  await openConsole(page, "s=open_door&h=4&d=4.6&e=5&p=-30&m=distance");
  const now = await placement(page);
  expect(now.pan).toBe(-30);
  expect(now.panManual).toBe(true);
  await expect(page.locator("#panInput")).toHaveValue("-30.0");
});

test("a hand-set tilt from a link shows in the Tilt field; a link without one means Auto", async ({ page }) => {
  await openConsole(page, "s=open_door&h=4&d=4.6&e=5&t=31.5&m=manual");
  await expect(page.locator("#tiltInput")).toHaveValue("31.5");
  await page.goto("/#s=open_door&h=4&d=4.6&e=5&m=manual");
  await page.reload();
  expect((await placement(page)).tiltManual).toBe(false);
});

test("switching to the fisheye and back keeps a hand-set tilt and pan, and the verdict", async ({ page }) => {
  await openConsole(page, "s=open_door&h=4&d=4.6&e=5&t=30&p=20&m=distance");
  const before = await placement(page);

  await choosePreset(page, "generic_fisheye_12mp");
  await expect(page.locator("#tiltInput")).toHaveValue("90.0");
  await expect(page.locator("#panInput")).toHaveValue("0.0");
  await choosePreset(page, "dahua_hdbw2531r_zs_s2");

  const after = await placement(page);
  expect(after.tilt).toBe(30);
  expect(after.pan).toBe(20);
  expect(after.verdict).toBe(before.verdict);
  await expect(page.locator("#tiltInput")).toHaveValue("30.0");
  await expect(page.locator("#panInput")).toHaveValue("20.0");
});

test("emptying the Pan or Tilt field and leaving it keeps Auto", async ({ page }) => {
  await openConsole(page);
  await page.locator("#advancedPanel summary").click();
  for (const id of ["#panInput", "#tiltInput"]) {
    await page.fill(id, "");
    await page.locator(id).blur();
  }
  const now = await placement(page);
  expect(now.panManual).toBe(false);
  expect(now.tiltManual).toBe(false);
});

test("Reset goes back to the default and keeps the site's own facts", async ({ page }) => {
  await openConsole(page, "s=corridor&h=4.2&d=5.1&t=36&e=3.5&o=1.2&p=10&z=6&m=manual");

  await page.click("#resetAll");

  const now = await placement(page);
  expect(now.panManual).toBe(false);
  expect(now.tiltManual).toBe(false);
  expect(now.entranceM).toBe(3.5);
  expect(await page.evaluate(() => ({ solve: state.solveMode, offset: state.offsetM, scene: state.profileId }))).toEqual({ solve: "distance", offset: 0, scene: "corridor" });
  await expect(page.locator("#heightInput")).toHaveValue("4.2");
  await expect(page.locator("#focalInput")).toHaveValue("2.7");
  await expect(page.locator("#resetToast")).toBeVisible();
});

test("Undo after Reset restores everything, even after a second Reset", async ({ page }) => {
  await openConsole(page, "s=open_door&h=4&d=4.6&e=5&p=-30&t=33&m=manual");

  await page.click("#resetAll");
  await page.click("#resetAll");
  await page.click("#resetUndo");

  const now = await placement(page);
  expect(now.pan).toBe(-30);
  expect(now.tilt).toBe(33);
  await expect(page.locator("#panInput")).toHaveValue("-30.0");
  expect(await page.evaluate(() => state.solveMode)).toBe("manual");
});

test("a camera turned far names the entrance end out of view and warns about the picture's edge", async ({ page }) => {
  await openConsole(page, "s=open_door&h=4&e=5&p=-44&m=distance");
  const now = await placement(page);
  expect(now.entrance.cause).toBe("turned");
  expect(now.warnings).toContain("aim_off_effective");
  await expect(page.locator("#entranceLine")).toContainText("out of it");
  await expect(page.locator("#entranceLine")).not.toContainText("wider than");
});

test("the offset caption says when the pan is set by hand", async ({ page }) => {
  await openConsole(page, "s=open_door&h=4&e=5&o=2&p=5&m=distance");
  await expect(page.locator("#offsetCaption")).toContainText("set by hand");
});

test("off-centre, vertical px/m stays with the distance to the middle of the entrance", async ({ page }) => {
  await openConsole(page, "s=open_door&h=4&e=5&m=distance");
  const centred = parseFloat(await page.locator("#verticalPpmMetric").textContent());
  await page.goto("/#s=open_door&h=4&e=5&o=2&m=distance");
  await page.reload();
  const offset = parseFloat(await page.locator("#verticalPpmMetric").textContent());
  expect(Math.abs(centred - offset)).toBeLessThanOrEqual(2);
});

for (const width of ["-3", "0", "1e9"]) {
  test(`a link entrance width of ${width} is ignored`, async ({ page }) => {
    await openConsole(page, `s=open_door&h=4&e=${width}&m=distance`);
    expect((await placement(page)).entranceM).toBeNull();
    await expect(page.locator("#entranceInput")).toHaveValue("");
  });
}

test("a placement survives a share link", async ({ page }) => {
  await openConsole(page, "s=corridor&h=3.4&d=3.3&e=3&o=-1.45&p=12&t=32&m=manual");
  await page.waitForFunction(() => location.hash.includes("p=12"));
  const link = await page.evaluate(() => location.href);
  await page.goto("about:blank");
  await page.goto(link);
  const now = await placement(page);
  expect(now.pan).toBe(12);
  expect(now.tilt).toBe(32);
  expect(await page.evaluate(() => ({ offset: state.offsetM, scene: state.profileId }))).toEqual({ offset: -1.45, scene: "corridor" });
});
