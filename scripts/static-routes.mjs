// Emit a real index.html for every static route the app answers.
//
// The app does its own routing off window.location.pathname, and GitHub Pages
// only serves a file it can find. Without this, /privacy and friends fall back
// to dist/404.html — which renders the right page, but answers with HTTP 404.
// That is invisible in a browser and very visible to anything that reads the
// status code, including the Google Play reviewer checking the account
// deletion URL we put on the store listing.
//
// Only fixed paths belong here. /invite/<token> is per-token and can never be
// pre-rendered, so 404.html stays as the fallback for anything not listed.

import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

const ROUTES = [
  'home', // legacy alias — "/" is the canonical marketing landing page now
  'login',
  'privacy',
  // Both spellings of the deletion page: the Dutch one is what we publish,
  // the English one is what someone typing from memory will try.
  'account-verwijderen',
  'delete-account',
  'inschrijven',
  'inschrijving', // legacy path, still linked from older mails
  'elif-ba',
  'toets',
];

const source = join(dist, 'index.html');
for (const route of ROUTES) {
  mkdirSync(join(dist, route), { recursive: true });
  copyFileSync(source, join(dist, route, 'index.html'));
}

console.log(`Pre-rendered ${ROUTES.length} static routes: ${ROUTES.join(', ')}`);
