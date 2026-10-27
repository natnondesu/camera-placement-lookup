// PROTOTYPE: inlines the real engine and rule files into the throwaway layout prototype.
import fs from "node:fs/promises";

const read = (path) => fs.readFile(new URL(path, import.meta.url), "utf8");
const [template, engine, rules, cameras] = await Promise.all([
  read("./placement-console.prototype.html"),
  read("../src/placement-rule.js"),
  read("../rules/scene-profiles.json"),
  read("../rules/cameras.json"),
]);

const html = template
  .replace("/*__ENGINE__*/", () => engine.replace(/^export /gm, ""))
  .replace("/*__RULES__*/null", () => rules.trim())
  .replace("/*__CAMERAS__*/null", () => cameras.trim());

await fs.mkdir(new URL("./dist/", import.meta.url), { recursive: true });
await fs.writeFile(new URL("./dist/placement-console.prototype.html", import.meta.url), html, "utf8");
console.log("prototype/dist/placement-console.prototype.html");
