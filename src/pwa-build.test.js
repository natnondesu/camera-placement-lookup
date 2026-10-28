import { test } from "node:test";
import assert from "node:assert/strict";
import { cacheVersion, buildManifest, renderServiceWorker } from "./pwa-build.js";

test("the cache version changes whenever any shipped file changes", () => {
  const a = cacheVersion(["<html>1</html>", "csv"]);
  assert.equal(a, cacheVersion(["<html>1</html>", "csv"]));
  assert.notEqual(a, cacheVersion(["<html>2</html>", "csv"]));
  assert.match(a, /^[0-9a-f]{12}$/);
});

test("the manifest makes the console installable as a standalone app", () => {
  const manifest = buildManifest({ themeColor: "#0b0f14", backgroundColor: "#0b0f14" });
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.name && manifest.short_name);
  const sizes = manifest.icons.map((icon) => icon.sizes + " " + (icon.purpose || "any"));
  assert.ok(sizes.includes("192x192 any"));
  assert.ok(sizes.includes("512x512 any"));
  assert.ok(sizes.includes("512x512 maskable"));
});

test("the service worker gets this build's version and file lists", () => {
  const template = 'const VERSION = "__VERSION__";\nconst LOCAL = __LOCAL__;\nconst REMOTE = __REMOTE__;';
  const sw = renderServiceWorker(template, { version: "abc123", local: ["/", "/index.html"], remote: ["https://cdn.example/x.js"] });
  assert.match(sw, /const VERSION = "abc123";/);
  assert.match(sw, /const LOCAL = \["\/","\/index.html"\];/);
  assert.match(sw, /https:\/\/cdn.example\/x.js/);
  assert.doesNotMatch(sw, /__[A-Z]+__/);
});

test("a template missing a placeholder is refused", () => {
  assert.throws(() => renderServiceWorker("const VERSION = 1;", { version: "a", local: [], remote: [] }), /__VERSION__/);
});
