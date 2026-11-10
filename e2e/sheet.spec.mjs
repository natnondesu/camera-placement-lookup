// The printable site sheet.
import { test, expect } from "@playwright/test";
import { openConsole } from "./helpers.mjs";

const pdfPages = (pdf) => (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;

for (const [label, hash, lang] of [
  ["the default placement", "s=open_door&h=4&e=5&m=distance", "en"],
  ["a placement with warnings", "s=open_door&h=4&e=5&o=2&p=5&t=40&m=distance", "en"],
  ["a placement with warnings, in Thai", "s=open_door&h=4&e=5&o=2&p=5&t=40&m=distance", "th"],
]) {
  test(`the site sheet prints on one A4 page: ${label}`, async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "PDF printing is Chromium only");
    await openConsole(page, hash);
    await page.evaluate((language) => setLanguage(language), lang);
    await page.click("#shareButton");
    await page.click("#shareOpenSheet");
    await expect(page.locator("#sheetPage")).toBeVisible();
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
    expect(pdfPages(pdf)).toBe(1);
  });
}

test("off-centre, the sheet's elevation says its distances run to the middle", async ({ page }) => {
  await openConsole(page, "s=open_door&h=4&e=5&o=2&m=distance");
  await page.click("#shareButton");
  await page.click("#shareOpenSheet");
  await expect(page.locator("#sheetPage svg").first()).toContainText("to middle");
});
