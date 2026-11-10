// Shared steps for the browser tests.
import { expect } from "@playwright/test";

/**
 * Opens the console at a placement link and collects console errors for the test to check.
 * @param {import("@playwright/test").Page} page
 * @param {string} hash the placement, e.g. "s=open_door&h=4&e=5&m=distance"
 * @returns {Promise<string[]>} errors, filled as the page runs
 */
export async function openConsole(page, hash = "s=open_door&h=4&e=5&m=distance") {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/#" + hash);
  await expect(page.locator("#verdictHeadline")).not.toBeEmpty();
  return errors;
}

/** What the engine judged the current placement with. */
export function placement(page) {
  return page.evaluate(() => {
    const r = currentPlacement().result;
    return {
      verdict: r.verdict, tilt: r.tilt.value, pan: r.pan.value, panManual: r.pan.manual, warnings: r.warnings,
      entrance: r.entrance, tiltManual: state.tiltUserAdjusted, entranceM: state.entranceM,
    };
  });
}

/** Picks a camera preset as the select would. */
export async function choosePreset(page, id) {
  await page.selectOption("#presetSelect", id);
}

/** Waits for the 3D view and its avatars (the person stepper shows once they have loaded). */
export async function waitForPeople(page) {
  await page.locator("#simWrap").scrollIntoViewIfNeeded();
  await expect(page.locator("#simPerson")).toBeVisible({ timeout: 45_000 });
}

/** Errors that matter: the offline service worker is blocked in tests, so its own complaints are expected. */
export function realErrors(errors) {
  return errors.filter((text) => !/service ?worker|sw\.js|manifest|offline support/i.test(text));
}
