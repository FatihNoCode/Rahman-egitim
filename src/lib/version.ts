// The app's version, as shown on the login screen, in the app's settings
// panel, in the device log and as the Sentry release name.
//
// It exists so a build can be identified from the device: "which version am I
// looking at?" is otherwise unanswerable once an APK or a TestFlight build is
// on someone's phone, and a bug report about a fix that shipped last week is
// impossible to interpret without it.
//
// The number itself lives in package.json and is injected by Vite (see
// `define` in vite.config.ts). It used to be its own string here, which is
// exactly the arrangement that let the two drift apart — the phone showed 3.36
// while the repo said 3.4.0, so the number could no longer be trusted to
// identify anything. Bump `version` in package.json in the same commit as any
// change that ships to the app.
declare const __APP_VERSION__: string;

// The fallback covers the one context that does not go through Vite's define:
// `npm run typecheck`, and any bare `tsc`/node consumer of this module.
export const APP_VERSION =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev';
