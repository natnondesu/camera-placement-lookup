// Build-time pieces of the installable app: the cache version, the web app manifest and the service worker file.
import { createHash } from "node:crypto";

/**
 * A short fingerprint of everything the app ships, so a new build always installs a new service worker and cache.
 * @param {string[]} contents
 * @returns {string}
 */
export function cacheVersion(contents) {
  const hash = createHash("sha256");
  contents.forEach((content) => hash.update(content).update("\0"));
  return hash.digest("hex").slice(0, 12);
}

/**
 * @param {{ themeColor: string, backgroundColor: string }} colors
 */
export function buildManifest({ themeColor, backgroundColor }) {
  return {
    name: "Camera Placement Lookup",
    short_name: "Camera Placement",
    description: "Where to mount a people-counting camera and where to draw the counting line.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    theme_color: themeColor,
    background_color: backgroundColor,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

/**
 * Fills the service worker template with this build's version and the files it precaches.
 * @param {string} template
 * @param {{ version: string, local: string[], remote: string[] }} build
 * @returns {string}
 */
export function renderServiceWorker(template, { version, local, remote }) {
  const values = { __VERSION__: version, __LOCAL__: JSON.stringify(local), __REMOTE__: JSON.stringify(remote) };
  return Object.entries(values).reduce((text, [key, value]) => {
    if (!text.includes(key)) throw new Error(`Service worker template has no ${key}`);
    return text.split(key).join(value);
  }, template);
}
