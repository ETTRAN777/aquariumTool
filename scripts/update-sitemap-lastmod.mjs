// Updates public/sitemap.xml's <lastmod> to today's date, run automatically
// before every deploy (see package.json's "predeploy" script) — deliberately
// NOT wired into the plain "build" script, since that also runs for local/
// dev builds where touching the committed sitemap on every local build
// wouldn't make sense; this should only fire when the site is actually
// being published.
//
// Only touches this project's own single-URL, project-level sitemap.xml.
// The domain-root sitemap (covering Portfolio, Sushi King, Campus Pantry,
// and this project — 4 URLs) lives in the separate ettran777.github.io
// repo, not this one, and isn't something this script can reach or should
// try to.

import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const sitemapPath = path.join(projectRoot, 'public', 'sitemap.xml');

// YYYY-MM-DD, UTC — matches the sitemaps.org date format already in the
// file, and UTC keeps the result consistent regardless of which machine
// or timezone `npm run deploy` happens to run from.
const today = new Date().toISOString().slice(0, 10);

const original = readFileSync(sitemapPath, 'utf-8');
const lastmodPattern = /<lastmod>[^<]*<\/lastmod>/;

if (!lastmodPattern.test(original)) {
  // Checking for presence of the tag, not whether the replacement would
  // change anything — running deploy twice in the same day is a real,
  // valid case where "already today's date" is correct and shouldn't
  // trigger a false "couldn't find the tag" warning.
  console.warn(`No <lastmod> tag found in ${sitemapPath} — sitemap format may have changed, skipping update.`);
} else {
  const updated = original.replace(lastmodPattern, `<lastmod>${today}</lastmod>`);
  writeFileSync(sitemapPath, updated);
  console.log(`Updated public/sitemap.xml lastmod to ${today}`);
}
