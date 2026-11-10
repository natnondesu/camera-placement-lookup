// The Escalator scene on the page: the landing, its link, Reset and Undo, the width it starts from, and the face note.
import { test, expect } from "@playwright/test";
import { openConsole, realErrors } from "./helpers.mjs";

test("Reset keeps the landing and the width, Undo brings them back, and a language switch keeps the field", async ({ page }) => {
  const errors = await openConsole(page, "s=escalator&h=4&e=3&l=bottom");
  await expect(page.locator("#landingField")).toBeVisible();
  await expect(page.locator("[data-landing=bottom]")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#entranceInput")).toHaveAttribute("aria-label", "Escalator pair width");

  await page.evaluate(() => { document.getElementById("heightInput").value = "6"; document.getElementById("heightInput").dispatchEvent(new Event("input", { bubbles: true })); });
  await page.click("#resetAll");
  expect(await page.evaluate(() => ({ landing: state.landing, width: state.entranceM, scene: state.profileId }))).toEqual({ landing: "bottom", width: 3, scene: "escalator" });
  await page.click("#resetUndo");
  expect(await page.evaluate(() => ({ landing: state.landing, width: state.entranceM }))).toEqual({ landing: "bottom", width: 3 });

  await page.evaluate(() => setLanguage("th"));
  await expect(page.locator("#landingField")).toBeVisible();
  await expect(page.locator("#entranceInput")).toHaveAttribute("aria-label", "ความกว้างบันไดเลื่อนทั้งคู่");
  expect(realErrors(errors)).toEqual([]);
});

test("the Escalator scene button starts from the standard 2.6 m pair, and the landing shows only for it", async ({ page }) => {
  await openConsole(page, "s=open_door&h=4&e=5&m=distance");
  await expect(page.locator("#landingField")).toBeHidden();
  await page.click("[data-scene=escalator]");
  await expect(page.locator("#landingField")).toBeVisible();
  expect(await page.evaluate(() => state.entranceM)).toBe(2.6);
  await expect(page.locator("#entranceInput")).toHaveValue("2.6");
  await page.click("[data-scene=open_door]");
  await expect(page.locator("#landingField")).toBeHidden();
  await expect(page.locator("#entranceInput")).toHaveAttribute("aria-label", "Entrance width");
});

test("a mount high enough to put the face line on the incline says the face reading is approximate", async ({ page }) => {
  await openConsole(page, "s=escalator&h=7&e=2.6&m=distance");
  await expect(page.locator("#faceNote")).toContainText(/approximate/i);
  await page.goto("/#s=escalator&h=3&e=2.6&m=distance");
  await page.reload();
  await expect(page.locator("#faceNote")).not.toContainText(/approximate/i);
});
