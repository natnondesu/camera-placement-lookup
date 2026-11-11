// The Escalator scene on the page: the landing, its link, Reset and Undo, the width it starts from, and the face note.
import { test, expect } from "@playwright/test";
import { openConsole, realErrors, waitForPeople } from "./helpers.mjs";

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
  expect(await page.evaluate(() => state.entranceM), "the door's own width comes back").toBe(5);
  await expect(page.locator("#entranceInput")).toHaveValue("5");
});

test("a mount high enough to put the face line on the incline says the face reading is approximate", async ({ page }) => {
  await openConsole(page, "s=escalator&h=7&e=2.6&m=distance");
  await expect(page.locator("#faceNote")).toContainText(/approximate/i);
  await page.goto("/#s=escalator&h=3&e=2.6&m=distance");
  await page.reload();
  await expect(page.locator("#faceNote")).not.toContainText(/approximate/i);
});

test("the verdict notes and the summary chip name the escalator pair, not an entrance; Open door still says Entrance", async ({ page }) => {
  await openConsole(page, "s=escalator&h=4&e=2.6&m=distance");
  const read = () => page.evaluate(() => ({
    note: document.getElementById("entranceLine").textContent,
    chip: document.getElementById("answerEntry").textContent,
  }));
  const pair = await read();
  expect(pair.note).toContain("Escalator pair");
  expect(pair.note).not.toMatch(/entrance/i);
  expect(pair.chip).toContain("Escalator pair");
  expect(pair.chip).not.toMatch(/entrance/i);

  // A width the view cannot cover, so the too-wide note is checked too.
  await page.evaluate(() => { const i = document.getElementById("entranceInput"); i.value = "30"; i.dispatchEvent(new Event("input", { bubbles: true })); });
  expect(await page.evaluate(() => document.getElementById("entranceLine").textContent)).not.toMatch(/entrance/i);

  const readings = await page.evaluate(() => readingsText(currentPlacement()));
  expect(readings).toContain("Escalator pair:");
  expect(readings).not.toMatch(/entrance/i);
  await page.click("#shareButton");
  await page.click("#shareOpenSheet");
  await expect(page.locator("#sheetPage")).toBeVisible();
  expect(await page.locator("#sheetPage").innerText()).not.toMatch(/entrance/i);
  await page.keyboard.press("Escape");
  await page.evaluate(() => setLanguage("th"));
  const thai = await read();
  expect(thai.note).toContain("บันไดเลื่อนทั้งคู่");
  expect(thai.note).not.toContain("ทางเข้า");
  expect(thai.chip).not.toContain("ทางเข้า");
  await page.evaluate(() => setLanguage("en"));

  await page.click("[data-scene=open_door]");
  const door = await read();
  expect(door.note).toMatch(/^Entrance /);
  expect(door.chip).toContain("Entrance");
});

test("a blank width is judged and labelled as the standard pair, not a 5 m entrance", async ({ page }) => {
  await openConsole(page, "s=escalator&h=2&m=distance");
  const chip = await page.evaluate(() => document.getElementById("answerEntry").textContent);
  expect(chip).toContain("Escalator pair");
  expect(chip).toContain("2.6");
  expect(chip).not.toMatch(/entrance/i);
});

test("Reset's tooltip and toast name the pair width, in English and Thai, and never the entrance", async ({ page }) => {
  await openConsole(page, "s=escalator&l=bottom&h=6&e=3.5&m=distance");
  for (const lang of ["en", "th"]) {
    await page.evaluate((code) => setLanguage(code), lang);
    expect(await page.getAttribute("#resetAll", "title")).not.toMatch(/entrance|ทางเข้า/i);
    await page.click("#resetAll");
    expect(await page.locator("#resetText").textContent()).not.toMatch(/entrance|ทางเข้า/i);
    await page.click("#resetUndo");
  }
});

test("off-centre in Thai, the Escalator scene never says entrance", async ({ page }) => {
  await openConsole(page, "s=escalator&h=4&e=2.6&o=1&m=distance");
  await page.evaluate(() => setLanguage("th"));
  const text = await page.evaluate(() => document.getElementById("offsetCaption").textContent + " " + t("alongFloor", { distance: "4.60" }) + " " + t("panStraight"));
  expect(text).not.toContain("ทางเข้า");
});

test("the printed sheet carries the incline caveat when the face line is on the incline", async ({ page }) => {
  await openConsole(page, "s=escalator&h=7&e=2.6&m=distance");
  await page.click("#shareButton");
  await page.click("#shareOpenSheet");
  await expect(page.locator("#sheetPage")).toContainText(/approximate/i);
});

test("the person on the counting line stands on the arriving escalator's edge, not in the divider", async ({ page }) => {
  await openConsole(page, "s=escalator&h=4&e=2.6&m=distance");
  await waitForPeople(page);
  const x = await page.evaluate(() => window.walkSim.viewState().standX);
  expect(x).toBeLessThan(-0.3);
  expect(x).toBeGreaterThan(-1.3);
});

test("the standing person stops at the edge of the arriving lane when arrowed, instead of jumping to the middle", async ({ page }) => {
  await openConsole(page, "s=escalator&h=7&e=2.6&m=distance");
  await waitForPeople(page);
  await page.click("[data-stand=face]");
  await page.focus("#simCanvas");
  const xs = [];
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press("ArrowLeft");
    xs.push(await page.evaluate(() => window.walkSim.viewState().standX));
  }
  const steps = xs.slice(1).map((x, i) => x - xs[i]);
  const direction = Math.sign(steps.find((d) => d !== 0));
  expect(steps.every((d) => d * direction >= -1e-9), JSON.stringify(xs)).toBe(true);
});
